-- Migration: server-issued, server-verified practice sessions.
-- Closes the gap where /api/practice-submit trusted a client-reported
-- {correct, total} count with no way to check it against real question
-- data, and fixes a real (if narrow) race condition in the old read-then-
-- write daily-cap check (two near-simultaneous submissions could each read
-- the same "points used so far" and both be awarded up to the cap,
-- exceeding 10 pts/day in total).
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- 1. Server-issued sessions: the server generates and stores the actual
--    questions (including answers) for a practice round before the student
--    sees them, and this row is what submissions get verified against.
CREATE TABLE IF NOT EXISTS practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  questions jsonb NOT NULL,       -- [{question, choices, answer, topic, _source, _sourceId}, ...]
  grade int,
  topics text[],
  difficulty text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz         -- NULL until submitted once; NOT NULL blocks replay
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_user ON practice_sessions(user_id, created_at DESC);
-- Sessions are short-lived (see SESSION_TTL_MINUTES in practice-session-start.js);
-- an index on expires_at supports an optional periodic cleanup job (not required
-- for correctness — expired/unconsumed sessions are just harmless dead rows).
CREATE INDEX IF NOT EXISTS idx_practice_sessions_expires ON practice_sessions(expires_at);

-- 2. Traceability: which session (if any) produced a given practice_submissions
--    row. Nullable — historical rows predate this and have none.
ALTER TABLE practice_submissions ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES practice_sessions(id);

-- 3. Per-user-per-day running total for the 10 pt/day cap. Replaces the old
--    approach of summing practice_submissions.points_earned over a rolling
--    36-hour window at request time (which was both a race condition and a
--    slightly indirect way to ask "how many points has this user used
--    today"). `day` is the calendar day string in America/Moncton (computed
--    in application code, same as before — this table doesn't hardcode a
--    timezone) so the cap still resets at local midnight, not UTC midnight.
CREATE TABLE IF NOT EXISTS practice_daily_points (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  points_used numeric(4,1) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- 4. The atomic function. Verifies submitted selections against the
--    session's own stored answer key (never trusts a client-reported
--    correct count), enforces single-use via consumed_at (replay
--    protection), and enforces the 10 pt/day cap with real row-level
--    locking — SELECT ... FOR UPDATE on both the session row and the daily-
--    points row means two concurrent calls for the same session or the same
--    user+day serialize correctly instead of racing. Runs as a single
--    implicit transaction when called via one RPC round-trip (Supabase
--    `.rpc()`), so either the whole scoring operation commits or none of it
--    does.
CREATE OR REPLACE FUNCTION submit_practice_session(
  p_session_id uuid,
  p_user_id uuid,
  p_selections jsonb,     -- [{"index": 0, "choice": "42"}, ...] — one entry per answered question
  p_time_seconds int,
  p_day date              -- the submitting user's local calendar day (America/Moncton), computed by the caller
) RETURNS jsonb AS $$
DECLARE
  v_session practice_sessions%ROWTYPE;
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
BEGIN
  SELECT * INTO v_session FROM practice_sessions
    WHERE id = p_session_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'session_not_found');
  END IF;

  IF v_session.user_id <> p_user_id THEN
    -- Do not distinguish "wrong user" from "not found" in the error code —
    -- avoids letting a caller enumerate other users' session IDs.
    RETURN jsonb_build_object('error', 'session_not_found');
  END IF;

  IF v_session.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('already', true);
  END IF;

  IF v_session.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'session_expired');
  END IF;

  -- Mark consumed BEFORE scoring, while still holding the row lock from the
  -- SELECT above — a concurrent second call for this same session_id blocks
  -- on that lock until this transaction commits, then sees consumed_at set
  -- and returns {"already": true} instead of double-scoring.
  UPDATE practice_sessions SET consumed_at = now() WHERE id = p_session_id;

  v_questions := v_session.questions;
  v_total := jsonb_array_length(v_questions);

  FOR v_i IN 0..v_total - 1 LOOP
    v_q := v_questions -> v_i;
    SELECT s INTO v_sel FROM jsonb_array_elements(coalesce(p_selections, '[]'::jsonb)) s
      WHERE (s ->> 'index')::int = v_i
      LIMIT 1;
    v_sel_choice := v_sel ->> 'choice';
    v_is_correct := (v_sel_choice IS NOT NULL AND v_sel_choice = (v_q ->> 'answer'));
    IF v_is_correct THEN
      v_correct := v_correct + 1;
    END IF;
    v_results := v_results || jsonb_build_object('index', v_i, 'correct', v_is_correct);
  END LOOP;

  v_raw_points := v_correct * 0.5;

  INSERT INTO practice_daily_points (user_id, day, points_used)
    VALUES (p_user_id, p_day, 0)
    ON CONFLICT (user_id, day) DO NOTHING;

  SELECT points_used INTO v_before FROM practice_daily_points
    WHERE user_id = p_user_id AND day = p_day
    FOR UPDATE;

  v_awarded := LEAST(v_raw_points, GREATEST(0, 10 - v_before));

  UPDATE practice_daily_points SET points_used = v_before + v_awarded
    WHERE user_id = p_user_id AND day = p_day;

  INSERT INTO practice_submissions (user_id, correct, total, difficulty, topics, points_earned, time_seconds, session_id)
    VALUES (p_user_id, v_correct, v_total, v_session.difficulty, v_session.topics, v_awarded, p_time_seconds, p_session_id)
    RETURNING id INTO v_new_submission_id;

  RETURN jsonb_build_object(
    'already', false,
    'correct', v_correct,
    'total', v_total,
    'pointsEarned', v_awarded,
    'pointsToday', v_before + v_awarded,
    'pointsRemaining', GREATEST(0, 10 - (v_before + v_awarded)),
    'results', v_results,
    'submissionId', v_new_submission_id
  );
END;
$$ LANGUAGE plpgsql;
