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
const mockSelectForInsert = jest.fn(() => ({ single: mockSingle }));
const mockInsert = jest.fn(() => ({ select: mockSelectForInsert }));
// practice_seen_questions lookup: .from(...).select(...).eq(...) -> {data, error}
const mockSeenEq = jest.fn(() => Promise.resolve({ data: [], error: null }));
const mockSeenSelect = jest.fn(() => ({ eq: mockSeenEq }));
const mockUpsert = jest.fn(() => Promise.resolve({ error: null }));
// Same `.select` name is used for two different chains (insert->select->single,
// and plain select->eq); disambiguate by whether `.single` or `.eq` is used next —
// simplest is to give `select` both shapes on the returned object.
const mockFrom = jest.fn(() => ({
  insert: mockInsert,
  select: mockSeenSelect,
  upsert: mockUpsert,
}));

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}));

jest.unstable_mockModule('../api/_practice-generators.js', () => ({
  generatePracticeQuestions: jest.fn((grade, topics, difficulty, count, seenSourceIds) =>
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

  it('looks up this user\'s previously-seen pool questions before generating', async () => {
    mockSeenEq.mockResolvedValueOnce({ data: [{ source_id: 'gsm8k-train-01077' }], error: null });
    const { generatePracticeQuestions } = await import('../api/_practice-generators.js');
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', grade: 4, topics: ['Word Problems'], count: 5 } }, res);
    expect(mockFrom).toHaveBeenCalledWith('practice_seen_questions');
    expect(generatePracticeQuestions).toHaveBeenCalledWith(
      4, ['Word Problems'], 'easy', 5, ['gsm8k-train-01077']
    );
  });

  it('a failed seen-questions lookup does not block session creation (best-effort)', async () => {
    mockSeenEq.mockResolvedValueOnce({ data: null, error: { message: 'db unreachable' } });
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', grade: 4, count: 3 } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('records newly-shown pool questions (with _sourceId) via upsert after creating the session', async () => {
    const { generatePracticeQuestions } = await import('../api/_practice-generators.js');
    generatePracticeQuestions.mockReturnValueOnce([
      { question: 'Q', questionFr: '', answer: '1', choices: ['1', '2'], hint: 'h', steps: ['s'], topic: 'Word Problems', _source: 'gsm8k', _sourceId: 'gsm8k-train-00001' },
      { question: 'Q2', questionFr: '', answer: '2', choices: ['1', '2'], hint: 'h', steps: ['s'], topic: 'Word Problems', _source: 'algorithmic', _sourceId: null },
    ]);
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', grade: 4, topics: ['Word Problems'], count: 2 } }, res);
    expect(mockUpsert).toHaveBeenCalledWith(
      [{ user_id: 'u1', source_id: 'gsm8k-train-00001', last_seen_at: expect.any(String) }],
      { onConflict: 'user_id,source_id' }
    );
  });

  it('does not call upsert when no generated question has a _sourceId', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', grade: 4, count: 2 } }, res);
    expect(mockUpsert).not.toHaveBeenCalled();
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
