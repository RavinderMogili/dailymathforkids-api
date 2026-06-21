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
    const { userId, pin } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!pin || !/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'A 4-digit PIN is required' });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const { error } = await sb.from('users')
      .update({ pin_hash: hashPin(pin) })
      .eq('id', userId);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
