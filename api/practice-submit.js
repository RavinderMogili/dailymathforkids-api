import { createClient } from '@supabase/supabase-js';
import { checkPrizeMilestone } from './_prize-check.js';
import { normalizeGrade } from './_grade.js';
import { getRewardDay, REWARD_TIME_ZONE } from './_time.js';

const MAX_PRACTICE_QUESTIONS = 50;
const firstRow = data => Array.isArray(data) ? data[0] : data;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, submissionId, correct, total, practiceGrade, difficulty,
      topics, timeSeconds, wrongAnswers } = req.body || {};
    const normalizedPracticeGrade = normalizeGrade(practiceGrade);
    if (!userId || !submissionId || correct == null || total == null || !normalizedPracticeGrade) {
      return res.status(400).json({ error: 'userId, submissionId, correct, total, and a valid practiceGrade are required' });
    }
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(submissionId))) {
      return res.status(400).json({ error: 'submissionId is invalid' });
    }
    if (!Number.isInteger(correct) || !Number.isInteger(total) || correct < 0 ||
        total < 1 || correct > total || total > MAX_PRACTICE_QUESTIONS) {
      return res.status(400).json({ error: 'correct and total are invalid' });
    }

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const rewardDay = getRewardDay();
    // This atomic database function obtains Official Grade, ignores any client
    // point total, calculates the award, caps the day, and deduplicates replays.
    const { data, error } = await sb.rpc('award_practice_submission', {
      p_user_id: userId,
      p_submission_key: String(submissionId),
      p_correct: correct,
      p_total: total,
      p_practice_grade: normalizedPracticeGrade,
      p_reward_day: rewardDay,
      p_difficulty: difficulty || 'easy',
      p_topics: Array.isArray(topics) ? topics.slice(0, 20) : [],
      p_time_seconds: typeof timeSeconds === 'number' && timeSeconds > 0
        ? Math.min(Math.round(timeSeconds), 86400) : null,
    });
    if (error) {
      return res.status(/rate limit/i.test(error.message || '') ? 429 : 400).json({ error: error.message });
    }
    const award = firstRow(data);
    if (!award) return res.status(500).json({ error: 'Practice result was not returned' });

    if (!award.replayed && Array.isArray(wrongAnswers) && wrongAnswers.length > 0) {
      const rows = wrongAnswers.slice(0, 20).map(m => ({
        user_id: userId, source: 'practice', quiz_id: null,
        question_num: m.questionNum || null,
        question_text: m.questionText || 'Unknown question',
        correct_answer: m.correctAnswer || '', user_answer: m.userAnswer || '',
        choices: m.choices || null, hint: m.hint || null,
        topic: m.topic || null, resolved: false,
      }));
      await sb.from('mistakes').insert(rows).catch(() => {});
    }
    if (!award.replayed && Number(award.points_awarded) > 0) {
      await checkPrizeMilestone(sb, userId).catch(() => {});
    }

    return res.status(200).json({
      ok: true,
      pointsEarned: Number(award.points_awarded) || 0,
      pointsToday: Number(award.points_today) || 0,
      pointsRemaining: Number(award.points_remaining) || 0,
      officialGrade: award.official_grade,
      practiceGrade: award.practice_grade,
      eligible: !!award.reward_eligible,
      replayed: !!award.replayed,
      rewardDay,
      timeZone: REWARD_TIME_ZONE,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
