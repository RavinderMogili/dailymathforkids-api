/**
 * Mocked unit tests for the practice-session endpoints (practice-session-start,
 * practice-submit). These verify handler-level logic — input validation,
 * request shape, and correct forwarding to/handling of the database RPC
 * response — using a mocked Supabase client. They do NOT and cannot prove
 * the atomic scoring function itself is correct (a mock returns whatever
 * it's told to); that's what tests/live/practice-session-pg.test.js (real
 * local Postgres) is for. See that file's header for which claims belong
 * to which tier.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockRpc = jest.fn();
const mockSingle = jest.fn();
const mockSelect = jest.fn(() => ({ single: mockSingle }));
const mockInsert = jest.fn(() => ({ select: mockSelect }));
const mockFrom = jest.fn(() => ({ insert: mockInsert }));

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}));

jest.unstable_mockModule('../api/_practice-generators.js', () => ({
  generatePracticeQuestions: jest.fn((grade, topics, difficulty, count) =>
    Array.from({ length: count }, (_, i) => ({
      question: `Q${i} for grade ${grade}`,
      questionFr: '',
      answer: String(i),
      choices: [String(i), String(i + 1), String(i + 2), String(i + 3)],
      hint: 'hint', steps: ['step'], topic: topics[0] || 'General',
      _source: 'algorithmic', _sourceId: null,
    }))
  ),
}));

function fakeRes() {
  const res = {};
  res.setHeader = jest.fn();
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((data) => { res.body = data; return res; });
  res.end = jest.fn();
  return res;
}

describe('POST /api/practice-session-start', () => {
  let handler;
  beforeEach(async () => {
    jest.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { id: 'session-abc-123' }, error: null });
    const mod = await import('../api/practice-session-start.js');
    handler = mod.default;
  });

  it('rejects missing userId', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { grade: 4 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('generates the requested number of questions and returns a sessionId', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', grade: 4, topics: ['Fractions'], difficulty: 'easy', count: 7 } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.sessionId).toBe('session-abc-123');
    expect(res.body.questions).toHaveLength(7);
  });

  it('clamps an out-of-range count to the maximum', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', grade: 4, count: 500 } }, res);
    expect(res.body.questions.length).toBeLessThanOrEqual(20);
  });

  it('stores the generated questions (with answers) server-side via insert', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', grade: 5, count: 3 } }, res);
    expect(mockFrom).toHaveBeenCalledWith('practice_sessions');
    const insertedRow = mockInsert.mock.calls[0][0];
    expect(insertedRow.user_id).toBe('u1');
    expect(insertedRow.questions).toHaveLength(3);
    expect(insertedRow.questions[0].answer).toBeDefined(); // server's copy includes the key
    expect(insertedRow.expires_at).toBeDefined();
  });
});

describe('POST /api/practice-submit (session-verified)', () => {
  let handler;
  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import('../api/practice-submit.js');
    handler = mod.default;
  });

  it('rejects a request with no sessionId (the old {correct,total} shape is no longer accepted)', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', correct: 10, total: 10 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toMatch(/sessionId/i);
  });

  it('rejects a request with no selections array', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', sessionId: 's1' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('forwards to the atomic RPC with the session id, user id, selections, and a computed day', async () => {
    mockRpc.mockResolvedValue({ data: { already: false, correct: 2, total: 5, pointsEarned: 1, pointsToday: 1, pointsRemaining: 9, results: [] }, error: null });
    const res = fakeRes();
    await handler({ method: 'POST', body: {
      userId: 'u1', sessionId: 's1',
      selections: [{ index: 0, choice: 'A' }, { index: 1, choice: 'B' }],
      timeSeconds: 42,
    } }, res);
    expect(mockRpc).toHaveBeenCalledWith('submit_practice_session', expect.objectContaining({
      p_session_id: 's1',
      p_user_id: 'u1',
      p_selections: [{ index: 0, choice: 'A' }, { index: 1, choice: 'B' }],
      p_time_seconds: 42,
    }));
    expect(typeof mockRpc.mock.calls[0][1].p_day).toBe('string');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.correct).toBe(2);
    expect(res.body.pointsEarned).toBe(1);
  });

  it('IGNORES a forged correctness/points claim in the request body — only the RPC result is trusted', async () => {
    mockRpc.mockResolvedValue({ data: { already: false, correct: 0, total: 5, pointsEarned: 0, pointsToday: 0, pointsRemaining: 10, results: [] }, error: null });
    const res = fakeRes();
    await handler({ method: 'POST', body: {
      userId: 'u1', sessionId: 's1',
      selections: [{ index: 0, choice: 'wrong-on-purpose' }],
      // Forged fields a malicious/buggy client might still send:
      correct: 999, total: 1, pointsEarned: 999,
    } }, res);
    // The handler must never read req.body.correct/total/pointsEarned for scoring —
    // the response reflects only what the (server-side-verified) RPC returned.
    expect(res.body.correct).toBe(0);
    expect(res.body.pointsEarned).toBe(0);
    expect(res.body.correct).not.toBe(999);
  });

  it('treats a replayed/duplicate session submission as "already", not a fresh score', async () => {
    mockRpc.mockResolvedValue({ data: { already: true }, error: null });
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', sessionId: 's1', selections: [] } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.already).toBe(true);
    expect(res.body.pointsEarned).toBe(0);
  });

  it('returns 404 for a session that does not exist (or belongs to another user)', async () => {
    mockRpc.mockResolvedValue({ data: { error: 'session_not_found' }, error: null });
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', sessionId: 'nope', selections: [] } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 410 for an expired session', async () => {
    mockRpc.mockResolvedValue({ data: { error: 'session_expired' }, error: null });
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', sessionId: 's1', selections: [] } }, res);
    expect(res.status).toHaveBeenCalledWith(410);
  });
});
