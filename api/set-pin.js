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
    const { userId, pin, security_question, security_answer } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const updates = {};
    if (pin) {
      if (!/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'A 4-digit PIN is required' });
      updates.pin_hash = hashPin(pin);
    }
    if (security_question || security_answer) {
      if (!security_question || !security_answer) {
        return res.status(400).json({ error: 'Both security question and answer are required' });
      }
      updates.security_question = security_question;
      updates.security_answer = security_answer;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const { error } = await sb.from('users')
      .update(updates)
      .eq('id', userId);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
