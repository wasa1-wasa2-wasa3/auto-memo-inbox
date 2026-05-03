const STORAGE_KEY = 'auto-memo-inbox:v1';

const categories = [
  { id: 'all', label: 'すべて' },
  { id: 'idea', label: 'アイデア' },
  { id: 'task', label: 'タスク' },
  { id: 'shopping', label: '買い物' },
  { id: 'housework', label: '家事' },
  { id: 'research', label: '調べる' },
  { id: 'contact', label: '連絡' },
  { id: 'place', label: '行きたい場所' },
  { id: 'health', label: '健康' },
  { id: 'money', label: 'お金' },
  { id: 'other', label: 'その他' },
];

const categoryRules = [
  ['shopping', ['買う', '購入', '注文', '欲しい', 'ストック', 'スーパー', 'Amazon', '楽天']],
  ['housework', ['掃除', '洗濯', '片付け', 'ゴミ', 'ベランダ', 'キッチン', '風呂', 'トイレ']],
  ['research', ['調べ', '確認', '比較', '読む', '勉強', 'リサーチ', '調査']],
  ['contact', ['連絡', '電話', 'メール', '返信', '相談', '送る', 'LINE']],
  ['place', ['行きたい', '旅行', '店', 'カフェ', 'ホテル', '場所', '予約']],
  ['health', ['病院', '運動', '睡眠', '体調', '薬', '歯医者', '健康']],
  ['money', ['株', '投資', '支払い', '請求', '税金', '予算', '家計', '売上']],
  ['idea', ['作りたい', 'アプリ', '機能', 'アイデア', '企画', 'サービス', '実装']],
  ['task', ['やる', 'したい', '必要', '提出', '締切', '準備', '予約']],
];

const priorityRules = {
  high: ['今日', '明日', '至急', '急ぎ', '締切', '期限', '忘れない', '必ず'],
  medium: ['週末', '今週', '近いうち', 'あとで', '準備', '確認'],
};

const actionRules = [
  ['作る', ['作る', '実装', '開発', '追加', 'デザイン']],
  ['買う', ['買う', '購入', '注文']],
  ['調べる', ['調べ', '比較', '確認', '読む']],
  ['連絡する', ['連絡', '電話', 'メール', '返信', '相談']],
  ['行く', ['行く', '行きたい', '訪問', '予約']],
  ['片付ける', ['掃除', '片付け', '洗濯', '整理']],
];

let state = {
  memos: loadMemos(),
  category: 'all',
  query: '',
  status: 'active',
  sort: 'newest',
};

const els = {
  form: document.querySelector('#memoForm'),
  input: document.querySelector('#memoInput'),
  source: document.querySelector('#sourceInput'),
  preview: document.querySelector('#aiPreview'),
  categoryNav: document.querySelector('#categoryNav'),
  memoList: document.querySelector('#memoList'),
  countLabel: document.querySelector('#countLabel'),
  search: document.querySelector('#searchInput'),
  status: document.querySelector('#statusFilter'),
  sort: document.querySelector('#sortInput'),
  stats: document.querySelector('#stats'),
  todayLabel: document.querySelector('#todayLabel'),
  exportBtn: document.querySelector('#exportBtn'),
  clearDoneBtn: document.querySelector('#clearDoneBtn'),
  template: document.querySelector('#memoTemplate'),
};

function loadMemos() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveMemos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.memos));
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word.toLowerCase()));
}

function classify(text) {
  const normalized = text.toLowerCase();
  const categoryHit = categoryRules.find(([, words]) => includesAny(normalized, words.map((word) => word.toLowerCase())));
  const actionHit = actionRules.find(([, words]) => includesAny(normalized, words.map((word) => word.toLowerCase())));
  const priority = includesAny(normalized, priorityRules.high.map((word) => word.toLowerCase()))
    ? 'high'
    : includesAny(normalized, priorityRules.medium.map((word) => word.toLowerCase()))
      ? 'medium'
      : 'low';
  const dueHint = extractDueHint(text);
  const title = makeTitle(text);
  const tags = [actionHit?.[0], dueHint].filter(Boolean);

  return {
    title,
    category: categoryHit?.[0] || 'other',
    action: actionHit?.[0] || 'メモ',
    priority,
    dueHint,
    tags,
  };
}

function extractDueHint(text) {
  const hints = ['今日', '明日', '今週', '週末', '来週', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜', '日曜'];
  return hints.find((hint) => text.includes(hint)) || null;
}

function makeTitle(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 28) return cleaned;
  return `${cleaned.slice(0, 28)}...`;
}

async function classifyWithAi(text, source) {
  try {
    const response = await fetch('/api/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source }),
    });
    if (!response.ok) throw new Error('Remote classifier unavailable');
    const data = await response.json();
    return {
      title: data.title || makeTitle(text),
      category: categories.some((category) => category.id === data.category) ? data.category : 'other',
      action: data.action || 'メモ',
      priority: ['high', 'medium', 'low'].includes(data.priority) ? data.priority : 'low',
      dueHint: data.dueHint || null,
      tags: Array.isArray(data.tags) ? data.tags.slice(0, 4) : [],
      classifier: 'openai',
    };
  } catch {
    return {
      ...classify(text),
      classifier: 'local',
    };
  }
}

async function createMemo(text, source) {
  const ai = await classifyWithAi(text, source);
  return {
    id: crypto.randomUUID(),
    raw: text,
    source,
    done: false,
    createdAt: new Date().toISOString(),
    ...ai,
  };
}

function getCategoryLabel(id) {
  return categories.find((category) => category.id === id)?.label || 'その他';
}

function getPriorityLabel(priority) {
  return {
    high: '高',
    medium: '中',
    low: '低',
  }[priority] || '低';
}

function sourceLabel(source) {
  return {
    manual: '手入力',
    line: 'LINE',
    gmail: 'Gmail',
  }[source] || source;
}

function filteredMemos() {
  const query = state.query.trim().toLowerCase();
  const priorityRank = { high: 3, medium: 2, low: 1 };

  return state.memos
    .filter((memo) => state.category === 'all' || memo.category === state.category)
    .filter((memo) => state.status === 'all' || (state.status === 'done' ? memo.done : !memo.done))
    .filter((memo) => {
      if (!query) return true;
      return [memo.title, memo.raw, memo.category, memo.action, memo.source, ...(memo.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      if (state.sort === 'priority') return priorityRank[b.priority] - priorityRank[a.priority];
      if (state.sort === 'category') return getCategoryLabel(a.category).localeCompare(getCategoryLabel(b.category), 'ja');
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

function renderNav() {
  els.categoryNav.innerHTML = '';
  const counts = state.memos.reduce((acc, memo) => {
    acc[memo.category] = (acc[memo.category] || 0) + 1;
    acc.all += 1;
    return acc;
  }, { all: 0 });

  categories.forEach((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = category.id === state.category ? 'active' : '';
    button.innerHTML = `<span>${category.label}</span><small>${counts[category.id] || 0}</small>`;
    button.addEventListener('click', () => {
      state.category = category.id;
      render();
    });
    els.categoryNav.append(button);
  });
}

function renderMemos() {
  const memos = filteredMemos();
  els.memoList.innerHTML = '';
  els.countLabel.textContent = `${memos.length}件`;

  if (memos.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'まだメモがありません。思いつきを上の入力欄に投げてください。';
    els.memoList.append(empty);
    return;
  }

  memos.forEach((memo) => {
    const item = els.template.content.firstElementChild.cloneNode(true);
    item.classList.toggle('done', memo.done);
    item.querySelector('.category-pill').textContent = getCategoryLabel(memo.category);
    const priority = item.querySelector('.priority-pill');
    priority.textContent = `優先度 ${getPriorityLabel(memo.priority)}`;
    priority.classList.add(`priority-${memo.priority}`);
    item.querySelector('.source-pill').textContent = sourceLabel(memo.source);
    item.querySelector('time').textContent = formatDate(memo.createdAt);
    item.querySelector('h4').textContent = memo.title;
    item.querySelector('p').textContent = memo.raw;

    const tags = item.querySelector('.memo-tags');
    [memo.action, memo.dueHint, ...(memo.tags || [])]
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index)
      .forEach((tag) => {
        const span = document.createElement('span');
        span.textContent = tag;
        tags.append(span);
      });

    item.querySelector('.check-button').addEventListener('click', () => {
      memo.done = !memo.done;
      saveMemos();
      render();
    });
    item.querySelector('.delete-button').addEventListener('click', () => {
      state.memos = state.memos.filter((itemMemo) => itemMemo.id !== memo.id);
      saveMemos();
      render();
    });

    els.memoList.append(item);
  });
}

function renderStats() {
  const active = state.memos.filter((memo) => !memo.done).length;
  const done = state.memos.filter((memo) => memo.done).length;
  const high = state.memos.filter((memo) => !memo.done && memo.priority === 'high').length;
  const topCategory = categories
    .filter((category) => category.id !== 'all')
    .map((category) => ({
      ...category,
      count: state.memos.filter((memo) => memo.category === category.id && !memo.done).length,
    }))
    .sort((a, b) => b.count - a.count)[0];

  els.stats.innerHTML = [
    ['未完了', active],
    ['完了', done],
    ['高優先度', high],
    [topCategory?.label || '最多カテゴリ', topCategory?.count || 0],
  ].map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
}

function formatDate(value) {
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function updatePreview() {
  const text = els.input.value.trim();
  if (!text) {
    els.preview.innerHTML = '<span>AI分類プレビュー</span><strong>入力するとカテゴリ、行動タイプ、優先度を推定します</strong>';
    return;
  }

  const ai = classify(text);
  els.preview.innerHTML = `
    <span>${getCategoryLabel(ai.category)} / ${ai.action}</span>
    <strong>${ai.title}</strong>
    <small>優先度: ${getPriorityLabel(ai.priority)}${ai.dueHint ? ` / 期限ヒント: ${ai.dueHint}` : ''}</small>
  `;
}

function render() {
  renderNav();
  renderMemos();
  renderStats();
  els.todayLabel.textContent = new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric' }).format(new Date());
}

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = els.input.value.trim();
  if (!text) return;

  const submitButton = els.form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = '分類中';

  createMemo(text, els.source.value)
    .then((memo) => {
      state.memos.unshift(memo);
      els.input.value = '';
      updatePreview();
      saveMemos();
      render();
    })
    .finally(() => {
      submitButton.disabled = false;
      submitButton.textContent = 'メモ化';
    });
});

els.input.addEventListener('input', updatePreview);
els.search.addEventListener('input', () => {
  state.query = els.search.value;
  render();
});
els.status.addEventListener('change', () => {
  state.status = els.status.value;
  render();
});
els.sort.addEventListener('change', () => {
  state.sort = els.sort.value;
  render();
});
els.clearDoneBtn.addEventListener('click', () => {
  state.memos = state.memos.filter((memo) => !memo.done);
  saveMemos();
  render();
});
els.exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state.memos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `auto-memo-inbox-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

if (state.memos.length === 0) {
  state.memos = [
    {
      id: crypto.randomUUID(),
      raw: 'LINEで送ったメッセージを自動でメモ化したい',
      source: 'line',
      done: false,
      createdAt: new Date().toISOString(),
      ...classify('LINEで送ったメッセージを自動でメモ化したい'),
      classifier: 'local',
    },
    {
      id: crypto.randomUUID(),
      raw: '週末にベランダ掃除したい',
      source: 'manual',
      done: false,
      createdAt: new Date().toISOString(),
      ...classify('週末にベランダ掃除したい'),
      classifier: 'local',
    },
    {
      id: crypto.randomUUID(),
      raw: 'Gmailの特定ラベルを定期的に取り込む方法を調べる',
      source: 'gmail',
      done: false,
      createdAt: new Date().toISOString(),
      ...classify('Gmailの特定ラベルを定期的に取り込む方法を調べる'),
      classifier: 'local',
    },
  ];
  saveMemos();
}

render();
