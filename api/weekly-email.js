import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export default async function handler(req, res) {
  // This endpoint is called by Vercel Cron every Sunday, or manually for testing.
  // Accepts GET (cron) or POST (manual trigger with ?test=email@example.com)
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Simple auth: cron jobs send Authorization header with CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  const testEmail = req.query.test;
  if (!testEmail && cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Get all users with parent email
    const { data: users, error: uErr } = await sb
      .from('users')
      .select('id, nickname, grade, parent_email')
      .not('parent_email', 'is', null);

    if (uErr) return res.status(500).json({ error: uErr.message });

    // Filter to users who actually have an email
    const targets = (users || []).filter(u => u.parent_email && u.parent_email.includes('@'));

    // If testing, only send to the test email
    if (testEmail) {
      const testUser = targets.find(u => u.parent_email === testEmail);
      if (testUser) {
        const result = await sendEmailForUser(sb, resend, testUser);
        return res.status(200).json({ test: true, result });
      }
      return res.status(404).json({ error: 'No user found with that parent email' });
    }

    // Send to all parents
    const results = [];
    for (const user of targets) {
      try {
        const result = await sendEmailForUser(sb, resend, user);
        results.push({ nickname: user.nickname, status: 'sent', ...result });
      } catch (e) {
        results.push({ nickname: user.nickname, status: 'failed', error: e.message });
      }
    }

    return res.status(200).json({ sent: results.length, results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function sendEmailForUser(sb, resend, user) {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Quiz submissions this week
  const { data: quizSubs } = await sb
    .from('submissions')
    .select('quiz_id, score, points_earned, time_seconds, created_at')
    .eq('user_id', user.id)
    .gte('created_at', weekAgo)
    .order('created_at', { ascending: true });

  // Practice submissions this week
  const { data: practiceSubs } = await sb
    .from('practice_submissions')
    .select('correct, total, difficulty, points_earned, time_seconds, created_at')
    .eq('user_id', user.id)
    .gte('created_at', weekAgo)
    .order('created_at', { ascending: true });

  // All-time stats for context
  const { data: allSubs } = await sb
    .from('submissions')
    .select('points_earned')
    .eq('user_id', user.id);
  const totalPoints = (allSubs || []).reduce((s, r) => s + (r.points_earned || 0), 0);

  // Calculate weekly stats
  const quizzes = quizSubs || [];
  const practices = practiceSubs || [];
  const weekQuizPoints = quizzes.reduce((s, r) => s + (r.points_earned || 0), 0);
  const weekPracticePoints = practices.reduce((s, r) => s + (parseFloat(r.points_earned) || 0), 0);
  const weekTotalPoints = weekQuizPoints + Math.round(weekPracticePoints);
  const quizCount = quizzes.length;
  const practiceCount = practices.length;
  const totalCorrect = practices.reduce((s, r) => s + (r.correct || 0), 0);
  const totalQuestions = practices.reduce((s, r) => s + (r.total || 0), 0);
  const practiceAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  // Determine activity level for messaging
  const totalSessions = quizCount + practiceCount;
  let headline, emoji, encouragement;
  if (totalSessions === 0) {
    headline = `${user.nickname} didn't practice this week`;
    emoji = '📢';
    encouragement = `A little practice each day goes a long way! Even 5 minutes helps build math confidence. Maybe try a quick practice session together today?`;
  } else if (totalSessions >= 5) {
    headline = `${user.nickname} had an amazing week!`;
    emoji = '🌟';
    encouragement = `Incredible dedication! ${user.nickname} is building a strong math foundation. Keep up the momentum!`;
  } else {
    headline = `${user.nickname}'s weekly math update`;
    emoji = '📊';
    encouragement = `Great job showing up! Consistency is key — even a few sessions each week make a big difference.`;
  }

  // Build quiz rows
  let quizRows = '';
  for (const q of quizzes) {
    const date = q.created_at ? new Date(q.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
    const time = q.time_seconds ? `${Math.floor(q.time_seconds / 60)}m ${q.time_seconds % 60}s` : '—';
    quizRows += `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${date}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center"><strong>${q.score}/5</strong></td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">+${q.points_earned}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${time}</td></tr>`;
  }

  // Build practice rows
  let practiceRows = '';
  for (const p of practices) {
    const date = p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
    practiceRows += `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${date}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center"><strong>${p.correct}/${p.total}</strong></td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${p.difficulty || 'easy'}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">+${parseFloat(p.points_earned || 0).toFixed(1)}</td></tr>`;
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:16px 16px 0 0;padding:24px;text-align:center;color:#fff">
    <div style="font-size:2rem">${emoji}</div>
    <h1 style="margin:8px 0 4px;font-size:1.3rem">${headline}</h1>
    <p style="margin:0;opacity:.85;font-size:.9rem">${user.grade} • Weekly Report</p>
  </div>

  <!-- Body -->
  <div style="background:#fff;padding:24px;border-radius:0 0 16px 16px;border:1px solid #e5e7eb;border-top:none">

    <!-- Stats cards -->
    <div style="display:flex;gap:10px;margin-bottom:20px;text-align:center">
      <div style="flex:1;background:#f0fdf4;border-radius:10px;padding:14px">
        <div style="font-size:1.5rem;font-weight:800;color:#16a34a">${quizCount}</div>
        <div style="font-size:.75rem;color:#666">Quizzes</div>
      </div>
      <div style="flex:1;background:#fef3c7;border-radius:10px;padding:14px">
        <div style="font-size:1.5rem;font-weight:800;color:#d97706">${practiceCount}</div>
        <div style="font-size:.75rem;color:#666">Practice</div>
      </div>
      <div style="flex:1;background:#ede9fe;border-radius:10px;padding:14px">
        <div style="font-size:1.5rem;font-weight:800;color:#7c3aed">+${weekTotalPoints}</div>
        <div style="font-size:.75rem;color:#666">Points</div>
      </div>
      <div style="flex:1;background:#f0f9ff;border-radius:10px;padding:14px">
        <div style="font-size:1.5rem;font-weight:800;color:#2563eb">${totalPoints}</div>
        <div style="font-size:.75rem;color:#666">Total Pts</div>
      </div>
    </div>

    <!-- Encouragement -->
    <p style="background:#fefce8;border-radius:10px;padding:14px;font-size:.9rem;color:#854d0e;margin:0 0 20px">
      💡 ${encouragement}
    </p>

    ${quizCount > 0 ? `
    <!-- Quiz table -->
    <h3 style="margin:0 0 10px;font-size:.95rem;color:#333">📝 Daily Quizzes</h3>
    <table style="width:100%;border-collapse:collapse;font-size:.85rem;margin-bottom:20px">
      <tr style="background:#f9fafb"><th style="padding:8px 12px;text-align:left;font-size:.75rem;color:#666">Date</th><th style="padding:8px 12px;text-align:center;font-size:.75rem;color:#666">Score</th><th style="padding:8px 12px;text-align:center;font-size:.75rem;color:#666">Points</th><th style="padding:8px 12px;text-align:center;font-size:.75rem;color:#666">Time</th></tr>
      ${quizRows}
    </table>` : ''}

    ${practiceCount > 0 ? `
    <!-- Practice table -->
    <h3 style="margin:0 0 10px;font-size:.95rem;color:#333">🎯 Practice Sessions</h3>
    <table style="width:100%;border-collapse:collapse;font-size:.85rem;margin-bottom:10px">
      <tr style="background:#f9fafb"><th style="padding:8px 12px;text-align:left;font-size:.75rem;color:#666">Date</th><th style="padding:8px 12px;text-align:center;font-size:.75rem;color:#666">Score</th><th style="padding:8px 12px;text-align:center;font-size:.75rem;color:#666">Level</th><th style="padding:8px 12px;text-align:center;font-size:.75rem;color:#666">Points</th></tr>
      ${practiceRows}
    </table>
    <p style="font-size:.82rem;color:#666;margin:0 0 20px">Practice accuracy: <strong>${practiceAccuracy}%</strong></p>` : ''}

    ${totalSessions === 0 ? `
    <div style="text-align:center;padding:20px">
      <p style="font-size:2rem;margin:0">📚</p>
      <p style="color:#666;font-size:.9rem">No activity this week. A quick practice session takes just 2 minutes!</p>
    </div>` : ''}

    <!-- CTA -->
    <div style="text-align:center;margin-top:10px">
      <a href="https://dailymathforkids.com/practice.html" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:.95rem">Start Practicing Now 🚀</a>
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:16px;font-size:.75rem;color:#999">
    <p style="margin:4px 0">Daily Math for Kids • Free math practice for students</p>
    <p style="margin:4px 0"><a href="https://dailymathforkids.com" style="color:#6366f1">dailymathforkids.com</a></p>
    <p style="margin:8px 0 0;font-size:.7rem">You're receiving this because a student added your email for progress reports.<br/>
    To stop, remove your email from the student's profile settings.</p>
  </div>

</div>
</body>
</html>`;

  const { data, error } = await resend.emails.send({
    from: 'Daily Math for Kids <progress@dailymathforkids.com>',
    to: user.parent_email,
    subject: `${emoji} ${headline}`,
    html,
  });

  if (error) throw new Error(error.message);
  return { emailId: data?.id };
}
