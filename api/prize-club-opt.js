import { createClient } from '@supabase/supabase-js';
import { validateNickname } from './_nickname-check.js';

/**
 * POST /api/prize-club-opt
 * Toggle a student's visibility on the public 300-Point Club page.
 * Separate consent from Math Stars (show_on_leaderboard) — a family may
 * want one shown and not the other.
 *
 * Body: { userId, optIn: true|false }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, optIn } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (typeof optIn !== 'boolean') return res.status(400).json({ error: 'optIn must be true or false' });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    const { data: user, error: uErr } = await sb
      .from('users')
      .select('id, nickname')
      .eq('id', userId)
      .maybeSingle();

    if (uErr || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (optIn) {
      const check = validateNickname(user.nickname);
      if (!check.valid) {
        return res.status(400).json({
          error: check.reason,
          needsNicknameChange: true,
        });
      }

      const { error: updateErr } = await sb
        .from('users')
        .update({
          show_on_prize_club: true,
          prize_club_opted_in_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (updateErr) {
        return res.status(500).json({ error: 'Could not update. Please try again.' });
      }

      return res.status(200).json({ ok: true, show_on_prize_club: true });
    } else {
      const { error: updateErr } = await sb
        .from('users')
        .update({ show_on_prize_club: false })
        .eq('id', userId);

      if (updateErr) {
        return res.status(500).json({ error: 'Could not update. Please try again.' });
      }

      return res.status(200).json({ ok: true, show_on_prize_club: false });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
