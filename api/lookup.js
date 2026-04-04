import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { nickname } = req.query;
    if (!nickname) return res.status(400).json({ error: 'nickname required' });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const { data, error } = await sb
      .from('users')
      .select('id, nickname, grade, school, city')
      .eq('nickname', nickname.trim())
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Nickname not found. Please register first.' });

    return res.status(200).json({
      userId: data.id,
      nickname: data.nickname,
      grade: data.grade,
      school: data.school,
      city: data.city,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
