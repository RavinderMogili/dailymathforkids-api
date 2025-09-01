create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  nickname text unique not null,
  created_at timestamptz default now()
);

create table if not exists quizzes (
  id text primary key,             -- e.g., '2025-09-01'
  questions jsonb not null,
  answers jsonb not null
);

create table if not exists submissions (
  id bigserial primary key,
  user_id uuid references users(id),
  quiz_id text references quizzes(id),
  score int not null,
  created_at timestamptz default now(),
  unique (user_id, quiz_id)
);

create view if not exists weekly_progress as
select user_id,
       date_trunc('week', created_at) as week,
       count(*) as days_played,
       avg(score)::numeric(4,2) as avg_score
from submissions
group by 1,2;
