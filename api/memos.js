function getConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {
    endpoint: `${url.replace(/\/$/, '')}/rest/v1/memos`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  };
}

function toDb(memo) {
  return {
    id: memo.id,
    raw: memo.raw,
    title: memo.title,
    category: memo.category,
    action: memo.action,
    priority: memo.priority,
    due_hint: memo.dueHint || null,
    source: memo.source || 'manual',
    done: Boolean(memo.done),
    tags: Array.isArray(memo.tags) ? memo.tags : [],
    classifier: memo.classifier || 'local',
    created_at: memo.createdAt || new Date().toISOString(),
  };
}

function fromDb(row) {
  return {
    id: row.id,
    raw: row.raw,
    title: row.title,
    category: row.category,
    action: row.action,
    priority: row.priority,
    dueHint: row.due_hint,
    source: row.source,
    done: row.done,
    tags: row.tags || [],
    classifier: row.classifier,
    createdAt: row.created_at,
  };
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

export default async function handler(req, res) {
  const config = getConfig();
  if (!config) {
    return res.status(501).json({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured' });
  }

  try {
    if (req.method === 'GET') {
      const response = await fetch(`${config.endpoint}?select=*&order=created_at.desc`, {
        headers: config.headers,
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.message || 'Supabase read failed' });
      return res.status(200).json({ memos: data.map(fromDb) });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          ...config.headers,
          Prefer: 'return=representation',
        },
        body: JSON.stringify(toDb(body.memo || body)),
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.message || 'Supabase insert failed' });
      return res.status(201).json({ memo: fromDb(data[0]) });
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const id = body.id || req.query?.id;
      if (!id) return res.status(400).json({ error: 'id is required' });
      const patch = {};
      if (typeof body.done === 'boolean') patch.done = body.done;
      if (body.title != null) patch.title = body.title;
      patch.updated_at = new Date().toISOString();

      const response = await fetch(`${config.endpoint}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: {
          ...config.headers,
          Prefer: 'return=representation',
        },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.message || 'Supabase update failed' });
      return res.status(200).json({ memo: fromDb(data[0]) });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (!id) return res.status(400).json({ error: 'id is required' });
      const response = await fetch(`${config.endpoint}?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: config.headers,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return res.status(response.status).json({ error: data.message || 'Supabase delete failed' });
      }
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
