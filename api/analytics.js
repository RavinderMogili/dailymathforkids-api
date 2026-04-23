import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    // Total registered users
    const { count: totalUsers } = await sb
      .from('users').select('*', { count: 'exact', head: true });

    // Total quiz submissions
    const { count: totalQuizSubs } = await sb
      .from('submissions').select('*', { count: 'exact', head: true });

    // Total practice submissions
    const { count: totalPracticeSubs } = await sb
      .from('practice_submissions').select('*', { count: 'exact', head: true });

    // Submissions in last 7 days (quiz)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count: quizLast7 } = await sb
      .from('submissions').select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo);

    // Practice in last 7 days
    const { count: practiceLast7 } = await sb
      .from('practice_submissions').select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo);

    // Unique active users last 7 days (quiz + practice)
    const { data: activeQuizUsers } = await sb
      .from('submissions').select('user_id')
      .gte('created_at', sevenDaysAgo);
    const { data: activePracticeUsers } = await sb
      .from('practice_submissions').select('user_id')
      .gte('created_at', sevenDaysAgo);
    const activeIds = new Set([
      ...(activeQuizUsers || []).map(r => r.user_id),
      ...(activePracticeUsers || []).map(r => r.user_id),
    ]);

    // Daily quiz submissions for last 14 days
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data: recentQuizSubs } = await sb
      .from('submissions').select('created_at')
      .gte('created_at', fourteenDaysAgo)
      .order('created_at', { ascending: true });
    const dailyQuiz = bucketByDay(recentQuizSubs || []);

    // Daily practice submissions for last 14 days
    const { data: recentPracticeSubs } = await sb
      .from('practice_submissions').select('created_at')
      .gte('created_at', fourteenDaysAgo)
      .order('created_at', { ascending: true });
    const dailyPractice = bucketByDay(recentPracticeSubs || []);

    // Average quiz score
    const { data: avgData } = await sb
      .from('submissions').select('score');
    const avgScore = avgData && avgData.length > 0
      ? (avgData.reduce((s, r) => s + r.score, 0) / avgData.length).toFixed(1)
      : 0;

    // Top 10 users by points
    const { data: topUsers } = await sb
      .from('leaderboard').select('nickname, grade, total_points, days_played')
      .order('total_points', { ascending: false })
      .limit(10);

    // Recent registrations (last 10)
    const { data: recentUsers } = await sb
      .from('users').select('nickname, grade, city, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    return res.status(200).json({
      totalUsers: totalUsers || 0,
      totalQuizSubmissions: totalQuizSubs || 0,
      totalPracticeSubmissions: totalPracticeSubs || 0,
      quizLast7Days: quizLast7 || 0,
      practiceLast7Days: practiceLast7 || 0,
      activeUsersLast7Days: activeIds.size,
      avgQuizScore: parseFloat(avgScore),
      dailyQuiz,
      dailyPractice,
      topUsers: topUsers || [],
      recentUsers: recentUsers || [],
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function bucketByDay(rows) {
  const buckets = {};
  for (const r of rows) {
    const day = r.created_at.slice(0, 10);
    buckets[day] = (buckets[day] || 0) + 1;
  }
  // Fill in missing days for last 14 days
  const result = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: buckets[key] || 0 });
  }
  return result;
}
