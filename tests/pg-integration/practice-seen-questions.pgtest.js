/**
 * Real-Postgres integration test for migrations/003_practice_seen_questions.sql.
 * Verifies the schema itself (upsert-on-conflict semantics, per-user isolation)
 * against a real Postgres — the application-level preferUnseen() logic in
 * api/_practice-generators.js is covered by mocked unit tests; this file only
 * proves the table/constraint behavior the app code relies on.
 *
 * ISOLATION: same TEST_DATABASE_URL safety guard as practice-scoring.pgtest.js.
 * See that file's header for the full explanation and how to run this:
 *
 *   docker run -d --name dmk-test-pg -e POSTGRES_PASSWORD=localtestpw \
 *     -e POSTGRES_DB=dmk_test -p 55432:5432 postgres:16-alpine
 *   TEST_DATABASE_URL=postgres://postgres:localtestpw@localhost:55432/dmk_test \
 *     npm run test:pg
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
    throw new Error('TEST_DATABASE_URL is not set. See this file\'s header comment.');
  }
  const lower = url.toLowerCase();
  for (const bad of PRODUCTION_HOST_SUBSTRINGS) {
    if (lower.includes(bad)) {
      throw new Error(`Refusing to run against a database URL containing "${bad}".`);
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

async function upsertSeen(client, rows) {
  // Mirrors the app's upsert call in api/practice-session-start.js.
  const values = rows.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
  const params = rows.flatMap(r => [r.user_id, r.source_id, r.last_seen_at]);
  await client.query(
    `insert into practice_seen_questions (user_id, source_id, last_seen_at)
     values ${values}
     on conflict (user_id, source_id) do update set last_seen_at = excluded.last_seen_at`,
    params
  );
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  const client = await pool.connect();
  try {
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
      path.join(__dirname, '..', '..', 'migrations', '003_practice_seen_questions.sql'), 'utf-8'
    );
    await client.query(migrationSql);
  } finally {
    client.release();
  }
}, 30000);

afterAll(async () => {
  if (pool) await pool.end();
});

beforeEach(async () => {
  const client = await pool.connect();
  try {
    userA = await makeUser(client, 'pgtest_seen_a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
    userB = await makeUser(client, 'pgtest_seen_b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
  } finally {
    client.release();
  }
});

describe('practice_seen_questions', () => {
  it('records a newly-seen source_id for a user', async () => {
    const client = await pool.connect();
    try {
      await upsertSeen(client, [{ user_id: userA, source_id: 'gsm8k-train-00001', last_seen_at: new Date().toISOString() }]);
      const { rows } = await client.query(
        `select source_id from practice_seen_questions where user_id = $1`, [userA]
      );
      expect(rows.map(r => r.source_id)).toEqual(['gsm8k-train-00001']);
    } finally { client.release(); }
  });

  it('upserting the same (user, source_id) again updates last_seen_at instead of duplicating', async () => {
    const client = await pool.connect();
    try {
      await upsertSeen(client, [{ user_id: userA, source_id: 'gsm8k-train-00001', last_seen_at: '2026-01-01T00:00:00Z' }]);
      await upsertSeen(client, [{ user_id: userA, source_id: 'gsm8k-train-00001', last_seen_at: '2026-06-01T00:00:00Z' }]);
      const { rows } = await client.query(
        `select source_id, last_seen_at from practice_seen_questions where user_id = $1`, [userA]
      );
      expect(rows).toHaveLength(1); // still one row, not two
      expect(new Date(rows[0].last_seen_at).getUTCMonth()).toBe(5); // June, the later write won
    } finally { client.release(); }
  });

  it('two different users seeing the same source_id do not collide (independent per-user rows)', async () => {
    const client = await pool.connect();
    try {
      await upsertSeen(client, [
        { user_id: userA, source_id: 'gsm8k-train-00002', last_seen_at: new Date().toISOString() },
        { user_id: userB, source_id: 'gsm8k-train-00002', last_seen_at: new Date().toISOString() },
      ]);
      const { rows } = await client.query(
        `select user_id from practice_seen_questions where source_id = 'gsm8k-train-00002'`
      );
      expect(rows.map(r => r.user_id).sort()).toEqual([userA, userB].sort());
    } finally { client.release(); }
  });

  it('deleting a user cascades to their seen-questions rows', async () => {
    const client = await pool.connect();
    try {
      await upsertSeen(client, [{ user_id: userA, source_id: 'gsm8k-train-00003', last_seen_at: new Date().toISOString() }]);
      await client.query(`delete from users where id = $1`, [userA]);
      const { rows } = await client.query(
        `select * from practice_seen_questions where user_id = $1`, [userA]
      );
      expect(rows).toHaveLength(0);
    } finally { client.release(); }
  });
});
