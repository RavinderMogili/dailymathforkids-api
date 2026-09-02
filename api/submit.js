import { createClient } from '@supabase/supabase-js';
import { checkPrizeMilestone } from './_prize-check.js';

function getTodayMoncton() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Moncton',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

function calcWeightedPoints(correctByDifficulty) {
  const easyPoints = (correctByDifficulty.easy || 0) * 1;
  const mediumPoints = (correctByDifficulty.medium || 0) * 2;
  const hardPoints = (correctByDifficulty.hard || 0) * 3;
  return easyPoints + mediumPoints + hardPoints;
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

    // Validate quiz date matches today in America/Moncton timezone
    const quizDatePart = quizId.slice(0, 10);
    const todayMoncton = getTodayMoncton();
    if (quizDatePart !== todayMoncton) {
      return res.status(403).json({ error: 'This quiz has expired. Only today\'s quiz can be submitted for points.' });
    }

    const datePart = quizDatePart;
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
      // Determine difficulty by position: positions 0-3 = Easy, 4-7 = Medium, 8-9 = Hard
      let difficulty = 'easy';
      if (i >= 4 && i < 8) difficulty = 'medium';
      else if (i >= 8) difficulty = 'hard';
      return { question: i + 1, correct: isCorrect, expected: correct[i] || '', given: String(a ?? '').trim(), difficulty };
    });
    const score = results.filter(r => r.correct).length;

    // Calculate weighted points: Easy=1, Medium=2, Hard=3
    const correctByDifficulty = {
      easy: results.filter(r => r.correct && r.difficulty === 'easy').length,
      medium: results.filter(r => r.correct && r.difficulty === 'medium').length,
      hard: results.filter(r => r.correct && r.difficulty === 'hard').length,
    };
    const points_earned = calcWeightedPoints(correctByDifficulty);

    const { error: sErr } = await sb.from('submissions')
      .insert({ user_id: userId, quiz_id: quizId, score, points_earned,
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
