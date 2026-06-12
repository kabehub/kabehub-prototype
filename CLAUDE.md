# KabeHub プロジェクト設定

## プロダクト概要

「思考のGitHub」を目指すAIチャット永続保存ツール。個人の壁打ちログを公開・フォーク・評価できるオープンプラットフォーム。

- 本番URL: https://kabehub.com
- GitHub: https://github.com/kabehub/kabehub-prototype
- 現フェーズ: Phase 3 完了（RAG / Memory機能一区切り） / Phase 4（マネタイズ）着手前

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

---

## 技術スタック

| レイヤー | 技術 |
|-|-|
| フロントエンド | Next.js 14 (App Router) + React + Tailwind CSS |
| DB | Supabase (PostgreSQL) — 法人アカウント admin@kabehub.com |
| 認証 | Supabase Auth（Google OAuth）+ @supabase/ssr |
| AI メイン | Anthropic Claude API（claude-opus-4-8 / claude-opus-4-7 / claude-opus-4-6 / claude-sonnet-4-6 / claude-haiku-4-5-20251001） |
| AI サブ1 | Google Gemini API（gemini-2.5-flash / gemini-2.5-pro / gemini-3.5-flash / gemini-3.1-flash-lite） |
| AI サブ2 | OpenAI API（gpt-4o / gpt-5.4-mini / gpt-5.4 / gpt-5.5 / gpt-5.5-pro） |
| 画像生成 | Gemini（gemini-2.5-flash-image他）/ OpenAI（gpt-image-2）/ Ideogram（ideogram-v3）/ OpenRouter-Flux（black-forest-labs/flux.2-pro） |
| Embedding | OpenAI text-embedding-3-small（RAG・記憶機能で使用） |
| ファイルストレージ | Supabase Storage（generated-imagesバケット） |
| デプロイ | Vercel（kabehub.com） |
| Markdown | react-markdown + remark-gfm + @tailwindcss/typography |

---

## 主要ファイルの役割

### API Routes（チャット・スレッド）

| ファイル | 役割 |
|-|-|
| `app/api/chat/route.ts` | チャット送受信の中枢。ストリーミング・DB保存・waitUntilフォールバックをすべて担う。**最も複雑なファイル。後述の地雷を必ず読むこと** |
| `app/api/arena/route.ts` | AI闘技場（複数AI同士の議論）のターン管理 |
| `app/api/explore/route.ts` | 公開スレッド一覧。sort パラメータ（newest/popular/trending）対応 |
| `app/api/share/[token]/route.ts` | 共有ページ用データ取得。shared_atフィルター（スナップショット型共有）あり。**後方互換に注意** |
| `app/api/threads/[id]/route.ts` | スレッドのCRUD。PATCHはupsert方式 |
| `app/api/folder-settings/route.ts` | フォルダ単位のシステムプロンプト設定（プロジェクト機能） |

### API Routes（RAG / Memory）

| ファイル | 役割 |
|-|-|
| `app/api/lore/route.ts` | GET（記憶一覧取得・sort対応）/ POST（手動追加） |
| `app/api/lore/[id]/route.ts` | PATCH（編集・固定・確認・アーカイブ） |
| `app/api/lore/bulk-archive/route.ts` | POST・複数記憶を一括アーカイブ（is_pinned保護あり） |
| `app/api/lore/like/route.ts` | POST・AI発言を「👍 記憶に追加」で liked_ai として保存 |
| `app/api/lore/batch-train/route.ts` | POST・未学習のuserメッセージをEmbedding化してlore_embeddingsに保存 |
| `app/api/lore/update-temporal-status/route.ts` | POST・temporal_status自動更新（SQLベース・LLM不要） |
| `app/api/lore/consolidate/candidates/route.ts` | GET・類似記憶統合候補一覧（dismiss済み除外） |
| `app/api/lore/consolidate/dismiss/route.ts` | POST・統合候補ペアを無視登録 |
| `app/api/lore/consolidate/preview/route.ts` | POST・gpt-4o-miniで統合案を生成（DBへの書き込みなし） |
| `app/api/lore/consolidate/merge/route.ts` | POST・統合案を確定保存・元2件をarchive/superseded |
| `app/api/lore/dreaming-batch/route.ts` | POST・自動Dreamingバッチ（greedy chain clustering・3件以上統合対応） |
| `app/api/lore/dreaming-batch/history/route.ts` | GET・Dreaming統合履歴取得 |
| `app/api/lore/dreaming-batch/rollback/route.ts` | POST・Dreaming統合のロールバック |

### Components

| ファイル | 役割 |
|-|-|
| `components/ChatPanel.tsx` | チャット画面のメインコンポーネント。状態管理の大半がここにある |
| `components/ChatInput.tsx` | 入力欄。ファイル添付・画像添付・Ctrl+V スクショ貼り付け・↵改行ボタン対応 |
| `components/Sidebar.tsx` | スレッド一覧・フォルダ管理・フォルダ設定モーダル |
| `components/MessageBubble.tsx` | 通常モードのメッセージ表示。assistantバブルに「👍 記憶に追加」ボタンあり |
| `components/RoleplayBubble.tsx` | なりきりモード用メッセージ表示（LINEライクUI） |
| `components/MarkdownRenderer.tsx` | Markdownレンダリング + `[[text]]→████` マスク変換 |

### Pages

| ファイル | 役割 |
|-|-|
| `app/memory/page.tsx` | Memory Summary UI。記憶一覧・フィルタ・検索・ソート・グループ表示・一括アーカイブ・統合候補・Dreaming履歴 |
| `app/settings/page.tsx` | 設定ページ。「AI記憶を管理する →」リンクあり |

### Lib

| ファイル | 役割 |
|-|-|
| `lib/supabase/client.ts` | ブラウザ用Supabaseクライアント |
| `lib/supabase/server.ts` | Server Components用 |
| `lib/supabase/route-handler.ts` | Route Handler用 |
| `lib/supabase-db.ts` | DB操作ヘルパー関数群。第一引数は必ずSupabaseClient |
| `lib/lore.ts` | MemoryKind拡張・LoreSearchResult拡張・searchLoreV2 |
| `lib/loreMemorySelect.ts` | `LORE_MEMORY_SELECT` 定数を共通化 |
| `lib/genres.ts` | ジャンルマスタ定数（10大分類・44中分類） |
| `lib/exportUtils.ts` | TXT/MD/CSVエクスポートのロジック |

### Docs

| ファイル | 役割 |
|-|-|
| `docs/schema.sql` | テーブル定義スナップショット（**⚠️ v78時点のまま古い。v124〜v141のマイグレーション未反映**） |

新しいマイグレーションは `docs/v{バージョン番号}_migration.sql` として追加し、Supabase Dashboard > SQL Editor で手動実行する。

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
- `messages` テーブルのカラム: `id / thread_id / role / content / provider / user_id / created_at / parent_id / is_hidden / model_id / is_active / branch_id / branch_root_id / branch_index / is_learned / skip_learning`（v89/v99/v124追加）

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

---

## 既知の地雷

### Git関連

| 地雷 | 説明 |
|-|-|
| force push 禁止 | `--force` でv133〜v136のコミットが消えた前例あり。絶対に使わない |
| コンフリクト復元手順 | `git merge --abort` → `git fetch origin` → `git reset --hard origin/main` |

### MCP関連

| 地雷 | 説明 |
|-|-|
| middleware matcher | `/api/mcp/*` はBearer認証のため `matcherに /api/((?!mcp).*)` が必要 |
| www.必須 | `kabehub.com` → `www.` へ307リダイレクト時にAuthorizationヘッダーが消える。`https://www.kabehub.com` を使う |

### RAG関連

| 地雷 | 説明 |
|-|-|
| OpenAI APIキー必須 | batch-train・Embedding生成・記憶統合はすべて `text-embedding-3-small` を使用。モデル変更は全レコード再生成が必要なため事実上不可 |
| extraction_version 保護 | `user_edited` / `user_created` / `liked_ai` のレコードはDreamingバッチで自動変更しない |
| is_pinned 保護 | `is_pinned = true` のレコードは時間更新バッチの自動expired化から保護する |
| embedding カラム非公開 | `lore_embeddings.embedding` は絶対にGETレスポンスに含めない |
| ペア正規化 | `lore_consolidation_dismissals` のペアは必ず `lore_id_a < lore_id_b` に正規化する |
| dreaming threshold | **本番では 0.92 を使う**（v139で復旧済み） |
| RPC自己結合性能 | `find_similar_lore_pairs` はO(n²)。大量記憶時は `find_similar_lore_pairs_v2`（LATERAL KNN方式）を使う（v138追加済み） |
| batch-train対象 | **userメッセージのみ**。`role = 'user'` / `provider != 'memo'` / `provider != 'image_gen'` で絞り込み。AI発言の記憶化は「👍 記憶に追加」ボタンで対応（v141） |
| liked_ai保護 | Dreaming保護条件は `extraction_version NOT IN ('user_edited', 'user_created', 'liked_ai')`。`find_similar_lore_pairs_v2` / `consolidate_dreaming_batch`（両シグネチャ）/ `consolidate_dreaming_batch_multi` の全RPCに適用済み |
| v_found_count カウンター | `consolidate_dreaming_batch_multi` の件数検証はFORループ内のカウンター方式。FORループ後の `GET DIAGNOSTICS` はPostgreSQLの仕様で件数が取れない |
| テスト用ダミーデータ | 自動整理テストは `extraction_version = 'batch_train'` かつ同一 `folder_name` に揃える。`user_created` は自動整理対象外 |
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

---

## 実装済み機能（主要・v141時点）

- マルチAI壁打ち（Claude / Gemini / OpenAI）
- 公開・引継ぎ・フォーク・explore（ジャンル・タグ・ソート・トレンド）
- AI闘技場・なりきりモード・プロジェクト機能（フォルダ単位システムプロンプト）
- 画像アップロード・画像生成（Gemini / OpenAI / Ideogram / Flux）
- Prompt Caching対応（Claude）・Branching UI（v132）
- **RAG / Memory機能群（v124〜v141）**
  - batch-train（未学習userメッセージのEmbedding化）
  - ルールベースRAG接続（chat/route.ts）・Citation表示
  - Memory Summary UI（`/memory` ページ）・手動編集・固定・アーカイブ
  - temporal_status自動更新バッチ
  - 類似記憶統合候補表示・ユーザー承認つき統合
  - 自動Dreamingバッチ（greedy chain clustering・3件以上対応）
  - Dreaming統合履歴UI・ロールバック機能
  - Memory Summary強化（sortMode / groupByKind / isNeedsReview拡張）
  - 一括アーカイブ機能
  - AI発言いいね学習（`liked_ai`）

---

## 既知の課題（未解決）

- `docs/schema.sql` が v78 のまま古い（v124〜v141のマイグレーション未反映）
- `ProfilePage.tsx` の日本語テキストが英語になっている（v112でCodex文字化け対処のため・手動修正要）
- 画像生成 Tech Debt（sharp圧縮・pg_cron自動削除・⭐Saveボタン・設定ページのデフォルトプロバイダー選択UI）
- Opus 4.8 の Extended Thinking（Extended thinking非対応のため将来対応）
- GitHub連携 Pinned Files失敗時のUI通知未実装（現状はconsole.warnのみ）
- 統合成功後にF5なしで候補リストが消えないケースあり（v137既知・fetchConsolidationCandidatesのタイミング問題）

---

## 次に実装予定

1. **v142: `docs/schema.sql` 更新**（技術負債解消）
   - v124〜v141のマイグレーションをすべて反映する

2. **Extended Thinking**（推論過程の可視化）
   - APIパラメータ追加のみ・Opus 4.8対応

3. **Phase 4 マネタイズ**
   - おまかせプラン（クレジット制・月額500〜1,000円）
   - Stripe連携
   - クレジット残量チェック・上限到達時のセルフプラン誘導UI

4. **KabeHub MCPサーバー**（Phase 4完了後）
   - `mcp_tokens` テーブル追加
   - `/settings` にトークン発行UI
   - `kabehub-mcp` npm公開

## 低優先・後回し

- 口述筆記モード（OpenAI Whisper API）
- 非同期整合性チェック（OpenAI Responses API Background mode）
- Branching Mode本格整備（分岐ツリー可視化・入れ子分岐）
- MCP拡張ツール（publish_thread / add_tag / bulk_add_messages）
- GitHub連携 Pinned Files失敗時のUI通知
- GitHubトークン disconnect時のGitHub側revoke
- parseGithubBlobUrlのブランチ制限緩和（現状はmain/master/develop/devのみ）
- GitHub探索中インジケーターのリアルタイム表示
