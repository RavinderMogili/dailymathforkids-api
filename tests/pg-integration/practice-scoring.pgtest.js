/**
 * Real-Postgres integration tests for submit_practice_session() — the
 * atomic function in migrations/002_practice_sessions.sql.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM tests/practice-session.test.js:
 * that file mocks the Supabase client, so it can only prove the *handler*
 * calls the RPC correctly and handles its response correctly — a mock
 * returns whatever it's told to, so it cannot prove the SQL itself
 * correctly re-derives correctness, blocks replay, or serializes concurrent
 * requests under real row locking. Only running the actual PL/pgSQL against
 * a real Postgres server proves that. This file does that.
 *
 * ISOLATION: connects ONLY to TEST_DATABASE_URL, which must be set
 * explicitly (no default, no fallback to any Supabase/production
 * connection string) and is checked against a small blocklist of
 * known-production-looking hosts before anything runs. Intended target: an
 * ephemeral local Postgres container, e.g.:
 *
 *   docker run -d --name dmk-test-pg -e POSTGRES_PASSWORD=localtestpw \
 *     -e POSTGRES_DB=dmk_test -p 55432:5432 postgres:16-alpine
 *   TEST_DATABASE_URL=postgres://postgres:localtestpw@localhost:55432/dmk_test \
 *     npm run test:pg
 *
 * This file does NOT touch Supabase, Vercel, or any deployed API — it opens
 * a plain `pg` connection to whatever TEST_DATABASE_URL says and nothing
 * else. Excluded from default `npm test` (see jest.config.js) so it never
 * runs — and never fails confusingly for lack of Postgres — by accident.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTION_HOST_SUBSTRINGS = ['supabase.co', 'vercel.app', 'amazonaws.com'];

function assertNonProductionUrl(url) {
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. This test refuses to guess a target. ' +
      'Point it at a local/ephemeral Postgres instance, e.g.:\n' +
      '  TEST_DATABASE_URL=postgres://postgres:localtestpw@localhost:55432/dmk_test npm run test:pg'
    );
  }
  const lower = url.toLowerCase();
  for (const bad of PRODUCTION_HOST_SUBSTRINGS) {
    if (lower.includes(bad)) {
      throw new Error(
        `Refusing to run against a database URL containing "${bad}" — this looks like ` +
        'a hosted/production-shaped connection string, not a local test database.'
      );
    }
  }
}

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
assertNonProductionUrl(TEST_DATABASE_URL);

let pool;
let userA, userB;

async function makeUser(client, nickname) {
  const { rows } = await client.query(
    `insert into users (nickname, grade) values ($1, 'Grade 4') returning id`,
    [nickname]
  );
  return rows[0].id;
}

async function makeSession(client, userId, questions, { expiresInMinutes = 30 } = {}) {
  const { rows } = await client.query(
    `insert into practice_sessions (user_id, questions, grade, topics, difficulty, expires_at)
     values ($1, $2::jsonb, 4, ARRAY['Word Problems'], 'easy', now() + ($3 || ' minutes')::interval)
     returning id`,
    [userId, JSON.stringify(questions), String(expiresInMinutes)]
  );
  return rows[0].id;
}

function submit(client, sessionId, userId, selections, day = new Date().toISOString().slice(0, 10)) {
  return client.query(
    `select submit_practice_session($1, $2, $3::jsonb, $4, $5::date) as result`,
    [sessionId, userId, JSON.stringify(selections), 60, day]
  ).then(r => r.rows[0].result);
}

const SAMPLE_QUESTIONS = Array.from({ length: 10 }, (_, i) => ({
  question: `Q${i}`, answer: String(i), choices: [String(i), String(i + 1), String(i + 2), String(i + 3)],
}));

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  const client = await pool.connect();
  try {
    // Minimal bootstrap: just enough of schema.sql for this function's FKs.
    await client.query('create extension if not exists pgcrypto');
    await client.query(`
      create table if not exists users (
        id uuid primary key default gen_random_uuid(),
        nickname text unique not null,
        grade text not null default 'Grade 3',
        created_at timestamptz default now()
      );
    `);
    const migrationSql = readFileSync(
      path.join(__dirname, '..', '..', 'migrations', '002_practice_sessions.sql'), 'utf-8'
    );
    // practice_submissions doesn't exist in this minimal bootstrap yet —
    // create the real one (from schema.sql) before running the migration,
    // which ALTERs it.
    await client.query(`
      create table if not exists practice_submissions (
        id bigserial primary key,
        user_id uuid references users(id) on delete cascade,
        correct int not null default 0,
        total int not null default 0,
        difficulty text default 'easy',
        topics text[] default '{}',
        points_earned numeric(4,1) default 0,
        time_seconds int default null,
        created_at timestamptz default now()
      );
    `);
    await client.query(migrationSql);
  } finally {
    client.release();
  }
}, 30000);

afterAll(async () => {
  if (pool) await pool.end();
});

beforeEach(async () => {
  // Fresh users per test to keep the daily-cap state isolated between tests.
  const client = await pool.connect();
  try {
    userA = await makeUser(client, 'pgtest_a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
    userB = await makeUser(client, 'pgtest_b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
  } finally {
    client.release();
  }
});

describe('submit_practice_session — correctness', () => {
  it('scores incorrect answers as incorrect and correct answers as correct', async () => {
    const client = await pool.connect();
    try {
      const sessionId = await makeSession(client, userA, SAMPLE_QUESTIONS);
      const result = await submit(client, sessionId, userA, [
        { index: 0, choice: '0' },   // correct
        { index: 1, choice: 'nope' }, // wrong
        { index: 2, choice: '2' },   // correct
        // indices 3-9 left unanswered = wrong
      ]);
      expect(result.correct).toBe(2);
      expect(result.total).toBe(10);
      expect(result.pointsEarned).toBe(1); // 2 * 0.5
    } finally { client.release(); }
  });

  it('a forged/absent selection can never score as correct — only the stored answer key counts', async () => {
    const client = await pool.connect();
    try {
      const sessionId = await makeSession(client, userA, SAMPLE_QUESTIONS);
      // Client claims it answered everything right by sending the exact
      // answer text for a QUESTION IT WASN'T ASKED (index 99) and garbage
      // for real indices — none of this should score.
      const result = await submit(client, sessionId, userA, [
        { index: 99, choice: '0' },
        { index: 0, choice: 'definitely-not-0' },
      ]);
      expect(result.correct).toBe(0);
      expect(result.pointsEarned).toBe(0);
    } finally { client.release(); }
  });
});

describe('submit_practice_session — replay protection', () => {
  it('a second submission of the same session returns already:true and does not double-award points', async () => {
    const client = await pool.connect();
    try {
      const sessionId = await makeSession(client, userA, SAMPLE_QUESTIONS);
      const first = await submit(client, sessionId, userA, [{ index: 0, choice: '0' }]);
      expect(first.already).toBe(false);
      expect(first.pointsEarned).toBe(0.5);

      const second = await submit(client, sessionId, userA, [
        { index: 0, choice: '0' }, { index: 1, choice: '1' }, { index: 2, choice: '2' },
      ]);
      expect(second.already).toBe(true);

      const { rows } = await client.query(
        `select count(*)::int as n, coalesce(sum(points_earned),0)::numeric as total
         from practice_submissions where user_id = $1`, [userA]
      );
      expect(rows[0].n).toBe(1); // only ONE submission row exists, from the first call
      expect(Number(rows[0].total)).toBe(0.5); // not 0.5 + (3 * 0.5) from the replay attempt
    } finally { client.release(); }
  });

  it('a session belonging to another user cannot be submitted', async () => {
    const client = await pool.connect();
    try {
      const sessionId = await makeSession(client, userA, SAMPLE_QUESTIONS);
      const result = await submit(client, sessionId, userB, [{ index: 0, choice: '0' }]);
      expect(result.error).toBe('session_not_found'); // deliberately not distinguished from "doesn't exist"
    } finally { client.release(); }
  });

  it('an expired session cannot be submitted', async () => {
    const client = await pool.connect();
    try {
      const sessionId = await makeSession(client, userA, SAMPLE_QUESTIONS, { expiresInMinutes: -1 });
      const result = await submit(client, sessionId, userA, [{ index: 0, choice: '0' }]);
      expect(result.error).toBe('session_expired');
    } finally { client.release(); }
  });
});

describe('submit_practice_session — atomic daily cap under concurrency', () => {
  it('sequential submissions correctly cap total daily points at 10', async () => {
    const client = await pool.connect();
    try {
      const day = '2027-01-01'; // fixed day, isolated from other tests by user
      let totalAwarded = 0;
      // 6 separate 10-question, all-correct sessions = 30 raw points if uncapped.
      for (let i = 0; i < 6; i++) {
        const sessionId = await makeSession(client, userA, SAMPLE_QUESTIONS);
        const selections = SAMPLE_QUESTIONS.map((q, idx) => ({ index: idx, choice: q.answer }));
        const result = await submit(client, sessionId, userA, selections, day);
        totalAwarded += result.pointsEarned;
      }
      expect(totalAwarded).toBe(10); // capped, not 30
    } finally { client.release(); }
  });

  it('CONCURRENT submissions near the cap never exceed it (the bug the old read-then-write code had)', async () => {
    const day = '2027-01-02';
    // Pre-load 8 of the 10 points via one connection.
    const setupClient = await pool.connect();
    let firstSessionId;
    try {
      firstSessionId = await makeSession(setupClient, userA, SAMPLE_QUESTIONS);
      const selections16correct = SAMPLE_QUESTIONS.slice(0, 8).map((q, idx) => ({ index: idx, choice: q.answer }));
      const preload = await submit(setupClient, firstSessionId, userA, selections16correct, day);
      expect(preload.pointsEarned).toBe(4); // 8 correct * 0.5 = 4 pts used, 6 remaining
    } finally { setupClient.release(); }

    // Now fire 5 CONCURRENT sessions, each fully correct (5 raw points each,
    // 25 total raw) — only 6 points of headroom remain. Every connection is
    // a genuinely separate Postgres backend connection, racing for real.
    const concurrentClients = await Promise.all(Array.from({ length: 5 }, () => pool.connect()));
    try {
      const sessionIds = [];
      for (const c of concurrentClients) {
        sessionIds.push(await makeSession(c, userA, SAMPLE_QUESTIONS));
      }
      const selectionsAllCorrect = SAMPLE_QUESTIONS.map((q, idx) => ({ index: idx, choice: q.answer }));
      const results = await Promise.all(
        concurrentClients.map((c, i) => submit(c, sessionIds[i], userA, selectionsAllCorrect, day))
      );
      const awardedThisRound = results.reduce((s, r) => s + r.pointsEarned, 0);
      expect(awardedThisRound).toBe(6); // exactly the remaining headroom, not 25

      const { rows } = await pool.query(
        `select points_used from practice_daily_points where user_id = $1 and day = $2`, [userA, day]
      );
      expect(Number(rows[0].points_used)).toBe(10); // 4 preload + 6 = exactly the cap, never more
    } finally {
      concurrentClients.forEach(c => c.release());
    }
  }, 20000);

  it('concurrent requests for DIFFERENT users do not interfere with each other\'s caps', async () => {
    const day = '2027-01-03';
    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      const sessionA = await makeSession(clientA, userA, SAMPLE_QUESTIONS);
      const sessionB = await makeSession(clientB, userB, SAMPLE_QUESTIONS);
      const allCorrect = SAMPLE_QUESTIONS.map((q, idx) => ({ index: idx, choice: q.answer }));
      const [resultA, resultB] = await Promise.all([
        submit(clientA, sessionA, userA, allCorrect, day),
        submit(clientB, sessionB, userB, allCorrect, day),
      ]);
      expect(resultA.pointsEarned).toBe(5); // each user has their own independent 10 pt/day cap
      expect(resultB.pointsEarned).toBe(5);
    } finally {
      clientA.release();
      clientB.release();
    }
  });
});
