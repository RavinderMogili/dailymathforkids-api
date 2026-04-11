import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock Supabase ──
const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();
const mockLimit = jest.fn(() => ({ single: mockSingle, maybeSingle: mockMaybeSingle }));
const mockLike = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockEq = jest.fn(() => ({ single: mockSingle, like: mockLike, limit: mockLimit, maybeSingle: mockMaybeSingle }));
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

  it('registers successfully with valid data', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'uuid-1', nickname: 'Alice', grade: 'G3', school: null, city: null, parent_email: null },
      error: null,
    });
    const res = fakeRes();
    await handler({ method: 'POST', body: { nickname: 'Alice', grade: 'G3' } }, res);
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

  it('rejects non-GET', async () => {
    const res = fakeRes();
    await handler({ method: 'POST' }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 404 when user not found', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = fakeRes();
    await handler({ method: 'GET', query: { nickname: 'nobody' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
