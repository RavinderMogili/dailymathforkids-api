create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  nickname text unique not null,
  grade text not null default 'Grade 3',
  school text,
  city text default 'Moncton',
  parent_email text,
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

-- Run once to add column to existing tables:
-- ALTER TABLE submissions ADD COLUMN IF NOT EXISTS time_seconds int default null;

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

create or replace view weekly_progress as
select
  user_id,
  date_trunc('week', created_at) as week,
  count(*) as days_played,
  sum(points_earned) as weekly_points,
  avg(score)::numeric(4,2) as avg_score
from submissions
group by 1, 2;
