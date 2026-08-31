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
  grade_correction_used boolean not null default false,
  show_on_leaderboard boolean not null default false,
  leaderboard_opted_in_at timestamptz,
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
  reward_day date,
  official_grade_at_submission text,
  created_at timestamptz default now(),
  unique (user_id, quiz_id)
);

-- Run once to add columns to existing tables:
-- ALTER TABLE submissions ADD COLUMN IF NOT EXISTS time_seconds int default null;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash text;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question text;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer text;

-- Lifetime leaderboard view. Grade-filtered competitive API results use the
-- immutable grade-at-award columns instead of this live account grade.
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
create table if not exists practice_submissions (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  correct int not null default 0,
  total int not null default 0,
  difficulty text default 'easy',
  topics text[] default '{}',
  points_earned numeric(4,1) default 0,
  time_seconds int default null,
  submission_key text,
  practice_grade text,
  official_grade_at_award text,
  reward_eligible boolean,
  reward_day date,
  created_at timestamptz default now()
);

-- Append-only Official Grade correction audit
create table if not exists official_grade_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id) on delete cascade,
  previous_grade text not null,
  new_grade text not null,
  change_type text not null check (change_type in ('one_time_self_service_correction', 'admin_approved_change')),
  change_reason text,
  changed_at timestamptz not null default now()
);
alter table official_grade_changes enable row level security;
revoke all on official_grade_changes from anon, authenticated;

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
create index if not exists official_grade_changes_user_changed_idx on official_grade_changes(user_id, changed_at desc);
create unique index if not exists practice_submissions_user_key_uidx
  on practice_submissions(user_id, submission_key) where submission_key is not null;
create index if not exists practice_submissions_user_reward_day_idx
  on practice_submissions(user_id, reward_day);
create index if not exists practice_submissions_grade_user_idx
  on practice_submissions(official_grade_at_award, user_id)
  where official_grade_at_award is not null and reward_eligible = true;
create unique index if not exists submissions_one_protected_reward_per_day_uidx
  on submissions(user_id, reward_day) where official_grade_at_submission is not null;
create index if not exists submissions_grade_user_idx
  on submissions(official_grade_at_submission, user_id)
  where official_grade_at_submission is not null;

-- Atomic one-time correction. Lifetime point rows are never updated.
create or replace function public.correct_official_grade(p_user_id uuid, p_new_grade text)
returns table(previous_grade text, new_grade text)
language plpgsql security invoker set search_path = public as $$
declare v_user public.users%rowtype;
begin
  select * into v_user from public.users where id = p_user_id for update;
  if not found then raise exception 'User not found'; end if;
  if v_user.grade_correction_used then raise exception 'Official Grade correction has already been used'; end if;
  if v_user.grade = p_new_grade then raise exception 'Choose a different Official Grade'; end if;
  update public.users set grade = p_new_grade, grade_correction_used = true where id = p_user_id;
  insert into public.official_grade_changes(user_id, previous_grade, new_grade, change_type)
  values (p_user_id, v_user.grade, p_new_grade, 'one_time_self_service_correction');
  return query select v_user.grade, p_new_grade;
end $$;
revoke all on function public.correct_official_grade(uuid, text) from public, anon, authenticated;
grant execute on function public.correct_official_grade(uuid, text) to service_role;

-- Owner-only correction after the self-service opportunity has been used.
create or replace function public.admin_change_official_grade(
  p_user_id uuid, p_new_grade text, p_reason text
) returns table(previous_grade text, new_grade text)
language plpgsql security invoker set search_path = public as $$
declare v_previous text;
begin
  if nullif(trim(p_reason), '') is null then raise exception 'An approval reason is required'; end if;
  select grade into v_previous from public.users where id = p_user_id for update;
  if not found then raise exception 'User not found'; end if;
  update public.users set grade = p_new_grade where id = p_user_id;
  insert into public.official_grade_changes(user_id, previous_grade, new_grade, change_type, change_reason)
  values (p_user_id, v_previous, p_new_grade, 'admin_approved_change', p_reason);
  return query select v_previous, p_new_grade;
end $$;
revoke all on function public.admin_change_official_grade(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_change_official_grade(uuid, text, text) to service_role;

-- Atomic Practice scoring, shared daily cap, grade eligibility, and replay protection.
create or replace function public.award_practice_submission(
  p_user_id uuid, p_submission_key text, p_correct integer, p_total integer,
  p_practice_grade text, p_reward_day date, p_difficulty text,
  p_topics text[], p_time_seconds integer
) returns table(
  points_awarded numeric, points_today numeric, points_remaining numeric,
  official_grade text, practice_grade text, reward_eligible boolean, replayed boolean
) language plpgsql security invoker set search_path = public as $$
declare
  v_official_grade text;
  v_existing public.practice_submissions%rowtype;
  v_before numeric := 0;
  v_award numeric := 0;
  v_eligible boolean := false;
begin
  select grade into v_official_grade from public.users where id = p_user_id for update;
  if not found then raise exception 'User not found'; end if;
  select ps.* into v_existing from public.practice_submissions ps
  where ps.user_id = p_user_id and ps.submission_key = p_submission_key;
  if found then
    select least(10, coalesce(sum(ps.points_earned), 0)) into v_before
    from public.practice_submissions ps where ps.user_id = p_user_id and ps.reward_day = p_reward_day;
    return query select v_existing.points_earned, v_before, greatest(0, 10-v_before),
      v_existing.official_grade_at_award, v_existing.practice_grade,
      coalesce(v_existing.reward_eligible, false), true;
    return;
  end if;
  if (select count(*) from public.practice_submissions ps
      where ps.user_id = p_user_id and ps.created_at >= now() - interval '1 minute') >= 12 then
    raise exception 'Practice submission rate limit reached';
  end if;
  select least(10, coalesce(sum(ps.points_earned), 0)) into v_before
  from public.practice_submissions ps where ps.user_id = p_user_id and ps.reward_day = p_reward_day;
  v_eligible := p_practice_grade = v_official_grade;
  if v_eligible then v_award := least(p_correct * 0.5, greatest(0, 10-v_before)); end if;
  insert into public.practice_submissions(
    user_id, submission_key, correct, total, difficulty, topics, points_earned,
    time_seconds, practice_grade, official_grade_at_award, reward_eligible, reward_day
  ) values (
    p_user_id, p_submission_key, p_correct, p_total, p_difficulty, p_topics, v_award,
    p_time_seconds, p_practice_grade, v_official_grade, v_eligible, p_reward_day
  );
  return query select v_award, least(10, v_before+v_award), greatest(0, 10-v_before-v_award),
    v_official_grade, p_practice_grade, v_eligible, false;
end $$;
revoke all on function public.award_practice_submission(uuid, text, integer, integer, text, date, text, text[], integer)
  from public, anon, authenticated;
grant execute on function public.award_practice_submission(uuid, text, integer, integer, text, date, text, text[], integer)
  to service_role;
