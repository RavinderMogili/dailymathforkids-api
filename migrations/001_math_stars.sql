-- Migration: Math Stars (Our Math Stars feature)
-- Adds leaderboard opt-in, nickname moderation support, and reward tracking.
-- Run in Supabase SQL Editor. Safe to run multiple times (uses IF NOT EXISTS / IF NOT EXISTS patterns).

-- 1. Add leaderboard opt-in fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_on_leaderboard boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS leaderboard_opted_in_at timestamptz;

-- 2. Reward milestone tracking
CREATE TABLE IF NOT EXISTS reward_milestones (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  threshold int NOT NULL DEFAULT 300,
  reached_at timestamptz NOT NULL DEFAULT now(),
  reward_status text NOT NULL DEFAULT 'eligible',  -- eligible | contacted | delivered
  delivered_at timestamptz,
  UNIQUE (user_id, threshold)
);

-- 3. Index for efficient weekly leaderboard queries
-- Covers: submissions in a date range for opted-in users
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_practice_submissions_created_at ON practice_submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_users_show_on_leaderboard ON users(show_on_leaderboard) WHERE show_on_leaderboard = true;
