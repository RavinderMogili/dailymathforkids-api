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
      .select('quiz_id, score, points_earned, time_seconds, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(90);

    if (sErr) return res.status(400).json({ error: sErr.message });

    const totalPoints = (subs || []).reduce((sum, s) => sum + (s.points_earned || 0), 0);

    // Get kid's rank among same-grade students
    const { data: gradeBoard } = await sb
      .from('leaderboard')
      .select('nickname, total_points, rank')
      .eq('grade', user.grade)
      .order('rank', { ascending: true });

    const gradeTotal = (gradeBoard || []).length;
    const myEntry = (gradeBoard || []).find(r => r.nickname === user.nickname);
    const myGradeRank = myEntry ? (gradeBoard || []).indexOf(myEntry) + 1 : null;

    // Get practice stats
    const { data: practiceSubs } = await sb
      .from('practice_submissions')
      .select('correct, total, difficulty, points_earned, time_seconds, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    const practicePoints = (practiceSubs || []).reduce((sum, p) => sum + (parseFloat(p.points_earned) || 0), 0);
    const practiceTotal = (practiceSubs || []).reduce((sum, p) => sum + (p.total || 0), 0);
    const practiceCorrect = (practiceSubs || []).reduce((sum, p) => sum + (p.correct || 0), 0);

    return res.status(200).json({
      nickname:    user.nickname,
      grade:       user.grade,
      school:      user.school,
      totalPoints,
      gradeRank:   myGradeRank,
      gradeTotal,
      practiceStats: {
        sessions: (practiceSubs || []).length,
        totalQuestions: practiceTotal,
        totalCorrect: practiceCorrect,
        pointsEarned: Math.round(practicePoints * 10) / 10,
      },
      submissions: (subs || []).map(s => ({
        quizId:       s.quiz_id,
        score:        s.score,
        pointsEarned: s.points_earned,
        timeSeconds:  s.time_seconds || null,
        date:         s.created_at ? s.created_at.slice(0, 10) : null,
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
