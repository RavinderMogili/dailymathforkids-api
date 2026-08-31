import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

// A minimal fake Postgrest query builder that actually applies .eq()/.not()
// filters to an in-memory row set, so these tests prove opted-out users are
// excluded from the *result*, not just that a filter method was called.
function makeFakeQuery(rows) {
  let data = rows;
  const builder = {
    select: () => builder,
    not: (column, _op, value) => {
      data = data.filter(row => (value === null ? row[column] != null : true));
      return builder;
    },
    eq: (column, value) => {
      data = data.filter(row => {
        if (column.startsWith('users.')) {
          const field = column.slice('users.'.length);
          return row.users && row.users[field] === value;
        }
        return row[column] === value;
      });
      return builder;
    },
    like: () => builder,
    order: () => builder,
    limit: () => builder,
    then: resolve => Promise.resolve(resolve({ data, error: null })),
  };
  return builder;
}

const submissionsRows = [
  { quiz_id: '2026-09-01', time_seconds: 40, score: 5, user_id: 'opted-in',
    users: { nickname: 'OptedIn', grade: 'Grade 4', show_on_leaderboard: true } },
  { quiz_id: '2026-09-01', time_seconds: 10, score: 5, user_id: 'opted-out',
    users: { nickname: 'OptedOut', grade: 'Grade 4', show_on_leaderboard: false } },
];

const mockFrom = jest.fn(table => {
  if (table === 'submissions') return makeFakeQuery(submissionsRows);
  return makeFakeQuery([]);
});

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockFrom })),
}));

function fakeRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.setHeader = jest.fn((k, v) => { res.headers[k] = v; });
  res.status = jest.fn(code => { res.statusCode = code; return res; });
  res.json = jest.fn(body => { res.body = body; return res; });
  res.end = jest.fn();
  return res;
}

describe('GET /api/leaderboard?type=speed privacy filter', () => {
  let handler;
  beforeEach(async () => {
    jest.clearAllMocks();
    handler = (await import('../api/leaderboard.js')).default;
  });

  it('excludes a student who has not enabled show_on_leaderboard, even though they set the fastest time', async () => {
    const res = fakeRes();
    await handler({ method: 'GET', query: { type: 'speed' } }, res);
    expect(res.statusCode).toBe(200);
    const nicknames = res.body.leaderboard.map(row => row.nickname);
    expect(nicknames).toContain('OptedIn');
    expect(nicknames).not.toContain('OptedOut');
  });
});

describe('leaderboard view is scoped to opted-in users', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'migrations', '003_leaderboard_privacy_filter.sql'), 'utf8');
  const schema = fs.readFileSync(path.join(process.cwd(), 'schema.sql'), 'utf8');

  it('filters the view on show_on_leaderboard = true in both the migration and schema.sql', () => {
    expect(migration).toMatch(/where\s+u\.show_on_leaderboard\s*=\s*true/i);
    expect(schema).toMatch(/where\s+u\.show_on_leaderboard\s*=\s*true/i);
  });

  it('never mutates points_earned or any award data — read-only view change (narrow scope)', () => {
    expect(migration).not.toMatch(/\bupdate\s+public\./i);
    expect(migration).not.toMatch(/\balter\s+table\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).not.toMatch(/\bset\s+points_earned\b/i);
  });
});
