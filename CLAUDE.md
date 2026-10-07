# KabeHub プロジェクト設定

最終更新: 2026/10/07 — 自動要約Phase 1a（v206カーソルDB定義・未適用、アプリ連携はPhase 1b）・自動要約Phase C-3（使用スレッド内のuser発言カバレッジと具体的な省略警告、プロンプトv8＋切り詰め前の入力マスク・空topicの理由表示）・topic一括削除Phase B（v205本番適用済み・schema反映済み）
> このファイルはコードと `git ls-files` の現行構成を突き合わせ、主要ファイルの実装内容を確認して更新。

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
git status --short   # 変更内容を確認
git add <変更したファイルを個別指定>
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
| フロントエンド | Next.js 16.2.11 (App Router) + React 19.2.8 + Tailwind CSS |
| DB | Supabase (PostgreSQL) — 法人アカウント admin@kabehub.com |
| 認証 | Supabase Auth（Google OAuth）+ @supabase/ssr |
| AI メイン | Anthropic Claude API（claude-fable-5 / claude-sonnet-5 / claude-opus-5 / claude-opus-4-8 / claude-opus-4-7 / claude-opus-4-6 / claude-sonnet-4-5 / claude-sonnet-4-6 / claude-haiku-4-5-20251001） |
| AI サブ1 | Google Gemini API（gemini-2.5-flash / gemini-2.5-pro / gemini-3.5-flash / gemini-3.1-flash-lite / gemini-3.6-flash / gemini-3.7-flash / gemini-3.5-flash-lite） |
| AI サブ2 | OpenAI API（gpt-4o / gpt-5.4-mini / gpt-5.4 / gpt-5.5 / gpt-5.5-pro / gpt-5.6-sol / gpt-5.6-terra / gpt-5.6-luna）※gpt-5.5-proは`/v1/chat/completions`非対応のため、chat・arena両方で`/v1/responses`へ分岐する |
| 画像生成 | Gemini（gemini-2.5-flash-image） / OpenAI（gpt-image-2） / Ideogram（ideogram-v3） / OpenRouter-Flux（black-forest-labs/flux.2-pro） |
| Embedding | OpenAI text-embedding-3-small（RAG・記憶機能で使用） |
| ファイルストレージ | Supabase Storage（generated-imagesバケット） |
| デプロイ | Vercel（kabehub.com） |
| Markdown | react-markdown + remark-gfm + @tailwindcss/typography |

モデルIDのUnion型は `types/index.ts`、実行時のモデル台帳・利用surface・デフォルト・Thinking対応・料金は `lib/modelRegistry.ts` で管理する。両者には双方向の型一致チェック（`AssertNever`）があり、不一致は型エラーになる。`app/api/chat/route.ts` と `app/api/arena/route.ts` は `lib/modelRegistry.ts` の `isAllowedModel` / `getDefaultModel` / `resolveClaudeRequestOverrides` をimportして使い、手動Thinking UIの可否は `canToggleDeepThinking` から導出する。モデル追加・削除時は `types/index.ts` と `lib/modelRegistry.ts` の両方を更新すること。

---

## 主要ファイルの役割

### API Routes（チャット・スレッド）

| ファイル | 役割 |
|-|-|
| `app/api/chat/route.ts` | チャット送受信の中枢。ストリーミング・DB保存（Promise Bridge）・waitUntilフォールバック・RAG注入・GitHub Tool Loop・Claude Thinking制御をすべて担う。**最も複雑なファイル。後述の地雷を必ず読むこと** |
| `app/api/arena/route.ts` | AI闘技場（複数AI同士の議論）のターン管理。**chat/route.tsと異なり非ストリーミング実装**（`await res.json()`で一括取得）。ClaudeのThinking/max_tokens設定は`resolveClaudeRequestOverrides`を共有し、text blockを全件結合する。gpt-5.5-pro用の`/v1/responses`分岐に対応済み |
| `app/api/explore/route.ts` | 公開スレッド一覧。sort パラメータ（newest/popular/trending）対応 |
| `app/api/share/[token]/route.ts` | 共有ページ用データ取得。shared_atフィルター（スナップショット型共有）あり。**後方互換に注意** |
| `app/api/share/[token]/fork/route.ts` | POST：共有スレッドのフォーク処理 |
| `app/api/threads/route.ts` | GET：認証ユーザーのスレッド一覧取得 |
| `app/api/threads/[id]/route.ts` | スレッドのCRUD。PATCHはupsert方式 |
| `app/api/threads/[id]/branch-to/route.ts` | 「新しいチャットに分岐」機能（v155） |
| `app/api/threads/[id]/copy/route.ts` | スレッドコピー・フォーク。roleplay関連フィールドをリセット。v158で500エラー修正済み（`copied_from`→`forked_from_id`） |
| `app/api/threads/[id]/drafts/route.ts` | 下書き保存 |
| `app/api/threads/[id]/likes/route.ts` | いいね機能 |
| `app/api/threads/[id]/message-notes/route.ts` / `notes/route.ts` | メッセージ単位・スレッド単位のメモ |
| `app/api/threads/[id]/messages/route.ts` / `app/api/threads/[id]/messages/[messageId]/route.ts` | 前者はGET・DELETE、後者はDELETE・PATCHでスレッド内メッセージを操作 |
| `app/api/threads/[id]/messages/restore-branch/route.ts` | 分岐の復元 |
| `app/api/threads/[id]/tags/route.ts` | タグ管理 |
| `app/api/project-settings/route.ts` | フォルダ単位のシステムプロンプト設定・GitHub連携設定（プロジェクト機能） |
| `app/api/messages/[id]/route.ts` | DELETE・PATCHによるメッセージ単体操作（画像tombstone操作を含む） |

### API Routes（RAG / Memory）

| ファイル | 役割 |
|-|-|
| `app/api/lore/route.ts` | GET（記憶一覧取得・sort対応）/ POST（手動追加） |
| `app/api/lore/promotions/route.ts` | GET・Project Memoryから昇格したLoreの来歴（6フィールドのみ） |
| `app/api/lore/[id]/route.ts` | PATCH（編集・固定・確認・アーカイブ） |
| `app/api/lore/bulk-archive/route.ts` | POST・複数記憶を一括アーカイブ（is_pinned保護あり） |
| `app/api/lore/like/route.ts` | POST・AI発言を「👍 記憶に追加」で liked_ai として保存 |
| `app/api/lore/batch-train/route.ts` | POST・未学習のuserメッセージをEmbedding化してlore_embeddingsに保存 |
| `app/api/lore/chunks/route.ts` / `app/api/lore/chunks/[id]/route.ts` | 前者はLore chunk一覧取得（GET）、後者は削除（DELETE） |
| `app/api/lore/embed/route.ts` | POST：既存Embeddingを削除して新しいEmbeddingを生成・保存 |
| `app/api/lore/update-temporal-status/route.ts` | POST・temporal_status自動更新（SQLベース・LLM不要） |
| `app/api/lore/consolidate/candidates/route.ts` | GET・類似記憶統合候補一覧（dismiss済み除外） |
| `app/api/lore/consolidate/dismiss/route.ts` | POST・統合候補ペアを無視登録 |
| `app/api/lore/consolidate/preview/route.ts` | POST・gpt-4o-miniで統合案を生成（DBへの書き込みなし） |
| `app/api/lore/consolidate/merge/route.ts` | POST・統合案を確定保存・元2件をarchive/superseded |
| `app/api/lore/dreaming-batch/route.ts` | POST・自動Dreamingバッチ（greedy chain clustering・3件以上統合対応） |
| `app/api/lore/dreaming-batch/history/route.ts` | GET・Dreaming統合履歴取得 |
| `app/api/lore/dreaming-batch/rollback/route.ts` | POST・Dreaming統合のロールバック |

### API Routes（Project Memory）

Project（旧フォルダ）単位のtopic型メモリ。`project_memory_topics`（現行本文・`revision`）と`project_memory_revisions`（履歴）を、RPC（SECURITY DEFINER）経由で更新する。認証は全routeで`requireRouteUser`。所有確認はMemory routeで`getOwnedProject`、Project一覧は`user_id`で絞り込み、Project作成・名前変更・削除はRPC内で行う。`proxy-paths.ts`には全routeが`bearer`で登録済み。

v206（Phase 1a、未適用）は `project_memory_auto_summary_cursors` にtopic×threadごとの消費位置を保持する（PK: topic_id/thread_id、message_idはFKなし、message_created_at、updated_at）。topic/thread削除でcascade。user_id列は持たず、topic所有者にSELECTのみをRLSで許可する。書き込み専用RPC `advance_project_memory_auto_summary_cursors(p_user_id uuid, p_topic_id uuid, p_expected_revision integer, p_cursors jsonb) returns integer` はSECURITY DEFINER・search_path空・authenticatedのみ実行可。auth→正のexpected_revision→1〜100件のJSON/UUID/重複検証→所有topicの行ロック→存在/非NULL project→revision CAS→thread/message所有・Project・user role・provider照合→DBのcreated_at取得→(created_at,message_id)が前進する場合のみupsert→前進行数を返す。不適格候補はskip、is_activeは再検証しない。戻り値は診断用で成功判定には使わない。topic本文・revision・履歴は変更しない。アプリからの呼び出しはPhase 1bで実装する。

| ファイル | 役割 |
|-|-|
| `app/api/projects/route.ts` | GET：所有Projectの`id, name`一覧（`/library`が使用）／POST：`get_or_create_project` RPCで名前からProjectを取得または作成（name trim後空は400） |
| `app/api/projects/[projectId]/route.ts` | PATCH：`rename_project` RPC（重複は409。関連4テーブルの`folder_name`を同期）／DELETE：`delete_project_preserving_contents` RPC。bodyに`promoteToLore`(boolean)必須。trueのときは`x-openai-api-key`必須で、非空topicを直列にEmbedding化してRPCへ渡す |
| `app/api/projects/[projectId]/memory/topics/route.ts` | GET：topic一覧＋`promotion`（`status`: `not_promoted`/`current`/`stale`、`source_revision`、`lore_id`）。`lore_embeddings`の`source_type='project_memory_promotion'`かつ`is_archived=false`・`superseded_by=null`だけを参照し、同revisionなら`current`、古いrevisionなら`stale`。archived/superseded行は参照せず、active候補がなければ`not_promoted`。active複数件・不正/未来revisionも`not_promoted`に倒す／POST：`create_project_memory_topic` RPC（201）。GET の select に `include_in_chat` を含む |
| `app/api/projects/[projectId]/memory/topics/[topicId]/route.ts` | GET：topic単体／PATCH：`update_project_memory_topic` RPC。`expected_revision`（正整数）必須、`edit_kind`は`full`（`new_content_md`）または`partial`（`old_text`/`new_text`）、`source_refs`はjsonb配列。revision不一致は409（楽観的排他）。GET の select に `include_in_chat` を含む |
| `app/api/projects/[projectId]/memory/topics/[topicId]/chat-inclusion/route.ts` | PATCH：bodyは`{include: boolean}`必須（不正は400）。`set_project_memory_topic_chat_inclusion` RPC（v204）でチャット注入のON/OFFのみ更新する（本文・`revision`・履歴は変えない）。成功は`{topic:{id, include_in_chat}, included_chars}`。エラーは404 topicなし・400 空topic・409 上限超過（`code:"chat_inclusion_limit_exceeded"`と`max_chars`）・403 権限なし。事前のtopic SELECTはせず、権限・存在確認はRPCに任せる |
| `app/api/projects/[projectId]/memory/topics/[topicId]/promote/route.ts` | POST：bodyは`expected_revision`必須・`acknowledged_edited_lore_ids`任意（省略時`[]`、最大100 UUID、null不可）。topic取得→revision不一致409→空topic400→同revision行確認。archivedかつ`superseded_by=null`なら`restore_archived_project_memory_promotion`（v203）をAPIキー確認・Embedding生成より前に呼ぶ。新規は編集済みLore確認→APIキー確認→Embedding→v202昇格RPC。未承認の置き換えは409 `edited_lore_needs_confirmation`＋`edited_lores:[{id,title}]`、RPC検出時も一覧を再取得して同じ409を返す。復元不可は409 `promotion_restore_unavailable`、revision conflict等は共通マッパー。成功契約は`{lore_id, created, restored?}`（復元時は`created:false`・RPCの`restored`をそのまま返す）。active/supersededの同revision行は従来経路を維持 |
| `app/api/projects/[projectId]/memory/topics/[topicId]/edit-preview/route.ts` | POST：「AIで編集」のプレビュー。**DB書き込みなし**。`x-openai-api-key`を認証より前に確認。body`{instruction}`（trim後非空・2,000文字以下）。結果は`proposal`/`no_change`/`not_applicable`の3種（共通envelope付き）。入力上限超過413、LLM失敗・不正応答は502 |
| `app/api/projects/[projectId]/memory/consolidate/preview/route.ts` | POST：Project全体の整理案プレビュー（DB書き込みなし）。`current_state` topicは対象外。入力上限超過413、失敗502。適用は専用routeではなく、クライアントがtopicごとに既存PATCHを呼ぶ（`source_refs`に`consolidation_run`） |
| `app/api/projects/[projectId]/memory/bootstrap/preview/route.ts` | POST：通常のProject内会話から未作成の標準4キーだけを生成する初回プレビュー（DB書き込みなし）。APIキーを認証前に確認。全キー作成済み／対象会話なし／根拠なしは200 `not_applicable`。DB読込失敗500、LLM失敗・不正応答502。入力超過は切り捨て、413は使わない。previewでは空本文の未作成キーを標準キー順のempty_topic_keysで常に返す（空配列可）。全件空なら従来どおりinsufficient_evidence。承認後は既存topics POSTで個別作成 |

### API Routes（GitHub連携）

| ファイル | 役割 |
|-|-|
| `app/api/fetch-github/route.ts` | チャット添付用の一時GitHubファイル取得 |
| `app/api/auth/github/route.ts` | GitHub OAuth開始（GET）・ローカル連携解除（DELETE） |
| `app/api/auth/github/callback/route.ts` | GitHub OAuthコールバック |
| `app/api/auth/github/status/route.ts` | GitHub連携状態確認 |

### API Routes（MCP）

prototype側：`mcp_tokens`テーブル・`/settings`でのトークン発行UI・`/api/mcp/threads`・`/api/mcp/threads/[id]/messages`のBearer認証API実装済み。別repo `github.com/kabehub/kabehub-mcp`：stdio方式のMCPサーバー実装済み。現行ツールは`create_thread`・`add_message`・`list_threads`の3つ（`src/index.ts`で確認）。npm registryへの公開状態は本項では断定しない。

| ファイル | 役割 |
|-|-|
| `app/api/mcp-tokens/route.ts` | MCPトークン発行・管理 |
| `app/api/mcp/threads/route.ts` | MCP経由スレッド操作 |
| `app/api/mcp/threads/[id]/messages/route.ts` | MCP経由メッセージ操作 |

### API Routes（その他）

| ファイル | 役割 |
|-|-|
| `app/api/account/route.ts` | DELETE：所有Storage画像を削除後、`delete_current_user` RPCでアカウントを削除 |
| `app/api/album/route.ts` | GET：生成画像一覧取得・署名URL発行 |
| `app/api/calendar/route.ts` | GET：指定年月の範囲で認証ユーザーのスレッドを取得 |
| `app/api/cron/storage-cleanup/route.ts` | GET：Cron Secret認証で孤立Storage候補を抽出し、dry-runまたは削除を実行・記録 |
| `app/api/csp-report/route.ts` | POST：CSP違反レポートをサイズ・rate limit・URL無害化のうえ記録 |
| `app/api/extract-settings/route.ts` | 会話から`novel_settings`を抽出・保存（POST）・取得（GET） |
| `app/api/image-gen/route.ts` | 画像生成（Gemini / OpenAI / Ideogram / Flux） |
| `app/api/novel-check/route.ts` | POST：入力検証後、外部AI APIで小説設定との整合性をチェック |
| `app/api/profile/route.ts` | ユーザープロフィール |
| `app/api/reports/route.ts` | POST：service role経由で`submit_report` RPCを呼び出して通報を登録 |
| `app/api/search/route.ts` | GET：所有スレッドのタイトル・メッセージ本文を部分一致検索 |
| `app/api/stats/route.ts` | 利用統計・料金集計（lib/pricing.ts利用） |

### Pages

| ファイル | 役割 |
|-|-|
| `app/page.tsx` | メインチャット画面。サイドバー折り畳み・スマホ判定などの中枢state |
| `app/[handle]/` (`page.tsx` / `default.tsx` / `ProfilePage.tsx`) | 公開プロフィールページ |
| `app/admin/storage-cleanup/page.tsx` | Storage Cleanupの直近実行履歴を表示する認証必須の管理ページ |
| `app/album/page.tsx` | 生成画像の一覧・選択・削除ページ |
| `app/arena/page.tsx` | AI闘技場 |
| `app/arena/[token]/`（`ArenaViewPage.tsx` / `default.tsx` / `page.tsx`） | 闘技場の共有ビュー |
| `app/calendar/page.tsx` | 月別スレッドカレンダーページ |
| `app/explore/page.tsx` | 公開スレッド一覧 |
| `app/image/page.tsx` | 画像生成ページ |
| `app/library/page.tsx` | 全Project横断のProject Memory一覧・DL/UL・Lore昇格・昇格先Loreへのリンク。折り畳み＋lazy load |
| `app/memory/page.tsx` | Memory Summary UI。記憶一覧・フィルタ・検索・ソート・グループ表示・一括アーカイブ・統合候補・Dreaming履歴・Lore昇格の来歴とハッシュリンク |
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
| `components/Sidebar.tsx` | スレッド一覧・フォルダ管理・指示／参照／Memoryの3タブ設定ドロワー・PC専用折り畳み機能（v168）・Project Memory一覧・整理・会話から初回生成モーダルの起点 |
| `components/ProjectSettingsTabs.tsx` | hookなしの制御タブ。ARIAと左右矢印／Home／Endによる選択・focus移動 |
| `components/ProjectMemoryTab.tsx` | Memory選択時のみmount。読み取り専用サマリ・自動要約／一覧の主導線・既存3ボタン。指示・参照パネルとtabpanel要素は常時mount |
| `components/MessageBubble.tsx` | 通常モードのメッセージ表示。「👍 記憶に追加」ボタン・編集/上書き再生成モーダル（ドロップダウン方式・v173） |
| `components/RoleplayBubble.tsx` | なりきりモード用メッセージ表示（LINEライクUI） |
| `components/MarkdownRenderer.tsx` | Markdownレンダリング + `[[text]]→████` マスク変換（variant="share"時のみ） |
| `components/ArenaTimeline.tsx` | provider別Bubble・thinking表示付きのAI闘技場タイムライン |
| `components/BranchTree.tsx` | 分岐ツリー可視化コンポーネント（Phase B） |
| `components/ExportModal.tsx` | TXT/MD/CSVエクスポートのUI。出力生成は`lib/exportUtils.ts`を利用 |
| `components/LegalLayout.tsx` | 利用規約・プライバシーポリシー等の共通レイアウト |
| `components/NovelSettingsPane.tsx` | 小説プロジェクト設定ペイン |
| `components/OutlinePane.tsx` | あらすじ・アウトラインの開閉ペイン |
| `components/PublishConfirmModal.tsx` | 公開確認モーダル。なりきりモードのスレッドは公開不可のガードあり |
| `components/Toast.tsx` | 成功・エラー通知を表示するToast Providerと`useToast` hook |
| `components/ProjectMemorySection.tsx` | `/library`の各Project行。折り畳み＋展開時のみlazy load（`keepLoaded: true`） |
| `components/ProjectMemoryListModal.tsx` | Sidebarから開くProject Memory一覧モーダル（`keepLoaded: false`）。Escape・背景クリック・「閉じる」は編集モーダル表示中/操作中は無効 |
| `components/ProjectMemoryTopicList.tsx` | topic行の共通表示（DL／AIで編集／Loreに昇格／Loreで見る／**チャットに含める**トグル・実際に注入されるtopicのみ「チャット注入中」、ONだが上限超過・本文が空のtopicは「未注入（理由）」バッジ）。一覧上部に「Memory注入: X / 8,000字」の使用量・注入されないtopicの警告・注意書きを表示する。DLは`actionsLocked`の影響を受けない |
| `components/ProjectMemoryPromotionConfirmModal.tsx` | `/library`・Sidebar一覧で共用する編集済みLore再昇格の確認モーダル（TopicList経由）。対象Loreのタイトルと編集内容を引き継がない説明を表示し、「編集を破棄して再昇格」で承認する。フォーカス制御・Escape・送信中キャンセル禁止あり |
| `components/ProjectMemoryDeleteConfirmModal.tsx` | 両一覧からの一括削除確認。対象revision・コードポイント字数・昇格/注入バッジ、履歴の完全削除とLore保持を明示。履歴の必須チェックと、昇格済み時のみLore重複の必須チェック。開くたび・対象変更で未チェックに戻り、キャンセルへ初期focus。送信中は全閉じる操作を禁止 |
| `components/ProjectMemoryInstructionEditModal.tsx` | 「AIで編集」の指示入力→差分プレビュー→適用モーダル（z-index 1200/1201） |
| `components/ProjectMemoryDiffView.tsx` | 差分表示。整理・編集・初回生成モーダルで共用（初回生成の旧本文は空文字） |
| `components/ProjectMemoryConsolidationModal.tsx` | Project全体整理案の選択・適用モーダル |
| `components/ProjectMemoryBootstrapModal.tsx` | 未作成topicの選択・空本文からの差分・使用スレッド数・個別適用結果を表示。empty_topic_keysが非空なら一覧の下に「作成案がないtopic」と各キーの理由を表示（principlesは明示的な恒常指示、その他は根拠記述がこの会話の範囲で見つからなかったため）。user発言が未使用なら古い発言に含まれている可能性を追記。チェックボックスなしで選択件数に影響せず、適用後も表示を維持。「使用したスレッド内のuser発言: x / y件」は常時表示。x<yなら「古いuser発言N件は使用していません」、messages_truncated>0なら「長文のuser発言N件は一部を中略しています」を警告色で個別表示。スレッド数行・Project全体を網羅していない警告・チャット注入OFF案内は維持。適用中はEscape・背景・ボタンで閉じられない（z-index 1100/1101） |
| `components/ProjectMemoryUploadConfirm.tsx` | topicファイルアップロード時の上書き／新規作成の確認ダイアログ |
| `components/ProjectDeleteConfirmModal.tsx` | Project削除確認（Loreへ昇格するかの選択つき） |

### Lib

| ファイル | 役割 |
|-|-|
| `lib/project-memory/summary.ts` | 純関数。標準キー集合との積集合、注入ON／現在注入、Lore登録済み／更新あり、チャット未注入・Lore未登録を集計。注入判定と使用字数は既存`summarizeChatInclusion`を再利用 |
| `lib/project-memory/summary-client.ts` | 既存topics GETから必要な5項目のみ抽出。HTTP・配列・全件の必須型とpromotion.statusをfail-closedで検証 |
| `lib/project-memory/use-project-memory-summary.ts` | Project IDとrefreshTokenで再取得するread-only hook。effect前も旧Projectのデータ・エラーを公開しない。未取得と0件を区別し、再取得失敗は旧データを破棄。request idとabortで古い応答を除外 |
| `lib/chat-system-blocks.ts` | Claude systemブロックの順序・キャッシュmarker選択と、非Claude向けの旧system文字列復元（importゼロの純関数） |
| `lib/attachmentContent.ts` | 手入力とテキスト添付を従来と同じフェンス・区切りで結合。contentは保存本文、queryTextはtrimしない手入力。splitMessageContent / replaceQueryText で添付部分を保持して手入力だけを差し替え |
| `lib/queryTextRetention.ts` | createQueryTextRetention factory。ページごとのメモリ内保持のみ。記録時と現在のcontentが一致しsplitが成功したときだけ手入力を再利用 |
| `lib/lore/chat-search-plan.ts` | サーバー用・importゼロの純関数。19語のトリガーとLore Book / Memoryの検索計画・コードポイント単位のクエリ導出を集約。メモモードはrouteで計画前にearly returnする |
| `lib/ai-context-blocks.ts` | 3ソース（lore_book / memory / project_memory_topic）の参照ブロックと、GitHub用コード封筒を生成。コードは封筒タグのみ分断し、JSX等を保持する |
| `lib/branching.ts` | 表示順・anchor・chain block・現在laneの構築ロジック |
| `lib/branchTree.ts` | 分岐ツリー構築ロジック（`scripts/branchTree.test.cjs`でテストあり） |
| `lib/context-window.ts` | `trimContextToWindow`。コンテキストウィンドウのトリミング・キャッシュアンカー算出 |
| `lib/csp.ts` | CSPヘッダー生成・違反レポート解析・報告URL無害化 |
| `lib/exportUtils.ts` | 会話エクスポート生成（`buildExportContent`等）。`components/ChatPanel.tsx`・`app/settings/page.tsx`から利用 |
| `lib/formatters.ts` | 相対時刻とローカル日時の表示フォーマッター |
| `lib/genres.ts` | ジャンル階層マスタ（`GENRES`）と子ジャンルID取得ヘルパー（`getChildIds`） |
| `lib/github-token-crypto.ts` | AES-GCMによるGitHubトークンの暗号化・復号 |
| `lib/github-token-store.ts` | `getGithubToken`。GitHubトークンの保存・取得 |
| `lib/github-tool-loop.ts` | `runGithubToolLoop`。AI動的GitHub探索。取得成功ファイルを `github_explored_file` 封筒列に変換（preambleなし・成功0件は空文字、warningsは戻り値とdevログのみ） |
| `lib/github.ts` | GitHub連携共通処理・取得と上限判定を行う `buildPinnedGithubContext`・自己完結した `github_pinned_file` 封筒列を生成する純関数 `buildPinnedGithubBlockText` |
| `lib/inputUtils.ts` | 送信キー設定の読み込みとモバイルviewport判定の共通helper |
| `lib/internalModels.ts` | LoreのEmbedding・抽出・統合で使う内部固定モデルID |
| `lib/logger.ts` | DB・外部API・ベストエフォート・security guard向けの機微情報を許可リスト化した構造化logger。Claude refusalの注入状況ログ（`claudeRefusal`） |
| `lib/lore/`（`batchTrain.ts` / `consolidation.ts` / `consolidationLlm.ts` / `dreaming.ts` / `index.ts` / `mappers.ts` / `openai.ts` / `promotion-provenance.ts` / `search.ts` / `selects.ts` / `types.ts` / `use-lore-hash-focus.ts`） | 記憶抽出・検索・統合・Dreaming・OpenAI呼び出し・型/mapper/select定義一式・Project Memory昇格Loreの来歴解析・`#lore-{id}`ディープリンク |
| `lib/loreMemorySelect.ts` | `LORE_MEMORY_SELECT` 定数を共通化 |
| `lib/mcp-auth.ts` | Bearer tokenのhash化・`mcp_tokens`照合・`last_used_at`のベストエフォート更新 |
| `lib/mcp-token-hash.ts` | MCPトークンをSHA-256でhash化 |
| `lib/messages/delete.ts` | 所有メッセージ削除、関連Loreのarchive、所有Storage画像の後処理を共通化 |
| `lib/modelRegistry.ts` | モデル台帳。モデルID・表示情報・利用surface・デフォルト・Thinking対応・料金・許可判定を一元管理。`canToggleDeepThinking`と`resolveClaudeRequestOverrides`も提供 |
| `lib/pricing.ts` | `getPricing`を`lib/modelRegistry.ts`から再exportする互換ファサード。`calcCost`・`formatUSD`を提供 |
| `lib/proxy-paths.ts` | `proxy.ts`と対応する認証・公開・MCP・`next`復帰先のパス/メソッド判定 |
| `lib/rate-limit.ts` | `checkChatRateLimit`。チャットのレート制限 |
| `lib/storage-path-guard.ts` | Storageパスが指定ユーザーの名前空間配下にあるか検証 |
| `lib/stringUtils.ts` | secret notationのmaskとメッセージsummary生成 |
| `lib/supabase.ts` | browser・Server Components・Route Handler用Supabase helperのbarrel export |
| `lib/supabase/admin.ts` | Cron・管理バッチ用のservice role Supabaseクライアント生成 |
| `lib/supabase/client-auth.ts` | browser側の`auth.getUser()`と認証エラー処理を共通化 |
| `lib/supabase/client.ts` | ブラウザ用Supabaseクライアント |
| `lib/supabase/download-image.ts` | `generated-images`から画像をdownloadしbase64へ変換 |
| `lib/supabase/route-auth.ts` | Route Handlerの必須/任意認証とCookie転記つきJSON応答を共通化 |
| `lib/supabase/route-handler.ts` | Route Handler用Supabaseクライアント |
| `lib/supabase/server.ts` | Server Components用Supabaseクライアント |
| `lib/supabase/storage-cleanup.ts` | 所有Storageパス収集・階層一覧取得・batch削除 |
| `lib/threadResourceCrud.ts` | スレッド配下リソースの認証付きGET・POST・DELETE handler factory |
| `lib/validationLimits.ts` | handle・tag・Pinned GitHub Files・一括archiveの入力制限と正規化 |
| `lib/project-memory/get-owned-project.ts` | 所有Project確認（なし404・DBエラー500） |
| `lib/project-memory/resolve-owned-project-id.ts` | Project名から所有`project_id`を解決 |
| `lib/project-memory/map-rpc-error.ts` | RPCエラーメッセージ→HTTPステータスの対応表（`42501`は403、未知は500）。チャット注入の400/409を含む |
| `lib/project-memory/topic-file.ts` | DL/UL用Markdown入出力。先頭行ヘッダー`<!-- kabehub-topic:v1 {topic_id, topic_key, revision} -->`のencode/decode |
| `lib/project-memory/download-topic-file.ts` | topicのMarkdownファイルダウンロード |
| `lib/project-memory/use-project-memory-topics.ts` | topic一覧・昇格・再昇格確認（`pendingConfirm`）・アップロード・AI編集・チャット注入ON/OFF・一括削除を管理するhook。削除は確認時点のrevisionをCAS送信、reloadで消えた選択IDを掃除。200で終了、404/409で選び直し、その他は確認内容を保持して再試行。同期refで操作を相互排他にし、古いProject応答を破棄。selectionModeだけでは親の開閉をlockしないが、両一覧のactionsLockedとULはlockする |
| `lib/project-memory/topic-delete-limits.ts` | importゼロのclient-safeな一括削除上限（50件）。v205のSQL値との一致を静的テストで保証 |
| `lib/project-memory/chat-inclusion-limits.ts` | チャット注入の正本。`PROJECT_MEMORY_CHAT_MAX_CHARS`（8,000）・コードポイント数の`countProjectMemoryChatChars`・標準4キー（principles → current-work → overview → references）を優先し、その他はtopic_key昇順→id昇順（同一標準キーもid昇順）のlocale非依存比較による`selectChatIncludedTopics`・UI用の`summarizeChatInclusion`。**importゼロのclient-safeファイル**。8,000は本文(`content_md`)の合計上限で、preamble・タグ・meta行は含まない |
| `lib/project-memory/chat-injection.ts` | `buildProjectMemoryChatBlock`。注入対象topicを`buildReferencePreamble()`＋topicごとの参照ブロック（`source="project_memory_topic"`、metaは`topic_key`と`revision`）として1つの文字列にまとめる。対象がなければ`null` |
| `lib/project-memory/instruction-edit.ts` | AI編集のLLM契約（strict JSON）・system prompt・サーバー側定数（`MAX_INSTRUCTION_EDIT_INPUT_CHARS`=20,000、`INSTRUCTION_EDIT_MAX_COMPLETION_TOKENS`=65,536） |
| `lib/project-memory/instruction-edit-limits.ts` | `MAX_INSTRUCTION_CHARS`（2,000）の正本。**importゼロのclient-safeファイル** |
| `lib/project-memory/instruction-edit-client.ts` | edit-previewのfetchとレスポンス検証（許可キー集合まで厳格）、適用（既存PATCH・`edit_kind:"full"`） |
| `lib/project-memory/consolidation.ts` | 整理案のLLM契約・入力構築・応答parse（入力上限20,000文字・出力8,192トークン） |
| `lib/project-memory/consolidation-client.ts` | 整理案の適用（topicごとに既存PATCH） |
| `lib/project-memory/auto-summary-redact.ts` | import-freeの入力マスク純関数。既知形式のメール・キー・トークン・JWT・秘密鍵を固定文字列`[redacted]`へ置換。区切り走査と線形時間のパターンで長文にも対応 |
| `lib/project-memory/auto-summary-limits.ts` | importゼロのclient-safe定数・共有型。AutoSummaryStatsは既存7キーにuser_messages_included（最終採用user発言数）とuser_messages_available（使用スレッド内の対象user発言総数）の2キーを追加。暫定値：最終入力60,000文字（JSON.stringify後のUTF-16長）、1発言1,000文字（マーカー込みのコードポイント数）、最低user発言2件、最大100スレッド、出力16,384トークン |
| `lib/project-memory/auto-summary.ts` | server用。thread全件ページング・並列数4のpreflight・最新user発言順の候補選定・userのみ100件ずつ遅延ページング・骨格込みのN決定とウォーターフィリング・JSON文字数予算・最終統計再計算・LLM strict JSON契約。入力確定はtrimAutoSummaryInput 1回→使用スレッドのcount取得→summarizeAutoSummaryInput 1回に分離し、finalizeAutoSummaryInputは従来シグネチャと副作用を維持する互換wrapper。最終使用スレッドのみ同一述語でhead exact countを並列度4で取得し、user_messages_availableは使用スレッド内だけの対象user発言総数とする（未使用スレッドを除外、削除競合時は採用件数を下限）。user本文・タイトルの既知形式メール／APIキー／トークン／JWT／秘密鍵をimport-free純関数maskAutoSummarySecretsで[redacted]に置換してから切り詰め、予算もマスク後の文字列で計算する。電話・住所・口座番号は入力側の対象外。ENDのない秘密鍵はBEGIN行のみ置換。タイトルは80コードポイント、1発言は1,000コードポイント以内（超過時は先頭約6：末尾約4で中略、マーカー込み）。入力をスレッドごとのJST日付別daysとuser本文文字列配列に圧縮し、同一スレッドと別スレッドの時系列規則を明示。assistant発言の推測・復元を禁止し、指示対象のない短い返答を決定扱いしない。貼り付けAI出力は明示的採用・承認が必要で、中略マーカーは欠落を表す。principlesは、このProject内でのAIの応答・作業の進め方についてユーザーが明示した常設の指示・決定のみ（workflow・開発/執筆規約・制約・出力の好み）。ユーザーの意見・分析・信念・世界についての主張は除外し、overview/current-workでユーザーの見解として帰属を明示。該当する常設指示がなければ空文字列。空にするtopicは説明文・プレースホルダを書かず、exactly空文字列とする（route側は空topicをpreviewから除外）。改行・部分読み・ユーザー未承認のAI提案の除外・必要最小限の重複の規則は維持。strict検証後のcontent_mdを改行補正する。入力はconsolidationと同じJSON.stringify方式、全入力をuntrusted dataとして扱う |
| `lib/project-memory/normalize-literal-newlines.ts` | importゼロの純関数。保護スパン外の文字としてのバックスラッシュ＋nを実改行へ補正。バッククォートのコード範囲・Windowsドライブパス・UNCパス・直前がバックスラッシュの対象を保持。閉じていないコード等の曖昧な範囲は保持し、冪等 |
| `lib/project-memory/auto-summary-client.ts` | bootstrap previewのstrict検証・取得と既存topics POSTの並列適用。empty_topic_keysは必須配列としてexactキー集合に追加し、標準キーのみ・重複なし・topicsと非交差・合計4件以内を検証。statsはカバレッジ2キー込みのexact検証（欠落・余分は拒否）、新件数は非負の安全整数でincludedがconsidered_threadsの合計と一致し、threads_included以上・available以下であることを検証。source_refs配列に本文を含まない来歴を記録し、statsは含めない。201/409/その他を個別分類 |
| `lib/project-memory/use-auto-summary.ts` | 設定を開いた際のeligibility取得、古いProject応答の破棄、APIキー取得、生成・承認・適用結果の管理。全適用結果とnot_applicableで一覧再取得。同じ生成案は再適用しない |

LLMは`lib/internalModels.ts`の`LORE_CHAT_MODEL`（現在`gpt-5.6-luna`）を使用。

### Docs

| ファイル・フォルダ | 役割 |
|-|-|
| `docs/schema.sql` | 本番Supabaseと突き合わせたcanonicalスキーマ |
| `docs/applied/` | 本番適用済み・schema.sqlへ反映済みのマイグレーション履歴。再実行しない（内容は`docs/applied/README.md`参照） |
| `docs/audit/` | 全体監査レポートと監査対応の検証記録 |
| `docs/lore-refactoring-notes.md` | Lore検索経路・責務分割・移行判断のリファクタリング記録 |
| `docs/api-key-flow-inventory.md` | BYOK APIキーの保存・送受信・ログ経路の棚卸し正本 |
| `docs/storage.sql` | Storage bucket・RLS・孤立オブジェクトcleanup関連のSQL正本 |
| `docs/audit/mh-5b-db-verification-2026-08-09.md` | MH-5bのDB実環境確認結果とDisposition |
| `docs/audit/mh-6-npm-audit-2026-08-09.md` | MH-6の依存関係・npm audit再検証記録 |

新しいマイグレーションは `docs/migration_v{n}_{内容}.sql` として追加し、Supabase Dashboard > SQL Editor で手動実行する。適用・schema.sql反映後は `docs/applied/` へ移動する。

### Scripts

- 全テスト（scripts/ のみ）: `npm test`（実体は `node --test --test-reporter=tap "scripts/*.test.cjs"`）。2026-10-07時点で376件。
- mobileを含む場合: `npm run test:all`（実体は引数なしの `node --test`。`apps/mobile/tests/` の2026-10-07時点の32件が加わり、合計408件）。
- 件数はテスト追加に伴って増えるため、上記は時点の値。

テスト108本（`*.test.cjs`）＋`testBootstrap.cjs`＋DB実環境検証`verify-*.mjs` 12本（`scripts/*.test.cjs` の作業ツリー実測・`scripts/verify-*.mjs` の作業ツリーによる更新時点の実測（v206新規ファイルを含む））。

| ファイル | 目的 |
|-|-|
| `scripts/project-memory-summary.test.cjs` / `scripts/project-memory-summary-client.test.cjs` / `scripts/use-project-memory-summary.test.cjs` / `scripts/project-memory-tab.test.cjs` / `scripts/project-settings-memory-sidebar.test.cjs` | サマリ意味論・fail-closed取得・effect前のProject切替／refresh競合応答・Memory主ボタン・Sidebarのrefresh契約を検証 |
| `scripts/attachment-content.test.cjs` | 添付結合のリテラルとのバイト一致・添付なし・raw queryText・split/replaceのラウンドトリップとfail-closedを検証 |
| `scripts/query-text-retention.test.cjs` | 空文字・添付なし・本文不一致・フェンス検証・factory独立性の保持契約を検証 |
| `scripts/query-text-regeneration.test.cjs` | resolver配線・別走査・実コールバックのbody / 再結合 / 検証失敗時の停止 / 中断時の保持を検証 |
| `scripts/ai-context-blocks.test.cjs` | AI参照ブロック生成と本文・属性値無害化の回帰テスト |
| `scripts/api-key-handling.test.cjs` | BYOK APIキーの保存・転送・ログ露出防止を横断検証 |
| `scripts/apply-branch-edit-route.test.cjs` | branch edit RouteのRPC契約・採番・エラー処理を検証 |
| `scripts/auth-callback-route.test.cjs` | 認証callbackのcode交換・Cookie・`next`復帰/onboarding分岐を検証 |
| `scripts/branchTree.test.cjs` | 分岐laneとツリーレイアウト構築を検証 |
| `scripts/calendar-route.test.cjs` | calendar Routeの認証・年月範囲・DB応答を検証 |
| `scripts/chat-system-blocks.test.cjs` | systemブロックの順序・空除外・marker上限とoverflow選択・旧連結のbyte一致を検証 |
| `scripts/chat-lore-search-plan.test.cjs` | 19語全件・非トリガー・temporary・OpenAIキー・novel・対象project有無の検索計画、queryTextのフォールバック・空文字・空白・上限・サロゲート境界を検証 |
| `scripts/chat-pinned-cache.test.cjs` | provider別request捕捉、Pinned cache・全body marker上限・連続system一致・非Claude/Tool Loop/見積もりの旧文字列一致・cached各ブロックとdynamic参照群のpreamble個数を検証。Project Memory topic注入ブロック（memory＋Pinned＋参照の併存・取得失敗・超過topic除外・memory未使用時の旧文字列一致）も検証。refusal時の文言分岐（memory注入あり／なし、memoryのみ／pinnedのみ、Thinking両形式、一回限り、保存本文）とログを検証 |
| `scripts/csp.test.cjs` | CSPヘッダー・report解析・URL無害化を検証 |
| `scripts/github-tool-loop.test.cjs` | Tool Loopの1ファイル1封筒・空本文・成功0件・封筒タグ分断・warnings/preamble非出力とPinned生成・取得上限を検証 |
| `scripts/fetch-github-route.test.cjs` | GitHubファイル取得Routeの認証・取得・失敗契約を検証 |
| `scripts/formatters.test.cjs` | 相対時刻・日時フォーマットを固定時刻で検証 |
| `scripts/loadModel.test.cjs` | モデル設定の保存/復元・fallback・registry由来snapshotを検証 |
| `scripts/logger.test.cjs` | 構造化loggerの許可フィールド（`claudeRefusal`を含む）と機微情報非出力を検証 |
| `scripts/lore-dreaming-clean.test.cjs` | Dreamingの記憶cleaning・失敗時fallback・統合処理を検証 |
| `scripts/lore-openai.test.cjs` | Lore用Embedding/Chat API wrapperのrequest・response・error契約を検証 |
| `scripts/lore-search-policy.test.cjs` | Lore Book（topK 3）・Memory（topK 5、閾値0.3）・query上限（2,000コードポイント）・combined timeout（3,000ms）の検索policyを検証 |
| `scripts/lore.test.cjs` | Loreのmapper・統合・Dreaming・batch train・関連Routeを特性化テスト |
| `scripts/mcp-token-hash.test.cjs` | MCPトークンのSHA-256 hashを既知ベクトルで検証 |
| `scripts/message-delete.test.cjs` | 所有メッセージ・関連Lore・Storage画像の削除契約を検証 |
| `scripts/modelRegistry.test.cjs` | モデル台帳・surface・default・Thinking・料金の整合を検証 |
| `scripts/novel-check-route.test.cjs` | novel-check Routeの認証・入力検証・外部API呼び出しを検証 |
| `scripts/optional-route-auth.test.cjs` | 任意認証Routeの匿名/認証済みCookie・DB/RPC契約を検証 |
| `scripts/pricing.test.cjs` | registry由来料金・費用計算・表示formatを検証 |
| `scripts/project-memory-*.test.cjs` / `scripts/projects-*-route.test.cjs` / `scripts/instruction-edit-client.test.cjs` / `scripts/use-project-memory-topics.test.cjs` | Project Memory API・hook・UI・migration契約の回帰テスト |
| `scripts/project-memory-auto-summary.test.cjs` / `scripts/project-memory-bootstrap-preview-route.test.cjs` / `scripts/auto-summary-client.test.cjs` / `scripts/use-auto-summary.test.cjs` / `scripts/project-memory-bootstrap-modal.test.cjs` | 初回生成の選定・ページング・文字数予算・LLM契約・preview Route・client strict検証・並列作成・eligibility再取得／競合応答・モーダル操作を検証（共通DBモデルは`auto-summary-test-helpers.cjs`） |
| `scripts/normalize-literal-newlines.test.cjs` | 改行補正の固定入出力・コード/パス/連続バックスラッシュのバイト保持・フェンス内外混在・曖昧なコード範囲の保持・冪等性を検証（14ケース） |
| `scripts/project-memory-delete-topics-migrations.test.cjs` / `scripts/projects-memory-topics-bulk-delete-route.test.cjs` / `scripts/project-memory-delete-confirm-modal.test.cjs` | v205のcast前検証・ロック/削除順・権限・50件契約、bulk-delete APIのfail-closed検証・エラー写像、必須チェック・Lore保持案内・focus・送信中ロックを検証。既存hook/両一覧/Sidebar/proxyテストにも一括削除の回帰を追加 |
| `scripts/verify-project-memory-delete-topics.mjs` | test DB固定の手動検証。v205手動適用後に実行し、CASの全か無か・revision cascade・昇格済みLore保持・不正入力P0001・認証42501を検証。通常テスト外、migration適用機能なし |
| `scripts/project-memory-auto-summary-cursors-migrations.test.cjs` | v206の静的テスト12件。migration/schema一致・列/FK/PK/index・RLS/ACL・RPC引数/戻り値・処理順・JSON/UUID/重複・エラー・100件定数・適格性・単調upsert・本文/履歴非変更・再適用と確認手順を検証 |
| `scripts/verify-project-memory-auto-summary-cursors.mjs` | v206手動適用後のtest DB固定検証（ref: jvarrlsqttfjiysaedlg）。auth/anon・前進/同値/後退/UUID順・CAS・不適格候補skip・inactive許可・不正入力・cascade・RLS・直接書込禁止・message削除後保持・本文/履歴非変更をPASS/FAILで確認。環境変数はAUTO_SUMMARY_CURSORS_*、通常テスト外。Codexはnode --checkのみ、DB実行・migration適用はRuiが行う |
| `scripts/verify-project-memory-*.mjs` | 実DB（test環境）向けの手動検証スクリプト。通常のテスト実行には含めない |
| `scripts/proxy.test.cjs` | `proxy.ts`のmatcher・認証境界・redirect・CSP付与をマトリクス検証 |
| `scripts/rate-limit.test.cjs` | rate limiter生成・制限判定・fallbackを検証 |
| `scripts/restore-branch-route.test.cjs` | 分岐復元RouteのRPC呼び出しとエラー契約を検証 |
| `scripts/route-auth-cookie.test.cjs` | Route認証helperのCookie転記・応答確定を検証 |
| `scripts/stats-route.test.cjs` | stats Routeの認証・集計・DBエラー応答を検証 |
| `scripts/storage-cleanup-cron.test.cjs` | Storage cleanup Cronのmode・候補上限・実行記録を検証 |
| `scripts/storage-cleanup.test.cjs` | Storageパス収集・再帰一覧取得・batch削除を検証 |
| `scripts/storage-path-guard.test.cjs` | Storageパスの所有namespace検証をテスト |
| `scripts/testBootstrap.cjs` | Node上でTypeScript/TSXと`@/` aliasを読み込む共通テストbootstrap |
| `scripts/threadResourceCrud.test.cjs` | スレッド配下リソース共通CRUD handlerの認証・query契約を検証 |

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

### ハードコード値監査時の判定基準

route・component・page・lib等のコード内にある数値・文字列のハードコードを監査する際は、
以下の基準を先に適用し、保守性に影響しない箇所への機械的・過剰な指摘を避けること。

**対象化条件（いずれか1つに該当すれば指摘対象とする）**

- **A. 二重定義**：同じ*概念*の値が2箇所以上に存在し、片方だけが更新されうる
  （同じ値でも概念が別なら非該当。例：ページサイズと文字数上限が偶然同じ値でも別概念）
- **B. 境界契約**：client側の表示・入力制限とserver側の検証、またはcaller側の指定値と
  callee側の既定値が、同じ値を前提に成立している
- **C. 手順依存**：モデル追加等の定型作業で、正本以外の複数箇所を手動で同期更新する必要がある

**除外条件**

対象化条件A〜Cのいずれにも該当しない場合に限り、以下の条件を適用して指摘対象から外す。

- **X. 単一箇所・自明**：1箇所にしか存在せず、周辺コードから値の意味が明確に読める
- **Y. テスト期待値**：正本の定数をimportすると、実装と期待値が同時に変わり検証として
  成立しなくなる（本番コード側の共有定数化を妨げる理由にはせず、テスト側の期待値リテラル
  を維持する）
- **Z. 外部仕様固定**：API・プロトコル側で値が固定されており、かつ二重定義・境界契約・
  手順依存のいずれにも該当しない

**格上げ条件**

条件AまたはBに該当し、すでに値または挙動が食い違っている場合は、保守性の問題ではなく
不具合として優先度を上げる。

指摘対象を判定する際は、監査レポートの記載や過去の行番号を現況とみなさず、必ず現在の
実ファイルを確認すること。定義元だけでなく、全caller・参照元、client/server双方、関連
テストも確認し、片側だけが別チケットで先行更新・解消済みのケースや、関数の暗黙デフォルト
に依存しているケースを見落とさないこと。

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

- Project系・Lore系・chat等の認証必須Routeは `requireRouteUser(req)`（`lib/supabase/route-auth.ts`）を使い、返された `user`・`supabase` と `finalizeJson` / `finalizeResponse` を利用する。未認証は401、JSON/応答finalizerは認証時のCookieを最終レスポンスへ転記する。
- Cookie認証ではhelper内部が `createRouteHandlerSupabaseClient(req, authResponse)` を呼ぶ。許可されたAPIのBearer認証ではanon keyとAuthorizationヘッダーを設定した `createClient` を生成し、`auth.getUser(token)`で検証する。不正BearerをCookieへフォールバックしない。
- 任意認証の `/api/explore`・`/api/reports` は `getOptionalRouteUser(req)` を使う。`/api/share/[token]` は `createRouteHandlerSupabaseClient` と `serviceRoleClient` を直接使うため、全Routeが同一のhelperを使うわけではない。
- service roleの実例は、Cronの `createAdminSupabaseClient`、通報RPC用の `createServiceRoleSupabaseClient`、MCPの `authenticateMcpToken` / `serviceRoleClient`。MCPトークン認証はCookie/Supabaseセッション認証とは別経路。
- chatの `waitUntil` は `dbSavePromise` でストリーム内保存の完了を待ち、保存失敗かつ非一時チャットの場合だけ `SUPABASE_SERVICE_ROLE_KEY` でREST APIへフォールバック保存する。

### なりきりモード

- `roleplay_mode = true` のスレッドは公開不可（`handleSaveShare` と `PublishConfirmModal` 両方にガードあり）
- フォーク・セルフコピペ時は `roleplay_mode: false / rp_char_name: null / rp_char_icon_url: null` にリセット（`app/api/threads/[id]/copy/route.ts`）

### モデルID・料金の追加手順（modelRegistry化後）

新しいAIモデルを追加する際は以下の手順で対応する：

1. `lib/modelRegistry.ts` の `MODEL_REGISTRY` へエントリを追加する。`provider`・`status`・`surfaces.chat`・`surfaces.arena`・`thinking`・`pricing`を設定する
2. `types/index.ts` の該当するUnion型へモデルIDを追加する。registryとの双方向型チェック（`AssertNever`）が型エラーにならないことを確認する
3. `components/ChatInput.tsx`・`app/api/chat/route.ts`・`app/api/arena/route.ts` は通常変更不要。`MODEL_CONFIG`・許可判定・デフォルト・Thinking対応表示はいずれもregistryから自動的に導出される
4. API形式が既存モデルと異なる場合のみ、対応するrouteへ個別実装を追加する（例：専用エンドポイント、request body形式、streaming方式）。gpt-5.5-proはこの例外に該当し、`app/api/chat/route.ts`・`app/api/arena/route.ts`の両方で`/v1/responses`分岐を実装済み
5. `lib/pricing.ts` は通常変更不要（`getPricing`の再exportのみのため）。`calcCost`・`formatUSD`自体の仕様変更がある場合のみ変更する

---

## 既知の地雷

### Git関連

| 地雷 | 説明 |
|-|-|
| force push 禁止 | `--force` でv133〜v136のコミットが消えた前例あり。絶対に使わない |
| コンフリクト復元手順 | `git merge --abort` → `git fetch origin` → `git reset --hard origin/main` |

### スマホ対応関連

- スマホ判定ブレークポイントは **768px** で統一。`app/page.tsx` の `matchMedia("(max-width: 767px)")` と、`ChatInput.tsx` / `ChatInputCentered.tsx` が共有する`lib/inputUtils.ts`の`isMobileViewport()`を同時に確認する
- iOS Safari の `matchMedia.addListener` フォールバック（`app/page.tsx`）は削除しないこと（古いiOSで動かなくなる）
- **iPhone実機での動作は未確認**。サイドバードロワー・ヘッダー・＋ドロップアップ・モデルドロップダウン・会話履歴ドロワー・ソフトキーボード表示時の位置を要確認
- `isToolMenuOpen`（＋ドロップアップ）と `openModelProvider`（モデルドロップダウン）は排他制御
- スマホ対応の詳細な変更履歴・地雷は `KabeHub_スマホレスポンシブ対応_引き継ぎ_20260624_v166.md` を参照

### 送信キー設定関連（v163）

- `loadEnterMode()` / `isMobileViewport()` はMH-3で`lib/inputUtils.ts`へ共通化済み。送信キー・モバイル判定を変更するときは共通helperと両入力コンポーネントの利用箇所を確認する
- LocalStorageキー: `kabehub_enter_mode`（`"send"` または `"newline"`）
- `MessageBubble.tsx` の editRegen textarea は `enterMode` 設定と独立して Ctrl/Cmd+Enter 固定（意図的な仕様）
- `app/arena/page.tsx` の人間ターン入力は変更対象外（Enter送信のまま）

### `proxy.ts` の認証境界対応表

正本は `lib/proxy-paths.ts` のコメントと `scripts/proxy.test.cjs` のマトリクステスト。
本表はそれらの要約であり、判定ロジックを変更したら本表も手動更新すること。

| パス種別 | matcher | セッション確認 | 未認証時・備考 |
|---|---:|---:|---|
| `/`・`/settings/*`・`/admin/*`・`/stats`・`/memory`・`/library`・`/album`・`/arena`・`/calendar`・`/image`・`/novel-check`・`/threads/[id]/tree` | ○ | ○ | ページなので `/login?next=...` へ307 |
| `/login` | ○ | ○ | 未ログインは表示、ログイン済みは `/` へ307 |
| `/arena/[token]`・`/share/[token]`（公開閲覧ページ） | ○※ | ✕ | 未認証でも閲覧可。CSPのみ付与 |
| その他の通常ページ（`/auth/callback`含む） | ○※ | ✕ | CSPのみ付与。ページ・Route自身の実装に委ねる |
| 一般の保護API | ○ | ○ | 未認証は JSON 401 |
| `/api/explore` | ○ | ○ | セッション取得は試すが、未認証でも通過（`isPublicOptionalAuthApi`） |
| `/api/share/[token]` の GET/HEAD | ○ | ✕ | 公開読み取り（`isPublicShareReadApi`） |
| `/api/share/[token]` の POST・子Route（fork等） | ○ | ○ | 原則保護 |
| `/api/mcp`・`/api/mcp/*` | ✕ | — | MCP Bearer認証（`isMcpBearerApi`） |
| `/api/reports`・GitHub callback・Cron・CSP report | ✕ | — | 各Routeの独自契約 |

※通常ページのprefetchはmatcherの`missing`条件により起動しない場合がある。

### `next` 往復の認証境界

`next` の生成・許可・正規化判定の正本は、`lib/proxy-paths.ts` の
`isProtectedRedirectPath()`・`isShareRedirectPath()`・
`resolveAllowedNextRedirect()` とテストである。変更時は `proxy.ts`・
`app/auth/callback/route.ts`・`scripts/proxy.test.cjs`・
`scripts/auth-callback-route.test.cjs` を必ず同時に更新すること。

### MCP関連

- `/api/mcp/*` はBearer認証のため、`proxy.ts`の`config.matcher`に `/api/((?!mcp).*)` が必要
- APIクライアントからは必ず `https://www.kabehub.com` を使う（`kabehub.com` へのリクエストは www. へ307リダイレクトされ、Authorizationヘッダーが消える）
- 現行MCPの確定実装範囲は主要ファイル表のMCP節を正とし、拡張ツールは「MCP拡張ロードマップ」の別トラックとして扱う

### RAG関連

| 地雷 | 説明 |
|-|-|
| OpenAI APIキー必須 | batch-train・Embedding生成・記憶統合はすべて `text-embedding-3-small` を使用。モデル変更は全レコード再生成が必要なため事実上不可 |
| extraction_version 保護 | `user_edited` / `user_created` / `liked_ai` のレコードはDreamingバッチで自動変更しない |
| is_pinned 保護 | `is_pinned = true` のレコードは時間更新バッチの自動expired化から保護する |
| embedding カラム非公開 | `lore_embeddings.embedding` は絶対にGETレスポンスに含めない |
| Loreレスポンス列 | `GET /api/lore`・`POST /api/lore`・`POST /api/lore/consolidate/merge`・`GET /api/lore/dreaming-batch/history` は `is_manually_corrected` を含む。`PATCH /api/lore/[id]` は従来から同列を含む |
| ペア正規化 | `lore_consolidation_dismissals` のペアは必ず `lore_id_a < lore_id_b` に正規化する |
| dreaming threshold | **本番では 0.92 を使う**（v139で復旧済み） |
| RPC自己結合性能 | `find_similar_lore_pairs` はO(n²)。大量記憶時は `find_similar_lore_pairs_v2`（LATERAL KNN方式）を使う |
| batch-train対象 | **userメッセージのみ**。`role = 'user'` / `provider != 'memo'` / `provider != 'image_gen'` で絞り込み。AI発言の記憶化は「👍 記憶に追加」ボタンで対応 |
| liked_ai保護 | Dreaming保護条件は `extraction_version NOT IN ('user_edited', 'user_created', 'liked_ai')`。全RPCに適用済み |
| v_found_count カウンター | `consolidate_dreaming_batch_multi` の件数検証はFORループ内のカウンター方式。FORループ後の `GET DIAGNOSTICS` はPostgreSQLの仕様で件数が取れない |
| チャット記憶検索の発火条件 | トリガー19語と検索条件は `lib/lore/chat-search-plan.ts` の `buildChatLoreSearchPlan` に集約済み。memory に一本化し、Lore Book とクエリが同一ならembeddingを共有、異なれば並列生成して検索する。temporary チャットでは記憶検索を行わない。通常Web送信の添付本文によるMemory誤発火・入力超過は解消済み（B2-2、2026-10-04）。再生成・分岐編集は同一ページセッション内は保持した手入力を再利用。再読み込み後・保持前のメッセージ・本文が別経路で変わったメッセージ・mobile・旧クライアントは従来どおり userContent 全文へフォールバック。 |
| queryText保持と編集対象 | 保持の信頼条件は「記録時の content と現在の message.content の一致」とsplit検証。lightはorderedMessagesの直前user（memoを含む）、branchはvisibleMessagesの直前非memo userを対象にするためlightEditQueryText / branchEditQueryTextを分ける。別経路の本文変更で自動的に無効化し、forgetを各経路に散らさない。 |
| Supabase スキーマキャッシュ | RPC追加・変更後にAPIから `schema cache` エラーが出たら `NOTIFY pgrst, 'reload schema';` を実行 |

### BYOK APIキー関連（H-21）

- **リスク受容**: APIキーはLocalStorageに平文保存され、同一オリジンでXSSが発生した場合は生キーが読み取られうる。「CSP Enforce切替・運用ロードマップ」のEnforce切替後は発生確率が下がるが、許可済みスクリプトの侵害等に対する完全な防御ではない。本リスクは受容し、H-21はリスク受容＋H-21Cへの将来移管としてクローズする
- **CSPの現状**: 現在はReport-Only運用中。Enforce切替は「CSP Enforce切替・運用ロードマップ」の別運用タスクであり、APIキー経路修正と混同しない
- **送受信経路**: `docs/api-key-flow-inventory.md`を正とし、固定件数ではなく横断grep結果に追随して更新する
- **Gemini外部転送**: KabeHubからGoogle APIへは`x-goog-api-key`を使う。URLクエリ`?key=...`へ戻さない
- **H-21C（未着手・将来検討）**: BYOK資格情報の任意暗号化同期・複数端末対応。ローカル保存は廃止せずオプトイン同期とし、既存LocalStorageキーは明示操作でのみ移行する。生キーをブラウザへ返すAPIは作らず、登録・置換・削除だけを提供する
- **H-21C暗号化候補**: ①AWS/GCP KMS＋Vercel OIDC Federation、②AES-256-GCM＋Vercel Sensitive Environment Variable、③Supabase Vaultの順で検討する。生キー窃取とKabeHub経由の不正利用を分けて脅威モデル化し、規約改訂・明示同意を必須とする。Capacitorモバイル化前に再評価する

### Project Memory関連

| 地雷 | 説明 |
|-|-|
| 設定ドロワーの保存方式 | 指示・参照は「保存」で設定を反映。Memory操作は個別に適用され、「保存」は不要。フッタはmarginTop:auto＋paddingTop:16pxで下端に置き、長い内容ではパネル下に続く（stickyなし） |
| Memoryサマリの意味 | チャット注入ONと現在注入は別概念。ONでも空本文・合計8,000字の選択から外れたtopicは現在注入に数えない。Lore登録済みはcurrent／staleの検索対象であり、会話ごとの参照を保証しない。currentを注入条件として扱わない。チャット未注入・Lore未登録は非注入かつnot_promotedのみ |
| Memoryサマリのrefresh契約 | SidebarのrefreshTokenを+1する3か所：①一覧モーダルonCancel（無条件）②整理applyが結果を返した直後（applied件数によらず、全件failedも対象）③自動要約apply wrapperのfinally（引数・戻り値・rejectをそのまま通し、Promise完了後に更新）。既存useAutoSummary／useProjectMemoryTopicsは変更しない |
| 新Route追加時の登録 | `app/api`配下にRouteを追加したら`lib/proxy-paths.ts`の`API_AUTH_CLASSIFICATIONS`へ登録が必須。`scripts/proxy-paths.test.cjs`が全route×methodに分類がちょうど1件あることを検証するため、未登録だと確実に失敗する |
| 自動要約の最終発言時刻 | `threads.updated_at`は通常チャットで更新されないため最終発言時刻に使わない。対象user messagesの最新`created_at`をpreflightで取得して候補を並べる。considered_threads.last_message_atも最新user発言時刻 |
| 自動要約のNULL扱い | `roleplay_mode`はfalseとNULLを通常スレッドとして採用（`.or("roleplay_mode.is.null,roleplay_mode.eq.false")`）。`is_active`もtrueとNULLを採用（`.or("is_active.is.null,is_active.eq.true")`）。単純なeq/neqではNULLが落ちる |
| 自動要約の1,000行境界 | thread一覧もmessageも`.range()`でページングする。threadはid順を固定、messageはcreated_at降順＋id降順。preflightと本文取得の絞り込みは同一helperを共有する |
| `MAX_AUTO_SUMMARY_INPUT_CHARS`の意味 | 本文合計ではなく、JSONエスケープ・topic役割・タイトル・JST日付と配列を含めたJSON.stringify後の最終userContent.length（暫定60,000）。最終トリム後にconsidered_threads/statsを再計算する。clientはimportゼロのauto-summary-limits.tsを参照 |
| 自動要約のuser発言カバレッジ | auto-summary.tsはウォーターフィリングと防御的トリム後に1件以上残った使用スレッドのみ、本文/preflightと同じtargetMessages述語＋role=userでhead:true・count:"exact"を並列度4で取得する。エラーと不正countはAutoSummaryDbErrorで失敗させる。user_messages_includedは最終considered_threadsのincluded_message_count合計。user_messages_availableは使用スレッド内の対象user発言総数だけで、未使用スレッドを含めない。削除競合では各スレッドの最終採用件数を下限とする。finalizeの件数Map省略時はトリム前件数へfallback。statsの9キー構成・カバレッジ整合・source_refsは維持 |
| 自動要約の入力形式・プロンプトv8 | `{requested_topics,threads:[{thread_id,title,days:[{d:"YYYY-MM-DD",m:["userの本文","userの本文"]}]}]}`。mはuser本文の文字列配列（roleラッパーなし）、assistantは入力に含めない。dはcreated_atをAsia/Tokyoに変換した日付。daysは日付昇順、同日内はcreated_at昇順（同時刻は既存表示順）。last_message_atとメッセージごとのcreated_atはLLM入力から除外し、出典のconsidered_threadsは維持。同一スレッドの配列順は時系列、別スレッド同日の前後関係は不明として明示的な撤回・訂正以外で上書きを推定しない。日付をスレッド最終更新日で代用しない。v7で追加した秘密情報・個人識別子を全topicから除外し、マスク形・プレースホルダ・省略注記も禁止。[redacted]への言及・復元推測も禁止する2行を維持。v8では各項目の詳細を最も適した主topicに置き、他topicには独立して理解するための最小限の文脈のみを記載する。overviewは安定した高水準の背景、current-workは進行中の作業や現状、referencesは詳細仕様・設定・参照情報を担当し、重複を抑える。v4の空文字・プレースホルダ禁止・principles定義とC-1の時系列ルールは文言を維持 |
| 自動要約の採用数と配分 | 最新user発言順・最大100候補から、requested_topicsと各thread_id/title/days:[]を実シリアライズしたskeleton(N)にN×MIN_THREAD_MESSAGE_BUDGET（1,500）を加えて60,000以内となる最大Nを採用。初回ページのみ並列数4で先読みし、以降は必要なスレッドだけ100件ずつ取得。未完了スレッドの採用本文.length合計が最小のもの（同点は新しいスレッド）へ次に新しいuser発言を1件追加するウォーターフィリング。JSONの正確な増分で判定し、超過時はそのスレッドのみ完了・omitted=true、他は続行。発言が尽きたら完了。新しい側から連続区間を採用し、最終buildAutoSummaryInputの実長確認と防御的トリムを維持 |
| 自動要約の空topic | previewのempty_topic_keysはmissingのうちLLMがcontent_md.trim() === ""を返したキーのみを標準キー順で保持する。既存topicのキーは含めず、非空topicsと非交差。preview時は空配列でも必須。全件空のnot_applicable: insufficient_evidenceには追加しない。statsの9キー・プロンプトv8は維持 |
| 自動要約の`source_refs` | 必ず`[{type:"auto_summary",run_id,model,prompt_version,considered_threads}]`という配列で送る。オブジェクト単体は400。会話本文・タイトル・指示文・empty_topic_keysを入れない。empty_topic_keysはapplyのリクエストボディにも含めない |
| 自動要約の標準キー | overview / current-work / principles / referencesの未作成キーだけを生成。current-work（ハイフン）とcurrent_state（アンダースコア）は別キー。current_stateや既存topic本文は入力に含めない |
| 自動要約apply後のeligibility | applied/conflict/failedのすべてでtopics一覧を再取得する。特に409後に古い不足キーを保持しない。not_applicableでも再取得。古いProjectの応答／再取得が新Projectの状態や進行中GETを無効化しないようにguardする |
| `MAX_INSTRUCTION_CHARS`の置き場 | `instruction-edit-limits.ts`が正本。`instruction-edit.ts`は`@/lib/lore/openai`（→logger）をimportするため、clientから直接importするとサーバー側コードがbundleに入る |
| `parsePreview`との同期 | edit-previewのレスポンスに項目を足す場合は`instruction-edit-client.ts`の`parsePreview`（許可キー集合）も同時に更新する。さもないとfail closedで編集不能になる |
| AI編集のLLM契約 | `applicable:true`は`new_content_md`/`summary`のみ、`false`は`reason`のみ。未知キー・非空本文の空化・不正形式はすべて502。本文が同一なら`no_change` |
| 409/404はterminal | AI編集の適用で409/404を受けたらpreviewは失効。古い`new_content_md`を再適用しない。通信・5xx失敗は同じpreview（同じ`expected_revision`）で再試行可（CASで二重適用されない） |
| previewの存在期間 | hookの`instructionEdit.preview`が存在してよいのはphaseが`preview`/`applying`の間だけ。`backToInstructionInput`・キャンセルで必ず破棄する |
| 操作の排他 | AI編集中・再昇格確認中（`pendingConfirm`）は別の昇格・アップロード・AI編集を禁止（hookのrefと`isActionLocked()`、一覧の`actionsLocked`）。確認中は親一覧の閉じる/Escape/背景クリック・Projectの折り畳みも禁止。確認モーダルのキャンセルは送信中禁止。`selectUploadFile`は`await file.text()`後にも再確認する。DLはlockしない。チャット注入のON/OFF中も同様にlockする |
| 親モーダルのEscape | `ProjectMemoryListModal`はレンダー時stateと同期refの二重guardで、編集モーダル表示中の親Escapeを無効化している |
| 生成キャンセル | client側fetchのabort＋UI反映停止のみ。`chatCompleteMini`は`signal`非対応のため、upstream OpenAI処理の停止は保証しない |
| 昇格のstale | AI編集・UL等でtopicの`revision`が上がると、追加のDB処理なしで自動的に`stale`（「更新あり」）になる。新revisionへの再昇格は旧active Loreをarchived/supersededにする。v202では通常APIが`user_edited`の置き換え確認を要求し、承認後に置き換える。Project削除の4引数呼び出しは第5引数NULLで従来どおり確認を省略（v201/v202は無変更） |
| 再昇格確認の正本 | UIの`stale`表示だけを条件にしない。GETがactive複数件を`not_promoted`へ倒すため、「未昇格」からでも同revision行がなければ旧active Loreを置き換える経路がある。v202以前の昇格RPCは`user_edited`も確認なしにsupersedeしていた。現行はサーバーの409主導で、routeのpreflightに加えRPCが置き換え対象をUUID順に`FOR UPDATE`して編集状態・承認IDを再検証する |
| 昇格RPCの第5引数 | `p_acknowledged_edited_lore_ids uuid[] default null`。通常APIは未承認時も`[]`を渡してガードを有効にし、確認後は409の対象IDを渡す。NULLはガードなしの互換動作で、v201のProject削除は4引数の位置指定呼び出しを維持。同revisionの既存ID返却は確認ガードより前に終了する |
| 昇格409とhook | `edited_lore_needs_confirmation`＋`edited_lores`の409だけが確認モーダル用の特別扱い。その他の409（`promotion_restore_unavailable`等）は確認を解除し、一覧再取得後にエラー表示。成功は`created`/`restored`を厳格検証せず確認を解除して再取得するため、`restored:false`も成功として扱う |
| 同revisionの再昇格 | 同一user+topic+revisionのLoreはarchived/supersededを含め最大1件（unique index）。通常APIはarchivedかつ`superseded_by=null`の同revision行を専用RPC `restore_archived_project_memory_promotion`（v203）で復元し、`is_archived=false`のみ更新（編集本文・embedding・`user_edited`等は保持、Embedding再生成なし）。他active行があれば409で拒否し、RPC内で既にactiveなら`restored:false`の200。superseded同revisionは対象外で従来のEmbedding→昇格RPC→`created:false`を維持し、Embedding前の409 short-circuitは別チケット。既存昇格RPC・Project削除の経路は従来どおり |
| 復元とOpenAIキー | v203の復元ブランチはroute単体ではOpenAIキー不要。ただし現行hookは`canPromote`が偽だと操作を開始せず、一覧もボタンを無効化する。GETはarchivedを見ず新規/復元を判別できないため、UIからキー無しで復元できる仕様にはなっていない |
| チャット注入の方式 | `project_memory_topics.include_in_chat`（default false）で**topic単位のopt-in**。ONのtopicは、そのProjectの通常チャットのsystemに毎回入る（一時チャット・未分類チャットは対象外）。昇格Lore検索とは別経路で、**昇格済みかつONのtopicは検索経由でも同内容が参照される場合がある**（許容済みの重複） |
| メモ保存とチャット注入 | `isMemo:true` はuser message保存後・AIコンテキスト構築前に早期returnするstorage-only経路。Project Memory topic・Lore/RAG・Pinned/GitHub・AI provider呼び出しの対象外。通常メモのほか `/image` 入力ログ・Novel Check（Web版・mobile版）の保存処理でも利用される。「メモをAIに送る」は本文を入力欄へ戻すだけで、その後は通常送信なのでProject Memory注入の対象になる |
| 8,000字の意味 | `PROJECT_MEMORY_CHAT_MAX_CHARS`は**topic本文(`content_md`)の合計**で、system全体の大きさではない。数え方はコードポイント（JSの`[...text].length`とPostgresの`char_length`が一致）。preamble・タグ・meta・区切りは含まない。選択順は principles → current-work → overview → references → その他（topic_key昇順→id昇順、locale非依存）。標準キーは大文字小文字・末尾空白を含め完全一致のみ（Mapで判定）。同じtopic_keyはid昇順。空白のみの本文は除外し、入らないtopicは丸ごとskipして後続を続ける（skip-and-continue）。未注入一覧も同じ比較順 |
| ON時の上限保証 | 上限チェックはRPC（v204）側でON時点のみ（上限値はSQLに直書き）。ON後にAI編集・ULで本文が増えるのは許容し、チャット側のselector（超過topicはskipして後続を続行）が最後の防衛線。OFFは常に許可。DBの空判定は`btrim`、JSは`trim`で、差はDB側が保守的 |
| selectorのcapはDB取得量を制限しない | チャット側の8,000字上限は注入量の制御であり、取得するDB行数・サイズの上限ではない（ON後に肥大化したtopicも一旦取得してから選別する） |
| ON/OFFとupdated_at | トグルはtrigger経由で`updated_at`を更新する（同値の再送はRPC内のearly returnで更新なし）。`revision`と履歴は変えない。`updated_at`は「行の更新時刻」であり本文の更新時刻ではない。整理(consolidate)のLLM入力にも`updated_at`が含まれる |
| 参照ブロックの無害化 | `topic_key`は`sanitizeAttributeValue`を通す。本文は`sanitizeReferenceText`。preambleは動的な参照ブロックとmemoryブロックの両方に入るため、併存時は全プロバイダーで重複するが許容（memoryブロックのバイト決定性のため、自前でpreambleを持つ） |
| チャット注入UIの排他 | トグル中は他の昇格・アップロード・AI編集を開始できず、逆に実行中はトグルも開始できない（hookのrefと`isActionLocked()`の双方向）。トグルは楽観更新せず、完了後に一覧を再取得する。失敗時は「reload→setError」の順（reloadがerrorをクリアするため） |
| refusal時の誘導文 | memory注入あり（cachedSystemBlocksにラベル`project-memory-topics`のブロックがある）のClaude `stop_reason: "refusal"`では、本文末尾に原因の可能性を示す1文（「…Project Memoryの「チャットに含める」がONのtopicが原因の可能性があります」）を追記する。注入なしは従来文言のまま。判定は`streamClaude`内でラベルから導出し、`streamClaude`のシグネチャは変えない。追記文は他の本文と同様にassistantメッセージとしてDB保存され、後続の履歴に入る（履歴からの除外は未実装）。ログは`[claude-refusal]`（`logger.claudeRefusal`）で、`memoryTopicsInjected`・`pinnedInjected`・`modelId`のみ出力する。本文・topic_keyは出さない。非Claudeプロバイダーの拒否相当（OpenAIのcontent_filter、GeminiのSAFETY等）は未対応 |
| ONのtopic内容とrefusal | ランダムな文字列の羅列など難読化に見える本文のtopicをONにすると、Claude（claude-sonnet-5で確認）が`stop_reason: "refusal"`を返し、そのProjectのClaudeチャットが送れなくなることがある。解除はトグルOFF。API側の判定基準は未確認の仮説（実装不具合ではない）。実機確認で長文topicを作るときは、自然な文章を使う |
| `git add`のパス | `[projectId]`・`[topicId]`を含むパスは引用符で囲む。`git add`を飛ばして`git commit`すると何もコミットされない |

### チャット・UI関連

| 地雷 | 説明 |
|-|-|
| ローカルGoogleログイン | OAuthリダイレクト先が本番URLなのでlocalhost認証は不可。本番で確認する |
| shared_at 後方互換 | 既存の公開スレッドは `shared_at = null`。フィルターを無条件に適用すると既存スレッドが全件消える |
| upsertのtitle必須 | `threads/[id]/route.ts` のupsertがINSERTに回った場合、titleが必要。`title: thread.title \|\| "無題"` を必ず含める |
| remark-gfm の [[text]] 誤認識 | shareページのYOUメッセージはMarkdownRendererを経由せずプレーンテキストで `.replace(/\[\[(.+?)\]\]/g, "████")` する |
| フォルダ（Project）名変更の整合性 | 名前変更は`PATCH /api/projects/[projectId]`（`rename_project` RPC）に一本化されている。関連4テーブルの`folder_name`はRPCが同期するため、個別にUPDATEしない |
| Claude system block | Claude system block の順序は stable(cache) → memory(cache・存在時のみ。`project-memory-topics`) → pinned(cache・存在時のみ) → dynamic(no cache)。空ブロックは作らない。Project Memory topicは複数でも**1つのcachedブロック**にまとめる（marker増加を避ける）。cache_control は message anchor を含めリクエスト全体で最大4個（system側は常に最大3、1枠をmessage anchor用に予約）。非Claude・Tool Loop・トークン見積もりは `buildCombinedSystemPrompt` と `cachedInsertionIndex` で同じ順序の文字列を復元する。Pinnedは `github_pinned_file` のコード封筒列を使う。Project MemoryとPinnedの各cachedブロックは自己完結でpreambleを各1個持つ。dynamicの参照群（lore_book / memory / Tool Loop）はrouteの `appendReferenceBlock` で最大1個。system全体でpreambleが常に1個とは限らない |
| Prompt Caching ヘッダー | `anthropic-beta: "prompt-caching-2024-07-31"` が必須。外すとcache_controlが無視される |
| [[text]] マスク記法 | `MarkdownRenderer` は `variant="share"` のときのみマスクが動く。variant指定を忘れると素通りする |
| MessageBubble の pre-wrap | `isMemo` のみ `whiteSpace: "pre-wrap"`。user・assistantは `MarkdownRenderer` 経由でproseレンダリング |
| OpenAI の max_tokens | `gpt-4o` は `max_tokens`、`gpt-5.4-mini` 以降は `max_completion_tokens`。`streamOpenAI` 内で分岐済み |
| OpenAI の stream_options | `stream_options: { include_usage: true }` が必須。外すと `[OpenAI Cache]` ログが出ない |
| gpt-5.5-pro専用分岐 | `streamOpenAI`・Arenaの`callOpenAI`内で`modelId === "gpt-5.5-pro"`の場合のみ`/v1/responses`へ分岐（Chat Completions API非対応のため）。chat側は一括取得してenqueueする擬似ストリーム、Arena側は非ストリーミングで一括取得する |

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
| v175 | GitHub OAuth stateの`expires_at`検索用インデックス追加（migration v175。コミット7b29eac） |
| v176 | updated_atトリガー関数の統合・未使用Dreaming RPCの整理（コミットe989d57） |
| v177 | ユーザー手動編集Loreマージの単一トランザクションRPC化（`merge_user_edited_lore_pair`。コミット544dcf5） |
| v178 | メッセージ分岐復元の単一トランザクションRPC化（コミットd5661ff） |
| v179 | 分岐編集の単一トランザクションRPC化（`apply_branch_edit`。コミット590cac7） |
| v180 | 旧likesカウンターRPC（`increment_likes_count`／`decrement_likes_count`）の削除（コミット642fb0c） |
| v181 | AI利用コスト計測基盤追加（`ai_usage_events`。コミット8d58705） |
| v182 | Project Memory Manager Phase A（Project・topic・revisionテーブル新設、既存3テーブルへの`project_id`追加とRLS。コミット4e8c951） |
| v183 | Phase B（folder_nameからProjectを作成し、既存3テーブルの`project_id`をbackfill。コミット7b99f41） |
| v184 | Project Memory topic作成・更新RPC（全体／部分編集・revision競合検出・revision履歴保存・authenticated限定。コミットdeb2d77） |
| v185 | Phase C（Project取得／作成RPC、folder_name書き込み時の`project_id`併記、Lore統合時の`project_id`継承。コミット739d4da） |
| v186 | Phase D（`project_id`版Lore検索RPC追加、チャットの設定取得・記憶検索を`project_id`基準へ移行。コミットa5c6614） |
| v187 | Phase E-1（旧folder_name版Lore検索RPCの3シグネチャ削除。コミット3b3058c） |
| v188 | Phase E-2（`project_id`版の類似Loreペア検索RPC追加。コミット8cc5f59） |
| v189 | Phase E-2（手動Loreマージに`project_id`一致ガードを追加。コミットbda2567） |
| v190 | Phase E-2（旧folder_name版の類似Loreペア検索RPCの削除。コミット474c6d8） |
| v191 | Phase E-3（`project_id`版のLore時系列ステータス更新RPC追加。コミットcb6d0cd） |
| v192 | Phase E-3（旧folder_name版のLore時系列ステータス更新RPCの削除。コミットc00fe47） |
| v193 | folder_settingsをproject_settingsへ改称（テーブル・制約・インデックス・RLS・トリガー。コミット3e8f2c1） |
| v194 | Project物理削除RPC（`delete_project_preserving_contents`。スレッド・Lore・topic保持、任意のtopic Lore昇格。昇格処理はv201で共通RPCへ統合。コミットf5ae9c0） |
| v195 | Project名変更RPC（所有権検証・行ロック・関連4テーブルのfolder_name同期。コミットc563e7c） |
| v196 | project_settingsのproject_id契約（folder_nameのNOT NULL解除・UNIQUE (user_id, project_id)追加。コミットe935a64とmigration/schemaで確認） |
| v197 | Project Memory Manager Phase 5A（project_id専用のDreaming／手動LoreマージRPCを3本追加、旧RPCは維持。migration `migration_v197_project_memory_dreaming_by_project.sql`。コミット6a4ba0b） |
| v198 | Phase 5C依存除去（Dreaming／手動Loreマージ・Project名変更／削除RPCを`lore_embeddings.folder_name`非依存へ更新。migration `migration_v198_project_memory_dreaming_final.sql`。コミット2b590a2） |
| v199 | Phase 5C Contract（旧Dreaming／手動LoreマージRPC3本・旧インデックス・`lore_embeddings.folder_name`列を削除。migration `migration_v199_lore_embeddings_folder_name_drop.sql`。コミット2b590a2） |
| v200 | Project Memory topicのLore昇格RPC追加（`promote_project_memory_topic_to_lore`・revision単位の重複防止unique index・active昇格Lore検索用index・旧active Loreのsupersede。Lore Book検索のarchived／superseded除外を修正。migration `migration_v200_project_memory_topic_promotion.sql`。コミット3cf0253） |
| v201 | Lore昇格ルール Phase 3（`delete_project_preserving_contents`の昇格処理をv200のRPCへ委譲し、source_revision付きmetadata・冪等性・supersedeを削除経路へ統合。migration `migration_v201_delete_project_promotion_delegation.sql`。コミットe80c415） |
| v202 | Project Memoryの手動編集済みLore再昇格確認（専用409・共通確認モーダル・RPCの承認ID再検証。コミットa0e73fb） |
| v203 | Project Memory同revisionのarchived昇格Lore復元（専用RPC・本文/embedding保持。コミット4526438） |
| v204 | Project Memory topicのチャット注入（`include_in_chat`列・`set_project_memory_topic_chat_inclusion` RPC・topic単位のopt-in。チャットへの注入・PATCH API・一覧のトグルと使用量表示。migration `migration_v204_project_memory_chat_inclusion.sql`。コミットc7e2eae／fac3277／72140ad） |
| v205 | Project Memory一覧（Sidebar・`/library`）の一括削除（50件まで、全件所有確認＋revision CAS、Project→topic id順ロック）。revision履歴ごと削除し、昇格済みLoreは残す。「選択→削除ボタン→確認モーダルの必須チェック」の二段階確認（履歴の完全削除を常に確認し、昇格済みを含む場合はLore保持・再昇格時の重複も確認）。本番適用済み、`docs/applied/migration_v205_delete_project_memory_topics.sql`へ移動・`docs/schema.sql`反映済み。実装コミット895d681 |
| v206 | 自動要約Phase 1aのtopic×thread消費位置テーブル・前進RPC（100件、topic revision CAS、本文/履歴とは独立）。`docs/migration_v206_project_memory_auto_summary_cursors.sql`に作成、`docs/schema.sql`反映済み。未適用、Ruiが手動適用後にapplied/へ移動。アプリ連携はPhase 1b |

> v174までの履歴に、v175以降は実ファイル・git logで確認できた上記項目だけを追記。以降のProject Memory機能全体は「API Routes（Project Memory）」・「Project Memory関連」節と `docs/applied/README.md` を参照。
> v175以降はmigration番号を基準とし、`docs/applied/README.md`の台帳と対応する。v174以前は機能の変更履歴番号であり、番号体系が異なる。
> Arena利用量記録（コミット89d9363）は当時「v182」と呼ばれたが、migration v182（Project Memory Phase A）とは別物。
> コミット日とDB適用日は一致しない。適用状況は`docs/applied/README.md`と`docs/schema.sql`冒頭を参照。
> migration v182・v184の冒頭コメントに残る「未適用」の記述は古く、台帳とコミット記録では適用済み。
> v175〜v205のmigrationは、`docs/applied/`と`docs/`直下に番号が存在するものをすべて表に記載（欠番を除く）。

> v133〜v159の詳細変更履歴（RPC定義・設計判断メモ含む）は `KabeHub_引き継ぎ資料_20260615_v159.md`、v160〜v172の詳細は `KabeHub_変更履歴アーカイブ_v160-v172.md` を参照。

---

## 既知の課題（未解決）

- **iPhone実機確認未了**: モデルドロップダウン・サイドバードロワー・ヘッダー・＋ドロップアップ・会話履歴ドロワー・サイドバー折り畳みボタンの動作確認
- `ProfilePage.tsx` の日本語テキストが英語になっている（v112でCodex文字化け対処のため・手動修正要）
- 画像生成 Tech Debt（sharp圧縮・pg_cron自動削除・⭐Saveボタン・設定ページのデフォルトプロバイダー選択UI）
- GitHub連携 Pinned Files失敗時のUI通知未実装（現状はconsole.warnのみ）。近接するUI改善ロードマップへ合流
- Phase Bその3（③''の④''をさらに編集した④'''がツリーに表示されない・原因未調査・優先度低）
- サイドバー折り畳みの `ResizeObserver` 未実装（幅変化時のtextarea高さ再計算）

---

## 次に実装予定

**iPhone実機確認**
- モデルドロップダウン・ソフトキーボード表示中の位置
- サイドバードロワー・ヘッダー・＋ドロップアップ
- サイドバー折り畳みボタン・アイコンバー
- 入力欄フッターの左端揃え・背景透過の見た目確認

**個別ロードマップへ移管済み**
- H-01（CSP Enforce切替）→「CSP Enforce切替・運用ロードマップ」
- H-23（PWA・Capacitor）→「PWA・Capacitorロードマップ」
- H-24（pg_bigm検索）→「pg_bigm検索ロードマップ」
- H-45（MCP拡張ツール）→「MCP拡張ロードマップ」
- H-46（GitHub側revoke）→「GitHub revokeロードマップ」

**Phase 4 マネタイズ**（最優先・未着手）
- おまかせプラン（クレジット制・月額500〜1,000円）
- Stripe連携
- クレジット残量チェック・上限到達時のセルフプラン誘導UI

**MCP実装状況（H-40確定）**
- prototype側のBearer認証API/トークン発行UIと、別repoの現行3ツールは実装済みであり「次に実装予定」ではない。`publish_thread`等の拡張は「MCP拡張ロードマップ」として区別する

---

## 低優先・後回し

- 口述筆記モード（OpenAI Whisper API）
- 非同期整合性チェック（OpenAI Responses API Background mode）
- 世界線ラベルの一意な連番化
- parseGithubBlobUrlのブランチ制限緩和（現状はmain/master/develop/devのみ）
- `app/arena/page.tsx` 人間ターン入力の送信キー設定への統一

---

## 差別化ポイント

- TypingMindと違い、複数AIの履歴共有・引継ぎ機能・メモモード・公開スレッド一覧がある
- 「完成した知識」でなく「考えている途中のプロセス」を共有する文化を作りたい
- 小説執筆特化機能（プロジェクトモード・キャラDB・整合性チェック）で作家ユーザーの開拓を狙う

### /api/chat の検索クエリ契約（B2-2、2026-10-04）

POST /api/chat の optional queryText は文字列だけを採用し、未指定・文字列以外は400にせず userContent へフォールバックする。通常Web送信は ChatInput / ChatInputCentered → handleSubmit の第5引数から手入力 value をtrimせず別送する。temporary のbodyには含めない。保存する messages.content は従来の添付込み userContent のまま。queryText はトリガー判定・embedding入力専用で、DB・system・ログへ追加しない。

buildChatSearchQueries の triggerText は raw queryText（空文字もそのまま）または userContent 全文。Memoryの19語の判定は切り詰め前の triggerText を使う。memoryQuery は triggerText の先頭、loreBookQuery は最終 userContent の先頭（手入力の後ろに添付が続く前提で、添付本文が必ず検索されるわけではない）。各queryは CHAT_LORE_SEARCH_POLICY.query.maxCodePoints の2,000コードポイントへ切り詰め、絵文字などのサロゲートペアを分断しない。2,000はOpenAIの限界値ではなく、tokenizerに依存せず余裕を取るためのKabeHub独自の保守的上限。

両検索が有効でqueryが同一ならembeddingは1回、異なるなら2回を並列生成する。片方のみ有効ならそのqueryだけを生成する。同じAbortController・combined timeout（3,000ms）を使い、一方のembeddingがnullでも成功側の検索・注入を継続する。MemoryのtopK 5・閾値0.3、Lore BookのtopK 3、systemの各ブロック形式は維持する。

再生成・分岐編集は同一ページセッション内は保持した手入力を再利用。再読み込み後・保持前のメッセージ・本文が別経路で変わったメッセージ・mobile・旧クライアントは従来どおり userContent 全文へフォールバック（embedding入力自体の上限は適用）。通常Web送信の添付テキストファイルがあるメッセージだけをページ所有のfactoryストアに保持し、DB・localStorage・sessionStorageには保存しない。手入力編集時は保持を検証して添付をバイト不変で再結合し、trim済みの手入力をqueryTextとして送る。全文編集はqueryTextを送らない。light編集と分岐編集は生成中断時もcommit済み本文に合わせて保持を更新し、通常送信の中断時は記録しない。temporary・メモ系・novel-check・mobileの送信経路は従来どおり。メモモードは検索計画前にearly returnする。
