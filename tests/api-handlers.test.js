import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock Supabase ──
const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();
const mockGte = jest.fn(() => ({ data: [], error: null }));
const mockLimit = jest.fn(() => ({ single: mockSingle, maybeSingle: mockMaybeSingle }));
const mockLike = jest.fn(() => ({ maybeSingle: mockMaybeSingle, limit: mockLimit }));
const mockEq = jest.fn(() => ({ single: mockSingle, like: mockLike, limit: mockLimit, maybeSingle: mockMaybeSingle, gte: mockGte }));
const mockSelect = jest.fn(() => ({ eq: mockEq, single: mockSingle }));
const mockInsert = jest.fn(() => ({ select: mockSelect }));
const mockUpsert = jest.fn(() => ({ select: mockSelect }));
const mockFrom = jest.fn(() => ({ select: mockSelect, insert: mockInsert, upsert: mockUpsert }));

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockFrom })),
}));

// ── Fake req/res ──
function fakeRes() {
  const res = {};
  res.statusCode = 200;
  res.headers = {};
  res.body = null;
  res.setHeader = jest.fn((k, v) => { res.headers[k] = v; });
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((data) => { res.body = data; return res; });
  res.end = jest.fn();
  return res;
}

// ── Register tests ──
describe('POST /api/register', () => {
  let handler;
  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import('../api/register.js');
    handler = mod.default;
  });

  it('rejects missing nickname', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { grade: 'G3' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toMatch(/nickname/i);
  });

  it('rejects missing grade', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { nickname: 'test' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toMatch(/grade/i);
  });

  it('rejects non-POST methods', async () => {
    const res = fakeRes();
    await handler({ method: 'GET' }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('handles OPTIONS preflight', async () => {
    const res = fakeRes();
    await handler({ method: 'OPTIONS' }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalled();
  });

  it('rejects missing PIN', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { nickname: 'Alice', grade: 'G3' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toMatch(/pin/i);
  });

  it('rejects missing security question when no parent email', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { nickname: 'Alice', grade: 'G3', pin: '1234' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toMatch(/security question|parent_email/i);
  });

  it('registers successfully with valid data', async () => {
    // First call: maybeSingle for duplicate check (no existing user)
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    // Second call: insert().select().single()
    mockSingle.mockResolvedValueOnce({
      data: { id: 'uuid-1', nickname: 'Alice', grade: 'G3', school: null, city: null, parent_email: null },
      error: null,
    });
    const res = fakeRes();
    await handler({ method: 'POST', body: {
      nickname: 'Alice', grade: 'G3', pin: '1234',
      security_question: 'What city were you born in?', security_answer: 'Toronto',
    } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.nickname).toBe('Alice');
    expect(res.body.userId).toBe('uuid-1');
  });
});

// ── Submit tests ──
describe('POST /api/submit', () => {
  let handler;
  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import('../api/submit.js');
    handler = mod.default;
  });

  it('rejects missing userId', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { quizId: 'q1', answers: [] } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toMatch(/bad input/i);
  });

  it('rejects missing answers array', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', quizId: 'q1' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects non-POST', async () => {
    const res = fakeRes();
    await handler({ method: 'GET' }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('blocks re-submission when user already submitted today', async () => {
    // limit(2) returns one existing submission row — should block
    mockLimit.mockResolvedValueOnce({ data: [{ id: 1 }], error: null });
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', quizId: '2026-07-09-G12', answers: ['A'] } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.already).toBe(true);
    expect(res.body.score).toBeNull();
  });
});

// ── Practice submit tests ──
describe('POST /api/practice-submit', () => {
  let handler;
  beforeEach(async () => {
    jest.clearAllMocks();
    mockGte.mockImplementation(() => ({ data: [], error: null }));
    const mod = await import('../api/practice-submit.js');
    handler = mod.default;
  });

  it('rejects missing userId', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { correct: 3, total: 5 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('caps points at the remaining daily allowance and ignores a client-supplied pointsEarned', async () => {
    // 8 points already earned earlier today
    mockGte.mockResolvedValueOnce({
      data: [{ points_earned: 8, created_at: new Date().toISOString() }],
      error: null,
    });
    const res = fakeRes();
    await handler({ method: 'POST', body: {
      userId: 'u1', correct: 10, total: 10, pointsEarned: 999,
    } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.pointsEarned).toBe(2); // raw 5 pts, but only 2 remaining under the 10/day cap
  });

  it('awards zero points once the daily cap is already reached', async () => {
    mockGte.mockResolvedValueOnce({
      data: [{ points_earned: 10, created_at: new Date().toISOString() }],
      error: null,
    });
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', correct: 6, total: 6 } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.pointsEarned).toBe(0);
  });

  it('ignores practice_submissions rows from a previous day when computing the cap', async () => {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    mockGte.mockResolvedValueOnce({
      data: [{ points_earned: 10, created_at: yesterday }],
      error: null,
    });
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', correct: 4, total: 4 } }, res);
    expect(res.body.pointsEarned).toBe(2); // 4 correct * 0.5, none of yesterday's points count
  });
});

// ── Lookup tests ──
describe('GET /api/lookup', () => {
  let handler;
  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import('../api/lookup.js');
    handler = mod.default;
  });

  it('rejects missing nickname', async () => {
    const res = fakeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toMatch(/nickname/i);
  });

  it('POST without nickname returns 400', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toMatch(/nickname/i);
  });

  it('returns 404 when user not found', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = fakeRes();
    await handler({ method: 'GET', query: { nickname: 'nobody' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── Prize Club opt-in tests ──
describe('POST /api/prize-club-opt', () => {
  let handler;
  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import('../api/prize-club-opt.js');
    handler = mod.default;
  });

  it('rejects missing userId', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { optIn: true } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toMatch(/userId/i);
  });

  it('rejects non-boolean optIn', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', optIn: 'yes' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toMatch(/optIn/i);
  });

  it('returns 404 when user not found', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', optIn: true } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('rejects non-POST methods', async () => {
    const res = fakeRes();
    await handler({ method: 'GET' }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ── Prize Club public listing tests ──
describe('GET /api/prize-club', () => {
  let handler;
  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import('../api/prize-club.js');
    handler = mod.default;
  });

  it('rejects non-GET methods', async () => {
    const res = fakeRes();
    await handler({ method: 'POST' }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
