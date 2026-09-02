import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/math-stars
 * Public weekly leaderboard — returns only nickname and weekly points
 * for students who have opted in.
 *
 * Query params:
 *   limit (optional, default 25, max 100)
 *
 * Weekly boundary: Monday 00:00 America/Moncton to next Monday 00:00 America/Moncton.
 * The server calculates the current week — clients cannot override it.
 */

/**
 * Calculate the current week boundaries in America/Moncton timezone.
 * Returns { weekStart, weekEnd } as ISO UTC strings.
 *
 * The week runs Monday 00:00 Moncton to next Monday 00:00 Moncton.
 */
function getCurrentWeekBounds() {
  const now = new Date();

  // Get current date/time parts in Moncton timezone using Intl
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Moncton',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, weekday: 'short',
  }).formatToParts(now);

  const weekday = parts.find(p => p.type === 'weekday').value; // Mon, Tue, etc.
  const year = parseInt(parts.find(p => p.type === 'year').value);
  const month = parseInt(parts.find(p => p.type === 'month').value) - 1;
  const day = parseInt(parts.find(p => p.type === 'day').value);

  // Map weekday to offset from Monday (Mon=0, Tue=1, ..., Sun=6)
  const dayMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const dayOffset = dayMap[weekday] ?? 0;

  // Monday date in Moncton
  const mondayDate = day - dayOffset;

  // Build Monday 00:00 Moncton as a UTC timestamp using Intl offset detection
  const weekStartUtc = monctonMidnightToUtc(year, month, mondayDate);
  const weekEndUtc = monctonMidnightToUtc(year, month, mondayDate + 7);

  return { weekStart: weekStartUtc, weekEnd: weekEndUtc };
}

/**
 * Given a date (year, month, day) representing midnight in America/Moncton,
 * return the equivalent UTC ISO string.
 *
 * Uses Intl to determine the timezone offset on that specific date,
 * correctly handling DST transitions.
 */
function monctonMidnightToUtc(year, month, day) {
  // Normalize the date (handles day overflow/underflow)
  const normalizedDate = new Date(year, month, day);
  const ny = normalizedDate.getFullYear();
  const nm = normalizedDate.getMonth();
  const nd = normalizedDate.getDate();

  // Create a UTC timestamp at noon on that date (noon avoids DST edge issues)
  const noonUtc = new Date(Date.UTC(ny, nm, nd, 12, 0, 0));

  // Find what the Moncton offset is at that noon time
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Moncton',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const p = formatter.formatToParts(noonUtc);
  const mHour = parseInt(p.find(x => x.type === 'hour').value);

  // Offset = UTC hour - Moncton hour at the same instant
  // noonUtc is 12:00 UTC. If Moncton shows 08:00, offset is +4 (i.e. Moncton is UTC-4)
  const mDay = parseInt(p.find(x => x.type === 'day').value);
  let utcOffsetHours = 12 - mHour;
  if (mDay !== nd) {
    // Day wrapped in Moncton — adjust
    utcOffsetHours += (mDay > nd ? -24 : 24);
  }

  // Moncton midnight = UTC midnight + offset
  // If Moncton is UTC-4, then Moncton 00:00 = UTC 04:00
  const utcDate = new Date(Date.UTC(ny, nm, nd, utcOffsetHours, 0, 0));
  return utcDate.toISOString();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Cache strategy: public cache for 60s, but browsers must revalidate (no-cache).
  // This ensures opted-out students disappear within 60s after toggling off, while still
  // benefiting from edge caching for repeat visitors within the same minute.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, no-cache');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    const { weekStart, weekEnd } = getCurrentWeekBounds();

    // Get opted-in user IDs
    const { data: optedInUsers, error: usersErr } = await sb
      .from('users')
      .select('id, nickname')
      .eq('show_on_leaderboard', true);

    if (usersErr) {
      return res.status(500).json({ error: 'Could not load data. Please try again soon.' });
    }

    if (!optedInUsers || optedInUsers.length === 0) {
      return res.status(200).json({
        period: 'week',
        weekStart,
        weekEnd,
        students: [],
      });
    }

    const userIds = optedInUsers.map(u => u.id);
    const nicknameMap = Object.fromEntries(optedInUsers.map(u => [u.id, u.nickname]));

    // Query quiz submissions within the week
    const { data: quizSubs, error: qErr } = await sb
      .from('submissions')
      .select('user_id, points_earned')
      .in('user_id', userIds)
      .gte('created_at', weekStart)
      .lt('created_at', weekEnd);

    if (qErr) {
      return res.status(500).json({ error: 'Could not load data. Please try again soon.' });
    }

    // Query practice submissions within the week
    const { data: pracSubs, error: pErr } = await sb
      .from('practice_submissions')
      .select('user_id, points_earned')
      .in('user_id', userIds)
      .gte('created_at', weekStart)
      .lt('created_at', weekEnd);

    if (pErr) {
      return res.status(500).json({ error: 'Could not load data. Please try again soon.' });
    }

    // Sum points per user
    const pointsMap = {};
    for (const s of (quizSubs || [])) {
      pointsMap[s.user_id] = (pointsMap[s.user_id] || 0) + (s.points_earned || 0);
    }
    for (const s of (pracSubs || [])) {
      pointsMap[s.user_id] = (pointsMap[s.user_id] || 0) + (Math.round(parseFloat(s.points_earned)) || 0);
    }

    // Build sorted list (only include students with > 0 weekly points)
    const students = Object.entries(pointsMap)
      .filter(([, pts]) => pts > 0)
      .map(([userId, pts]) => ({ nickname: nicknameMap[userId], weeklyPoints: pts }))
      .sort((a, b) => b.weeklyPoints - a.weeklyPoints || a.nickname.localeCompare(b.nickname));

    // Assign ranks (tied scores get the same rank)
    let currentRank = 0;
    let lastPoints = -1;
    for (let i = 0; i < students.length; i++) {
      if (students[i].weeklyPoints !== lastPoints) {
        currentRank = i + 1;
        lastPoints = students[i].weeklyPoints;
      }
      students[i].rank = currentRank;
    }

    // Apply limit (include all tied at the cutoff rank)
    let result = students;
    if (students.length > limit) {
      const cutoffRank = students[limit - 1].rank;
      result = students.filter(s => s.rank <= cutoffRank);
    }

    return res.status(200).json({
      period: 'week',
      weekStart,
      weekEnd,
      students: result,
    });
  } catch (e) {
    return res.status(500).json({ error: 'We couldn\'t load Math Stars right now. Please try again soon.' });
  }
}

// Export for testing
export { getCurrentWeekBounds, monctonMidnightToUtc };
