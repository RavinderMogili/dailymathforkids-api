-- READ-ONLY diagnostics. Never updates data or labels a student as dishonest.
select user_id, array_agg(distinct coalesce(official_grade_at_submission, split_part(quiz_id, '-', 4))) as observed_grades
from public.submissions group by user_id having count(distinct coalesce(official_grade_at_submission, split_part(quiz_id, '-', 4))) > 1;

select user_id, (created_at at time zone 'America/Moncton')::date as practice_day, sum(points_earned) as recorded_points
from public.practice_submissions group by 1, 2 having sum(points_earned) > 10;

select user_id, submission_key, count(*) as copies
from public.practice_submissions where submission_key is not null group by 1, 2 having count(*) > 1;

select user_id, left(quiz_id, 10) as quiz_day, count(*) as submissions, array_agg(distinct quiz_id) as quiz_ids
from public.submissions group by 1, 2 having count(*) > 1;

select user_id, created_at, points_earned
from public.submissions where points_earned >= 20 order by points_earned desc, created_at desc;

