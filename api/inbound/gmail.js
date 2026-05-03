const CATEGORIES = ['idea', 'task', 'shopping', 'housework', 'research', 'contact', 'place', 'health', 'money', 'other'];
const ACTIONS = ['作る', '買う', '調べる', '連絡する', '行く', '片付ける', 'メモ'];
const PRIORITIES = ['high', 'medium', 'low'];

function getSupabaseConfig() {
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

function extractOutputText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('');
}

function makeFallbackTitle(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length <= 32 ? cleaned : `${cleaned.slice(0, 32)}...`;
}

async function classifyMemo({ subject, body, from, to }) {
  const text = [subject, body].filter(Boolean).join('\n\n').trim();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      title: makeFallbackTitle(subject || body || 'Gmail memo'),
      category: 'other',
      action: 'メモ',
      priority: 'low',
      dueHint: null,
      tags: ['gmail'],
      classifier: 'local',
    };
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      instructions: [
        'You classify quick personal memo emails written mostly in Japanese.',
        'Return compact JSON only, matching the schema.',
        'Use the email body as the main memo and the subject as helpful context.',
      ].join('\n'),
      input: [{
        role: 'user',
        content: [{
          type: 'input_text',
          text: `From: ${from || ''}\nTo: ${to || ''}\nSubject: ${subject || ''}\nBody:\n${body || ''}`,
        }],
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'gmail_memo_classification',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'category', 'action', 'priority', 'dueHint', 'tags'],
            properties: {
              title: { type: 'string' },
              category: { type: 'string', enum: CATEGORIES },
              action: { type: 'string', enum: ACTIONS },
              priority: { type: 'string', enum: PRIORITIES },
              dueHint: { type: 'string' },
              tags: {
                type: 'array',
                minItems: 0,
                maxItems: 4,
                items: { type: 'string' },
              },
            },
          },
        },
      },
      max_output_tokens: 250,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'OpenAI classification failed');
  const parsed = JSON.parse(extractOutputText(data));
  return {
    title: parsed.title || makeFallbackTitle(subject || body),
    category: CATEGORIES.includes(parsed.category) ? parsed.category : 'other',
    action: parsed.action || 'メモ',
    priority: PRIORITIES.includes(parsed.priority) ? parsed.priority : 'low',
    dueHint: parsed.dueHint || null,
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    classifier: 'openai',
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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.INBOUND_SECRET;
  const provided = req.headers['x-inbound-secret'];
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabaseConfig();
  if (!supabase) {
    return res.status(501).json({ error: 'Supabase is not configured' });
  }

  try {
    const body = await readJson(req);
    const subject = String(body.subject || '').trim();
    const messageBody = String(body.body || '').trim();
    const from = String(body.from || '').trim();
    const to = String(body.to || '').trim();
    const gmailMessageId = String(body.gmailMessageId || '').trim();

    if (!subject && !messageBody) return res.status(400).json({ error: 'subject or body is required' });

    const classification = await classifyMemo({ subject, body: messageBody, from, to });
    const now = new Date().toISOString();
    const raw = [subject, messageBody].filter(Boolean).join('\n\n').trim();
    const memo = {
      raw,
      title: classification.title,
      category: classification.category,
      action: classification.action,
      priority: classification.priority,
      due_hint: classification.dueHint,
      source: 'gmail',
      done: false,
      tags: [...new Set([...(classification.tags || []), 'gmail'].filter(Boolean))],
      classifier: classification.classifier,
      created_at: now,
      updated_at: now,
    };

    const response = await fetch(supabase.endpoint, {
      method: 'POST',
      headers: {
        ...supabase.headers,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(memo),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Supabase insert failed' });

    return res.status(201).json({
      ok: true,
      gmailMessageId,
      memo: data[0],
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
