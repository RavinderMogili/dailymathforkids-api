import { describe, it, expect } from '@jest/globals';

const API = 'https://dailymathforkids-api.vercel.app';

describe('Live API smoke tests', () => {
  it('GET /api/status without params returns 400', async () => {
    const res = await fetch(`${API}/api/status`);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/userId/i);
  });

  it('GET /api/leaderboard returns array', async () => {
    const res = await fetch(`${API}/api/leaderboard`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.leaderboard)).toBe(true);
  });

  it('GET /api/lookup without nickname returns 400', async () => {
    const res = await fetch(`${API}/api/lookup`);
    expect(res.status).toBe(400);
  });

  it('POST /api/register without body returns 400', async () => {
    const res = await fetch(`${API}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/submit without body returns 400', async () => {
    const res = await fetch(`${API}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('GET /api/groups without params returns 400', async () => {
    const res = await fetch(`${API}/api/groups`);
    expect(res.status).toBe(400);
  });

  it('GET /api/leaderboard?type=speed returns array', async () => {
    const res = await fetch(`${API}/api/leaderboard?type=speed`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.leaderboard)).toBe(true);
  });

  it('GET /api/leaderboard?grade=G3 filters by grade', async () => {
    const res = await fetch(`${API}/api/leaderboard?grade=G3`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.leaderboard)).toBe(true);
    data.leaderboard.forEach(entry => {
      expect(entry.grade).toBe('G3');
    });
  });
});
