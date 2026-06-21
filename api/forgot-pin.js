import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

function hashPin(pin) {
  return createHash('sha256').update(String(pin)).digest('hex');
}

function normalize(str) {
  return String(str || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { nickname, parent_email, security_question, security_answer, new_pin } = req.body || {};
    if (!nickname) return res.status(400).json({ error: 'nickname required' });
    if (!new_pin || !/^\d{4}$/.test(String(new_pin))) return res.status(400).json({ error: 'A 4-digit PIN is required' });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const { data: user, error } = await sb.from('users')
      .select('id, nickname, parent_email, security_question, security_answer, pin_hash')
      .eq('nickname', nickname.trim())
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });
    if (!user) return res.status(404).json({ error: 'Nickname not found.' });

    let verified = false;
    let method = null;

    // Method 1: Parent email verification
    if (parent_email && normalize(parent_email) === normalize(user.parent_email)) {
      verified = true;
      method = 'email';
    }

    // Method 2: Security question verification
    if (!verified && security_question && security_answer && user.security_question && user.security_answer) {
      if (normalize(security_question) === normalize(user.security_question) &&
          normalize(security_answer) === normalize(user.security_answer)) {
        verified = true;
        method = 'security_question';
      }
    }

    if (!verified) {
      return res.status(401).json({
        error: 'Could not verify your identity. Please check your parent email or security question answer.',
        hasParentEmail: !!user.parent_email,
        hasSecurityQuestion: !!(user.security_question && user.security_answer),
      });
    }

    const { error: updErr } = await sb.from('users')
      .update({ pin_hash: hashPin(new_pin) })
      .eq('id', user.id);

    if (updErr) return res.status(400).json({ error: updErr.message });
    return res.status(200).json({ success: true, method });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
