# Auto Memo Inbox

LINEやGmailに投げた「ふと思いついたこと」を、自動でメモ化して分類するためのMVPです。

現時点では外部連携前の静的プロトタイプとして、ブラウザ上で以下が動きます。

- メモ投入
- ルールベースのAI風カテゴリ分類
- 行動タイプ、優先度、期限ヒントの推定
- カテゴリ別表示
- 検索、状態フィルタ、並び替え
- 完了管理
- JSONエクスポート
- localStorage保存

## 起動

`index.html` をブラウザで開くだけで動きます。

## 次に追加するもの

1. LINE Messaging API Webhook
2. Gmail API または Apps Script 経由の取り込み
3. OpenAI API による本物の分類
4. Supabase保存
5. GitHub Actions / Vercel デプロイ

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
  "createdAt": "2026-05-03T00:00:00.000Z"
}
```
