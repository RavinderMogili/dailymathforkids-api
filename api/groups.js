import { createClient } from '@supabase/supabase-js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function randomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

  // GET ?userId=X — return the user's group
  // GET ?invite_code=ABC123 — return group progress
  if (req.method === 'GET') {
    const { invite_code, userId } = req.query;

    if (userId) {
      const { data: membership } = await sb
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId)
        .limit(1)
        .single();

      if (!membership) return res.status(200).json({ group: null });

      const { data: group } = await sb
        .from('groups')
        .select('id, name, invite_code')
        .eq('id', membership.group_id)
        .single();

      if (!group) return res.status(200).json({ group: null });

      const { data: progress } = await sb
        .from('group_progress')
        .select('*')
        .eq('group_id', group.id)
        .single();

      return res.status(200).json({
        group: { groupId: group.id, groupName: group.name, invite_code: group.invite_code, ...(progress || {}) }
      });
    }

    if (!invite_code) return res.status(400).json({ error: 'invite_code or userId required' });

    const { data, error } = await sb
      .from('group_progress')
      .select('*')
      .eq('invite_code', invite_code.toUpperCase())
      .single();

    if (error || !data) return res.status(404).json({ error: 'Group not found' });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { action, userId, groupName, invite_code } = req.body || {};

    // Create a new group
    if (action === 'create') {
      if (!userId || !groupName) return res.status(400).json({ error: 'userId and groupName required' });

      const code = randomCode();
      const { data, error } = await sb
        .from('groups')
        .insert({ name: groupName.trim().slice(0, 60), invite_code: code, created_by: userId })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });

      // Add the creator as first member
      await sb.from('group_members').insert({ group_id: data.id, user_id: userId });

      return res.status(201).json({ groupId: data.id, groupName: data.name, invite_code: code });
    }

    // Join an existing group by invite code
    if (action === 'join') {
      if (!userId || !invite_code) return res.status(400).json({ error: 'userId and invite_code required' });

      const { data: group, error: gErr } = await sb
        .from('groups')
        .select('id, name')
        .eq('invite_code', invite_code.toUpperCase())
        .single();

      if (gErr || !group) return res.status(404).json({ error: 'Group not found — check the code and try again' });

      const { error: mErr } = await sb
        .from('group_members')
        .upsert({ group_id: group.id, user_id: userId }, { onConflict: 'group_id,user_id' });

      if (mErr) return res.status(500).json({ error: mErr.message });

      // Return updated group totals
      const { data: progress } = await sb
        .from('group_progress')
        .select('*')
        .eq('group_id', group.id)
        .single();

      return res.status(200).json({ joined: true, groupName: group.name, ...(progress || {}) });
    }

    return res.status(400).json({ error: 'Unknown action. Use "create" or "join".' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
