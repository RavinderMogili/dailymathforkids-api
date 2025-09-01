import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, quizId } = req.query;
    if (!userId || !quizId) return res.status(400).json({ error: 'userId and quizId required' });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const { data, error } = await sb.from('submissions')
      .select('score, created_at')
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ done: !!data, score: data?.score ?? null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
