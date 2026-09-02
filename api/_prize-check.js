import { Resend } from 'resend';

const PRIZE_THRESHOLD = 300;
const ADMIN_EMAIL = 'ravinder.ravi001@gmail.com';

/**
 * After a submission, check if the student just crossed 300 total points.
 * If so and they have a parent email, notify the admin.
 * Runs in the background — never blocks or fails the main request.
 */
export async function checkPrizeMilestone(sb, userId) {
  try {
    // Get user info
    const { data: user } = await sb
      .from('users')
      .select('nickname, grade, parent_email')
      .eq('id', userId)
      .maybeSingle();
    if (!user) return;

    // Sum quiz points
    const { data: quizPts } = await sb
      .from('submissions')
      .select('points_earned')
      .eq('user_id', userId);
    const quizTotal = (quizPts || []).reduce((s, r) => s + (r.points_earned || 0), 0);

    // Sum practice points
    const { data: pracPts } = await sb
      .from('practice_submissions')
      .select('points_earned')
      .eq('user_id', userId);
    const pracTotal = (pracPts || []).reduce((s, r) => s + (parseFloat(r.points_earned) || 0), 0);

    const total = quizTotal + Math.round(pracTotal);
    if (total < PRIZE_THRESHOLD) return;

    // Record the milestone once per (user, threshold). The unique constraint
    // means only the first crossing inserts a row — later submissions that
    // are still above the threshold are silently ignored (no duplicate email).
    const { data: inserted, error: milestoneErr } = await sb
      .from('reward_milestones')
      .upsert(
        { user_id: userId, threshold: PRIZE_THRESHOLD },
        { onConflict: 'user_id,threshold', ignoreDuplicates: true }
      )
      .select('id');
    if (milestoneErr) {
      console.error('reward_milestones insert failed:', milestoneErr.message);
      return;
    }
    if (!inserted || inserted.length === 0) return; // already recorded — don't re-notify

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return;

    const resend = new Resend(resendKey);
    const hasParentEmail = user.parent_email && user.parent_email.includes('@');

    await resend.emails.send({
      from: 'Daily Math for Kids <progress@dailymathforkids.com>',
      to: ADMIN_EMAIL,
      subject: `🏆 ${user.nickname} reached ${total} points — prize eligible!`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
          <h2 style="color:#16a34a">🏆 Prize Milestone Reached!</h2>
          <p><strong>${user.nickname}</strong> (${user.grade || 'Unknown grade'}) has earned <strong>${total} points</strong> — they qualify for the $10 Walmart gift card!</p>
          ${hasParentEmail
            ? `<p>✅ <strong>Parent email on file:</strong> <a href="mailto:${user.parent_email}">${user.parent_email}</a></p>
               <p>You can send the Walmart eGift card to this email.</p>`
            : `<p>⚠️ <strong>No parent email on file.</strong> The student has been asked to add one on their profile page.</p>`
          }
          <hr style="margin:20px 0;border:none;border-top:1px solid #eee"/>
          <p style="font-size:.85rem;color:#666">This is an automated notification from Daily Math for Kids.</p>
        </div>
      `,
    });
  } catch (e) {
    // Never fail the main request — just log
    console.error('Prize check error (non-fatal):', e.message);
  }
}
