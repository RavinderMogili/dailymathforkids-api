import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { normalizeGrade } from './_grade.js';

const hashPin = pin => createHash('sha256').update(String(pin)).digest('hex');
const firstRow = data => Array.isArray(data) ? data[0] : data;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { userId, newGrade, pin, confirmed } = req.body || {};
    const grade = normalizeGrade(newGrade);
    if (!userId || !grade || confirmed !== true || !/^\d{4}$/.test(String(pin || ''))) {
      return res.status(400).json({ error: 'userId, valid newGrade, PIN, and explicit confirmation are required' });
    }
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const { data: user, error: userError } = await sb.from('users')
      .select('id, grade, pin_hash, grade_correction_used').eq('id', userId).maybeSingle();
    if (userError || !user) return res.status(404).json({ error: 'User not found' });
    if (!user.pin_hash || hashPin(pin) !== user.pin_hash) {
      return res.status(401).json({ error: 'Incorrect PIN' });
    }
    if (user.grade_correction_used) {
      return res.status(409).json({ error: 'Official Grade correction has already been used. Please contact us through Feedback.' });
    }
    if (normalizeGrade(user.grade) === grade) {
      return res.status(400).json({ error: 'Choose a different Official Grade' });
    }
    const { data, error } = await sb.rpc('correct_official_grade', {
      p_user_id: userId, p_new_grade: grade,
    });
    if (error) return res.status(/already been used/i.test(error.message || '') ? 409 : 400).json({ error: error.message });
    const result = firstRow(data);
    return res.status(200).json({
      ok: true, officialGrade: result?.new_grade || grade,
      gradeCorrectionUsed: true, pointsPreserved: true,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

