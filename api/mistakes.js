import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

  // GET: Fetch user's mistakes
  if (req.method === 'GET') {
    const { userId, source, resolved } = req.query || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });

    let query = sb.from('mistakes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (source) query = query.eq('source', source);
    if (resolved === 'false') query = query.eq('resolved', false);
    if (resolved === 'true') query = query.eq('resolved', true);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ mistakes: data });
  }

  // POST: Save new mistakes (batch)
  if (req.method === 'POST') {
    const { userId, mistakes } = req.body || {};
    if (!userId || !Array.isArray(mistakes) || mistakes.length === 0) {
      return res.status(400).json({ error: 'userId and mistakes[] required' });
    }

    const rows = mistakes.slice(0, 20).map(m => ({
      user_id: userId,
      source: m.source || 'quiz',
      quiz_id: m.quizId || null,
      question_num: m.questionNum || null,
      question_text: m.questionText,
      correct_answer: m.correctAnswer,
      user_answer: m.userAnswer,
      choices: m.choices || null,
      hint: m.hint || null,
      topic: m.topic || null,
      resolved: false,
    }));

    const { error } = await sb.from('mistakes').insert(rows);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ saved: rows.length });
  }

  // PATCH: Mark mistakes as resolved
  if (req.method === 'PATCH') {
    const { userId, ids } = req.body || {};
    if (!userId || !Array.isArray(ids)) {
      return res.status(400).json({ error: 'userId and ids[] required' });
    }

    const { error } = await sb.from('mistakes')
      .update({ resolved: true })
      .eq('user_id', userId)
      .in('id', ids);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ resolved: ids.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
