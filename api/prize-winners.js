import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/prize-winners
 * Admin-only: lists every student who has crossed a reward milestone
 * (e.g. the 300-point Walmart gift card), so points can be sent out.
 *
 * Auth: same admin key as /api/analytics (ANALYTICS_KEY env var),
 * passed as `Authorization: Bearer <key>` or `?key=<key>`.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Admin-only: this endpoint exposes parent emails.
  const expected = (process.env.ANALYTICS_KEY || '').trim();
  if (!expected) return res.status(503).json({ error: 'analytics key not configured' });
  const authHeader = req.headers['authorization'] || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const given = bearer || String(req.query.key || '').trim();
  if (given !== expected) return res.status(401).json({ error: 'unauthorized' });

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    const { data, error } = await sb
      .from('reward_milestones')
      .select('id, user_id, threshold, reached_at, reward_status, delivered_at, users(nickname, grade, parent_email)')
      .order('reached_at', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });

    const winners = (data || []).map(r => ({
      id: r.id,
      userId: r.user_id,
      nickname: r.users?.nickname || 'Unknown',
      grade: r.users?.grade || null,
      parentEmail: r.users?.parent_email || null,
      threshold: r.threshold,
      reachedAt: r.reached_at,
      status: r.reward_status,
      deliveredAt: r.delivered_at,
    }));

    return res.status(200).json({ winners, count: winners.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
