# docs/ 最終構成・CLAUDE.md スリム化・Codex 指示書の分割案

作成: 2026-11-26／基準: 方針書 v2（`KabeHub_ドキュメント再編_方針_v2.md`）、`extract/` 全メモ、`claude-md-corrections.md`（#1〜#72）、`inventory.md`（C1 反映後）、現行 `CLAUDE.md`（約135KB＝138,599バイト）。
**公開リポジトリのため、実値（project ref・管理者UUID・鍵・トークン・個人メール・PCのユーザー名パス）は書かない。** `docs/internal/` は存在のみ前提にし、内容は読んでいない。
この文書は計画のみ。ファイルの作成・移動・commit はしていない。

---

## 1. docs/ の最終ツリー

サイズは想定（KB）。方針書 §5-5 の「1ファイル30KB以内」を守るため、方針書 §4-1 から次の3点を**分割案として追加**した（Rui 承認済み、2026-11-26。§6 の 1）。

- `project-memory.md` → `project-memory.md`＋`project-memory-ui.md`（CLAUDE.md の Project Memory 関連記述だけで約31KBあり、1ファイルでは超過）
- `auth-and-security.md` → `auth-and-security.md`（認証・proxy・RPC規約・logger）＋`security-hardening.md`（CSP・BYOK・Storage・依存・H-21C・Trial）（抽出メモが3本・計約90KB）
- `threads.md`・`arena.md` は**抽出メモが無い**（旧資料が実質ゼロ）。CLAUDE.md の記述とコードだけで書く小さなファイルにする

```
docs/
├─ README.md                      索引（目的別・コードパス→feature 対応表）
├─ status.md                      現況ダッシュボード（日付つき項目は「次に確認する日」列）
├─ overview/        product.md ／ architecture.md ／ glossary.md
├─ features/        23ファイル（下表）
├─ operations/      dev-workflow.md ／ environments.md ／ testing.md ／ runbooks/（7本）
├─ roadmap/         backlog.md
├─ history/         changelog.md
├─ security/        api-key-flow-inventory.md（現行 docs/ 直下から移動。§6 の更新つき）
├─ work/            README.md（運用ルールのみ。検討中トラックの置き場）
├─ archive/         既存＋C2 で移した2本＋T21a で移す5本（下記「docs/ 直下の未割り当てファイル」）
├─ internal/        gitignore・ローカルのみ（本計画の対象外。件数に含めない）
├─ audit/ ／ applied/ ／ schema.sql ／ storage.sql   現状維持
└─ _reorg/          再編完了後に archive へ（conflicts/・source-map/ の空ディレクトリを含む）
```

**docs/ 直下の未割り当てファイル（2026-11-26 追記）**: 次の5本は feature に割り当てず、**内容を変えずに T21a の最後に `docs/archive/` へ移動する（移動のみ）**。各ファイルは、担当タスクが**移動前の現在位置**で入力として読む。

| ファイル | 読むタスク | 備考 |
|-|-|-|
| `KabeHub_folder_name統一_Phase3_実装報告_v1.md` | なし（`project-memory.md` の履歴は抽出メモ経由） | 実装報告。移動のみ |
| `KabeHub_folder_name統一_Phase5C_実装ログ.md` | なし | 同上 |
| `thread-trash-phase3b2-report.md` | T10（`trash.md`） | 追跡済みの一時レポート |
| `ai-usage-cost-handover.md` | T6（`models-and-pricing.md`） | AI 利用コスト計測の引き継ぎ |
| `lore-refactoring-notes.md` | T12（`lore-rag.md`） | Lore 検索経路の記録 |

`docs/task12-handoff.md`・`docs/task13a-handoff.md` は **T19（`mobile.md`）の入力とし、移動しない**。`inventory.md` §3 では「docs/archive/ 移動候補（一時レポート）」と記載しているため、T19 が内容を `mobile.md` に反映した後に、移動するかどうかを ③ で Rui が判断する。

### 1-1. features/（23ファイル・約412KB）

| ファイル | 担当する抽出メモ（＋補助入力） | コードで検証する範囲 | 想定KB | 公開時の注意（置換規則） |
|-|-|-|-|-|
| chat-core.md | `chat-core.md`／CLAUDE.md「ストリーミング」「検索クエリ契約」 | `app/api/chat/route.ts`、`lib/chat-system-blocks.ts`、`lib/context-window.ts`、`lib/rate-limit.ts`、`lib/lore/chat-search-plan.ts`、`lib/ai-context-blocks.ts` | 28 | 行番号を書かない。`MAX_ACCUMULATED_CHARS` 等は定数名つき |
| models-and-pricing.md | `models-and-pricing.md` | `lib/modelRegistry.ts`・`packages/shared/src/modelRegistry.ts`（2ファイル同期）、`lib/pricing.ts`、`lib/aiUsage.ts`、`lib/internalModels.ts`、`app/stats/` | 26 | 料金は日付つき（Argon 2026-12-01、Flash 系 2027-01-01）。「最新」等の相対表現禁止 |
| branching-and-regenerate.md | `branching-and-regenerate.md` | `lib/branching.ts`、`lib/branchTree.ts`、`components/BranchTree.tsx`、`app/api/threads/[id]/branch-to`・`messages/restore-branch`、`apply_branch_edit` | 26 | RPC の定義は migration 番号で参照 |
| chat-ui.md | `chat-ui.md`／CLAUDE.md の地雷（スマホ・送信キー・入力欄・サイドバー） | `components/ChatPanel.tsx`・`ChatInput.tsx`・`ChatInputCentered.tsx`・`Sidebar.tsx`・`MessageBubble.tsx`、`lib/inputUtils.ts`、`app/globals.css` | 16 | 同上 |
| rich-conversation.md | `rich-conversation.md` | `lib/openai-web-search.ts`、`lib/openai-responses-input.ts`、`components/KabeCardView.tsx`・`SourceChips.tsx`・`WebSearchToggle.tsx`、`packages/shared/src/kabeCard.ts`・`webSearch.ts`、`lib/kabe-card-system-prompt.ts` | 28 | D番号（D1〜D80）は維持。外部検索の出典URLは本文に書かない |
| threads.md | **抽出メモなし**。CLAUDE.md の API 表＋コード | `app/api/threads/**`、`app/api/messages/**`、`app/api/calendar`、`app/calendar/`、`lib/threadResourceCrud.ts` | 8 | 根拠はコードのみ。「資料なし」と明記 |
| trash.md | `trash.md`（＋`docs/archive/` の trash レポート） | `app/api/trash/threads/**`、`app/trash/`、`lib/threads/*`、`app/api/cron/thread-trash-purge`、migration v207 | 22 | Cron の実削除切替（2026-11-26）は status と二重にしない（出典リンクのみ） |
| search.md | `search.md` | `app/api/search/route.ts`、`docs/schema.sql` の拡張（pg_trgm 未導入の確認） | 6 | pg_trgm 仕様書の SQL は「未適用」と書く（#28） |
| export.md | `export.md` | `lib/exportUtils.ts`、`components/ExportModal.tsx`、`MarkdownRenderer` の csv／txt DL | 6 | |
| sharing-and-explore.md | `sharing-and-explore.md` | `app/api/share/**`、`app/api/explore/route.ts`、`app/api/reports`、`app/[handle]/`、`lib/genres.ts` | 12 | カーソル検証の規則は正本の関数名で書く（#27） |
| lore-rag.md | `lore-rag.md`／CLAUDE.md「RAG関連」 | `lib/lore/**`・`packages/shared/src/lore/`（mirror）、`app/api/lore/**`、`app/memory/page.tsx`、`lib/messages/delete.ts` | 24 | shared 版との同期手順を地雷に（#11） |
| project-memory.md | `project-memory.md`／CLAUDE.md「API Routes（Project Memory）」「Project Memory関連」 | `app/api/projects/**`、`lib/project-memory/*`（auto-summary 系を除く）、v182〜v205、`chat-inclusion-limits.ts`、`chat-injection.ts` | 28 | folder_name の legacy 400 の7ハンドラを表で（#10） |
| project-memory-ui.md | 同上（UI 契約）／CLAUDE.md「Components」「Lib」の PM 行 | `components/ProjectMemory*.tsx`・`ProjectSettingsTabs.tsx`・`Sidebar.tsx`（Memory 部）、`lib/project-memory/use-project-memory-topics.ts` | 14 | |
| auto-summary.md | `auto-summary.md` | `lib/project-memory/auto-summary*.ts`、`app/api/projects/[projectId]/memory/{bootstrap,update}/**`、v206 | 18 | prompt バージョン（v8／v2）は定数名で。#1・#6・#8 を反映 |
| github-integration.md | `github-integration.md` | `app/api/auth/github/**`、`lib/github*.ts`、`lib/github-tool-loop.ts`、`lib/github-token-*.ts`、`user_github_tokens` | 16 | OAuth App のクライアントID・redirect の実値は書かない（環境変数名のみ） |
| mcp.md | `mcp.md` | `app/api/mcp/**`、`app/api/mcp-tokens`、`lib/mcp-auth.ts`、別 repo のツール名（3つ） | 14 | **トークン値は一切書かない**（旧資料に実値の混入あり。#D 参照）。クライアント側（`~\.claude\`）は「リポジトリ外」とだけ書き、PC のユーザー名パスは `<user>` |
| arena.md | **抽出メモなし**（内部モデル刷新の Arena 部は models 側）。コード | `app/api/arena/route.ts`、`app/arena/**`、`components/ArenaTimeline.tsx` | 6 | 非ストリーミングである点（Promise Bridge 非採用）を要約に |
| image-generation.md | `image-generation.md` | `app/api/image-gen/route.ts`、`app/album/`、`app/image/`、`docs/storage.sql` | 10 | Storage の bucket 名は可、署名URLは書かない |
| novel-and-roleplay.md | `novel-and-roleplay.md` | `app/api/extract-settings`、`app/api/novel-check`、`components/NovelSettingsPane.tsx`・`OutlinePane.tsx`・`RoleplayBubble.tsx`、`folder_type` | 14 | |
| auth-and-security.md | `auth-and-security-1.md`＋`-2.md`（判断・地雷節が中心。矛盾節は corrections 経由） | `proxy.ts`、`lib/proxy-paths.ts`、`lib/supabase/route-auth.ts`、`app/auth/callback/route.ts`、`lib/logger.ts`、`app/api/account/route.ts`、`docs/schema.sql` の SECURITY DEFINER 関数 | 28 | **公開しない項目は書かない**（§5 の共通ルール）。管理者UUID・RLS の本番との差・OAuth クライアント共用は書かず、「`docs/internal/` を参照（ローカルのみ）」の1行だけ |
| security-hardening.md | `auth-and-security-3.md` | `lib/csp.ts`、`proxy.ts`（nonce）、`app/api/csp-report/route.ts`、`docs/security/api-key-flow-inventory.md`、`lib/storage-path-guard.ts`、BYOK 関連 | 24 | 同上。Trial・H-21C は「検討」と明記。実在値（本番 ref・個人メール・鍵断片）は旧資料にあるため、写すときは `<project-ref>`・`<user>` に置換 |
| mobile.md | `mobile.md`＋`docs/mobile-env-setup.md`・task12/13a | `apps/mobile/**`、`packages/shared/**`、`lib/proxy-paths.ts` の CORS、workspaces 設定 | 28 | `mobile-env-setup.md` にある本番 ref は `<prod-project-ref>` に置換（#63）。署名鍵の指紋・keystore の中身は書かない |
| highlight.md（計画中） | `highlight.md` | コードに実装なし（Phase 0 の撤去のみ）。`lib/lore/` の `liked_ai` 保護 | 10 | status: 計画中。確定は D1〜D3 のみ |

### 1-2. その他のファイル（19ファイル・約154KB）

| ファイル | 担当する抽出メモ | コードで検証する範囲 | 想定KB | 公開時の注意 |
|-|-|-|-|-|
| README.md | 全体（inventory・各 feature の frontmatter） | 対応表の `code_paths` の実在 | 6 | |
| status.md | `next-actions.md`＋`cross-history.md`＋`cross-overview-roadmap.md` の日付表 | Argon 料金 epoch（`lib/modelRegistry.ts`）、Cron の `vercel.json` | 8 | 日付つき項目に「次に確認する日」列。実値なし |
| overview/product.md | `cross-overview-roadmap.md`（判断1〜5）／CLAUDE.md 概要・差別化 | `package.json`（版数） | 5 | 本番URLは可（公開サイト） |
| overview/architecture.md | `cross-overview-roadmap.md`／`chat-core.md`／CLAUDE.md 技術スタック | `lib/modelRegistry.ts` の導出関係、system ブロック順（`lib/chat-system-blocks.ts`）、`proxy.ts` の境界概要 | 14 | 詳細は各 feature へのリンクのみ（二重記載しない） |
| overview/glossary.md | 全抽出メモの用語 | — | 6 | |
| operations/dev-workflow.md | `cross-operations.md` 判断1〜12・地雷 | `.gitignore`、`package.json` scripts | 10 | PC のパスは `<user>` |
| operations/environments.md | `cross-operations.md` 判断13〜16・20 | `.env.local.example`、`vercel.json`、`lib/csp.ts` の `NEXT_PUBLIC_SITE_URL` 参照（`repo-hygiene-report.md` 調査3） | 10 | **環境変数は名前のみ**。値・本番/テスト DB の ref は書かない。`NEXT_PUBLIC_APP_URL` は「コード参照なし」と書く |
| operations/testing.md | CLAUDE.md「Scripts」表（約14.6KB）＋#7・#8・#47 | `package.json` scripts、`scripts/*.test.cjs` の件数（`npm test` 実測は Codex が実行しない→「要実測」とする） | 14 | 件数は「時点」つき。verify-*.mjs は「本番で実行しない」を明記 |
| operations/runbooks/（7本、各約3KB） | `cross-operations.md`（法人移行4失敗ほか）、`auth-and-security-3.md` 地雷1、`next-actions.md` | 手順は【資料】中心。コード照合は環境変数名・RPC 名のみ | 21 | **置換規則（#72）**: `<project-ref>`・`<user>`・`<old-project>`。キー値・スクリーンショットを貼らない |
| roadmap/backlog.md | `cross-overview-roadmap.md`（F1〜F9・BL3）、corrections #46・#53・#70 | `lib/modelRegistry.ts`（日付項目）、各 feature の「未実装」節へのリンク | 20 | BL3 §5 の優先順位は Rui 未承認 → 「提案順」と明記 |
| history/changelog.md | `cross-history.md`／CLAUDE.md「実装済み機能（バージョン別）」（14.6KB） | `git log`（主要コミット）、`docs/applied/README.md` | 22 | 版番号の二重採番（v177・v178）と migration 番号を併記して区別（#69） |
| security/api-key-flow-inventory.md | 現行 `docs/api-key-flow-inventory.md`（移動） | §6「残存リスク」を現状（本番 Enforce）へ（#48） | 17 | 移動のみ＋§6 修正。他は変更しない |
| work/README.md | 方針書 §7・§9-4 | — | 1 | |

**合計: 42ファイル・約566KB**（features 23・その他 19）。方針書 §4-1 の21ファイル案から、分割で2ファイル（project-memory-ui・security-hardening）増える。`docs/internal/` と既存の `schema.sql`・`storage.sql`・`applied/`・`audit/`・`archive/` は含まない。

---

## 2. CLAUDE.md を約22KB に縮める計画

現行 138,599バイト（約135KB）→ 目標 15〜25KB（**約22KB**）。冒頭〜「プロダクト概要」直前の数行を含め、約110KBを移し、約6KBを削除する。

### 2-1. 残す節（約22KB）

| 残す内容（新しい形） | 現行KB→新KB | 備考 |
|-|-|-|
| プロダクト概要・現フェーズ（Phase 4 日付項目へのリンク） | 0.4→0.8 | #62 のモバイル進捗は1行＋ `mobile.md` リンク |
| 起動コマンド・キャッシュ対処・テストDB 手順は `environments.md`／runbook へのポインタ | 0.6→1.2 | #68 |
| デバイス間作業の鉄則（個別 add・force 禁止・pull・削除/リネームも個別・コミット前確認） | 0.5→2.0 | #41・#67 の要点のみ。細則は `dev-workflow.md` |
| 技術スタック（表を圧縮。モデルID一覧は台帳が正本と書く） | 3.4→2.2 | #15（`claude-fable-5-1`・`gpt-6-astra`）・#51（`--webpack`・next 固定）を反映 |
| 指示フォーマット＋役割分担（1表） | 0.3→1.2 | #66 |
| 開発ルール：ハードコード値監査の判定基準 | 2.3→2.3 | 横断規則なので原文維持 |
| 開発ルール：DB操作・マイグレーション再実行安全性＋SECURITY DEFINER 規則（#37 の3行） | 2.0→3.0 | |
| 開発ルール：Supabase クライアントの使い分け（#43 の落とし穴を追記） | 1.8→1.5 | |
| 開発ルール：モデルID・料金の追加手順 | 1.5→1.5 | `models-and-pricing.md` にも同内容を置かず、片方からリンクのみ |
| 横断の地雷（7項目の短い表）：新 Route 追加時の `API_AUTH_CLASSIFICATIONS` 登録／proxy の matcher とページ追加（#40）／Promise Bridge を崩さない／shared と root の二重同期（#11・#60）／Legal の exact-copy（#59）／CRLF・Windows 注意（#5・#6）／`docs/` 更新規則（方針書 §7） | 各0.3〜1.6→4.0 | 1項目2〜3行＋リンク |
| **索引表**（触るコードのパス→読む doc。`docs/README.md` の対応表へのリンクも） | 新規 3.0 | `@import` は使わない（方針書 §9-1） |
| 合計 | — | **約22.4KB** |

### 2-2. docs/ へ移す節（約110KB）

| 現行の節（KB） | 移す先 |
|-|-|
| 主要ファイルの役割：API Routes 6表（計約14.7）・Pages（1.7）・Components（7.2）・Lib（20.2）・Docs（1.1） | 各 feature の「主要ファイル」節（Components・Lib は機能ごとに分配） |
| Scripts（14.6） | `operations/testing.md`（件数・表）＋各 feature の「主要ファイル」にテスト名。履歴行（#8）は `history/changelog.md` |
| Project Memory 関連（23.4）＋API Routes（Project Memory）（7.9） | `project-memory.md`・`project-memory-ui.md`・`auto-summary.md`（約26KB分を分配） |
| 実装済み機能（バージョン別）（14.6） | `history/changelog.md` |
| RAG 関連（3.1）・MCP 関連（0.5） | `lore-rag.md`・`mcp.md` |
| BYOK（1.8）・proxy 認証境界表（1.6）・`next` 往復（0.4） | `security-hardening.md`・`auth-and-security.md`（表は auth 側に正本） |
| チャット・UI 関連（4.3）・Branching（0.9）・再生成（0.4）・新規会話UI（0.9）・入力欄（0.6）・サイドバー（0.3）・スマホ（1.0）・送信キー（0.6） | `chat-ui.md`・`chat-core.md`・`rich-conversation.md`・`branching-and-regenerate.md`・`mobile.md` |
| ストリーミング（1.2）・検索クエリ契約（2.6）・スナップショット共有（0.4）・なりきり（0.3） | `chat-core.md`・`sharing-and-explore.md`・`novel-and-roleplay.md`（Promise Bridge の「崩さない」の1行だけ CLAUDE.md に残す） |
| 次に実装予定（1.0）・低優先（0.4）・既知の課題（0.7）・差別化（0.4） | `roadmap/backlog.md`・`overview/product.md` |

### 2-3. 削除する記述（約6KB）

- 最終更新行の長い履歴（「最終更新」1行の列挙、約1.2KB）。履歴は `changelog.md` と git が持つ（#64）。
- 古い記述（corrections の「古い」12件）：v206 の「旧記述のまま」一文（#1）、`rename_project` の4テーブル同期（#9）、「ローカル連携解除」・GitHub revoke ロードマップ参照（#30）、matcher の一括表記（#35）、upsert・title 必須の記述（#17）、「移管済み」の5ロードマップ（#46）ほか。
- 全表の重複（Lib 表と feature で重なる行）、履歴行（Scripts の検証記録）。

### 2-4. corrections #1〜#72 の解決先（対応表）

| # | 解決先（正本→CLAUDE.md の扱い） |
|-|-|
| 1 | auto-summary.md（v206 状態）／CLAUDE.md は削除 |
| 2・3 | chat-core.md |
| 4・33 | image-generation.md |
| 5・6 | dev-workflow.md（CRLF・Codex 停止条件・autocrlf）／CLAUDE.md に地雷1行 |
| 7・8 | testing.md（`SUPABASE_ACCESS_TOKEN`・履歴行の扱い） |
| 9・10 | project-memory.md（4テーブル→3テーブル同期、folder_name の400） |
| 11・12・13・14 | lore-rag.md（#11 はミラー同期も CLAUDE.md の横断地雷に1行） |
| 15 | models-and-pricing.md＋CLAUDE.md 技術スタック（修正して残す） |
| 16・17・18 | trash.md（#17 は threads.md にも PATCH/DELETE の挙動） |
| 19・20 | rich-conversation.md |
| 21・22・23・24 | models-and-pricing.md |
| 25 | models-and-pricing.md（`aiUsage`）＋architecture.md |
| 26 | chat-ui.md（境界値の3か所重複は「地雷」に） |
| 27 | sharing-and-explore.md |
| 28 | search.md |
| 29 | highlight.md |
| 30・31 | github-integration.md |
| 32 | mcp.md |
| 34 | novel-and-roleplay.md |
| 35・39・40・44・45 | auth-and-security.md（#40 は CLAUDE.md 横断地雷に1行） |
| 36・43 | auth-and-security.md＋CLAUDE.md「Supabase クライアント」節 |
| 37 | CLAUDE.md「マイグレーション」節（3行）＋auth-and-security.md |
| 38 | auth-and-security.md |
| 41・67 | dev-workflow.md＋CLAUDE.md 鉄則（要点のみ） |
| 42・50・52・54・58 | security-hardening.md（#54 の Markdown 信頼不可は rich-conversation.md にも1行） |
| 46・53・70 | roadmap/backlog.md＋status.md（CLAUDE.md の「次に実装予定」は削除） |
| 47 | security-hardening.md（`applied/` 凍結規則）＋testing.md |
| 48 | security/api-key-flow-inventory.md（§6 修正） |
| 49・55 | runbooks/login-loop.md（CLAUDE.md に1行ポインタ） |
| 51 | environments.md＋CLAUDE.md 技術スタック |
| 56・57・58・60・61・62・63 | mobile.md（#57 は auth-and-security.md、#60 は CLAUDE.md 横断地雷にも） |
| 59 | CLAUDE.md 横断地雷（Legal exact-copy）＋mobile.md |
| 64・69 | history/changelog.md（最終更新行は廃止） |
| 65 | environments.md |
| 66 | dev-workflow.md＋CLAUDE.md 指示フォーマット |
| 68 | runbooks/test-db-dev-server.md |
| 71 | repo-hygiene-report.md（C2）／status.md に「追跡資産」の扱いを記録 |
| 72 | 共通ルールブロック（§5）＋runbooks 全般 |

（#1〜#72 の全番号を上表で網羅。#D 節の「公開しない項目」は docs/ に書かない）

---

## 3. AGENTS.md（Codex 用・約2KB）の案

```
# AGENTS.md（Codex 用）

このリポジトリの正本は CLAUDE.md と docs/ です。作業前に CLAUDE.md を読み、索引表から該当する docs/features/<機能>.md を開いてください。
コードと資料が矛盾したらコードが正です。矛盾は書き換えず docs/_reorg/conflicts/ に1行残します。

## 共通ルール
- commit・push・git add -A は禁止。変更したファイルは個別に報告し、add は Rui が行う
- 本番 DB・本番 API に接続しない。.env* を読まない・書かない。値（鍵・トークン・メール・project ref（本番・テストとも）・UUID・PC のユーザー名パス）をファイル・ログ・報告に出さない（admin@kabehub.com のみ可。置換: <project-ref>・<prod-project-ref>・<user>・<old-project>）
- docs/internal/ は読まない・参照しない・転記しない
- 推測で埋めない。根拠は【コード】【資料】【実測】【未確認】で区別する
- [id] を含むパスは引用符で囲む。CRLF/LF と BOM は既存ファイルに合わせる
- アプリのコード・テスト・migration は、指示書が明示した場合のみ変更する
- 作業前に npm test と tsc の結果を記録し、作業後に比較する（docs のみの変更では実行不要）
- 機能を変更したら docs/features/<機能>.md を同じ変更で更新する
詳細: docs/operations/dev-workflow.md
```

---

## 4. Codex 指示書の分割案（T1〜T21b、22本）

目安: 1タスクで Codex が読む量 30〜60KB（抽出メモ＋該当 corrections 行＋CLAUDE.md の該当節＋コードの主要ファイル）。所要は Codex の実行時間の目安（コード読解を含む。承認待ちの時間は除く）。

**共通方式**: 各タスクは `conflicts`・`source-map` を**自分専用の断片**（`docs/_reorg/conflicts/Tn.md`、`docs/_reorg/source-map/Tn.md`）に書く（並列実行で `conflicts.md` が衝突するため。③で Claude が統合）。`inventory.md` は触らない。断片の置き場 `docs/_reorg/conflicts/`・`docs/_reorg/source-map/` は空ディレクトリ（`.gitkeep` のみ）として作成済み。

**並列実行の注意（2026-11-26 追記）**: **同じ作業ツリーで複数の Codex を同時に動かさない**。順次実行するか、`git worktree` を分けて実行する。書き込み先が feature ごとに分かれていても、`docs/_reorg/conflicts/`・`docs/_reorg/source-map/` などの共有ディレクトリがあり、`git status` や `git add` の対象も混ざるため。下の「並列実行可」は、**worktree を分けた場合に限る**（依存の順序が崩れないという意味）。

| T | 対象ファイル | 入力（抽出メモ・コードの範囲） | 依存 | 検証方法 | 所要 |
|-|-|-|-|-|-|
| T1 | overview/product・architecture・glossary | `cross-overview-roadmap.md`（判断・地雷）、CLAUDE.md 概要・技術スタック・差別化、corrections #15・#51・#56・#62、`package.json`、`lib/modelRegistry.ts` の導出関係。約35KB | なし | 版数・フェーズ記述を `package.json`／コードで照合。用語集は各抽出メモの用語の漏れを grep | 30分 |
| T2 | operations/dev-workflow・environments・runbooks（7本） | `cross-operations.md`、`auth-and-security-3.md` 地雷1、`next-actions.md`、corrections #5〜#6・#41・#49・#55・#65〜#68・#72、`.env.local.example`、`vercel.json`。約55KB | なし | 置換規則の違反を grep（ref・パス）。環境変数は名前のみ | 40分 |
| T3 | operations/testing.md | CLAUDE.md「Scripts」表（14.6KB）、corrections #7・#8・#47、`package.json`、`scripts/` の一覧。約25KB | なし | 表の各テスト名の実在を `ls scripts` で照合。件数は「要実測」 | 25分 |
| T4 | history/changelog.md | `cross-history.md`、CLAUDE.md「実装済み機能」、corrections #64・#69、`docs/applied/README.md`、`git log` の要約。約40KB | なし | 版番号と migration 番号の対応を `applied/README.md`・schema で照合 | 30分 |
| T5 | features/chat-core.md | `chat-core.md`、CLAUDE.md ストリーミング・検索クエリ契約、corrections #2・#3・#5、`app/api/chat/route.ts` ほか。約45KB | T1（glossary リンク） | 上限値・定数名を grep、Promise Bridge の順序契約をコードと照合 | 50分 |
| T6 | features/models-and-pricing.md | `models-and-pricing.md`、corrections #15・#21〜#25、`lib/modelRegistry.ts`・`packages/shared/src/modelRegistry.ts`、**`docs/ai-usage-cost-handover.md`（移動前の現在位置）**。約44KB | T1 | 2ファイルの同期、PricingEpoch の日付、手順の再現確認 | 40分 |
| T7 | features/branching-and-regenerate.md | `branching-and-regenerate.md`、`lib/branching.ts`・`lib/branchTree.ts`・RPC。約40KB | T1 | RPC 規約（#44）は auth 側へリンクのみ | 40分 |
| T8 | features/chat-ui.md・threads.md・arena.md | `chat-ui.md`、CLAUDE.md の UI 地雷、corrections #17・#26、`app/api/threads/**`・`app/arena/**` のコード。約35KB | T1 | threads／arena は【コード】のみで書き、資料が無いと明記 | 35分 |
| T9 | features/rich-conversation.md | `rich-conversation.md`、corrections #19・#20・#54、`lib/openai-*.ts`・`kabeCard.ts`・各 component。約45KB | T5（system ブロックへのリンク） | カード上限・NDJSON 契約をコードで照合 | 45分 |
| T10 | features/trash.md・search.md・export.md | `trash.md`・`search.md`・`export.md`、`docs/archive/` の trash レポート、**`docs/thread-trash-phase3b2-report.md`（移動前の現在位置）**、corrections #16〜#18・#28。約57KB | T1 | RPC 名・保持日数・エラー写像をコード／schema で照合 | 40分 |
| T11 | features/sharing-and-explore.md・image-generation.md・novel-and-roleplay.md | 同名3抽出メモ（計約38KB）、corrections #4・#27・#33・#34 | T1 | カーソル検証・img2img 対応表・`folder_type` をコードで照合 | 40分 |
| T12 | features/lore-rag.md | `lore-rag.md`、CLAUDE.md RAG 関連、corrections #11〜#14、`lib/lore/**`・`packages/shared/src/lore/`、**`docs/lore-refactoring-notes.md`（移動前の現在位置）** | T1 | shared と root の同一性を diff で確認（docs には差の有無のみ書く） | 35分 |
| T13 | features/project-memory.md | `project-memory.md`、CLAUDE.md の PM API・Lib・地雷（API 表 7.9KB＋地雷 23.4KB の該当分）、corrections #9・#10。約55KB | T1 | API 表の route 実在、RPC・エラー写像、上限定数を照合 | 55分 |
| T14 | features/project-memory-ui.md | 同抽出メモの UI 部、CLAUDE.md の Components・Lib の PM 行、`components/ProjectMemory*.tsx`、`use-project-memory-topics.ts`。約35KB | T13 | 排他・Escape・lock の契約をコードで照合 | 35分 |
| T15 | features/auto-summary.md | `auto-summary.md`、CLAUDE.md の自動要約地雷（約12KB）、corrections #1・#6・#8、`lib/project-memory/auto-summary*.ts`。約35KB | T13 | prompt バージョン・予算定数・cursor 契約を照合 | 40分 |
| T16 | features/github-integration.md・mcp.md | 同名2抽出メモ（約35KB）、corrections #30〜#32 | T1 | トークン値の不在を grep。OAuth 環境変数は名前のみ | 40分 |
| T17 | features/auth-and-security.md | `auth-and-security-1.md`・`-2.md`（判断・地雷節のみ約35KB）、corrections #35〜#45・#57、`proxy.ts`・`lib/proxy-paths.ts` | T1 | proxy 表を `lib/proxy-paths.ts`／`scripts/proxy.test.cjs` で照合。**公開しない項目の混入を grep** | 55分 |
| T18 | features/security-hardening.md＋security/api-key-flow-inventory.md の移動・修正 | `auth-and-security-3.md`、`docs/api-key-flow-inventory.md`、corrections #42・#47・#48・#50・#52〜#54・#58 | T17 | CSP の設定を `lib/csp.ts` で照合、inventory §6 を現状に | 50分 |
| T19 | features/mobile.md | `mobile.md`、`docs/mobile-env-setup.md`（本番 ref を `<prod-project-ref>` に置換して統合）・`docs/task12-handoff.md`・`docs/task13a-handoff.md`（入力のみ。**移動しない**。移動の可否は ③ で Rui が判断）、corrections #56〜#63、`apps/mobile/**`。約45KB | T17（proxy/CORS リンク） | project ref の不在を grep（本番・テストとも）。workspaces・CORS を設定ファイルで照合 | 45分 |
| T20 | features/highlight.md、roadmap/backlog.md、status.md | `highlight.md`、`cross-overview-roadmap.md`（宿題・F1〜F9）、`next-actions.md`、corrections #29・#46・#53・#70。約55KB。status は T5〜T19 の各 feature「未実装」節を読む | T5〜T19 | 日付つき項目の日付をコード（epoch）と照合。BL3 優先順位は「提案順」と注記。backlog に「プライバシーポリシーへのゴミ箱7日保持の追記」を公開前課題として載せる。**status.md の様式案を提案する**（日付つき項目に「次に確認する日」列。Rui が確定） | 55分 |
| T21a | `docs/README.md`（コードパス→feature 対応表）、`AGENTS.md`、`docs/work/README.md`、**docs/ 直下の未割り当て5ファイルの `docs/archive/` への移動（最後の作業・移動のみ。§1 の表）** | 全 feature の frontmatter（`code_paths`）、本書 §3（AGENTS.md 案）、方針書 §7・§9-4、§1 の5ファイル表。約30KB | T20 | `code_paths` の全パス実在・対応表の全リンク実在、`AGENTS.md` が 3KB 以内、移動した5本の内容が移動前と同一（`git diff --stat` で rename のみ）、`.claude/rules/` を作っていない | 35分 |
| T21b | **`CLAUDE.new.md`**（スリム版 CLAUDE.md。**既存 `CLAUDE.md` は置き換えない**） | 現行 CLAUDE.md、corrections の対応表（本書 §2-4）、`docs/README.md`（T21a の成果）、各 feature の frontmatter。約45KB | T21a | 25KB 以内、索引の全リンク実在、corrections #1〜#72 が解決先に存在（本書 §2-4 の対応表どおり）。差し替えは ③ で Claude が読みテスト（§7 の 8）をした後に Rui が行う | 40分 |

**依存の要約**: **最初の実行は T5（chat-core）だけ**（試行。出来を見て §5 の共通ルールと指示書を直してから T1〜T4 へ）。T1〜T4 は互いに独立で、T5 の後に実行（土台）。T6〜T19 は T1 完了後（T14→T13、T15→T13、T18→T17、T19→T17 のみ順序あり）。T20 は T5〜T19 の後、**T21a は T20 の後、T21b は T21a の後（最後）**。複数タスクを同時に動かす場合は、上記「並列実行の注意」のとおり worktree を分ける。T5 の「T1（glossary リンク）」依存は、試行では glossary リンクを後で補完する扱いにする。任意の「docs 機械チェック」は別チケット（方針書 §7）。合計 **22本**（T1〜T20、T21a、T21b）。

---

## 5. 共通ルールブロック案（全 Codex 指示書の冒頭）

```
■ 共通ルール（必ず守る）
1. 書いてはいけない値: Supabase の project ref は本番・テストとも書かない（<project-ref>・<prod-project-ref>・<user>・<old-project> に置換する）。
   管理者 UUID・APIキー・トークン・パスワード・DB 接続文字列・個人メール・PC のユーザー名を含むパスも書かない。admin@kabehub.com のみ可。
   旧資料にこれらがあるときは上記の記号に置換する（corrections #72）。キー値・スクリーンショットは貼らない。
2. 監査総括（2026-08-16 更新版）の付録 A は古い版（B-05b 未着手と誤記）。書き写さない。監査 ID は監査名を前置する（例: 監査A B-05、監査F MF-2。ID が監査間で衝突する）。
3. docs/internal/ の内容は読まない・参照しない・転記しない。公開しない項目（本番 RLS の差・OAuth クライアント共用・管理者 UUID の履歴残存など）は書かず、必要なら「docs/internal/ を参照（ローカルのみ）」の1行にとどめる。
4. 推測で埋めない。根拠を【コード】【資料】【実測】【未確認】で区別する。仕様・契約の節は原則【コード】だけで書く。
5. 資料とコードが矛盾したらコードを書き、docs/_reorg/conflicts/<T番号>.md に「資料名・記述・実際・判断」を1行追記する（本文で解決しない）。
6. 「確定した判断」「地雷」を落とさない。統合・省略した項目は docs/_reorg/source-map/<T番号>.md に「どこへ移した／なぜ捨てた」を残す。
7. 行番号を書かない（ファイル名・関数名・定数名で参照）。上限値は「値＋正本の定数名」。日付は絶対日付。相対表現（最新・今回・次回）禁止。
8. 見出し名・frontmatter（feature／status／verified／code_paths）・30秒要約は方針書 §4-2 のテンプレートに固定。1ファイル30KB以内（超えるなら分割案を先に出す）。
9. リンクは docs/ 起点のリポジトリ内パスのみ。Project のファイル名や claude.ai の URL を書かない。
10. commit・push・git add -A 禁止。[id] を含むパスは引用符。git add は Rui が個別指定で行う。変更ファイルの一覧を最後に報告する。
11. アプリのコード・テスト・migration・schema.sql は変更しない（この指示書が明示する場合を除く）。
12. 本番 DB・本番 API に接続しない。.env* を読まない。npm test／tsc の実測が要るときは「要実測」と書き、実行結果を創作しない。
```

---

## 6. Rui の決定事項（2026-11-26 に決定済み）

| # | 項目 | 決定 |
|-|-|-|
| 1 | 分割案と `docs/security/` | **承認**。`project-memory` を2ファイル、`auth-and-security` を2ファイルに分け、`docs/security/` を新設して `api-key-flow-inventory.md` を移す |
| 2 | BL3 §5 の優先順位 | **未承認**。`roadmap/backlog.md` には「提案順」と明記して載せる |
| 3 | 公開しない項目 | `docs/internal/` に留め、Codex の入力から外す。`docs/mobile-env-setup.md` は置換した版を `mobile.md` へ統合する |
| 4 | `docs/internal/` の PC 間同期 | 手動コピー |
| 5 | 最初の実行 | **T5（chat-core）だけ試す**。出来を見て共通ルール（§5）を直してから T1〜T4 へ |
| 6 | `.claude/rules/` | 再編後に再判断。T21a・T21b では作らない |
| 7 | プライバシーポリシーへの「ゴミ箱7日保持」追記 | `roadmap/backlog.md` の公開前課題として載せる（T20） |

**残る未決**: `status.md` の様式のみ（T20 が案を提案し、Rui が確定する）。Project 旧版の削除は再編完了後で確定済み（実施の合図だけ）。

---

## 7. ③（Claude による検査）の観点リスト（優先順位）

1. **公開してはならない値の混入**（最優先）: 全新規ファイルで project ref・UUID・トークン形式・個人メール・PC パスを grep。`docs/internal/` の内容の転記がないか（用語・固有の値の照合）。
2. **仕様の正確さ**: 【コード】とした記述を上限値・エラー写像・順序契約から抜き取り、実コードと照合する。優先する項目は、(a) 認証境界（`proxy.ts`・`lib/proxy-paths.ts`・`API_AUTH_CLASSIFICATIONS`）、(b) Promise Bridge と `MAX_ACCUMULATED_CHARS`、(c) モデル台帳の2ファイル同期と PricingEpoch の日付、(d) Project Memory のチャット注入（8,000字・選択順）と RPC の権限、(e) ゴミ箱の保持7日と Cron、(f) カード記法の上限・NDJSON 契約。
3. **corrections #1〜#72 の解決確認**: 本書 §2-4 の対応表どおり、各項目が解決先ファイルに実在するか（grep）。特に「古い」と指摘された12件が新ドキュメントに残っていないこと。
4. **情報の欠落**: 各抽出メモの「確定した判断」「地雷」が feature か `source-map` に行き着くか（節ごとの件数突合）。
5. **矛盾の処理**: `conflicts/` の各行について Rui に正を確認する。`inventory.md` §6-1 の要照合（モデル追加チケット4本）は本文に採用していないか。
6. **重複**: 上限値・定数名・RPC 名を横断 grep し、同じ事実が2ファイル以上に書かれていないか（CLAUDE.md の横断地雷との二重記載を含む）。
7. **frontmatter と code_paths の実在**、相対リンク切れ、30KB 以内、30秒要約の有無、見出し名のテンプレート準拠（スクリプトで機械チェック）。
8. **CLAUDE.md の読みテスト**: 新しいセッションで「chat の system ブロックに項目を足したい」「新 Route を追加したい」「モデルを追加したい」を投げ、索引から正しい doc へ到達し、地雷を拾えるか。CLAUDE.md が 25KB 以下か。
9. **日付・時点表記**: 「最新」「今回」などの相対表現の残存、Argon・Flash 系料金の日付、`status.md` の「次に確認する日」の妥当性。
10. **migration・schema・コードの未変更確認**: `git diff --stat` で docs 以外が変わっていないこと（C2 の `.gitignore` 変更を除く）。

---

## 改訂履歴

- **2026-11-26**: Rui の決定と Claude のレビューを反映。
  - §5 共通ルール 1 と §3 の AGENTS.md 案: project ref は本番・テストとも書かない（置換記号を明記）。「テスト DB の ref のみ可」を削除。`admin@kabehub.com` のみ可。
  - §4: T21 を T21a（`docs/README.md`・`AGENTS.md`・`docs/work/README.md`・未割り当て5ファイルの archive 移動）と T21b（`CLAUDE.new.md` の出力。既存 `CLAUDE.md` は置き換えない）に分割。依存を「T21a は T20 の後、T21b は T21a の後」に更新し、合計を22本に。最初の実行は T5 のみと明記。
  - §1: docs/ 直下の未割り当て5ファイルの扱いを追記（移動のみ・T6／T10／T12 の入力に追加。`task12-handoff.md`・`task13a-handoff.md` は T19 の入力で移動しない）。tree の archive 行と `_reorg` 行を更新。
  - §4 共通方式: 「並列実行の注意」を追記（同じ作業ツリーで複数の Codex を同時に動かさない。順次か worktree 分離）。
  - §4 T6・T10・T12・T19・T20 の入力・検証を更新（T20 に status.md 様式の提案とゴミ箱7日保持の backlog 載せを追加）。
  - §6: 「未決事項」を「決定済み」に書き換え（残る未決は status.md の様式のみ）。
  - 空ディレクトリ `docs/_reorg/conflicts/`・`docs/_reorg/source-map/` を作成（各 `.gitkeep`）。
