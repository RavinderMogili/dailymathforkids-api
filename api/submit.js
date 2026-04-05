import { createClient } from '@supabase/supabase-js';

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

    const datePart = quizId.slice(0, 10);
    const { data: todaySub } = await sb.from('submissions')
      .select('id')
      .eq('user_id', userId)
      .like('quiz_id', datePart + '%')
      .maybeSingle();
    if (todaySub) {
      return res.status(200).json({ score: null, outOf: 5, points_earned: 0, already: true });
    }

    const { data: quiz, error: qErr } = await sb.from('quizzes')
      .select('answers')
      .eq('id', quizId)
      .single();
    if (qErr || !quiz) return res.status(400).json({ error: 'quiz not found' });

    const correct = quiz.answers || [];
    const score = answers.filter((a, i) => {
      const got = parseFloat(String(a ?? '').trim());
      const exp = parseFloat(String(correct[i] ?? '').trim());
      return !isNaN(got) && !isNaN(exp) && got === exp;
    }).length;
    const points_earned = calcPoints(score, correct.length);

    const { error: sErr } = await sb.from('submissions')
      .insert({ user_id: userId, quiz_id: quizId, score, points_earned,
                time_seconds: (typeof timeSeconds === 'number' && timeSeconds > 0) ? timeSeconds : null });

    if (sErr) {
      if (/duplicate|unique/i.test(sErr.message)) {
        return res.status(200).json({ score: null, outOf: correct.length, points_earned: 0, already: true });
      }
      return res.status(400).json({ error: sErr.message });
    }

    return res.status(200).json({ score, outOf: correct.length, points_earned, already: false });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
