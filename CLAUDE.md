# KabeHub プロジェクト設定

最終更新: 2026/07/01（v174基準）
> このファイルはコード（types/index.ts・lib/pricing.ts・app/api/chat/route.ts・app/api/arena/route.ts・components/ChatInput.tsx）とファイル構成一覧との突き合わせを経て更新。ただし一部ファイルは名称からの推測のみで内容未確認（⚠️マーク箇所）。

## プロダクト概要

「思考のGitHub」を目指すAIチャット永続保存ツール。個人の壁打ちログを公開・フォーク・評価できるオープンプラットフォーム。

- 本番URL: https://kabehub.com
- GitHub: https://github.com/kabehub/kabehub-prototype
- 現フェーズ: Phase 3 完了（RAG / Memory機能一区切り） / **Phase 4（マネタイズ）未着手**

---

## 起動コマンド

```bash
# ノートPC
cd C:\Users\ruima\kabehub-prototype
npm run dev

# デスクトップPC
cd C:\Users\Admin\Desktop\20260328
npm run dev
```

キャッシュ問題が起きたら:

```bash
rmdir /s /q .next && npm run dev
# それでも解決しない場合:
rmdir /s /q node_modules && npm install && npm run dev
```

⚠️ **ローカルでGoogleログインすると kabehub.com に飛ぶ（OAuthリダイレクトが本番URLのため）。ローカル動作確認は本番Supabaseに繋いだ状態で行う。**

---

## デバイス間作業の鉄則

```bash
# 作業終了時（必ず実行）
git add .
git commit -m "作業内容のメモ"
git push origin main

# 作業開始時（必ず実行）
git pull origin main
```

⚠️ **`--force` は絶対に使わない。** v137実装時にforce pushでv133〜v136のコミットが消えた。
コンフリクト発生時: `git merge --abort` → `git fetch origin` → `git reset --hard origin/main`

---

## 技術スタック

| レイヤー | 技術 |
|-|-|
| フロントエンド | Next.js 14 (App Router) + React + Tailwind CSS |
| DB | Supabase (PostgreSQL) — 法人アカウント admin@kabehub.com |
| 認証 | Supabase Auth（Google OAuth）+ @supabase/ssr |
| AI メイン | Anthropic Claude API（claude-fable-5 / claude-opus-4-8 / claude-opus-4-7 / claude-opus-4-6 / claude-sonnet-5 / claude-sonnet-4-5 / claude-sonnet-4-6 / claude-haiku-4-5-20251001） |
| AI サブ1 | Google Gemini API（gemini-2.5-flash / gemini-2.5-pro / gemini-3.5-flash / gemini-3.1-flash-lite） |
| AI サブ2 | OpenAI API（gpt-4o / gpt-5.4-mini / gpt-5.4 / gpt-5.5 / gpt-5.5-pro）※arena/route.tsのみgpt-5.5-pro未反映（後述の地雷参照） |
| 画像生成 | Gemini（gemini-2.5-flash-image） / OpenAI（gpt-image-2） / Ideogram（ideogram-v3） / OpenRouter-Flux（black-forest-labs/flux.2-pro） |
| Embedding | OpenAI text-embedding-3-small（RAG・記憶機能で使用） |
| ファイルストレージ | Supabase Storage（generated-imagesバケット） |
| デプロイ | Vercel（kabehub.com） |
| Markdown | react-markdown + remark-gfm + @tailwindcss/typography |

**モデルID定義は `types/index.ts` が正**（`ClaudeModel` / `GeminiModel` / `OpenAIModel` / `ImageGenModel` / `Provider`型）。`app/api/chat/route.ts` と `app/api/arena/route.ts` に同じ配列が重複定義されているため、新モデル追加時は必ず両方更新すること。

---

## 主要ファイルの役割

### API Routes（チャット・スレッド）

| ファイル | 役割 |
|-|-|
| `app/api/chat/route.ts` | チャット送受信の中枢。ストリーミング・DB保存（Promise Bridge）・waitUntilフォールバック・RAG注入・GitHub Tool Loop・Extended Thinkingガードをすべて担う。**最も複雑なファイル。後述の地雷を必ず読むこと** |
| `app/api/arena/route.ts` | AI闘技場（複数AI同士の議論）のターン管理。**chat/route.tsと異なり非ストリーミング実装**（`await res.json()`で一括取得）。Promise Bridge・Extended Thinkingガード・gpt-5.5-pro分岐は未適用 |
| `app/api/explore/route.ts` | 公開スレッド一覧。sort パラメータ（newest/popular/trending）対応 |
| `app/api/share/[token]/route.ts` | 共有ページ用データ取得。shared_atフィルター（スナップショット型共有）あり。**後方互換に注意** |
| `app/api/share/[token]/fork/route.ts` | 共有スレッドのフォーク処理 ⚠️内容未確認 |
| `app/api/threads/route.ts` | スレッド一覧関連 ⚠️内容未確認 |
| `app/api/threads/[id]/route.ts` | スレッドのCRUD。PATCHはupsert方式 |
| `app/api/threads/[id]/branch-to/route.ts` | 「新しいチャットに分岐」機能（v155） |
| `app/api/threads/[id]/copy/route.ts` | スレッドコピー・フォーク。roleplay関連フィールドをリセット。v158で500エラー修正済み（`copied_from`→`forked_from_id`） |
| `app/api/threads/[id]/drafts/route.ts` | 下書き保存 |
| `app/api/threads/[id]/likes/route.ts` | いいね機能 |
| `app/api/threads/[id]/message-notes/route.ts` / `notes/route.ts` | メッセージ単位・スレッド単位のメモ |
| `app/api/threads/[id]/messages/route.ts` / `messages/[messageId]/route.ts` | メッセージ操作 ⚠️内容未確認 |
| `app/api/threads/[id]/messages/restore-branch/route.ts` | 分岐の復元 |
| `app/api/threads/[id]/tags/route.ts` | タグ管理 |
| `app/api/folder-settings/route.ts` | フォルダ単位のシステムプロンプト設定・GitHub連携設定（プロジェクト機能） |
| `app/api/messages/[id]/route.ts` | メッセージ単体操作 ⚠️内容未確認 |

### API Routes（RAG / Memory）

| ファイル | 役割 |
|-|-|
| `app/api/lore/route.ts` | GET（記憶一覧取得・sort対応）/ POST（手動追加） |
| `app/api/lore/[id]/route.ts` | PATCH（編集・固定・確認・アーカイブ） |
| `app/api/lore/bulk-archive/route.ts` | POST・複数記憶を一括アーカイブ（is_pinned保護あり） |
| `app/api/lore/like/route.ts` | POST・AI発言を「👍 記憶に追加」で liked_ai として保存 |
| `app/api/lore/batch-train/route.ts` | POST・未学習のuserメッセージをEmbedding化してlore_embeddingsに保存 |
| `app/api/lore/chunks/route.ts` / `chunks/[id]/route.ts` | Lore chunk関連 ⚠️内容未確認 |
| `app/api/lore/embed/route.ts` | Embedding生成関連 ⚠️内容未確認 |
| `app/api/lore/update-temporal-status/route.ts` | POST・temporal_status自動更新（SQLベース・LLM不要） |
| `app/api/lore/consolidate/candidates/route.ts` | GET・類似記憶統合候補一覧（dismiss済み除外） |
| `app/api/lore/consolidate/dismiss/route.ts` | POST・統合候補ペアを無視登録 |
| `app/api/lore/consolidate/preview/route.ts` | POST・gpt-4o-miniで統合案を生成（DBへの書き込みなし） |
| `app/api/lore/consolidate/merge/route.ts` | POST・統合案を確定保存・元2件をarchive/superseded |
| `app/api/lore/dreaming-batch/route.ts` | POST・自動Dreamingバッチ（greedy chain clustering・3件以上統合対応） |
| `app/api/lore/dreaming-batch/history/route.ts` | GET・Dreaming統合履歴取得 |
| `app/api/lore/dreaming-batch/rollback/route.ts` | POST・Dreaming統合のロールバック |

### API Routes（GitHub連携）

| ファイル | 役割 |
|-|-|
| `app/api/fetch-github/route.ts` | チャット添付用の一時GitHubファイル取得 |
| `app/api/auth/github/route.ts` | GitHub OAuth開始 ⚠️内容未確認 |
| `app/api/auth/github/callback/route.ts` | GitHub OAuthコールバック |
| `app/api/auth/github/status/route.ts` | GitHub連携状態確認 |

### API Routes（MCP）

⚠️ **既存資料の「次に実装予定：KabeHub MCPサーバー（Phase 4完了後）」は実態と矛盾している可能性が高い。** 以下のファイルが既に存在するため、MCPサーバーは一定程度実装済みとみられる。次回コード確認時に実装状況・完成度を要確認。

| ファイル | 役割 |
|-|-|
| `app/api/mcp-tokens/route.ts` | MCPトークン発行・管理 |
| `app/api/mcp/threads/route.ts` | MCP経由スレッド操作 |
| `app/api/mcp/threads/[id]/messages/route.ts` | MCP経由メッセージ操作 |

### API Routes（その他）

| ファイル | 役割 |
|-|-|
| `app/api/album/route.ts` | アルバム機能 ⚠️内容未確認 |
| `app/api/calendar/route.ts` | カレンダー機能 ⚠️内容未確認 |
| `app/api/extract-settings/route.ts` | 設定抽出（おそらくLore Book関連） ⚠️内容未確認 |
| `app/api/image-gen/route.ts` | 画像生成（Gemini / OpenAI / Ideogram / Flux） |
| `app/api/novel-check/route.ts` | 小説整合性チェック機能 ⚠️内容未確認 |
| `app/api/profile/route.ts` | ユーザープロフィール |
| `app/api/reports/route.ts` | 通報機能 ⚠️内容未確認 |
| `app/api/search/route.ts` | 検索機能 ⚠️内容未確認 |
| `app/api/stats/route.ts` | 利用統計・料金集計（lib/pricing.ts利用） |

### Pages

| ファイル | 役割 |
|-|-|
| `app/page.tsx` | メインチャット画面。サイドバー折り畳み・スマホ判定などの中枢state |
| `app/[handle]/` (`page.tsx` / `default.tsx` / `ProfilePage.tsx`) | 公開プロフィールページ |
| `app/album/page.tsx` | アルバム機能 ⚠️内容未確認 |
| `app/arena/page.tsx` | AI闘技場 |
| `app/arena/[token]/`（`ArenaViewPage.tsx` / `default.tsx` / `page.tsx`） | 闘技場の共有ビュー |
| `app/calendar/page.tsx` | カレンダー機能 ⚠️内容未確認 |
| `app/explore/page.tsx` | 公開スレッド一覧 |
| `app/image/page.tsx` | 画像生成ページ |
| `app/memory/page.tsx` | Memory Summary UI。記憶一覧・フィルタ・検索・ソート・グループ表示・一括アーカイブ・統合候補・Dreaming履歴 |
| `app/novel-check/page.tsx` | 小説整合性チェックUI |
| `app/settings/page.tsx` | 設定ページ。フォントサイズ・送信キー設定・「AI記憶を管理する →」リンク |
| `app/share/[token]/page.tsx` | 共有スレッド閲覧ページ |
| `app/stats/page.tsx` | 利用統計ページ |
| `app/threads/[id]/tree/page.tsx` | 分岐ツリー可視化（「マングローブ林」・Phase B） |
| `app/legal/` `app/privacy/` `app/terms/` `app/login/` | 静的・認証系ページ |

### Components

| ファイル | 役割 |
|-|-|
| `components/ChatPanel.tsx` | チャット画面のメインコンポーネント。状態管理の大半がここにある |
| `components/ChatInput.tsx` | 下部固定入力欄。ファイル添付・画像添付・Ctrl+Vスクショ貼り付け・モデルドロップダウン・送信キー設定対応 |
| `components/ChatInputCentered.tsx` | 新規会話スタート時の中央配置入力欄（v144〜）。`ChatInput.tsx`から型・ヘルパーをimportして共通利用 |
| `components/Sidebar.tsx` | スレッド一覧・フォルダ管理・フォルダ設定モーダル・PC専用折り畳み機能（v168） |
| `components/MessageBubble.tsx` | 通常モードのメッセージ表示。「👍 記憶に追加」ボタン・編集/上書き再生成モーダル（ドロップダウン方式・v173） |
| `components/RoleplayBubble.tsx` | なりきりモード用メッセージ表示（LINEライクUI） |
| `components/MarkdownRenderer.tsx` | Markdownレンダリング + `[[text]]→████` マスク変換（variant="share"時のみ） |
| `components/ArenaTimeline.tsx` | AI闘技場のタイムライン表示 ⚠️内容未確認 |
| `components/BranchTree.tsx` | 分岐ツリー可視化コンポーネント（Phase B） |
| `components/ExportModal.tsx` | TXT/MD/CSVエクスポートUI（旧`lib/exportUtils.ts`の後継の可能性・要確認） |
| `components/LegalLayout.tsx` | 利用規約・プライバシーポリシー等の共通レイアウト |
| `components/NovelSettingsPane.tsx` | 小説プロジェクト設定ペイン |
| `components/OutlinePane.tsx` | あらすじ・アウトラインペイン ⚠️内容未確認 |
| `components/PublishConfirmModal.tsx` | 公開確認モーダル。なりきりモードのスレッドは公開不可のガードあり |

### Lib

| ファイル | 役割 |
|-|-|
| `lib/supabase/client.ts` | ブラウザ用Supabaseクライアント |
| `lib/supabase/server.ts` | Server Components用 |
| `lib/supabase/route-handler.ts` | Route Handler用 |
| `lib/supabase/download-image.ts` | 画像ダウンロードヘルパー ⚠️内容未確認 |
| `lib/supabase-db.ts` | DB操作ヘルパー関数群。第一引数は必ずSupabaseClient |
| `lib/supabase.ts` | Supabase関連の共通処理 ⚠️内容未確認 |
| `lib/pricing.ts` | モデル別料金定義（`MODEL_PRICING`）。`getPricing()`でSonnet 5の導入価格→通常価格自動切替ロジック実装済み（2026/9/1境界） |
| `lib/lore.ts` | MemoryKind拡張・LoreSearchResult拡張・`searchLore` / `searchLoreV2` |
| `lib/loreMemorySelect.ts` | `LORE_MEMORY_SELECT` 定数を共通化 |
| `lib/branching.ts` | 分岐関連ロジック ⚠️内容未確認 |
| `lib/branchTree.ts` | 分岐ツリー構築ロジック（`scripts/branchTree.test.cjs`でテストあり） |
| `lib/context-window.ts` | `trimContextToWindow`。コンテキストウィンドウのトリミング・キャッシュアンカー算出 |
| `lib/github.ts` | GitHub連携共通処理・`buildPinnedGithubContext` |
| `lib/github-token-crypto.ts` | GitHubトークンの暗号化 ⚠️内容未確認 |
| `lib/github-token-store.ts` | `getGithubToken`。GitHubトークンの保存・取得 |
| `lib/github-tool-loop.ts` | `runGithubToolLoop`。AI動的GitHub探索（Phase 4 AI Tool Loop） |
| `lib/mcp-auth.ts` | MCP用Bearer認証処理 ⚠️内容未確認 |
| `lib/mock-db.ts` | 開発用モックDB ⚠️内容未確認 |
| `lib/rate-limit.ts` | `checkChatRateLimit`。チャットのレート制限 |
| `lib/stringUtils.ts` | 文字列処理ユーティリティ ⚠️内容未確認 |

⚠️ 旧CLAUDE.mdに記載のあった `lib/genres.ts`（ジャンルマスタ）・`lib/exportUtils.ts`（エクスポートロジック）は最新のファイル構成一覧に見当たらない。リネーム・統合（`components/ExportModal.tsx`等）・削除のいずれかと思われるが未確認。次回コード確認時に要確認。

### Docs

| ファイル・フォルダ | 役割 |
|-|-|
| `docs/schema.sql` | 本番Supabaseと突き合わせたcanonicalスキーマ |
| `docs/applied/` | 本番適用済み・schema.sqlへ反映済みのマイグレーション履歴。再実行しない（内容は`docs/applied/README.md`参照） |

新しいマイグレーションは `docs/migration_v{n}_{内容}.sql` として追加し、Supabase Dashboard > SQL Editor で手動実行する。適用・schema.sql反映後は `docs/applied/` へ移動する。

---

## 指示フォーマット

タスクを依頼するときは以下の3点セットで書く。

```
Goal:                # 何を達成したいか（1文）
Constraints:         # やってはいけないこと・前提条件
Acceptance criteria: # 完了と判断する条件（箇条書き）
```

---

## 開発ルール（必読）

### DB操作

- **INSERT は使わず upsert を使う**。スレッド・メッセージともに競合リスクがある
- `app/api/threads/[id]/route.ts` の PATCH は `.upsert()` 方式（新規スレッドはDB行がない状態でPATCHが来ることがある）
- `saveAssistantMessage` も upsert（`onConflict: "id"`）。再生成やタイミング競合で同じIDのINSERTが2回走る
- `messages` テーブルのカラム: `id / thread_id / role / content / provider / user_id / created_at / parent_id / is_hidden / model_id / is_active / branch_id / branch_root_id / branch_index / is_learned / skip_learning / message_number / input_tokens / output_tokens / metadata`

### マイグレーションの再実行安全性

- 新規マイグレーションは、可能な限り再実行しても同じ最終状態になる形で書く
- `CREATE TABLE` / `ADD COLUMN` / `CREATE INDEX` では `IF NOT EXISTS` を使う。
  ただし存在するだけで定義が正しいとは限らないため、重要な型・制約・権限は
  適用後に目視確認する
- 関数本体だけを変更する場合は `CREATE OR REPLACE FUNCTION` を使う
  - 引数型や戻り値を変更する場合は、旧シグネチャを `DROP FUNCTION IF EXISTS`
    してから再作成する（別オーバーロードとして残ってしまうため）
- トリガーは `DROP TRIGGER IF EXISTS` → `CREATE TRIGGER`
- RLSポリシーは `DROP POLICY IF EXISTS` → `CREATE POLICY`（`CREATE POLICY`自体は
  IF NOT EXISTSに対応していないため）
- 制約変更は `DROP CONSTRAINT IF EXISTS` → `ADD CONSTRAINT`
- データ移行など完全な冪等化が難しい場合は、事前確認・適用済み判定・
  適用後確認・ロールバック方針をファイル内コメントに明記する
- 本番適用済みかつ `docs/schema.sql` に反映済みのファイルは `docs/applied/` へ
  移動し、再実行しない

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

- `resolveDbSave` / `dbSavePromise` は **POST関数スコープ内** に定義（モジュールスコープに書くとリクエスト間で競合する）
- `wrappedStream` の `finally` ブロックで **必ず** `resolveDbSave(dbSaved)` を呼ぶ
- `waitUntil` 内で `await dbSavePromise` を使う（500ms固定タイマーは廃止済み。復活させない）
- `cancel()` は `if (!dbSaved)` チェックを入れる（DB保存完了後のcancel競合防止）
- **`app/api/arena/route.ts` はこのパターンを採用していない**（非ストリーミング・単純JSON取得）。今後arenaもストリーミング化する場合は要新規設計

### スナップショット型共有（share/[token]/route.ts）

- `shared_at` が存在する場合のみ `.lte("created_at", thread.shared_at)` フィルターを追加
- `shared_at = null`（既存スレッド）は全件返す → **後方互換のため削除しない**
- `is_hidden` フラグと `[[text]]` マスクは `shared_at` に関係なく即時反映される

### Supabase クライアントの使い分け

- Route Handler 内では必ず `createRouteHandlerSupabaseClient` を使う（RLSが効く）
- `waitUntil` フォールバック内では `SUPABASE_SERVICE_ROLE_KEY` で直接 REST API を叩く（レスポンス後にクライアントが失効するため）

### なりきりモード

- `roleplay_mode = true` のスレッドは公開不可（`handleSaveShare` と `PublishConfirmModal` 両方にガードあり）
- フォーク・セルフコピペ時は `roleplay_mode: false / rp_char_name: null / rp_char_icon_url: null` にリセット（`app/api/threads/[id]/copy/route.ts`）

### モデルID・料金の追加手順（v174で確立）

新しいAIモデルを追加する際は以下を**同時に**更新すること（v174 Sonnet 5対応時の実例）：

1. `types/index.ts`: 該当する `ClaudeModel` / `GeminiModel` / `OpenAIModel` / `ImageGenModel` 型に追加
2. `lib/pricing.ts`: `MODEL_PRICING` にエントリ追加。導入価格→通常価格の自動切替が必要な場合は `getPricing()` に日付分岐を追加
3. `components/ChatInput.tsx`: `MODEL_CONFIG` に選択肢追加。Extended Thinking非対応モデルなら `THINKING_UNSUPPORTED_MODELS`相当の除外条件（ボタンのdisabled/title/color/cursor）に追加
4. `app/api/chat/route.ts`: `CLAUDE_MODEL_IDS`等に追加。Extended Thinking非対応なら `THINKING_UNSUPPORTED_MODELS` にも追加（サーバー側二重防御）
5. **`app/api/arena/route.ts`: 同様のモデルID配列に追加（v174でgpt-5.5-pro漏れが発覚。同期漏れが起きやすい箇所）**

---

## 既知の地雷

### Git関連

| 地雷 | 説明 |
|-|-|
| force push 禁止 | `--force` でv133〜v136のコミットが消えた前例あり。絶対に使わない |
| コンフリクト復元手順 | `git merge --abort` → `git fetch origin` → `git reset --hard origin/main` |

### モデルID同期関連（v174で発覚）

| 地雷 | 説明 |
|-|-|
| chat/arena間の同期漏れ | モデルID配列（`CLAUDE_MODEL_IDS`/`GEMINI_MODEL_IDS`/`OPENAI_MODEL_IDS`）が`app/api/chat/route.ts`と`app/api/arena/route.ts`に重複定義されている。**v174時点で`app/api/arena/route.ts`の`OPENAI_MODEL_IDS`に`gpt-5.5-pro`が未反映**（要修正・単純な同期漏れと判明）。新モデル追加時は両ファイル同時更新必須 |
| arena/route.tsはgpt-5.5-pro専用分岐なし | chat/route.tsは`gpt-5.5-pro`利用時に`/v1/responses`エンドポイントへ分岐するが、arena/route.tsの`callOpenAI`は`/v1/chat/completions`のみの単純実装。上記のモデルID追加と合わせて対応が必要な可能性が高い |

### スマホ対応関連

- スマホ判定ブレークポイントは **768px** で統一。`app/page.tsx` の `matchMedia("(max-width: 767px)")` と `ChatInput.tsx` / `ChatInputCentered.tsx` の `isMobileViewport()` が同じ値を使う。どちらか変更するときは両方変える
- iOS Safari の `matchMedia.addListener` フォールバック（`app/page.tsx`）は削除しないこと（古いiOSで動かなくなる）
- **iPhone実機での動作は未確認**。サイドバードロワー・ヘッダー・＋ドロップアップ・モデルドロップダウン・会話履歴ドロワー・ソフトキーボード表示時の位置を要確認
- `isToolMenuOpen`（＋ドロップアップ）と `openModelProvider`（モデルドロップダウン）は排他制御
- スマホ対応の詳細な変更履歴・地雷は `KabeHub_スマホレスポンシブ対応_引き継ぎ_20260624_v166.md` を参照

### 送信キー設定関連（v163）

- `loadEnterMode()` / `isMobileViewport()` は `ChatInput.tsx` と `ChatInputCentered.tsx` に**同一定義が重複**している。片方だけ変更すると挙動がズレる。将来的には `lib/inputUtils.ts` へ共通化推奨
- LocalStorageキー: `kabehub_enter_mode`（`"send"` または `"newline"`）
- `MessageBubble.tsx` の editRegen textarea は `enterMode` 設定と独立して Ctrl/Cmd+Enter 固定（意図的な仕様）
- `app/arena/page.tsx` の人間ターン入力は変更対象外（Enter送信のまま）

### MCP関連

- `/api/mcp/*` はBearer認証のため、middlewareのmatcherに `/api/((?!mcp).*)` が必要
- APIクライアントからは必ず `https://www.kabehub.com` を使う（`kabehub.com` へのリクエストは www. へ307リダイレクトされ、Authorizationヘッダーが消える）
- ⚠️ 「次に実装予定」に記載のあるMCPサーバーは、`app/api/mcp-tokens/route.ts` `app/api/mcp/threads/route.ts` 等が既に存在するため実装状況の再確認が必要（詳細は主要ファイル表のMCPセクション参照）

### RAG関連

| 地雷 | 説明 |
|-|-|
| OpenAI APIキー必須 | batch-train・Embedding生成・記憶統合はすべて `text-embedding-3-small` を使用。モデル変更は全レコード再生成が必要なため事実上不可 |
| extraction_version 保護 | `user_edited` / `user_created` / `liked_ai` のレコードはDreamingバッチで自動変更しない |
| is_pinned 保護 | `is_pinned = true` のレコードは時間更新バッチの自動expired化から保護する |
| embedding カラム非公開 | `lore_embeddings.embedding` は絶対にGETレスポンスに含めない |
| ペア正規化 | `lore_consolidation_dismissals` のペアは必ず `lore_id_a < lore_id_b` に正規化する |
| dreaming threshold | **本番では 0.92 を使う**（v139で復旧済み） |
| RPC自己結合性能 | `find_similar_lore_pairs` はO(n²)。大量記憶時は `find_similar_lore_pairs_v2`（LATERAL KNN方式）を使う |
| batch-train対象 | **userメッセージのみ**。`role = 'user'` / `provider != 'memo'` / `provider != 'image_gen'` で絞り込み。AI発言の記憶化は「👍 記憶に追加」ボタンで対応 |
| liked_ai保護 | Dreaming保護条件は `extraction_version NOT IN ('user_edited', 'user_created', 'liked_ai')`。全RPCに適用済み |
| v_found_count カウンター | `consolidate_dreaming_batch_multi` の件数検証はFORループ内のカウンター方式。FORループ後の `GET DIAGNOSTICS` はPostgreSQLの仕様で件数が取れない |
| RAG発火条件の二重管理 | `app/api/chat/route.ts` 内に `shouldSearchRagMemory`（キーワードベース・`RAG_TRIGGER_KEYWORDS`）と `MEMORY_TRIGGER_PATTERN`（正規表現）の2種類の発火判定ロジックが存在。片方だけ変更すると挙動が乖離するおそれあり |
| Supabase スキーマキャッシュ | RPC追加・変更後にAPIから `schema cache` エラーが出たら `NOTIFY pgrst, 'reload schema';` を実行 |

### チャット・UI関連

| 地雷 | 説明 |
|-|-|
| ローカルGoogleログイン | OAuthリダイレクト先が本番URLなのでlocalhost認証は不可。本番で確認する |
| shared_at 後方互換 | 既存の公開スレッドは `shared_at = null`。フィルターを無条件に適用すると既存スレッドが全件消える |
| upsertのtitle必須 | `threads/[id]/route.ts` のupsertがINSERTに回った場合、titleが必要。`title: thread.title \|\| "無題"` を必ず含める |
| remark-gfm の [[text]] 誤認識 | shareページのYOUメッセージはMarkdownRendererを経由せずプレーンテキストで `.replace(/\[\[(.+?)\]\]/g, "████")` する |
| フォルダ名変更の整合性 | `threads` と `folder_settings` 両テーブルを同時にUPDATEする。片方だけ変えると孤立する |
| Prompt Caching ヘッダー | `anthropic-beta: "prompt-caching-2024-07-31"` が必須。外すとcache_controlが無視される |
| [[text]] マスク記法 | `MarkdownRenderer` は `variant="share"` のときのみマスクが動く。variant指定を忘れると素通りする |
| MessageBubble の pre-wrap | `isMemo` のみ `whiteSpace: "pre-wrap"`。user・assistantは `MarkdownRenderer` 経由でproseレンダリング |
| OpenAI の max_tokens | `gpt-4o` は `max_tokens`、`gpt-5.4-mini` 以降は `max_completion_tokens`。`streamOpenAI` 内で分岐済み |
| OpenAI の stream_options | `stream_options: { include_usage: true }` が必須。外すと `[OpenAI Cache]` ログが出ない |
| gpt-5.5-pro専用分岐 | `streamOpenAI` 内で `modelId === "gpt-5.5-pro"` の場合のみ `/v1/responses` エンドポイントに分岐（Chat Completions API非対応のため）。ストリーミングではなく一括取得してenqueueする擬似ストリーム |

### Branching関連

| 地雷 | 説明 |
|-|-|
| カラム追加時期 | `is_active` / `branch_id` / `parent_id` / `branch_root_id` / `branch_index` はv99〜v131で段階的に追加済み。マイグレーション前に `\d messages` でカラム確認を必ず行う |
| 表示順 | `messages` の表示順は `message_number` 優先（null時は `created_at` fallback）。`created_at` 単独ソートに戻すとBranchBubbleの位置がズレる |
| 入れ子分岐 | `branch_root_id` バグは修正済み（v148） |
| branchBlocksByAnchor | 統一ロジック化完了・パターン①②③実機確認済み（v150） |
| 残課題（軽微・表示のみ） | `branch_index` が `branch_root_id` ごとのローカル番号のため「世界線0」が複数表示されることがある |
| Phase Bその3（未着手・優先度低） | ③''の④''をさらに編集した④'''がツリーに表示されない問題。原因未調査 |

### 再生成関連（v153・v173）

- 「分岐として再生成」(`mode: "branch"` / デフォルト)と「上書き再生成」(`mode: "light"`)の2種類
- 「🪄 上書き再生成」ボタンは**最後のassistant応答(isLast)にのみ**表示
- v173で編集・上書き再生成モーダルの送信先がプロバイダー3ボタン＋モデルドロップダウン方式に変更。`image_gen` は送信先に含まない

### 新規会話UI関連（v144・v156）

- `ChatInputCentered.tsx` は `ChatInput.tsx` から各種型・ヘルパーをimportして共通利用している。`ChatInput.tsx` 側でのexport削除・リネームは `ChatInputCentered.tsx` を壊す
- `isInitialInputMode` は `(!thread || orderedMessages.length === 0) && !isLoading` で判定。`!isLoading` を外すと初回送信中に中央入力が再表示される
- `handleSubmit` 系は `resolvedThreadId` 方式。`setActiveThreadId()` 直後に同一関数内で `activeThreadId` を参照する実装に戻すと失敗する（React stateの非同期更新のため）
- `ChatInputCentered` は `image_gen` プロバイダーを扱わない方針を維持
- v171で `position: absolute`（`fixed`ではない）による縦中央オーバーレイ配置に変更。親要素に `position: relative` が必要

### 下部固定入力欄(ChatInput)関連（v154・v168・v170）

- 表示条件は `!isInitialInputMode && orderedMessages.length > 0 && !isLoading`。`!isLoading` を外すと生成中も入力欄が表示されたままになる
- v168で自動伸縮対応（`rows={1}`・`minHeight: calc(1rem * var(--font-scale, 1) * 1.6 + 28px)`・最大240px）
- v170でフッターの`borderTop`/`background`/左右paddingを`ChatPanel.tsx`側に移譲。フッター外層・内層・columnコンテナに`overflow: hidden`を付けないこと（モデルドロップダウン・＋メニューが上方向展開するため）

### サイドバー折り畳み関連（v168）

- LocalStorageキー: `kabehub_sidebar_collapsed`
- `isMobileOverlay` が `true` のとき（スマホ表示）は折り畳み機能を一切動作させないこと
- `ResizeObserver`（サイドバー幅変化時のtextarea高さ再計算）は未実装（残課題）

### Supabaseスキーマキャッシュ関連

- RPC追加・変更後に `schema cache` エラーが出た場合: `NOTIFY pgrst, 'reload schema';` を実行

---

## 実装済み機能（バージョン別）

| バージョン | 内容 |
|-|-|
| 〜v131 | マルチAI壁打ち（Claude/Gemini/OpenAI）・公開/引継ぎ/フォーク/explore・AI闘技場・なりきりモード・プロジェクト機能・画像アップロード/生成・Prompt Caching |
| v132 | Branching UI（branchEditモード・BranchBubbleグルーピング・分岐復元・エクスポート除外） |
| v133 | Memory Summary UI（/memory独立ページ・手動編集API・手動追加・固定/アーカイブ・extraction_version保護） |
| v134 | アーカイブ機能バグ修正（.maybeSingle()・case "archive"復元・RLS UPDATEポリシー追加） |
| v135 | temporal_status自動更新バッチ（SQLベース・LLM不要・is_pinned/user_edited保護） |
| v136 | 類似記憶統合候補表示（find_similar_lore_pairs RPC・dismissテーブル・無視機能） |
| v137 | ユーザー承認つき記憶統合（preview/merge API・gpt-4o-mini統合案・LORE_MEMORY_SELECT共通化） |
| v138 | 自動Dreamingバッチ（find_similar_lore_pairs_v2 LATERAL KNN・consolidate_dreaming_batch RPC・履歴API） |
| v139 | 統合履歴UI・ロールバック（rollback RPC・履歴展開UI・tags union修正・threshold 0.92復旧） |
| v140 | 本格Dreaming（3件以上統合・greedy chain clustering・multi RPC・batch-trainをuser発言のみに・limit 100） |
| v141 | Memory Summary強化・一括アーカイブ・AI発言いいね学習（liked_ai・Dreaming保護3RPC更新） |
| v142 | 会話UI改善（編集再生成のデフォルトAI選択・Enter即生成・サイドバードラッグ選択維持） |
| v143 | BranchBubble表示位置修正（分岐元メッセージ直後にアンカー固定・branch_index単位グルーピング・message_number優先ソート） |
| v144 | 新規会話スタートUI改善（中央配置の初期入力画面・ChatInputCentered新規・resolvedThreadId方式への統一） |
| v145〜v147 | 分岐履歴レールUI Phase A-1〜A-3（分岐ブロック表示・世界線切替・ドットインジケーター拡張） |
| v148〜v150 | Phase A.5：入れ子分岐branch_root_idバグ修正・branchBlocksByAnchorの統一ロジック化・実機検証完了 |
| v151〜v152 | Phase B着手：分岐ツリー可視化「マングローブ林」バグ修正・ノードラベル省略表示・兄弟分岐の親付け替え |
| v153 | 再生成機能2点修正（二重発言バグ修正・上書き再生成追加） |
| v154 | AI応答生成中の下部固定入力欄非表示化 |
| v155 | 「新しいチャットに分岐」機能 |
| v156 | ChatInputCenteredにメモ・深く考える・ファイル添付・GitHub連携を実装 |
| v157 | フォルダ「＋」から新規会話作成時のfolder_name保存バグ修正 |
| v158 | 会話コピー機能の500エラー修正 |
| v159 | コードブロックのコピー機能堅牢化・配色淡色化 |
| v160 | iPhone Safari viewport設定追加 |
| v161 | スマホ サイドバードロワー化 |
| v162 | スマホ ヘッダーレイアウト修正 |
| v163 | 送信キー設定追加（Enter/Ctrl+Enter切替・IME強化） |
| v164 | スマホ入力欄UI改善（モデルボタン横スクロール・＋ドロップアップ集約） |
| v165 | スマホ モデル選択UI改善（プロバイダータップでドロップダウン・送信ボタン拡大） |
| v166 | スマホUI改善（フォントサイズ調整・会話履歴ドロワー） |
| v168 | 入力欄自動伸縮 + サイドバー折り畳み（PC専用） |
| v169〜v171 | メッセージ一覧・入力欄・フッターの中央寄せ（840px maxWidth）・ChatInputCenteredのオーバーレイ化 |
| v172 | PC版モデル選択をドロップダウン方式に変更 |
| v173 | 編集・上書き再生成モーダルの送信先をドロップダウン方式に変更 |
| v174 | Claude Sonnet 5対応（料金自動切替・Extended Thinking非対応ガード） |

> v133〜v159の詳細変更履歴（RPC定義・設計判断メモ含む）は `KabeHub_引き継ぎ資料_20260615_v159.md`、v160〜v172の詳細は `KabeHub_変更履歴アーカイブ_v160-v172.md` を参照。

---

## 既知の課題（未解決）

- **iPhone実機確認未了**: モデルドロップダウン・サイドバードロワー・ヘッダー・＋ドロップアップ・会話履歴ドロワー・サイドバー折り畳みボタンの動作確認
- `ProfilePage.tsx` の日本語テキストが英語になっている（v112でCodex文字化け対処のため・手動修正要）
- 画像生成 Tech Debt（sharp圧縮・pg_cron自動削除・⭐Saveボタン・設定ページのデフォルトプロバイダー選択UI）
- Opus 4.8 の Extended Thinking 対応（将来対応）
- GitHub連携 Pinned Files失敗時のUI通知未実装（現状はconsole.warnのみ）
- 統合成功後にF5なしで候補リストが消えないケース（fetchConsolidationCandidatesのタイミング問題）
- `loadEnterMode()` / `isMobileViewport()` が `ChatInput.tsx` と `ChatInputCentered.tsx` に重複定義。`lib/inputUtils.ts` への共通化が望ましい
- Phase Bその3（③''の④''をさらに編集した④'''がツリーに表示されない・原因未調査・優先度低）
- サイドバー折り畳みの `ResizeObserver` 未実装（幅変化時のtextarea高さ再計算）
- **【新規・v174コード確認で発覚】`app/api/arena/route.ts` の `OPENAI_MODEL_IDS` に `gpt-5.5-pro` が未反映**（単純な同期漏れ・要修正）
- **【新規・要確認】MCPサーバーの実装状況が資料と食い違っている**（「次に実装予定」に記載があるが、`app/api/mcp-tokens/route.ts` 等が既に存在。詳細未確認）
- **【新規・要確認】`lib/genres.ts` / `lib/exportUtils.ts` が最新ファイル構成に見当たらない**（リネーム・統合・削除のいずれか不明）

---

## 次に実装予定

**iPhone実機確認**
- モデルドロップダウン・ソフトキーボード表示中の位置
- サイドバードロワー・ヘッダー・＋ドロップアップ
- サイドバー折り畳みボタン・アイコンバー
- 入力欄フッターの左端揃え・背景透過の見た目確認

**PWA対応**
- `manifest.json` 追加・アイコン整備・`viewport-fit=cover`・`env(safe-area-inset-bottom)` を入力欄 padding に追加

**将来：スマホアプリ化（Capacitor推奨）**
- Capacitor を最初から導入することで Android/iOS の両対応が共通コードで可能
- PWA → Android TWA でまず Google Play 配信 → 後から `npx cap add ios` で iOS 追加の順が現実的
- ⚠️ Capacitor 導入時は Next.js の `output: "export"` が必要。API リクエスト先は `https://kabehub.com` を明示的に指定する

**Phase 4 マネタイズ**（最優先・未着手）
- おまかせプラン（クレジット制・月額500〜1,000円）
- Stripe連携
- クレジット残量チェック・上限到達時のセルフプラン誘導UI

**KabeHub MCPサーバー**（Phase 4完了後、と資料上はなっているが実装状況要再確認）
- `mcp_tokens` テーブル追加・`/settings` にトークン発行UI・`kabehub-mcp` npm公開
- ⚠️ 上記「既知の課題」参照。ルートファイルが既に存在するため、この項目自体の現状把握が最優先

**技術負債**
- `app/api/arena/route.ts` のモデルID同期・gpt-5.5-pro対応

---

## 低優先・後回し

- 口述筆記モード（OpenAI Whisper API）
- 非同期整合性チェック（OpenAI Responses API Background mode）
- 世界線ラベルの一意な連番化
- `visibleMessages` 等の `useMemo` 化（パフォーマンス問題が出た場合に検討）
- MCP拡張ツール（publish_thread / add_tag / bulk_add_messages）
- GitHub連携 Pinned Files失敗時のUI通知
- GitHubトークン disconnect時のGitHub側revoke
- parseGithubBlobUrlのブランチ制限緩和（現状はmain/master/develop/devのみ）
- `app/arena/page.tsx` 人間ターン入力の送信キー設定への統一

---

## 差別化ポイント

- TypingMindと違い、複数AIの履歴共有・引継ぎ機能・メモモード・公開スレッド一覧がある
- 「完成した知識」でなく「考えている途中のプロセス」を共有する文化を作りたい
- 小説執筆特化機能（プロジェクトモード・キャラDB・整合性チェック）で作家ユーザーの開拓を狙う
