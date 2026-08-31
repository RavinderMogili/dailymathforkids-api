import { createClient } from '@supabase/supabase-js';
import { checkPrizeMilestone } from './_prize-check.js';
import { gradeFromQuizId, normalizeGrade } from './_grade.js';
import { getRewardDay } from './_time.js';

function calcPoints(score, outOf) {
  let pts = score;
  if (outOf > 0 && score === outOf) pts += 3;
  return pts;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, quizId, answers, timeSeconds } = req.body || {};
    if (!userId || !quizId || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'bad input' });
    }
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    const { data: user, error: userErr } = await sb.from('users')
      .select('grade').eq('id', userId).maybeSingle();
    if (userErr || !user) return res.status(404).json({ error: 'User not found' });
    const officialGrade = normalizeGrade(user.grade);
    const quizGrade = gradeFromQuizId(quizId);
    const rewardDay = getRewardDay();
    if (quizId.slice(0, 10) !== rewardDay) {
      return res.status(403).json({ error: 'Only today\'s Daily Quiz can earn points' });
    }
    if (!officialGrade || !quizGrade || quizGrade !== officialGrade) {
      return res.status(403).json({ error: 'Daily Quiz rewards are available only for your Official Grade' });
    }

    const datePart = quizId.slice(0, 10);
    const { data: todaySubs, error: dupErr } = await sb.from('submissions')
      .select('id')
      .eq('user_id', userId)
      .like('quiz_id', datePart + '%')
      .limit(2);
    if (dupErr) return res.status(400).json({ error: dupErr.message });
    if (todaySubs && todaySubs.length > 0) {
      return res.status(200).json({ score: null, outOf: 5, points_earned: 0, already: true });
    }

    const { data: quiz, error: qErr } = await sb.from('quizzes')
      .select('answers')
      .eq('id', quizId)
      .single();
    if (qErr || !quiz) return res.status(400).json({ error: 'quiz not found' });

    const correct = quiz.answers || [];
    const results = answers.map((a, i) => {
      const got = String(a ?? '').trim().toLowerCase();
      const exp = String(correct[i] ?? '').trim().toLowerCase();
      // Numeric comparison only when BOTH are pure numbers ("3.80" == "3.8"),
      // so "9" does not falsely match "9 remainder 2".
      const isPureNumber = s => /^-?\d*\.?\d+$/.test(s);
      // Empty answers are never correct; skip questions beyond stored answers
      const isCorrect = got !== '' && exp !== '' && (
        got === exp || (
          isPureNumber(got) && isPureNumber(exp) && parseFloat(got) === parseFloat(exp)
        )
      );
      return { question: i + 1, correct: isCorrect, expected: correct[i] || '', given: String(a ?? '').trim() };
    });
    const score = results.filter(r => r.correct).length;
    const points_earned = calcPoints(score, correct.length);

    const { error: sErr } = await sb.from('submissions')
      .insert({ user_id: userId, quiz_id: quizId, score, points_earned,
                reward_day: rewardDay, official_grade_at_submission: officialGrade,
                time_seconds: (typeof timeSeconds === 'number' && timeSeconds > 0) ? timeSeconds : null });

    if (sErr) {
      if (/duplicate|unique/i.test(sErr.message)) {
        return res.status(200).json({ score: null, outOf: correct.length, points_earned: 0, already: true });
      }
      return res.status(400).json({ error: sErr.message });
    }

    // Save wrong answers to mistakes table (non-blocking)
    const wrongOnes = results.filter(r => !r.correct);
    if (wrongOnes.length > 0) {
      const { data: quiz2 } = await sb.from('quizzes').select('questions').eq('id', quizId).single();
      const questions = (quiz2 && quiz2.questions) || [];
      const mistakeRows = wrongOnes.map(r => ({
        user_id: userId,
        source: 'quiz',
        quiz_id: quizId,
        question_num: r.question,
        question_text: questions[r.question - 1] || `Question ${r.question}`,
        correct_answer: r.expected,
        user_answer: r.given,
        resolved: false,
      }));
      const { error: mErr } = await sb.from('mistakes').insert(mistakeRows);
      if (mErr) console.error('mistakes insert failed:', mErr.message);
    }

    // Check prize milestone (awaited: un-awaited work may never run on serverless)
    await checkPrizeMilestone(sb, userId).catch(e => console.error('prize check failed:', e.message));

    return res.status(200).json({ score, outOf: correct.length, points_earned, already: false, results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
