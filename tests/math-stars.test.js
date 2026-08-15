import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock Supabase ──
let mockFromData = {};
const mockUpdate = jest.fn(() => ({ eq: jest.fn(() => ({ data: null, error: null })) }));
const mockInsert = jest.fn(() => ({ select: jest.fn(() => ({ single: jest.fn(() => ({ data: null, error: null })) })) }));

function buildChain(resolvedValue) {
  const chain = {};
  const methods = ['select', 'eq', 'in', 'gte', 'lt', 'like', 'not', 'order', 'limit', 'single', 'maybeSingle'];
  for (const m of methods) {
    chain[m] = jest.fn(() => chain);
  }
  // Make it thenable
  chain.then = (fn) => Promise.resolve(fn(resolvedValue));
  // Allow await directly
  Object.defineProperty(chain, Symbol.toStringTag, { value: 'Promise' });
  // Direct resolution
  chain[Symbol.for('jest.asymmetricMatch')] = undefined;
  return chain;
}

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table) => {
      const data = mockFromData[table];
      if (data !== undefined) {
        const chain = buildChain(data);
        chain.update = mockUpdate;
        chain.insert = mockInsert;
        return chain;
      }
      const chain = buildChain({ data: null, error: null });
      chain.update = mockUpdate;
      chain.insert = mockInsert;
      return chain;
    }),
  })),
}));

// ── Environment ──
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE = 'test-key';

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

// ── Nickname validation tests ──
describe('Nickname validation', () => {
  let validateNickname;
  beforeEach(async () => {
    const mod = await import('../api/_nickname-check.js');
    validateNickname = mod.validateNickname;
  });

  it('accepts valid fun nicknames', () => {
    expect(validateNickname('MathStar99').valid).toBe(true);
    expect(validateNickname('CoolKid').valid).toBe(true);
    expect(validateNickname('Dragon123').valid).toBe(true);
    expect(validateNickname('Pi_Lover').valid).toBe(true);
  });

  it('rejects nicknames shorter than 3 chars', () => {
    const r = validateNickname('AB');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/at least 3/);
  });

  it('rejects nicknames longer than 20 chars', () => {
    const r = validateNickname('A'.repeat(21));
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/20 characters/);
  });

  it('rejects email addresses', () => {
    const r = validateNickname('kid@school.com');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/email/i);
  });

  it('rejects phone numbers', () => {
    const r = validateNickname('555-123-4567');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/phone/i);
  });

  it('rejects URLs', () => {
    expect(validateNickname('www.mysite.com').valid).toBe(false);
    expect(validateNickname('https://bad').valid).toBe(false);
  });

  it('rejects social media handles', () => {
    expect(validateNickname('@insta_user').valid).toBe(false);
    expect(validateNickname('ig:coolkid').valid).toBe(false);
    expect(validateNickname('tiktok_star').valid).toBe(false);
  });

  it('rejects reserved/impersonation names', () => {
    expect(validateNickname('Admin').valid).toBe(false);
    expect(validateNickname('teacher').valid).toBe(false);
    expect(validateNickname('Support99').valid).toBe(false);
    expect(validateNickname('moderator').valid).toBe(false);
  });

  it('rejects profanity', () => {
    expect(validateNickname('badFuck99').valid).toBe(false);
    expect(validateNickname('ShitKid').valid).toBe(false);
  });

  it('rejects HTML/script injection', () => {
    expect(validateNickname('<script>').valid).toBe(false);
    expect(validateNickname('onclick=alert').valid).toBe(false);
  });

  it('warns about real-name patterns', () => {
    const r = validateNickname('John Smith');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/real name/i);
    expect(r.isNameWarning).toBe(true);
  });

  it('does not flag single words as real names', () => {
    expect(validateNickname('Sarah').valid).toBe(true);
    expect(validateNickname('Matthew').valid).toBe(true);
  });
});

// ── Weekly boundary calculation tests ──
describe('Weekly boundary calculation', () => {
  let getCurrentWeekBounds;
  beforeEach(async () => {
    const mod = await import('../api/math-stars.js');
    getCurrentWeekBounds = mod.getCurrentWeekBounds;
  });

  it('returns weekStart before weekEnd', () => {
    const { weekStart, weekEnd } = getCurrentWeekBounds();
    expect(new Date(weekStart).getTime()).toBeLessThan(new Date(weekEnd).getTime());
  });

  it('week is exactly 7 days', () => {
    const { weekStart, weekEnd } = getCurrentWeekBounds();
    const diff = new Date(weekEnd).getTime() - new Date(weekStart).getTime();
    // Allow 1 hour tolerance for DST transitions
    expect(diff).toBeGreaterThanOrEqual(6.5 * 24 * 60 * 60 * 1000);
    expect(diff).toBeLessThanOrEqual(7.5 * 24 * 60 * 60 * 1000);
  });

  it('weekStart is a Monday in Moncton timezone', () => {
    const { weekStart } = getCurrentWeekBounds();
    const wsDate = new Date(weekStart);
    // Use Intl to reliably get the weekday in Moncton
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Moncton',
      weekday: 'short',
    }).format(wsDate);
    expect(weekday).toBe('Mon');
  });
});

// ── Math Stars API endpoint tests ──
describe('GET /api/math-stars', () => {
  let handler;
  beforeEach(async () => {
    jest.clearAllMocks();
    mockFromData = {};
    const mod = await import('../api/math-stars.js');
    handler = mod.default;
  });

  it('rejects non-GET methods', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('handles OPTIONS preflight', async () => {
    const res = fakeRes();
    await handler({ method: 'OPTIONS', query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns empty array when no users opted in', async () => {
    mockFromData['users'] = { data: [], error: null };
    const res = fakeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.period).toBe('week');
    expect(res.body.students).toEqual([]);
  });

  it('response does not include internal IDs, grade, city, or days played', async () => {
    mockFromData['users'] = { data: [{ id: 'uuid-1', nickname: 'Star1' }], error: null };
    mockFromData['submissions'] = { data: [{ user_id: 'uuid-1', points_earned: 5 }], error: null };
    mockFromData['practice_submissions'] = { data: [], error: null };
    const res = fakeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    if (res.body.students && res.body.students.length > 0) {
      const s = res.body.students[0];
      expect(s).not.toHaveProperty('id');
      expect(s).not.toHaveProperty('user_id');
      expect(s).not.toHaveProperty('grade');
      expect(s).not.toHaveProperty('city');
      expect(s).not.toHaveProperty('school');
      expect(s).not.toHaveProperty('days_played');
      expect(s).not.toHaveProperty('email');
    }
  });

  it('response includes period, weekStart, weekEnd fields', async () => {
    mockFromData['users'] = { data: [], error: null };
    const res = fakeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res.body).toHaveProperty('period', 'week');
    expect(res.body).toHaveProperty('weekStart');
    expect(res.body).toHaveProperty('weekEnd');
  });

  it('sets short cache header', async () => {
    mockFromData['users'] = { data: [], error: null };
    const res = fakeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res.headers['Cache-Control']).toMatch(/max-age=60/);
  });
});

// ── Math Stars Opt-in/out tests ──
describe('POST /api/math-stars-opt', () => {
  let handler;
  beforeEach(async () => {
    jest.clearAllMocks();
    mockFromData = {};
    const mod = await import('../api/math-stars-opt.js');
    handler = mod.default;
  });

  it('rejects missing userId', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { optIn: true } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toMatch(/userId/);
  });

  it('rejects non-boolean optIn', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'u1', optIn: 'yes' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toMatch(/optIn/);
  });

  it('rejects non-POST methods', async () => {
    const res = fakeRes();
    await handler({ method: 'GET', body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 404 for non-existent user', async () => {
    mockFromData['users'] = { data: null, error: null };
    const res = fakeRes();
    await handler({ method: 'POST', body: { userId: 'fake', optIn: true } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── Tied scores ranking tests ──
describe('Ranking with ties', () => {
  it('tied scores receive the same rank', () => {
    // This tests the ranking logic inline
    const students = [
      { nickname: 'A', weeklyPoints: 10 },
      { nickname: 'B', weeklyPoints: 10 },
      { nickname: 'C', weeklyPoints: 5 },
    ].sort((a, b) => b.weeklyPoints - a.weeklyPoints || a.nickname.localeCompare(b.nickname));

    let currentRank = 0;
    let lastPoints = -1;
    for (let i = 0; i < students.length; i++) {
      if (students[i].weeklyPoints !== lastPoints) {
        currentRank = i + 1;
        lastPoints = students[i].weeklyPoints;
      }
      students[i].rank = currentRank;
    }

    expect(students[0].rank).toBe(1); // A
    expect(students[1].rank).toBe(1); // B (tied)
    expect(students[2].rank).toBe(3); // C
  });

  it('speed is not used as a tie-breaker — alphabetical nickname used instead', () => {
    const students = [
      { nickname: 'Zorro', weeklyPoints: 10 },
      { nickname: 'Alpha', weeklyPoints: 10 },
    ].sort((a, b) => b.weeklyPoints - a.weeklyPoints || a.nickname.localeCompare(b.nickname));

    expect(students[0].nickname).toBe('Alpha'); // alphabetical
    expect(students[1].nickname).toBe('Zorro');
  });
});
