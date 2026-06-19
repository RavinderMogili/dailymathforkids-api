import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const ADMIN_EMAIL = 'ravinder.ravi001@gmail.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, category, message, email, pageUrl, quizId, questionNum } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (!category || !['bug', 'suggestion', 'question', 'wrong_answer'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    const { error } = await sb.from('feedback').insert({
      user_id: userId || null,
      category,
      message: message.trim(),
      email: email || null,
      page_url: pageUrl || null,
      quiz_id: quizId || null,
      question_num: questionNum || null,
    });

    if (error) return res.status(400).json({ error: error.message });

    // Email notification to admin
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        const categoryEmoji = { bug: '🐛', suggestion: '💡', question: '❓', wrong_answer: '❌' };
        const categoryLabel = { bug: 'Bug Report', suggestion: 'Suggestion', question: 'Question', wrong_answer: 'Wrong Answer Report' };

        await resend.emails.send({
          from: 'Daily Math for Kids <feedback@dailymathforkids.com>',
          to: ADMIN_EMAIL,
          subject: `${categoryEmoji[category]} ${categoryLabel[category]} — Daily Math for Kids`,
          html: `
            <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
              <h2 style="color:#2563eb">${categoryEmoji[category]} New ${categoryLabel[category]}</h2>
              <div style="background:#f8fafc;border-radius:12px;padding:16px;margin:12px 0">
                <p style="margin:0;white-space:pre-wrap">${message.trim()}</p>
              </div>
              ${email ? `<p><strong>Reply to:</strong> <a href="mailto:${email}">${email}</a></p>` : ''}
              ${pageUrl ? `<p><strong>Page:</strong> ${pageUrl}</p>` : ''}
              ${quizId ? `<p><strong>Quiz:</strong> ${quizId}${questionNum ? ` — Question #${questionNum}` : ''}</p>` : ''}
              <hr style="margin:20px 0;border:none;border-top:1px solid #eee"/>
              <p style="font-size:.85rem;color:#666">Submitted via the feedback widget on Daily Math for Kids.</p>
            </div>
          `,
        });
      } catch { /* email is best-effort */ }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
