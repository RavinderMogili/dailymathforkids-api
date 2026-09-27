import { createClient } from '@supabase/supabase-js';
import { generatePracticeQuestions } from './_practice-generators.js';

const SESSION_TTL_MINUTES = 30;
const MAX_COUNT = 20;
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, grade, topics, difficulty, count } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const gradeNum = Math.min(Math.max(parseInt(grade, 10) || 3, 1), 12);
    const topicList = Array.isArray(topics) ? topics.filter(t => typeof t === 'string') : [];
    const diff = VALID_DIFFICULTIES.includes(difficulty) ? difficulty : 'easy';
    const qCount = Math.min(Math.max(parseInt(count, 10) || 10, 1), MAX_COUNT);

    // Server-side generation is the actual security boundary here — the
    // client never gets a say in what "questions" means for this session.
    const questions = generatePracticeQuestions(gradeNum, topicList, diff, qCount);
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(500).json({ error: 'failed to generate practice questions' });
    }

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000).toISOString();

    const { data, error } = await sb.from('practice_sessions').insert({
      user_id: userId,
      questions,
      grade: gradeNum,
      topics: topicList,
      difficulty: diff,
      expires_at: expiresAt,
    }).select('id').single();

    if (error) return res.status(400).json({ error: error.message });

    // The answer key travels with the question set here (same as every
    // practice question source already worked before this change — see
    // "Practice scoring trust boundary" in the frontend repo's
    // tools/word-problems/README.md for why this is a deliberate,
    // documented tradeoff, not an oversight): it preserves Practice Mode's
    // existing instant per-question feedback UX. What changed is that
    // /api/practice-submit no longer trusts anything the client says about
    // correctness — it re-derives it from this session's own stored copy.
    return res.status(200).json({ sessionId: data.id, questions, expiresAt });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
