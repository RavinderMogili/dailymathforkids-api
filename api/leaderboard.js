import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { grade, city, limit = '50', type, date } = req.query;
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    if (type === 'speed') {
      let q = sb
        .from('submissions')
        .select('quiz_id, time_seconds, score, user_id, users(nickname, grade)')
        .not('time_seconds', 'is', null)
        .eq('score', 5)
        .order('time_seconds', { ascending: true })
        .limit(Math.min(Number(limit) || 50, 100));

      if (date) q = q.like('quiz_id', date + '%');
      if (grade) q = q.eq('users.grade', grade);

      const { data, error } = await q;
      if (error) return res.status(400).json({ error: error.message });

      const rows = (data || [])
        .filter(s => s.users)
        .map((s, i) => ({
          rank: i + 1,
          nickname: s.users.nickname,
          grade: s.users.grade,
          timeSeconds: s.time_seconds,
          date: s.quiz_id.slice(0, 10),
          score: s.score,
        }));
      return res.status(200).json({ leaderboard: rows });
    }

    let query = sb
      .from('leaderboard')
      .select('nickname, grade, school, city, total_points, days_played, rank')
      .order('rank', { ascending: true })
      .limit(Math.min(Number(limit) || 50, 100));

    if (grade) query = query.eq('grade', grade);
    if (city)  query = query.eq('city', city);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ leaderboard: data || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
