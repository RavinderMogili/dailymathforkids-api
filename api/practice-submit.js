import { createClient } from '@supabase/supabase-js';
import { checkPrizeMilestone } from './_prize-check.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, correct, total, difficulty, topics, timeSeconds, pointsEarned, wrongAnswers } = req.body || {};
    if (!userId || correct == null || total == null) {
      return res.status(400).json({ error: 'userId, correct, and total are required' });
    }

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    const { error } = await sb.from('practice_submissions').insert({
      user_id: userId,
      correct: correct,
      total: total,
      difficulty: difficulty || 'easy',
      topics: Array.isArray(topics) ? topics : [],
      points_earned: typeof pointsEarned === 'number' ? pointsEarned : 0,
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

    // Check prize milestone in background (non-blocking)
    checkPrizeMilestone(sb, userId).catch(() => {});

    return res.status(200).json({ ok: true, pointsEarned: pointsEarned || 0 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
