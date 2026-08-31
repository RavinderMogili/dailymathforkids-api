import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const mockRpc = jest.fn();
const mockMaybeSingle = jest.fn();
const mockInsert = jest.fn(() => Promise.resolve({ error: null }));
const chain = {};
for (const method of ['select', 'eq', 'gte', 'lt', 'order', 'limit']) chain[method] = jest.fn(() => chain);
chain.maybeSingle = mockMaybeSingle;
chain.insert = mockInsert;

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ rpc: mockRpc, from: jest.fn(() => chain) })),
}));
jest.unstable_mockModule('../api/_prize-check.js', () => ({ checkPrizeMilestone: jest.fn(async () => {}) }));

function fakeRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.setHeader = jest.fn((key, value) => { res.headers[key] = value; });
  res.status = jest.fn(code => { res.statusCode = code; return res; });
  res.json = jest.fn(body => { res.body = body; return res; });
  res.end = jest.fn();
  return res;
}

describe('Practice reward authority', () => {
  let handler;
  beforeEach(async () => {
    jest.clearAllMocks();
    handler = (await import('../api/practice-submit.js')).default;
  });

  it('ignores fake client points and returns the database-calculated award', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ points_awarded: 5, points_today: 5,
      points_remaining: 5, official_grade: 'Grade 5', practice_grade: 'Grade 5',
      reward_eligible: true, replayed: false }], error: null });
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', submissionId: 'session-12345',
      correct: 10, total: 10, practiceGrade: 'Grade 5', pointsEarned: 100 } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.pointsEarned).toBe(5);
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty('pointsEarned');
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty('p_points_earned');
  });

  it('returns zero and Extra Practice eligibility for cross-grade work', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ points_awarded: 0, points_today: 4,
      points_remaining: 6, official_grade: 'Grade 5', practice_grade: 'Grade 6',
      reward_eligible: false, replayed: false }], error: null });
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', submissionId: 'session-67890',
      correct: 20, total: 20, practiceGrade: 'Grade 6' } }, res);
    expect(res.body).toMatchObject({ pointsEarned: 0, eligible: false, officialGrade: 'Grade 5' });
  });

  it('reports a replay without awarding a second time', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ points_awarded: 2.5, points_today: 7.5,
      points_remaining: 2.5, official_grade: 'Grade 5', practice_grade: 'Grade 5',
      reward_eligible: true, replayed: true }], error: null });
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', submissionId: 'same-session',
      correct: 5, total: 5, practiceGrade: 'Grade 5' } }, res);
    expect(res.body.replayed).toBe(true);
  });
});

describe('Official Grade correction', () => {
  let handler;
  beforeEach(async () => {
    jest.clearAllMocks();
    handler = (await import('../api/grade-correction.js')).default;
  });

  it('locks correction based on server state, independent of browser storage', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'u1', grade: 'Grade 4',
      pin_hash: createHash('sha256').update('1234').digest('hex'), grade_correction_used: true }, error: null });
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', newGrade: 'Grade 5', pin: '1234', confirmed: true } }, res);
    expect(res.statusCode).toBe(409);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation and a PIN', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', newGrade: 'Grade 5' } }, res);
    expect(res.statusCode).toBe(400);
  });
});

describe('Migration guarantees', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'migrations', '002_grade_lock_practice_fairness.sql'), 'utf8');

  it('does not update, delete, reset, or recalculate existing points', () => {
    expect(sql).not.toMatch(/set\s+points_earned/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.(submissions|practice_submissions)/i);
  });

  it('contains one-time correction, audit, idempotency, and protected Daily Quiz constraints', () => {
    expect(sql).toContain('grade_correction_used');
    expect(sql).toContain('official_grade_changes');
    expect(sql).toContain('practice_submissions_user_key_uidx');
    expect(sql).toContain('submissions_one_protected_reward_per_day_uidx');
  });

  it('encodes 0.5 per correct and the shared 10-point daily cap', () => {
    expect(sql).toMatch(/p_correct \* 0\.5/);
    expect(sql).toMatch(/least\(10/i);
    expect(sql).toMatch(/p_practice_grade = v_official_grade/);
  });

  it('restricts correction and award functions to the service role', () => {
    expect(sql).toMatch(/revoke all on function public\.correct_official_grade[\s\S]*from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.award_practice_submission[\s\S]*to service_role/i);
  });
});

describe('canonical reward day', () => {
  it('uses the America/Moncton calendar date rather than browser timezone', async () => {
    const { getRewardDay, REWARD_TIME_ZONE } = await import('../api/_time.js');
    expect(REWARD_TIME_ZONE).toBe('America/Moncton');
    expect(getRewardDay(new Date('2026-09-01T02:30:00Z'))).toBe('2026-08-31');
  });
});
