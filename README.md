# 壁打ちエディタ — AI思考ログ永続保存チャット

思考のログが絶対に消えない、ミニマルなAIチャットUI。

## クイックスタート

```bash
# 1. 依存関係インストール
npm install

# 2. 環境変数を設定
cp .env.local.example .env.local
# .env.local を編集して APIキーを記入

# 3. 開発サーバー起動
npm run dev
# → http://localhost:3000
```

## Phase 1（現在）: モック DB

- データはサーバーメモリに保存（再起動でリセット）
- APIキーなしでもモック応答で動作確認可能

## Phase 2: Supabase 永続化

1. `supabase-schema.sql` をSupabase SQL Editorで実行
2. `.env.local` に Supabase URL と ANON_KEY を追加
3. `lib/mock-db.ts` を `lib/supabase.ts` ベースの実装に差し替え

## ディレクトリ構成

```
app/
  api/
    chat/route.ts          ← AI呼び出し + メッセージ保存
    threads/
      route.ts             ← スレッド一覧取得
      [id]/
        route.ts           ← スレッド削除
        messages/route.ts  ← メッセージ一覧取得
  page.tsx                 ← メインUI（状態管理）
  layout.tsx
  globals.css

components/
  Sidebar.tsx              ← 左カラム：スレッド一覧
  ChatPanel.tsx            ← 右カラム：チャット画面
  MessageBubble.tsx        ← メッセージ表示（Markdownレンダリング）
  ChatInput.tsx            ← 入力エリア

lib/
  mock-db.ts               ← Phase 1用インメモリDB
  supabase.ts              ← Phase 2用クライアント（stub）

types/index.ts             ← Thread / Message 型定義
```

## 対応AIプロバイダー

| 環境変数 | モデル |
|---|---|
| `ANTHROPIC_API_KEY` | claude-opus-4-5 |
| `OPENAI_API_KEY` | gpt-4o |

両方設定した場合は Anthropic が優先されます。
