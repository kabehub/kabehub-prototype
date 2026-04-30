# KabeHub プロジェクト設定

## プロダクト概要

「思考のGitHub」を目指すAIチャット永続保存ツール。個人の壁打ちログを公開・フォーク・評価できるオープンプラットフォーム。

* 本番URL: https://kabehub.com
* GitHub: https://github.com/kabehub/kabehub-prototype
* 現フェーズ: Phase 3 完了 / Phase 4（マネタイズ）着手前

\---

## 起動コマンド

```bash
# ノートPC
cd C:\\Users\\ruima\\kabehub-prototype
npm run dev

# デスクトップPC
cd C:\\Users\\Admin\\Desktop\\20260328
npm run dev
```

キャッシュ問題が起きたら:

```bash
rmdir /s /q .next \&\& npm run dev
# それでも解決しない場合:
rmdir /s /q node\_modules \&\& npm install \&\& npm run dev
```

**⚠️ ローカルでGoogleログインすると kabehub.com に飛ぶ（OAuthリダイレクトが本番URLのため）。ローカル動作確認は本番Supabaseに繋いだ状態で行う。**

\---

## 技術スタック

|レイヤー|技術|
|-|-|
|フロントエンド|Next.js 14 (App Router) + React + Tailwind CSS|
|DB|Supabase (PostgreSQL) — 法人アカウント admin@kabehub.com|
|認証|Supabase Auth（Google OAuth）+ @supabase/ssr|
|AI メイン|Anthropic Claude API（claude-sonnet-4-5 / claude-sonnet-4-6）|
|AI サブ1|Google Gemini API（gemini-2.5-flash / gemini-2.5-pro）|
|AI サブ2|OpenAI API（gpt-4o）|
|デプロイ|Vercel（kabehub.com）|
|Markdown|react-markdown + remark-gfm + @tailwindcss/typography|

\---

## 主要ファイルの役割

### API Routes

|ファイル|役割|
|-|-|
|`app/api/chat/route.ts`|チャット送受信の中枢。ストリーミング・DB保存・waitUntilフォールバックをすべて担う。**最も複雑なファイル。後述の地雷を必ず読むこと**|
|`app/api/arena/route.ts`|AI闘技場（複数AI同士の議論）のターン管理|
|`app/api/explore/route.ts`|公開スレッド一覧。sort パラメータ（newest/popular/trending）対応|
|`app/api/share/\[token]/route.ts`|共有ページ用データ取得。shared\_atフィルター（スナップショット型共有）あり。**後方互換に注意**|
|`app/api/threads/\[id]/route.ts`|スレッドのCRUD。PATCHはupsert方式|
|`app/api/folder-settings/route.ts`|フォルダ単位のシステムプロンプト設定（プロジェクト機能）|

### Components

|ファイル|役割|
|-|-|
|`components/ChatPanel.tsx`|チャット画面のメインコンポーネント。状態管理の大半がここにある|
|`components/ChatInput.tsx`|入力欄。ファイル添付・画像添付・Ctrl+Vスクショ貼り付け対応|
|`components/Sidebar.tsx`|スレッド一覧・フォルダ管理・フォルダ設定モーダル|
|`components/MessageBubble.tsx`|通常モードのメッセージ表示|
|`components/RoleplayBubble.tsx`|なりきりモード用メッセージ表示（LINEライクUI）|
|`components/MarkdownRenderer.tsx`|Markdownレンダリング + `\[\[text]]→████` マスク変換|

### Lib

|ファイル|役割|
|-|-|
|`lib/supabase/client.ts`|ブラウザ用Supabaseクライアント|
|`lib/supabase/server.ts`|Server Components用|
|`lib/supabase/route-handler.ts`|Route Handler用|
|`lib/supabase-db.ts`|DB操作ヘルパー関数群。第一引数は必ずSupabaseClient|
|`lib/genres.ts`|ジャンルマスタ定数（10大分類・44中分類）|
|`lib/exportUtils.ts`|TXT/MD/CSVエクスポートのロジック|

\---

## 開発ルール（必読）

### DB操作

* **INSERT は使わず upsert を使う**。スレッド・メッセージともに競合リスクがある
* `app/api/threads/\[id]/route.ts` の PATCH は `.upsert()` 方式（新規スレッドはDB行がない状態でPATCHが来ることがある）
* `saveAssistantMessage` も upsert（`onConflict: "id"`）。再生成やタイミング競合で同じIDのINSERTが2回走る

### ストリーミング（chat/route.ts）

`app/api/chat/route.ts` は **Promise Bridge パターン** を採用している。絶対に構造を崩さないこと。

```
【正しい実行順序】
wrappedStream.start() → テキストを accumulatedText に蓄積
  → saveToDb(false) 呼び出し → dbSaved = true
  → finally で resolveDbSave(dbSaved) を呼ぶ ← ★これが肝
  → waitUntil が await dbSavePromise で完了を待つ
  → dbSaved=true なのでフォールバックはスキップ
```

* `resolveDbSave` / `dbSavePromise` は **POST関数スコープ内** に定義（モジュールスコープに書くとリクエスト間で競合する）
* `wrappedStream` の `finally` ブロックで **必ず** `resolveDbSave(dbSaved)` を呼ぶ
* `waitUntil` 内で `await dbSavePromise` を使う（500ms固定タイマーは廃止済み。復活させない）
* `cancel()` は `if (!dbSaved)` チェックを入れる（DB保存完了後のcancel競合防止）

### スナップショット型共有（share/\[token]/route.ts）

* `shared\_at` が存在する場合のみ `.lte("created\_at", thread.shared\_at)` フィルターを追加
* `shared\_at = null`（既存スレッド）は全件返す → **後方互換のため削除しない**
* `is\_hidden` フラグと `\[\[text]]` マスクは `shared\_at` に関係なく即時反映される

### Supabase クライアントの使い分け

* Route Handler 内では必ず `createRouteHandlerSupabaseClient` を使う（RLSが効く）
* `waitUntil` フォールバック内では `SUPABASE\_SERVICE\_ROLE\_KEY` で直接 REST API を叩く（レスポンス後にクライアントが失効するため）

### なりきりモード

* `roleplay\_mode = true` のスレッドは公開不可（`handleSaveShare` と `PublishConfirmModal` 両方にガードあり）
* フォーク・セルフコピペ時は `roleplay\_mode: false / rp\_char\_name: null / rp\_char\_icon\_url: null` にリセット（`app/api/threads/\[id]/copy/route.ts`）

\---

## 既知の地雷

|地雷|説明|
|-|-|
|ローカルGoogleログイン|OAuthリダイレクト先が本番URLなのでlocalhost認証は不可。本番で確認する|
|shared\_at 後方互換|既存の公開スレッドは shared\_at = null。フィルターを無条件に適用すると既存スレッドが全件消える|
|upsertの title 必須|`threads/\[id]/route.ts` のupsertがINSERTに回った場合、titleが必要。`title: thread.title \|\| "無題"` を必ず含める|
|remark-gfm の \[\[text]] 誤認識|`\[\[text]]` をWikiリンクとして解釈するため、shareページのYOUメッセージはMarkdownRendererを経由せずプレーンテキストで `.replace(/\\\[\\\[(.+?)\\]\\]/g, "████")` する|
|フォルダ名変更の整合性|`threads` と `folder\_settings` 両テーブルを同時に UPDATE する必要あり。片方だけ変えると孤立する|
|Prompt Caching ヘッダー|`anthropic-beta: "prompt-caching-2024-07-31"` が必須。外すとcache\_controlが無視される|
|`\[\[text]]` マスク記法|`MarkdownRenderer` は `variant="share"` のときのみマスクが動く。variant指定を忘れると素通りする|

\---

## git 運用ルール

デバイスが2台（ノートPC / デスクトップPC）あるため、必ずこの手順を守る:

```bash
# 作業終了時（必ず実行）
git add .
git commit -m "作業内容のメモ"
git push origin main

# 作業開始時（必ず実行）
git pull origin main
```

\---

## 次に実装予定

1. **Phase 4 マネタイズ**（最優先）

   * おまかせプラン（クレジット制・月額500〜1,000円）
   * Stripe連携
   * クレジット残量チェック・上限到達時のセルフプラン誘導UI
2. **KabeHub MCPサーバー**（Phase 4完了後）

   * `mcp\_tokens` テーブル追加
   * `/settings` にトークン発行UI
   * `kabehub-mcp` npm公開
   * ClaudeCodeユーザーが壁打ちをKabeHubに保存・公開できる仕組み
3. **Branching Mode**（Phase 4以降）

   * `parent\_id` カラムはDB準備済み。UI未実装



\## ⚠️ 既知の地雷



\### MCP関連

\- `/api/mcp/\*` はBearer認証のため、middlewareのmatcherに `/api/((?!mcp).\*)` が必要

&#x20; （Next.jsはmatcherに書かなくてもAPIルートにmiddlewareを適用する）

\- APIクライアントからは必ず `https://www.kabehub.com` を使う

&#x20; （`kabehub.com` へのリクエストは www. へ307リダイレクトされ、Authorizationヘッダーが消える）

