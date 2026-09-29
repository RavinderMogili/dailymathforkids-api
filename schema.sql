create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  nickname text unique not null,
  grade text not null default 'Grade 3',
  school text,
  city text default 'Moncton',
  parent_email text,
  pin_hash text,
  security_question text,
  security_answer text,
  show_on_leaderboard boolean not null default false,
  leaderboard_opted_in_at timestamptz,
  show_on_prize_club boolean not null default false,
  prize_club_opted_in_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists quizzes (
  id text primary key,             -- e.g., '2025-09-01'
  questions jsonb not null,
  answers jsonb not null,
  created_at timestamptz default now()
);

create table if not exists submissions (
  id bigserial primary key,
  user_id uuid references users(id),
  quiz_id text references quizzes(id),
  score int not null,
  points_earned int not null default 0,
  time_seconds int default null,
  created_at timestamptz default now(),
  unique (user_id, quiz_id)
);

-- Run once to add columns to existing tables:
-- ALTER TABLE submissions ADD COLUMN IF NOT EXISTS time_seconds int default null;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash text;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question text;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer text;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS show_on_prize_club boolean not null default false;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS prize_club_opted_in_at timestamptz;

-- Leaderboard view
create or replace view leaderboard as
select
  u.id,
  u.nickname,
  u.grade,
  u.school,
  u.city,
  coalesce(sum(s.points_earned), 0)::int as total_points,
  count(s.id)::int as days_played,
  rank() over (order by coalesce(sum(s.points_earned), 0) desc) as rank
from users u
left join submissions s on s.user_id = u.id
group by u.id, u.nickname, u.grade, u.school, u.city;

-- Per-question results
create table if not exists question_attempts (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  quiz_id text not null,
  question_num int not null,
  correct boolean not null,
  created_at timestamptz default now()
);

-- Groups (family or class)
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists group_members (
  group_id uuid references groups(id) on delete cascade,
  user_id  uuid references users(id)  on delete cascade,
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

-- Group totals view
create or replace view group_progress as
select
  g.id          as group_id,
  g.name        as group_name,
  g.invite_code,
  count(distinct gm.user_id)::int                        as member_count,
  coalesce(sum(s.points_earned), 0)::int                 as total_points,
  count(distinct s.quiz_id || gm.user_id::text)::int     as quizzes_completed
from groups g
left join group_members gm on gm.group_id = g.id
left join submissions   s  on s.user_id   = gm.user_id
group by g.id, g.name, g.invite_code;

-- Practice mode submissions
-- Server-issued practice sessions — see migrations/002_practice_sessions.sql
-- for why (server-side answer verification, replay protection, atomic
-- daily-cap enforcement). Defined here, before practice_submissions, so the
-- foreign key below has something to point at.
create table if not exists practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  questions jsonb not null,
  grade int,
  topics text[],
  difficulty text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create table if not exists practice_submissions (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  correct int not null default 0,
  total int not null default 0,
  difficulty text default 'easy',
  topics text[] default '{}',
  points_earned numeric(4,1) default 0,
  time_seconds int default null,
  created_at timestamptz default now(),
  session_id uuid references practice_sessions(id)
);

create table if not exists practice_daily_points (
  user_id uuid not null references users(id) on delete cascade,
  day date not null,
  points_used numeric(4,1) not null default 0,
  primary key (user_id, day)
);

-- Server-side exposure tracking (avoid repeating pool-sourced questions a
-- user has already seen) — see migrations/003_practice_seen_questions.sql.
create table if not exists practice_seen_questions (
  user_id uuid not null references users(id) on delete cascade,
  source_id text not null,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, source_id)
);

create index if not exists idx_practice_seen_questions_user on practice_seen_questions(user_id);

create or replace view weekly_progress as
select
  user_id,
  date_trunc('week', created_at) as week,
  count(*) as days_played,
  sum(points_earned) as weekly_points,
  avg(score)::numeric(4,2) as avg_score
from submissions
group by 1, 2;

-- Mistake history (wrong answers from daily quizzes and practice)
create table if not exists mistakes (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  source text not null default 'quiz',  -- 'quiz' or 'practice'
  quiz_id text,                          -- e.g. '2026-06-29-G9' for quiz, null for practice
  question_num int,
  question_text text not null,
  correct_answer text not null,
  user_answer text not null,
  choices jsonb,
  hint text,
  topic text,
  resolved boolean not null default false,  -- true when user gets it right in review
  created_at timestamptz default now()
);

create index if not exists idx_mistakes_user on mistakes(user_id, source, created_at desc);

-- Reward milestone tracking (e.g. 300-point Walmart gift card)
create table if not exists reward_milestones (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  threshold int not null default 300,
  reached_at timestamptz not null default now(),
  reward_status text not null default 'eligible',  -- eligible | contacted | delivered
  delivered_at timestamptz,
  unique (user_id, threshold)
);

-- Performance indexes for weekly leaderboard queries
create index if not exists idx_submissions_created_at on submissions(created_at);
create index if not exists idx_practice_submissions_created_at on practice_submissions(created_at);
create index if not exists idx_users_show_on_leaderboard on users(show_on_leaderboard) where show_on_leaderboard = true;

create index if not exists idx_practice_sessions_user on practice_sessions(user_id, created_at desc);
create index if not exists idx_practice_sessions_expires on practice_sessions(expires_at);

-- Atomic, server-side practice-session verification + daily-cap enforcement.
-- See migrations/002_practice_sessions.sql for the full explanation of the
-- row-locking that makes this safe under concurrent requests.
create or replace function submit_practice_session(
  p_session_id uuid,
  p_user_id uuid,
  p_selections jsonb,
  p_time_seconds int,
  p_day date
) returns jsonb as $$
declare
  v_session practice_sessions%rowtype;
  v_questions jsonb;
  v_total int;
  v_correct int := 0;
  v_i int;
  v_q jsonb;
  v_sel jsonb;
  v_sel_choice text;
  v_is_correct boolean;
  v_raw_points numeric;
  v_before numeric;
  v_awarded numeric;
  v_results jsonb := '[]'::jsonb;
  v_new_submission_id bigint;
begin
  select * into v_session from practice_sessions
    where id = p_session_id
    for update;

  if not found then
    return jsonb_build_object('error', 'session_not_found');
  end if;

  if v_session.user_id <> p_user_id then
    return jsonb_build_object('error', 'session_not_found');
  end if;

  if v_session.consumed_at is not null then
    return jsonb_build_object('already', true);
  end if;

  if v_session.expires_at < now() then
    return jsonb_build_object('error', 'session_expired');
  end if;

  update practice_sessions set consumed_at = now() where id = p_session_id;

  v_questions := v_session.questions;
  v_total := jsonb_array_length(v_questions);

  for v_i in 0..v_total - 1 loop
    v_q := v_questions -> v_i;
    select s into v_sel from jsonb_array_elements(coalesce(p_selections, '[]'::jsonb)) s
      where (s ->> 'index')::int = v_i
      limit 1;
    v_sel_choice := v_sel ->> 'choice';
    v_is_correct := (v_sel_choice is not null and v_sel_choice = (v_q ->> 'answer'));
    if v_is_correct then
      v_correct := v_correct + 1;
    end if;
    v_results := v_results || jsonb_build_object('index', v_i, 'correct', v_is_correct);
  end loop;

  v_raw_points := v_correct * 0.5;

  insert into practice_daily_points (user_id, day, points_used)
    values (p_user_id, p_day, 0)
    on conflict (user_id, day) do nothing;

  select points_used into v_before from practice_daily_points
    where user_id = p_user_id and day = p_day
    for update;

  v_awarded := least(v_raw_points, greatest(0, 10 - v_before));

  update practice_daily_points set points_used = v_before + v_awarded
    where user_id = p_user_id and day = p_day;

  insert into practice_submissions (user_id, correct, total, difficulty, topics, points_earned, time_seconds, session_id)
    values (p_user_id, v_correct, v_total, v_session.difficulty, v_session.topics, v_awarded, p_time_seconds, p_session_id)
    returning id into v_new_submission_id;

  return jsonb_build_object(
    'already', false,
    'correct', v_correct,
    'total', v_total,
    'pointsEarned', v_awarded,
    'pointsToday', v_before + v_awarded,
    'pointsRemaining', greatest(0, 10 - (v_before + v_awarded)),
    'results', v_results,
    'submissionId', v_new_submission_id
  );
end;
$$ language plpgsql;
