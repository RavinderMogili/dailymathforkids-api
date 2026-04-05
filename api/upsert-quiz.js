import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-internal-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const internalKey = req.headers['x-internal-key'];
  if (!internalKey || internalKey !== process.env.SUPABASE_SERVICE_ROLE) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { quizId, questions, answers } = req.body || {};
  if (!quizId || !Array.isArray(questions) || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'bad input' });
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
  const { error } = await sb.from('quizzes')
    .upsert({ id: quizId, questions, answers }, { onConflict: 'id' });

  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ ok: true, quizId });
}
