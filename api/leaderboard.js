import { createClient } from '@supabase/supabase-js';
import { gradeFromQuizId, normalizeGrade } from './_grade.js';

function rankRows(rows, limit) {
  const sorted = rows.sort((a, b) => b.total_points - a.total_points || a.nickname.localeCompare(b.nickname));
  let rank = 0;
  let previousPoints = null;
  sorted.forEach((row, index) => {
    if (row.total_points !== previousPoints) rank = index + 1;
    row.rank = rank;
    previousPoints = row.total_points;
  });
  if (sorted.length <= limit) return sorted;
  const cutoffRank = sorted[limit - 1].rank;
  return sorted.filter(row => row.rank <= cutoffRank);
}

export function buildGradeLeaderboard(users, quizSubmissions, practiceSubmissions, grade, limit = 50) {
  const usersById = new Map((users || []).map(user => [user.id, user]));
  const totals = new Map();
  const activityDays = new Map();

  const addPoints = (submission, attributedGrade) => {
    if (normalizeGrade(attributedGrade) !== grade || !usersById.has(submission.user_id)) return;
    totals.set(submission.user_id, (totals.get(submission.user_id) || 0) + (Number(submission.points_earned) || 0));
    if (submission.reward_day) {
      if (!activityDays.has(submission.user_id)) activityDays.set(submission.user_id, new Set());
      activityDays.get(submission.user_id).add(submission.reward_day);
    }
  };

  (quizSubmissions || []).forEach(row => addPoints(row, row.official_grade_at_submission));
  (practiceSubmissions || [])
    .filter(row => row.reward_eligible === true)
    .forEach(row => addPoints(row, row.official_grade_at_award));

  const rows = [...totals.entries()]
    .filter(([, points]) => points > 0)
    .map(([userId, points]) => {
      const user = usersById.get(userId);
      return {
        nickname: user.nickname,
        grade,
        school: user.school,
        city: user.city,
        total_points: Math.round(points * 10) / 10,
        days_played: activityDays.get(userId)?.size || 0,
      };
    });
  return rankRows(rows, limit);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { grade, city, limit = '50', type, date } = req.query;
    const rowLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const requestedGrade = grade ? normalizeGrade(grade) : null;
    if (grade && !requestedGrade) return res.status(400).json({ error: 'grade must be Grade 1 through Grade 12' });
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    if (type === 'speed') {
      let q = sb.from('submissions')
        .select('quiz_id, time_seconds, score, user_id, official_grade_at_submission, users(nickname, grade)')
        .not('time_seconds', 'is', null)
        .eq('score', 5)
        .order('time_seconds', { ascending: true })
        .limit(rowLimit);
      if (date) q = q.like('quiz_id', date + '%');
      if (requestedGrade) q = q.eq('official_grade_at_submission', requestedGrade);

      const { data, error } = await q;
      if (error) return res.status(400).json({ error: error.message });
      const rows = (data || []).filter(s => s.users).map((s, index) => ({
        rank: index + 1,
        nickname: s.users.nickname,
        grade: s.official_grade_at_submission || gradeFromQuizId(s.quiz_id) || s.users.grade,
        timeSeconds: s.time_seconds,
        date: s.quiz_id.slice(0, 10),
        score: s.score,
      }));
      return res.status(200).json({ leaderboard: rows });
    }

    // Unfiltered lifetime totals retain every grandfathered point. Grade-filtered
    // competitive results use only the immutable grade recorded when points were earned.
    if (!requestedGrade) {
      let query = sb.from('leaderboard')
        .select('nickname, grade, school, city, total_points, days_played, rank')
        .order('rank', { ascending: true }).limit(rowLimit);
      if (city) query = query.eq('city', city);
      const { data, error } = await query;
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ leaderboard: data || [] });
    }

    let usersQuery = sb.from('users').select('id, nickname, school, city');
    if (city) usersQuery = usersQuery.eq('city', city);
    const [{ data: users, error: usersError }, { data: quizRows, error: quizError },
      { data: practiceRows, error: practiceError }] = await Promise.all([
      usersQuery,
      sb.from('submissions')
        .select('user_id, points_earned, reward_day, official_grade_at_submission')
        .eq('official_grade_at_submission', requestedGrade),
      sb.from('practice_submissions')
        .select('user_id, points_earned, reward_day, official_grade_at_award, reward_eligible')
        .eq('official_grade_at_award', requestedGrade)
        .eq('reward_eligible', true),
    ]);
    const error = usersError || quizError || practiceError;
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({
      leaderboard: buildGradeLeaderboard(users, quizRows, practiceRows, requestedGrade, rowLimit),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
