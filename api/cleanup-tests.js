import { createClient } from '@supabase/supabase-js';

// Deletes accounts created by automated tests (Playwright E2E and Jest
// integration tests). Protected by the service role key, same as upsert-quiz.
// Test nickname patterns: 'test_<timestamp>_...' and 'E2E_...'
const TEST_NICKNAME_RE = /^(test_\d+_|E2E_)/;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const token    = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const expected = (process.env.SUPABASE_SERVICE_ROLE || '').trim();
  if (!token || !expected || token !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    const { data: users, error: uErr } = await sb
      .from('users').select('id, nickname')
      .or('nickname.like.test\\_%,nickname.like.E2E\\_%');
    if (uErr) return res.status(400).json({ error: uErr.message });

    const targets = (users || []).filter(u => TEST_NICKNAME_RE.test(u.nickname));
    if (targets.length === 0) {
      return res.status(200).json({ deleted: 0, nicknames: [] });
    }

    const ids = targets.map(u => u.id);
    // submissions has no ON DELETE CASCADE — remove them first
    const { error: sErr } = await sb.from('submissions').delete().in('user_id', ids);
    if (sErr) return res.status(400).json({ error: sErr.message });

    const { error: dErr } = await sb.from('users').delete().in('id', ids);
    if (dErr) return res.status(400).json({ error: dErr.message });

    return res.status(200).json({ deleted: targets.length, nicknames: targets.map(u => u.nickname) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
