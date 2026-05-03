const CATEGORIES = ['idea', 'task', 'shopping', 'housework', 'research', 'contact', 'place', 'health', 'money', 'other'];
const ACTIONS = ['作る', '買う', '調べる', '連絡する', '行く', '片付ける', 'メモ'];
const PRIORITIES = ['high', 'medium', 'low'];

function extractOutputText(data) {
  if (typeof data.output_text === 'string') return data.output_text;

  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  return parts.join('');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(501).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  const text = String(req.body?.text || '').trim();
  const source = String(req.body?.source || 'manual');
  if (!text) return res.status(400).json({ error: 'text is required' });

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        instructions: [
          'You classify quick personal notes written mostly in Japanese.',
          'Return compact JSON only, matching the provided schema.',
          'Prefer practical categories and short Japanese titles.',
        ].join('\n'),
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `Source: ${source}\nMemo: ${text}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'memo_classification',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'category', 'action', 'priority', 'dueHint', 'tags'],
              properties: {
                title: {
                  type: 'string',
                  description: 'A concise Japanese title, 32 characters or fewer.',
                },
                category: {
                  type: 'string',
                  enum: CATEGORIES,
                },
                action: {
                  type: 'string',
                  enum: ACTIONS,
                },
                priority: {
                  type: 'string',
                  enum: PRIORITIES,
                },
                dueHint: {
                  type: 'string',
                  description: 'A short Japanese due-date hint such as 今日, 明日, 週末, or an empty string.',
                },
                tags: {
                  type: 'array',
                  minItems: 0,
                  maxItems: 4,
                  items: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
        max_output_tokens: 250,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'OpenAI request failed' });
    }

    const outputText = extractOutputText(data);
    if (!outputText) return res.status(502).json({ error: 'No classification returned' });

    const parsed = JSON.parse(outputText);
    return res.status(200).json({
      title: parsed.title,
      category: parsed.category,
      action: parsed.action,
      priority: parsed.priority,
      dueHint: parsed.dueHint || null,
      tags: parsed.tags || [],
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
