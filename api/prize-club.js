import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/prize-club
 * Public "300-Point Club" page data — lists students who have crossed a
 * reward milestone (e.g. 300 points) AND opted in to be shown publicly.
 * Never resets (unlike the weekly Math Stars leaderboard).
 *
 * Only nickname + threshold + the date it was reached are returned.
 * Grade, school, city, and parent email are never exposed here.
 */
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
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    const { data, error } = await sb
      .from('reward_milestones')
      .select('threshold, reached_at, user_id, users!inner(nickname, show_on_prize_club)')
      .eq('users.show_on_prize_club', true)
      .order('reached_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'Could not load data. Please try again soon.' });

    const members = [];
    for (const r of (data || [])) {
      const userIds = [r.user_id];
      const { data: subs } = await sb
        .from('submissions')
        .select('points_earned')
        .in('user_id', userIds);

      const { data: pracSubs } = await sb
        .from('practice_submissions')
        .select('points_earned')
        .in('user_id', userIds);

      let totalPoints = 0;
      (subs || []).forEach(s => { totalPoints += s.points_earned || 0; });
      (pracSubs || []).forEach(s => { totalPoints += Math.round(parseFloat(s.points_earned) || 0); });

      members.push({
        nickname: r.users?.nickname,
        threshold: r.threshold,
        totalPoints: totalPoints,
      });
    }

    return res.status(200).json({ members, count: members.length });
  } catch (e) {
    return res.status(500).json({ error: 'Could not load data. Please try again soon.' });
  }
}
