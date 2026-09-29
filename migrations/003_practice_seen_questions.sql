-- Migration: server-side exposure tracking for pool-sourced practice
-- questions (hand-curated pool + GSM8K extended pool).
--
-- WHY: server-issued practice sessions (migrations/002_practice_sessions.sql)
-- generate questions in api/_practice-generators.js, which previously had no
-- repeat-avoidance at all — the old client-side localStorage mechanism
-- (dmk_extpool_seen_ids in scripts/practice-engine.js) only ever applied to
-- the non-points-eligible offline-fallback path, never to real server
-- sessions. With only ~100 GSM8K pilot questions, a student practicing
-- Word Problems regularly could see the same question repeatedly with zero
-- avoidance. This table moves that "have I seen this before" memory
-- server-side, keyed by user_id instead of browser/localStorage — fixing
-- both the missing-repeat-avoidance regression AND the old mechanism's
-- documented cross-device/private-browsing blind spot at the same time.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

CREATE TABLE IF NOT EXISTS practice_seen_questions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id text NOT NULL,        -- q._sourceId, e.g. 'gsm8k-train-01077'
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source_id)
);

-- Naturally bounded in size: only pool questions carry a _sourceId (the
-- hand-curated and GSM8K-extended pools together are on the order of a few
-- hundred records), so this table grows at most to
-- (active users) x (distinct pool questions ever seen) — not with every
-- practice session, unlike practice_submissions.
CREATE INDEX IF NOT EXISTS idx_practice_seen_questions_user ON practice_seen_questions(user_id);
