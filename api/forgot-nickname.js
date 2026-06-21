import { createClient } from '@supabase/supabase-js';

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
    const { parent_email, security_question, security_answer } = req.body || {};
    if (!parent_email && !security_answer) {
      return res.status(400).json({ error: 'parent_email or security answer required' });
    }

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    let query = sb.from('users').select('nickname, parent_email, security_question, security_answer');

    if (parent_email) {
      query = query.eq('parent_email', parent_email.trim());
    }

    const { data: users, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    if (!users || users.length === 0) return res.status(404).json({ error: 'No account found with that information.' });

    // If security question used, filter by exact match
    let matched = users;
    if (security_question && security_answer) {
      matched = users.filter(u =>
        normalize(u.security_question) === normalize(security_question) &&
        normalize(u.security_answer) === normalize(security_answer)
      );
    }

    if (matched.length === 0) {
      return res.status(401).json({ error: 'Security question answer does not match.' });
    }

    if (matched.length > 1) {
      return res.status(200).json({
        nicknames: matched.map(u => u.nickname),
        message: 'Multiple accounts found. Please select your nickname.',
      });
    }

    return res.status(200).json({ nickname: matched[0].nickname });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
