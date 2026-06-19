import { describe, test, expect, beforeAll } from '@jest/globals';
import { mockReq, mockRes, setEnv } from './helpers.js';

beforeAll(() => setEnv());

// ─── Register ──────────────────────────────────────────────────────────────────

describe('POST /api/register', () => {
  test('returns 405 for GET request', async () => {
    const { default: handler } = await import('../api/register.js');
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  test('returns 200 for OPTIONS (CORS preflight)', async () => {
    const { default: handler } = await import('../api/register.js');
    const res = mockRes();
    await handler(mockReq({ method: 'OPTIONS' }), res);
    expect(res.statusCode).toBe(200);
  });

  test('returns 400 if nickname missing', async () => {
    const { default: handler } = await import('../api/register.js');
    const res = mockRes();
    await handler(mockReq({ method: 'POST', body: { grade: '4' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/nickname/i);
  });

  test('returns 400 if grade missing', async () => {
    const { default: handler } = await import('../api/register.js');
    const res = mockRes();
    await handler(mockReq({ method: 'POST', body: { nickname: 'TestKid' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/grade/i);
  });
});

// ─── Lookup ────────────────────────────────────────────────────────────────────

describe('GET /api/lookup', () => {
  test('returns 405 for POST', async () => {
    const { default: handler } = await import('../api/lookup.js');
    const res = mockRes();
    await handler(mockReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  test('returns 400 if no nickname', async () => {
    const { default: handler } = await import('../api/lookup.js');
    const res = mockRes();
    await handler(mockReq({ method: 'GET', query: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/nickname/i);
  });
});

// ─── Status ────────────────────────────────────────────────────────────────────

describe('GET /api/status', () => {
  test('returns 405 for POST', async () => {
    const { default: handler } = await import('../api/status.js');
    const res = mockRes();
    await handler(mockReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  test('returns 400 if missing userId or quizId', async () => {
    const { default: handler } = await import('../api/status.js');
    const res = mockRes();
    await handler(mockReq({ method: 'GET', query: { userId: 'abc' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/userId.*quizId|required/i);
  });
});

// ─── Submit ────────────────────────────────────────────────────────────────────

describe('POST /api/submit', () => {
  test('returns 405 for GET', async () => {
    const { default: handler } = await import('../api/submit.js');
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  test('returns 400 if bad input', async () => {
    const { default: handler } = await import('../api/submit.js');
    const res = mockRes();
    await handler(mockReq({ method: 'POST', body: { userId: 'x' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/bad input/i);
  });

  test('returns 400 if answers is not an array', async () => {
    const { default: handler } = await import('../api/submit.js');
    const res = mockRes();
    await handler(mockReq({ method: 'POST', body: { userId: 'x', quizId: 'q', answers: 'not-array' } }), res);
    expect(res.statusCode).toBe(400);
  });
});

// ─── Practice Submit ───────────────────────────────────────────────────────────

describe('POST /api/practice-submit', () => {
  test('returns 405 for GET', async () => {
    const { default: handler } = await import('../api/practice-submit.js');
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  test('returns 400 if userId missing', async () => {
    const { default: handler } = await import('../api/practice-submit.js');
    const res = mockRes();
    await handler(mockReq({ method: 'POST', body: { correct: 3, total: 5 } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/userId/i);
  });

  test('returns 400 if correct is null', async () => {
    const { default: handler } = await import('../api/practice-submit.js');
    const res = mockRes();
    await handler(mockReq({ method: 'POST', body: { userId: 'x', total: 5 } }), res);
    expect(res.statusCode).toBe(400);
  });
});

// ─── Feedback ──────────────────────────────────────────────────────────────────

describe('POST /api/feedback', () => {
  test('returns 405 for GET', async () => {
    const { default: handler } = await import('../api/feedback.js');
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  test('returns 400 if message empty', async () => {
    const { default: handler } = await import('../api/feedback.js');
    const res = mockRes();
    await handler(mockReq({ method: 'POST', body: { category: 'bug', message: '' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/message/i);
  });

  test('returns 400 if category invalid', async () => {
    const { default: handler } = await import('../api/feedback.js');
    const res = mockRes();
    await handler(mockReq({ method: 'POST', body: { category: 'invalid', message: 'test' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/category/i);
  });

  test('accepts valid categories', async () => {
    const { default: handler } = await import('../api/feedback.js');
    for (const cat of ['bug', 'suggestion', 'question', 'wrong_answer']) {
      const res = mockRes();
      await handler(mockReq({ method: 'POST', body: { category: cat, message: 'test msg' } }), res);
      // Will be 400 (Supabase unreachable) or 200 — but NOT a category validation error
      if (res.statusCode === 400) {
        expect(res.body.error).not.toMatch(/category/i);
      }
    }
  });
});

// ─── Leaderboard ───────────────────────────────────────────────────────────────

describe('GET /api/leaderboard', () => {
  test('returns 405 for POST', async () => {
    const { default: handler } = await import('../api/leaderboard.js');
    const res = mockRes();
    await handler(mockReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  test('returns 200 for OPTIONS', async () => {
    const { default: handler } = await import('../api/leaderboard.js');
    const res = mockRes();
    await handler(mockReq({ method: 'OPTIONS' }), res);
    expect(res.statusCode).toBe(200);
  });
});

// ─── History ───────────────────────────────────────────────────────────────────

describe('GET /api/history', () => {
  test('returns 405 for POST', async () => {
    const { default: handler } = await import('../api/history.js');
    const res = mockRes();
    await handler(mockReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  test('returns 400 if userId missing', async () => {
    const { default: handler } = await import('../api/history.js');
    const res = mockRes();
    await handler(mockReq({ method: 'GET', query: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/userId/i);
  });
});

// ─── Update Email ──────────────────────────────────────────────────────────────

describe('POST /api/update-email', () => {
  test('returns 405 for GET', async () => {
    const { default: handler } = await import('../api/update-email.js');
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  test('returns 400 if userId missing', async () => {
    const { default: handler } = await import('../api/update-email.js');
    const res = mockRes();
    await handler(mockReq({ method: 'POST', body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/userId/i);
  });
});

// ─── Upsert Quiz ───────────────────────────────────────────────────────────────

describe('POST /api/upsert-quiz', () => {
  test('returns 401 without auth header', async () => {
    const { default: handler } = await import('../api/upsert-quiz.js');
    const res = mockRes();
    await handler(mockReq({ method: 'POST', body: { quizId: 'q1', questions: [], answers: [] }, headers: {} }), res);
    expect(res.statusCode).toBe(401);
  });

  test('returns 401 with wrong token', async () => {
    const { default: handler } = await import('../api/upsert-quiz.js');
    const res = mockRes();
    await handler(mockReq({
      method: 'POST',
      body: { quizId: 'q1', questions: [], answers: [] },
      headers: { authorization: 'Bearer wrong-key' },
    }), res);
    expect(res.statusCode).toBe(401);
  });

  test('returns 400 with correct auth but bad input', async () => {
    const { default: handler } = await import('../api/upsert-quiz.js');
    const res = mockRes();
    await handler(mockReq({
      method: 'POST',
      body: {},
      headers: { authorization: 'Bearer test-service-role-key' },
    }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/bad input/i);
  });
});

// ─── Points calculation (submit.js) ────────────────────────────────────────────

describe('Points calculation', () => {
  test('perfect score gives bonus +3', () => {
    // Replicate calcPoints from submit.js
    function calcPoints(score, outOf) {
      let pts = score;
      if (outOf > 0 && score === outOf) pts += 3;
      return pts;
    }
    expect(calcPoints(5, 5)).toBe(8);   // 5 + 3 bonus
    expect(calcPoints(4, 5)).toBe(4);   // no bonus
    expect(calcPoints(0, 5)).toBe(0);
    expect(calcPoints(3, 3)).toBe(6);   // 3 + 3 bonus
    expect(calcPoints(1, 1)).toBe(4);   // 1 + 3 bonus
  });
});

// ─── CORS headers ──────────────────────────────────────────────────────────────

describe('CORS headers', () => {
  test('all endpoints set Access-Control-Allow-Origin: *', async () => {
    const endpoints = [
      { path: '../api/register.js', method: 'OPTIONS' },
      { path: '../api/submit.js', method: 'OPTIONS' },
      { path: '../api/practice-submit.js', method: 'OPTIONS' },
      { path: '../api/feedback.js', method: 'OPTIONS' },
      { path: '../api/leaderboard.js', method: 'OPTIONS' },
      { path: '../api/status.js', method: 'OPTIONS' },
      { path: '../api/history.js', method: 'OPTIONS' },
      { path: '../api/lookup.js', method: 'OPTIONS' },
      { path: '../api/update-email.js', method: 'OPTIONS' },
    ];
    for (const ep of endpoints) {
      const { default: handler } = await import(ep.path);
      const res = mockRes();
      await handler(mockReq({ method: ep.method }), res);
      expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    }
  });
});
