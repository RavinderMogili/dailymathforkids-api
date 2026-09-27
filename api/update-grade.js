import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, grade } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!grade) return res.status(400).json({ error: 'grade required' });
    if (!/^(1[0-2]|[1-9])$/.test(String(grade))) return res.status(400).json({ error: 'Invalid grade' });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const { error } = await sb.from('users')
      .update({ grade: String(grade) })
      .eq('id', userId);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true, grade: String(grade) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
