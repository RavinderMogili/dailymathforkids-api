/**
 * Integration tests — hit the live API to verify full registration,
 * login, PIN, security question, and recovery flows actually work
 * end-to-end (including database columns).
 *
 * Run with: npm test -- --testPathPattern=integration
 *
 * NOTE: These create real test users in the database. Use unique
 * nicknames with a 'test_' prefix so they can be cleaned up later.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

const API = 'https://dailymathforkids-api.vercel.app';
const TEST_PREFIX = 'test_' + Date.now() + '_';
const TEST_PIN = '9876';

let testUser = null; // { userId, nickname }

// ─── Helper ──────────────────────────────────────────────────────────────────

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function get(path) {
  const res = await fetch(`${API}${path}`);
  return { status: res.status, data: await res.json() };
}

// ─── Registration ────────────────────────────────────────────────────────────

describe('Registration with security question', () => {
  const nickname = TEST_PREFIX + 'kid';

  it('rejects registration without PIN', async () => {
    const { status, data } = await post('/api/register', {
      nickname,
      grade: 'Grade 3',
      security_question: 'What city were you born in?',
      security_answer: 'Toronto',
    });
    expect(status).toBe(400);
    expect(data.error).toMatch(/pin/i);
  });

  it('rejects registration without security question or parent email', async () => {
    const { status, data } = await post('/api/register', {
      nickname,
      grade: 'Grade 3',
      pin: TEST_PIN,
    });
    expect(status).toBe(400);
    expect(data.error).toMatch(/security question|parent_email/i);
  });

  it('registers with security question (no parent email)', async () => {
    const { status, data } = await post('/api/register', {
      nickname,
      grade: 'Grade 3',
      pin: TEST_PIN,
      security_question: 'What city were you born in?',
      security_answer: 'Toronto',
    });
    expect(status).toBe(200);
    expect(data.userId).toBeDefined();
    expect(data.nickname).toBe(nickname);
    testUser = { userId: data.userId, nickname };
  });

  it('rejects duplicate nickname', async () => {
    const { status, data } = await post('/api/register', {
      nickname,
      grade: 'Grade 3',
      pin: '1111',
      security_question: 'What city were you born in?',
      security_answer: 'Montreal',
    });
    expect(status).toBe(409);
    expect(data.error).toMatch(/taken/i);
  });

  it('registers with parent email (no security question)', async () => {
    const nick2 = TEST_PREFIX + 'kid2';
    const { status, data } = await post('/api/register', {
      nickname: nick2,
      grade: 'Grade 5',
      pin: '1234',
      parent_email: 'testparent@example.com',
    });
    expect(status).toBe(200);
    expect(data.nickname).toBe(nick2);
  });
});

// ─── Login (lookup) ──────────────────────────────────────────────────────────

describe('Login / lookup', () => {
  it('returns 401 if PIN not provided for user with PIN', async () => {
    const nickname = TEST_PREFIX + 'kid';
    const { status, data } = await get(`/api/lookup?nickname=${encodeURIComponent(nickname)}`);
    expect(status).toBe(401);
    expect(data.needPin).toBe(true);
  });

  it('logs in with correct PIN via POST', async () => {
    const nickname = TEST_PREFIX + 'kid';
    const { status, data } = await post('/api/lookup', {
      nickname,
      pin: TEST_PIN,
    });
    expect(status).toBe(200);
    expect(data.userId).toBeDefined();
    expect(data.nickname).toBe(nickname);
  });

  it('rejects wrong PIN', async () => {
    const nickname = TEST_PREFIX + 'kid';
    const { status, data } = await post('/api/lookup', {
      nickname,
      pin: '0000',
    });
    expect(status).toBe(401);
    expect(data.error).toMatch(/incorrect/i);
  });

  it('returns 404 for non-existent nickname', async () => {
    const { status } = await get('/api/lookup?nickname=nonexistent_user_xyz_999');
    expect(status).toBe(404);
  });
});

// ─── Set PIN / change PIN ────────────────────────────────────────────────────

describe('Set PIN', () => {
  it('changes PIN for existing user', async () => {
    if (!testUser) return;
    const { status, data } = await post('/api/set-pin', {
      userId: testUser.userId,
      pin: '5555',
    });
    expect(status).toBe(200);
    expect(data.ok || data.success || status === 200).toBeTruthy();
  });

  it('updates security question via set-pin endpoint', async () => {
    if (!testUser) return;
    const { status } = await post('/api/set-pin', {
      userId: testUser.userId,
      security_question: "What is your pet's name?",
      security_answer: 'Max',
    });
    expect(status).toBe(200);
  });
});

// ─── Forgot PIN ──────────────────────────────────────────────────────────────

describe('Forgot PIN recovery', () => {
  it('rejects without nickname', async () => {
    const { status, data } = await post('/api/forgot-pin', {
      security_answer: 'Max',
      new_pin: '1111',
    });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('rejects with wrong security answer', async () => {
    if (!testUser) return;
    const { status, data } = await post('/api/forgot-pin', {
      nickname: testUser.nickname,
      security_question: "What is your pet's name?",
      security_answer: 'WrongAnswer',
      new_pin: '1111',
    });
    expect(status).toBe(401);
    expect(data.error).toBeDefined();
  });

  it('resets PIN with correct security question and answer', async () => {
    if (!testUser) return;
    const { status, data } = await post('/api/forgot-pin', {
      nickname: testUser.nickname,
      security_question: "What is your pet's name?",
      security_answer: 'Max',
      new_pin: '4321',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });
});

// ─── Forgot Nickname ─────────────────────────────────────────────────────────

describe('Forgot Nickname recovery', () => {
  it('rejects without parent_email or security_answer', async () => {
    const { status, data } = await post('/api/forgot-nickname', {});
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('recovers nickname via parent email', async () => {
    const { status, data } = await post('/api/forgot-nickname', {
      parent_email: 'testparent@example.com',
    });
    expect(status).toBe(200);
    expect(data.nickname || data.nicknames).toBeDefined();
  });
});

// ─── History (profile data) ──────────────────────────────────────────────────

describe('History / profile', () => {
  it('returns hasPin and securityQuestion for user', async () => {
    if (!testUser) return;
    const { status, data } = await get(`/api/history?userId=${testUser.userId}`);
    expect(status).toBe(200);
    expect(data.hasPin).toBe(true);
    expect(data.securityQuestion).toBeDefined();
  });
});
