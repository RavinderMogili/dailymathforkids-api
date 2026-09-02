import { createClient } from '@supabase/supabase-js';
import { checkPrizeMilestone } from './_prize-check.js';

const DAILY_PRACTICE_CAP = 10;
const REWARD_TIME_ZONE = 'America/Moncton';

// Calendar-day key ('YYYY-MM-DD') in the reward timezone, so the cap resets
// at local midnight rather than UTC midnight.
function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REWARD_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, correct, total, difficulty, topics, timeSeconds, wrongAnswers } = req.body || {};
    if (!userId || correct == null || total == null) {
      return res.status(400).json({ error: 'userId, correct, and total are required' });
    }

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    // Recompute points from correct answers server-side — never trust a
    // client-supplied pointsEarned value — then cap at 10 pts per calendar day.
    const rawPoints = Number(correct) * 0.5;
    const today = dayKey();
    const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    const { data: recent, error: sumErr } = await sb.from('practice_submissions')
      .select('points_earned, created_at')
      .eq('user_id', userId)
      .gte('created_at', since);
    if (sumErr) return res.status(400).json({ error: sumErr.message });
    const usedToday = (recent || [])
      .filter(r => dayKey(new Date(r.created_at)) === today)
      .reduce((s, r) => s + (parseFloat(r.points_earned) || 0), 0);
    const remaining = Math.max(0, DAILY_PRACTICE_CAP - usedToday);
    const points_earned = Math.min(rawPoints, remaining);

    const { error } = await sb.from('practice_submissions').insert({
      user_id: userId,
      correct: correct,
      total: total,
      difficulty: difficulty || 'easy',
      topics: Array.isArray(topics) ? topics : [],
      points_earned,
      time_seconds: (typeof timeSeconds === 'number' && timeSeconds > 0) ? timeSeconds : null,
    });

    if (error) return res.status(400).json({ error: error.message });

    // Save wrong answers to mistakes table
    if (Array.isArray(wrongAnswers) && wrongAnswers.length > 0) {
      const mistakeRows = wrongAnswers.slice(0, 20).map(m => ({
        user_id: userId,
        source: 'practice',
        quiz_id: null,
        question_num: m.questionNum || null,
        question_text: m.questionText || 'Unknown question',
        correct_answer: m.correctAnswer || '',
        user_answer: m.userAnswer || '',
        choices: m.choices || null,
        hint: m.hint || null,
        topic: m.topic || null,
        resolved: false,
      }));
      sb.from('mistakes').insert(mistakeRows).then(() => {}).catch(() => {});
    }

    // Check prize milestone (awaited: un-awaited work may never run on serverless)
    await checkPrizeMilestone(sb, userId).catch(e => console.error('prize check failed:', e.message));

    return res.status(200).json({
      ok: true,
      pointsEarned: points_earned,
      pointsToday: usedToday + points_earned,
      pointsRemaining: Math.max(0, remaining - points_earned),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
