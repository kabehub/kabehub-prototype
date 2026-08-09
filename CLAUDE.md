# KabeHub プロジェクト設定

最終更新: 2026/08/09（MH-1完了。ME-5・MB-c/e・H-21節・MG系・MH-3〜MH-6反映後の最終HEAD基準）
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
| AI サブ1 | Google Gemini API（gemini-2.5-flash / gemini-2.5-pro / gemini-3.5-flash / gemini-3.1-flash-lite / gemini-3.6-flash / gemini-3.5-flash-lite） |
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
| `app/api/folder-settings/route.ts` | フォルダ単位のシステムプロンプト設定・GitHub連携設定（プロジェクト機能） |
| `app/api/messages/[id]/route.ts` | DELETE・PATCHによるメッセージ単体操作（画像tombstone操作を含む） |

### API Routes（RAG / Memory）

| ファイル | 役割 |
|-|-|
| `app/api/lore/route.ts` | GET（記憶一覧取得・sort対応）/ POST（手動追加） |
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
| `components/ArenaTimeline.tsx` | provider別Bubble・thinking表示付きのAI闘技場タイムライン |
| `components/BranchTree.tsx` | 分岐ツリー可視化コンポーネント（Phase B） |
| `components/ExportModal.tsx` | TXT/MD/CSVエクスポートのUI。出力生成は`lib/exportUtils.ts`を利用 |
| `components/LegalLayout.tsx` | 利用規約・プライバシーポリシー等の共通レイアウト |
| `components/NovelSettingsPane.tsx` | 小説プロジェクト設定ペイン |
| `components/OutlinePane.tsx` | あらすじ・アウトラインの開閉ペイン |
| `components/PublishConfirmModal.tsx` | 公開確認モーダル。なりきりモードのスレッドは公開不可のガードあり |
| `components/Toast.tsx` | 成功・エラー通知を表示するToast Providerと`useToast` hook |

### Lib

| ファイル | 役割 |
|-|-|
| `lib/ai-context-blocks.ts` | AI参照データの本文・属性値を無害化し、共通の参照ブロックを生成 |
| `lib/branching.ts` | 表示順・anchor・chain block・現在laneの構築ロジック |
| `lib/branchTree.ts` | 分岐ツリー構築ロジック（`scripts/branchTree.test.cjs`でテストあり） |
| `lib/context-window.ts` | `trimContextToWindow`。コンテキストウィンドウのトリミング・キャッシュアンカー算出 |
| `lib/csp.ts` | CSPヘッダー生成・違反レポート解析・報告URL無害化 |
| `lib/exportUtils.ts` | 会話エクスポート生成（`buildExportContent`等）。`components/ChatPanel.tsx`・`app/settings/page.tsx`から利用 |
| `lib/formatters.ts` | 相対時刻とローカル日時の表示フォーマッター |
| `lib/genres.ts` | ジャンル階層マスタ（`GENRES`）と子ジャンルID取得ヘルパー（`getChildIds`） |
| `lib/github-token-crypto.ts` | AES-GCMによるGitHubトークンの暗号化・復号 |
| `lib/github-token-store.ts` | `getGithubToken`。GitHubトークンの保存・取得 |
| `lib/github-tool-loop.ts` | `runGithubToolLoop`。AI動的GitHub探索（Phase 4 AI Tool Loop） |
| `lib/github.ts` | GitHub連携共通処理・`buildPinnedGithubContext` |
| `lib/inputUtils.ts` | 送信キー設定の読み込みとモバイルviewport判定の共通helper |
| `lib/internalModels.ts` | LoreのEmbedding・抽出・統合で使う内部固定モデルID |
| `lib/logger.ts` | DB・外部API・ベストエフォート・security guard向けの機微情報を許可リスト化した構造化logger |
| `lib/lore/`（`batchTrain.ts` / `consolidation.ts` / `consolidationLlm.ts` / `dreaming.ts` / `index.ts` / `mappers.ts` / `openai.ts` / `search.ts` / `selects.ts` / `types.ts`） | 記憶抽出・検索・統合・Dreaming・OpenAI呼び出し・型/mapper/select定義一式 |
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

監査時7本 → 現在31本（`git ls-files 'scripts/*'`による生成時点の実測）。

| ファイル | 目的 |
|-|-|
| `scripts/ai-context-blocks.test.cjs` | AI参照ブロック生成と本文・属性値無害化の回帰テスト |
| `scripts/api-key-handling.test.cjs` | BYOK APIキーの保存・転送・ログ露出防止を横断検証 |
| `scripts/apply-branch-edit-route.test.cjs` | branch edit RouteのRPC契約・採番・エラー処理を検証 |
| `scripts/auth-callback-route.test.cjs` | 認証callbackのcode交換・Cookie・`next`復帰/onboarding分岐を検証 |
| `scripts/branchTree.test.cjs` | 分岐laneとツリーレイアウト構築を検証 |
| `scripts/calendar-route.test.cjs` | calendar Routeの認証・年月範囲・DB応答を検証 |
| `scripts/csp.test.cjs` | CSPヘッダー・report解析・URL無害化を検証 |
| `scripts/fetch-github-route.test.cjs` | GitHubファイル取得Routeの認証・取得・失敗契約を検証 |
| `scripts/formatters.test.cjs` | 相対時刻・日時フォーマットを固定時刻で検証 |
| `scripts/loadModel.test.cjs` | モデル設定の保存/復元・fallback・registry由来snapshotを検証 |
| `scripts/logger.test.cjs` | 構造化loggerの許可フィールドと機微情報非出力を検証 |
| `scripts/lore-dreaming-clean.test.cjs` | Dreamingの記憶cleaning・失敗時fallback・統合処理を検証 |
| `scripts/lore-openai.test.cjs` | Lore用Embedding/Chat API wrapperのrequest・response・error契約を検証 |
| `scripts/lore-search-policy.test.cjs` | チャットのLore検索policy定数と利用側の同期を検証 |
| `scripts/lore.test.cjs` | Loreのmapper・統合・Dreaming・batch train・関連Routeを特性化テスト |
| `scripts/mcp-token-hash.test.cjs` | MCPトークンのSHA-256 hashを既知ベクトルで検証 |
| `scripts/message-delete.test.cjs` | 所有メッセージ・関連Lore・Storage画像の削除契約を検証 |
| `scripts/modelRegistry.test.cjs` | モデル台帳・surface・default・Thinking・料金の整合を検証 |
| `scripts/novel-check-route.test.cjs` | novel-check Routeの認証・入力検証・外部API呼び出しを検証 |
| `scripts/optional-route-auth.test.cjs` | 任意認証Routeの匿名/認証済みCookie・DB/RPC契約を検証 |
| `scripts/pricing.test.cjs` | registry由来料金・費用計算・表示formatを検証 |
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

- Route Handler 内では必ず `createRouteHandlerSupabaseClient` を使う（RLSが効く）
- `waitUntil` フォールバック内では `SUPABASE_SERVICE_ROLE_KEY` で直接 REST API を叩く（レスポンス後にクライアントが失効するため）

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
| `/`・`/settings/*`・`/admin/*`・`/stats`・`/memory`・`/album`・`/arena`・`/calendar`・`/image`・`/novel-check`・`/threads/[id]/tree` | ○ | ○ | ページなので `/login?next=...` へ307 |
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
| RAG発火条件の二重管理 | `app/api/chat/route.ts` 内に `shouldSearchRagMemory`（キーワードベース・`RAG_TRIGGER_KEYWORDS`）と `MEMORY_TRIGGER_PATTERN`（正規表現）の2種類の発火判定ロジックが存在。片方だけ変更すると挙動が乖離するおそれあり |
| Supabase スキーマキャッシュ | RPC追加・変更後にAPIから `schema cache` エラーが出たら `NOTIFY pgrst, 'reload schema';` を実行 |

### BYOK APIキー関連（H-21）

- **リスク受容**: APIキーはLocalStorageに平文保存され、同一オリジンでXSSが発生した場合は生キーが読み取られうる。「CSP Enforce切替・運用ロードマップ」のEnforce切替後は発生確率が下がるが、許可済みスクリプトの侵害等に対する完全な防御ではない。本リスクは受容し、H-21はリスク受容＋H-21Cへの将来移管としてクローズする
- **CSPの現状**: 現在はReport-Only運用中。Enforce切替は「CSP Enforce切替・運用ロードマップ」の別運用タスクであり、APIキー経路修正と混同しない
- **送受信経路**: `docs/api-key-flow-inventory.md`を正とし、固定件数ではなく横断grep結果に追随して更新する
- **Gemini外部転送**: KabeHubからGoogle APIへは`x-goog-api-key`を使う。URLクエリ`?key=...`へ戻さない
- **H-21C（未着手・将来検討）**: BYOK資格情報の任意暗号化同期・複数端末対応。ローカル保存は廃止せずオプトイン同期とし、既存LocalStorageキーは明示操作でのみ移行する。生キーをブラウザへ返すAPIは作らず、登録・置換・削除だけを提供する
- **H-21C暗号化候補**: ①AWS/GCP KMS＋Vercel OIDC Federation、②AES-256-GCM＋Vercel Sensitive Environment Variable、③Supabase Vaultの順で検討する。生キー窃取とKabeHub経由の不正利用を分けて脅威モデル化し、規約改訂・明示同意を必須とする。Capacitorモバイル化前に再評価する

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
