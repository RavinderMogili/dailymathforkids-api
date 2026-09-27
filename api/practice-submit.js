import { createClient } from '@supabase/supabase-js';
import { checkPrizeMilestone } from './_prize-check.js';

const REWARD_TIME_ZONE = 'America/Moncton';

// Calendar-day key ('YYYY-MM-DD') in the reward timezone, so the cap resets
// at local midnight rather than UTC midnight. Passed to the atomic DB
// function rather than computed there, so this stays the single place that
// owns the timezone rule (unchanged from before this rewrite).
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
    const { userId, sessionId, selections, timeSeconds, wrongAnswers } = req.body || {};
    if (!userId || !sessionId || !Array.isArray(selections)) {
      return res.status(400).json({ error: 'userId, sessionId, and selections are required' });
    }

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    // Everything that matters — which answers were actually correct, replay
    // protection, and the 10 pt/day cap — happens atomically inside this one
    // database call. See migrations/002_practice_sessions.sql for the
    // function body and why each check needs to happen there (under a row
    // lock) rather than here in application code.
    const { data, error } = await sb.rpc('submit_practice_session', {
      p_session_id: sessionId,
      p_user_id: userId,
      p_selections: selections,
      p_time_seconds: (typeof timeSeconds === 'number' && timeSeconds > 0) ? timeSeconds : null,
      p_day: dayKey(),
    });

    if (error) return res.status(400).json({ error: error.message });
    if (data?.error === 'session_not_found') return res.status(404).json({ error: 'practice session not found' });
    if (data?.error === 'session_expired') return res.status(410).json({ error: 'practice session expired' });
    if (data?.already) {
      return res.status(200).json({ correct: null, total: null, pointsEarned: 0, already: true });
    }

    // Save wrong answers to mistakes table (best-effort, non-blocking — same
    // as before this rewrite). These are for the review feature only; they
    // are never used to compute correctness or points, which come entirely
    // from the RPC result above.
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

    await checkPrizeMilestone(sb, userId).catch(e => console.error('prize check failed:', e.message));

    return res.status(200).json({
      correct: data.correct,
      total: data.total,
      pointsEarned: data.pointsEarned,
      pointsToday: data.pointsToday,
      pointsRemaining: data.pointsRemaining,
      results: data.results,
      already: false,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
