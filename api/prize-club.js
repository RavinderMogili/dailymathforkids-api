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
  // Short cache so opted-out students disappear promptly
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    const { data, error } = await sb
      .from('reward_milestones')
      .select('threshold, reached_at, users!inner(nickname, show_on_prize_club)')
      .eq('users.show_on_prize_club', true)
      .order('reached_at', { ascending: true });

    if (error) return res.status(500).json({ error: 'Could not load data. Please try again soon.' });

    const members = (data || []).map(r => ({
      nickname: r.users?.nickname,
      threshold: r.threshold,
      reachedAt: r.reached_at ? r.reached_at.slice(0, 10) : null,
    }));

    return res.status(200).json({ members, count: members.length });
  } catch (e) {
    return res.status(500).json({ error: 'Could not load data. Please try again soon.' });
  }
}
