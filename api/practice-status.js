import { createClient } from '@supabase/supabase-js';
import { getRewardDay, REWARD_TIME_ZONE } from './_time.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { userId } = req.query || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const rewardDay = getRewardDay();
    const { data: user, error: userError } = await sb.from('users')
      .select('grade').eq('id', userId).maybeSingle();
    if (userError || !user) return res.status(404).json({ error: 'User not found' });
    const { data: sessions, error } = await sb.from('practice_submissions')
      .select('points_earned').eq('user_id', userId).eq('reward_day', rewardDay);
    if (error) return res.status(400).json({ error: error.message });
    const pointsToday = Math.min(10, (sessions || []).reduce((sum, row) => sum + (Number(row.points_earned) || 0), 0));
    return res.status(200).json({
      officialGrade: user.grade, pointsToday, pointsRemaining: Math.max(0, 10 - pointsToday),
      dailyCap: 10, rewardDay, timeZone: REWARD_TIME_ZONE,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

