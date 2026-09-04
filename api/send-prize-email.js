import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

/**
 * POST /api/send-prize-email
 * Admin-only: sends the $10 Walmart eGift card code to a milestone winner's
 * parent email (from /api/prize-winners), then marks the milestone delivered.
 *
 * Auth: same admin key as /api/prize-winners (ANALYTICS_KEY env var),
 * passed as `Authorization: Bearer <key>` or `?key=<key>`.
 *
 * Body: { milestoneId, code, pin?, force? }
 *   - milestoneId: id from /api/prize-winners
 *   - code: the Walmart eGift card number/code
 *   - pin: optional PIN, if the card has one
 *   - force: resend even if already marked delivered
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Admin-only: this endpoint sends real email and touches parent emails.
  const expected = (process.env.ANALYTICS_KEY || '').trim();
  if (!expected) return res.status(503).json({ error: 'analytics key not configured' });
  const authHeader = req.headers['authorization'] || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const given = bearer || String(req.query?.key || '').trim();
  if (given !== expected) return res.status(401).json({ error: 'unauthorized' });

  const { milestoneId, code, pin, force } = req.body || {};
  if (!milestoneId) return res.status(400).json({ error: 'milestoneId is required' });
  if (!code || !String(code).trim()) return res.status(400).json({ error: 'code is required' });

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    const { data: milestone, error: mErr } = await sb
      .from('reward_milestones')
      .select('id, threshold, reward_status, delivered_at, users(nickname, parent_email)')
      .eq('id', milestoneId)
      .maybeSingle();
    if (mErr) return res.status(400).json({ error: mErr.message });
    if (!milestone) return res.status(404).json({ error: 'milestone not found' });

    const parentEmail = milestone.users?.parent_email;
    if (!parentEmail || !parentEmail.includes('@')) {
      return res.status(400).json({ error: 'no parent email on file for this student' });
    }

    if (milestone.reward_status === 'delivered' && !force) {
      return res.status(409).json({
        error: 'already delivered',
        deliveredAt: milestone.delivered_at,
        hint: 'pass force:true to resend',
      });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return res.status(503).json({ error: 'email service not configured' });

    const resend = new Resend(resendKey);
    const nickname = milestone.users?.nickname || 'your child';

    const { data, error: sendErr } = await resend.emails.send({
      from: 'Daily Math for Kids <progress@dailymathforkids.com>',
      to: parentEmail,
      subject: `🎉 ${nickname} earned a $10 Walmart gift card!`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px">

  <div style="background:linear-gradient(135deg,#16a34a,#22c55e);border-radius:16px 16px 0 0;padding:24px;text-align:center;color:#fff">
    <div style="font-size:2rem">🏆</div>
    <h1 style="margin:8px 0 4px;font-size:1.3rem">${nickname} reached ${milestone.threshold} points!</h1>
    <p style="margin:0;opacity:.85;font-size:.9rem">300-Point Club Reward</p>
  </div>

  <div style="background:#fff;padding:24px;border-radius:0 0 16px 16px;border:1px solid #e5e7eb;border-top:none">
    <p style="font-size:.95rem;color:#333">Congratulations! <strong>${nickname}</strong> has practiced their way to ${milestone.threshold} total points on Daily Math for Kids and earned a <strong>$10 Walmart eGift card</strong> — our thanks for all the hard work.</p>

    <div style="background:#f0fdf4;border:2px dashed #16a34a;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
      <div style="font-size:.75rem;color:#166534;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Walmart eGift Card Code</div>
      <div style="font-size:1.3rem;font-weight:800;color:#14532d;letter-spacing:.05em">${code}</div>
      ${pin ? `<div style="font-size:.85rem;color:#166534;margin-top:8px">PIN: <strong>${pin}</strong></div>` : ''}
    </div>

    <p style="font-size:.85rem;color:#666">You can redeem this online at <a href="https://www.walmart.com/giftcards/redeem" style="color:#16a34a">walmart.com/giftcards</a> or in any Walmart store.</p>

    <hr style="margin:20px 0;border:none;border-top:1px solid #eee"/>
    <p style="font-size:.78rem;color:#999;margin:0">This email was sent because ${nickname} reached a reward milestone on <a href="https://dailymathforkids.com" style="color:#6366f1">dailymathforkids.com</a>. Questions? Just reply to this email.</p>
  </div>
</div>
</body>
</html>`,
    });

    if (sendErr) return res.status(502).json({ error: sendErr.message });

    const { error: updateErr } = await sb
      .from('reward_milestones')
      .update({ reward_status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', milestoneId);
    if (updateErr) {
      // Email went out but the status update failed — surface this clearly
      // so it isn't silently resent later.
      return res.status(207).json({
        sent: true,
        emailId: data?.id,
        warning: `email sent but failed to mark delivered: ${updateErr.message}`,
      });
    }

    return res.status(200).json({ sent: true, emailId: data?.id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
