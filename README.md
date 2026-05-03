# Auto Memo Inbox

LINEやGmailに投げた「ふと思いついたこと」を、自動でメモ化して分類するためのMVPです。

現時点ではLINE/Gmail連携前のプロトタイプとして、ブラウザ上で以下が動きます。

- メモ投入
- OpenAI APIによるカテゴリ分類
- `OPENAI_API_KEY` 未設定時のルールベース分類フォールバック
- 行動タイプ、優先度、期限ヒントの推定
- カテゴリ別表示
- 検索、状態フィルタ、並び替え
- 完了管理
- JSONエクスポート
- localStorage保存

## 起動

`index.html` をブラウザで開くだけで動きます。

OpenAI分類も試す場合は、VercelなどのServerless環境で `/api/classify` を動かし、環境変数を設定してください。

```text
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
INBOUND_SECRET=your-long-random-secret
```

`OPENAI_MODEL` は省略できます。デフォルトは `gpt-4o-mini` です。

Supabase保存を使う場合は、`supabase/schema.sql` をSupabase SQL Editorで実行して `memos` テーブルを作成してください。`SUPABASE_SERVICE_ROLE_KEY` はVercelのServerless APIだけで使い、ブラウザには出しません。

## Vercel公開

1. GitHubの `auto-memo-inbox` をVercelにImport
2. Framework Presetは `Other`
3. 環境変数 `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` を追加
4. Deploy

静的画面だけなら環境変数なしでも動きます。その場合、分類と保存はブラウザ内のローカル処理に自動で切り替わります。

## Gmail連携

Gmailは、専用メールアドレスとして `+memo` エイリアスを使う想定です。

たとえば普段のメールが以下なら:

```text
yourname@gmail.com
```

メモ専用アドレスは以下にします。

```text
yourname+memo@gmail.com
```

Gmail側ではこのアドレスに届いたメールへ `AutoMemo` ラベルを付けます。

### Gmailフィルタ

1. Gmailの検索欄で `to:yourname+memo@gmail.com` を検索
2. 検索オプションから「フィルタを作成」
3. 「ラベルを付ける」で `AutoMemo` を選択
4. 必要なら「受信トレイをスキップ」はオフのまま

### Apps Script

1. Google Apps Scriptを開く
2. `scripts/gmail-apps-script.js` の内容を貼り付ける
3. `CONFIG.VERCEL_INBOUND_URL` を以下の形に変更

```text
https://YOUR-VERCEL-DOMAIN.vercel.app/api/inbound/gmail
```

4. `CONFIG.INBOUND_SECRET` をVercel環境変数 `INBOUND_SECRET` と同じ値にする
5. `installTrigger()` を一度実行して、5分ごとの同期トリガーを作る

Apps Scriptは以下だけを処理します。

```text
label:AutoMemo -label:AutoMemoDone
```

処理が成功したメールには `AutoMemoDone` ラベルが付き、`AutoMemo` ラベルは外れます。

## 開発チェック

```bash
npm run check
```

## 次に追加するもの

1. LINE Messaging API Webhook
2. Gmail API または Apps Script 経由の取り込み
3. LINE Messaging API Webhook
4. GitHub Actions

## 想定データ

```json
{
  "id": "uuid",
  "raw": "週末にベランダ掃除したい",
  "title": "週末にベランダ掃除したい",
  "category": "housework",
  "action": "片付ける",
  "priority": "medium",
  "dueHint": "週末",
  "source": "line",
  "done": false,
  "classifier": "openai",
  "createdAt": "2026-05-03T00:00:00.000Z"
}
```
