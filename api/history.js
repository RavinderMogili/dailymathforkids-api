import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    const { data: user, error: uErr } = await sb
      .from('users')
      .select('nickname, grade, school, city')
      .eq('id', userId)
      .maybeSingle();

    if (uErr || !user) return res.status(404).json({ error: 'User not found' });

    const { data: subs, error: sErr } = await sb
      .from('submissions')
      .select('quiz_id, score, points_earned, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(90);

    if (sErr) return res.status(400).json({ error: sErr.message });

    const totalPoints = (subs || []).reduce((sum, s) => sum + (s.points_earned || 0), 0);

    return res.status(200).json({
      nickname:    user.nickname,
      grade:       user.grade,
      school:      user.school,
      totalPoints,
      submissions: (subs || []).map(s => ({
        quizId:       s.quiz_id,
        score:        s.score,
        pointsEarned: s.points_earned,
        date:         s.created_at ? s.created_at.slice(0, 10) : null,
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
