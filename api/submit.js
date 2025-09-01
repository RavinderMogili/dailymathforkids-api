import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, quizId, answers } = req.body || {};
    if (!userId || !quizId || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'bad input' });
    }
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    const { data: quiz, error: qErr } = await sb.from('quizzes')
      .select('answers')
      .eq('id', quizId)
      .single();
    if (qErr || !quiz) return res.status(400).json({ error: 'quiz not found' });

    const correct = quiz.answers || [];
    const score = answers.filter((a,i) => String(a ?? '').trim() === String(correct[i] ?? '').trim()).length;

    const { error: sErr } = await sb.from('submissions')
      .insert({ user_id: userId, quiz_id: quizId, score })
      .select();
    if (sErr && !/duplicate/i.test(sErr.message)) return res.status(400).json({ error: sErr.message });

    return res.status(200).json({ score, outOf: correct.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
