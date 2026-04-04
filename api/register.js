import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { nickname, grade, school, city, parent_email } = req.body || {};
    if (!nickname) return res.status(400).json({ error: 'nickname required' });
    if (!grade) return res.status(400).json({ error: 'grade required' });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const { data, error } = await sb.from('users')
      .upsert(
        { nickname, grade, school: school || null, city: city || null, parent_email: parent_email || null },
        { onConflict: 'nickname' }
      )
      .select('id, nickname, grade, school, city, parent_email')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({
      userId: data.id,
      nickname: data.nickname,
      grade: data.grade,
      school: data.school,
      city: data.city,
      parent_email: data.parent_email,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
