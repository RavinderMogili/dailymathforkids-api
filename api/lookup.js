import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

function hashPin(pin) {
  return createHash('sha256').update(String(pin)).digest('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Support both GET (legacy) and POST (with PIN)
    const nickname = req.method === 'POST'
      ? (req.body || {}).nickname
      : (req.query || {}).nickname;
    const pin = req.method === 'POST' ? (req.body || {}).pin : null;

    if (!nickname) return res.status(400).json({ error: 'nickname required' });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const { data, error } = await sb
      .from('users')
      .select('id, nickname, grade, school, city, pin_hash')
      .eq('nickname', nickname.trim())
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Nickname not found. Please register first.' });

    // If user has a PIN set, verify it
    if (data.pin_hash) {
      if (!pin) return res.status(401).json({ error: 'PIN required', needPin: true });
      if (hashPin(pin) !== data.pin_hash) return res.status(401).json({ error: 'Incorrect PIN. Please try again.' });
    } else {
      // Old account without PIN — let them set one
      if (pin && /^\d{4}$/.test(String(pin))) {
        await sb.from('users').update({ pin_hash: hashPin(pin) }).eq('id', data.id);
      } else {
        return res.status(200).json({
          userId: data.id,
          nickname: data.nickname,
          grade: data.grade,
          school: data.school,
          city: data.city,
          needSetPin: true,
        });
      }
    }

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
