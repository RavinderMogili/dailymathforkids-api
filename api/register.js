import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

function hashPin(pin) {
  return createHash('sha256').update(String(pin)).digest('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { nickname, grade, school, city, parent_email, pin } = req.body || {};
    if (!nickname) return res.status(400).json({ error: 'nickname required' });
    if (!grade) return res.status(400).json({ error: 'grade required' });
    if (!pin || !/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'A 4-digit PIN is required' });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    // Check if nickname already exists — don't let someone overwrite another user's account
    const { data: existing } = await sb.from('users')
      .select('id, pin_hash')
      .eq('nickname', nickname.trim())
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'This nickname is already taken. Please choose another or log in.' });
    }

    const { data, error } = await sb.from('users')
      .insert({
        nickname: nickname.trim(),
        grade,
        school: school || null,
        city: city || null,
        parent_email: parent_email || null,
        pin_hash: hashPin(pin),
      })
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
