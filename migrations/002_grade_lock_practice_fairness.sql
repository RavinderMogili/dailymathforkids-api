-- PREPARED ONLY. Do not apply until the owner approves the cutover.
-- This migration never updates, deletes, resets, or recalculates points_earned.
-- Canonical reward day: America/Moncton calendar date (midnight-to-midnight).

alter table public.users
  add column if not exists grade_correction_used boolean not null default false;

create table if not exists public.official_grade_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  previous_grade text not null,
  new_grade text not null,
  change_type text not null check (change_type in ('one_time_self_service_correction', 'admin_approved_change')),
  change_reason text,
  changed_at timestamptz not null default now()
);
create index if not exists official_grade_changes_user_changed_idx
  on public.official_grade_changes (user_id, changed_at desc);
alter table public.official_grade_changes enable row level security;
revoke all on public.official_grade_changes from anon, authenticated;

alter table public.practice_submissions
  add column if not exists submission_key text,
  add column if not exists practice_grade text,
  add column if not exists official_grade_at_award text,
  add column if not exists reward_eligible boolean,
  add column if not exists reward_day date;

-- Accounting-only backfill. Existing award values remain byte-for-byte unchanged.
update public.practice_submissions
set reward_day = (created_at at time zone 'America/Moncton')::date
where reward_day is null;

create unique index if not exists practice_submissions_user_key_uidx
  on public.practice_submissions (user_id, submission_key)
  where submission_key is not null;
create index if not exists practice_submissions_user_reward_day_idx
  on public.practice_submissions (user_id, reward_day);

alter table public.submissions
  add column if not exists reward_day date,
  add column if not exists official_grade_at_submission text;
update public.submissions
set reward_day = case
  when left(quiz_id, 10) ~ '^\d{4}-\d{2}-\d{2}$' then left(quiz_id, 10)::date
  else (created_at at time zone 'America/Moncton')::date
end
where reward_day is null;
-- Historical duplicates are grandfathered. The partial constraint protects only new submissions.
create unique index if not exists submissions_one_protected_reward_per_day_uidx
  on public.submissions (user_id, reward_day)
  where official_grade_at_submission is not null;

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

