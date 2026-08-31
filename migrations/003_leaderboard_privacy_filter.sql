-- Legacy /api/leaderboard privacy fix: the "leaderboard" view and the
-- grade/speed queries in api/leaderboard.js read from users without
-- checking show_on_leaderboard, so students who never opted in could
-- appear on the public leaderboard. This migration scopes the view to
-- opted-in users only. It does not touch points_earned or any award data.

create or replace view public.leaderboard as
select
  u.id,
  u.nickname,
  u.grade,
  u.school,
  u.city,
  coalesce(sum(s.points_earned), 0)::int as total_points,
  count(s.id)::int as days_played,
  rank() over (order by coalesce(sum(s.points_earned), 0) desc) as rank
from public.users u
left join public.submissions s on s.user_id = u.id
where u.show_on_leaderboard = true
group by u.id, u.nickname, u.grade, u.school, u.city;
