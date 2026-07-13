# KabeHub リポジトリ全体 静的監査レポート — 項目G（ログ出力とセンシティブ情報）

- 監査日: 2026-07-13（Asia/Tokyo）
- 対象: 監査開始時点のGit追跡済み176ファイルと、ignoredファイル .env.local の計177ファイル
- 実行コード母集団: TypeScript / TSX / JavaScript / CommonJS 137ファイル
- 除外: node_modules、.next、.git（node_modules/next/package.json の開始条件確認を除く）
- 変更方針: コード・テスト・設定・既存文書は変更せず、本レポートだけを新規作成
- 非実施: DB接続、SQL実行、依存更新、コード修正

## サマリ

| 指標 | 件数 |
|---|---:|
| 指摘件数 | 7 |
| うちセンシティブ情報関連 | 4 |
| console.log / error / warn 呼び出し | 127 |
| 本番実行コード内 | 112 |
| テストコード内 | 15 |
| センシティブ情報を含みうる本番ログ | 16 |
| 一般的なエラー／警告ログ | 79 |
| 低リスクの進捗・件数・状態ログ | 17 |
| 実データのAPIキー・トークン・認証ヘッダー・service role keyを直接ログ引数にする箇所 | 0 |

| 区分 | 指摘件数 | 対象箇所数 | 高 | 中 | 低 |
|---|---:|---:|---:|---:|---:|
| センシティブ情報関連（G-001〜G-004） | 4 | 16 | 16 | 0 | 0 |
| 一般的なエラー／警告（G-005） | 1 | 79 | 0 | 79 | 0 |
| 低リスクの本番診断ログ（G-006） | 1 | 17 | 0 | 0 | 17 |
| テストハーネス出力（G-007） | 1 | 15 | 0 | 0 | 15 |
| 合計 | 7 | 127 | 16 | 79 | 32 |

メソッド別では、本番コードが console.error 72件、console.log 11件、console.warn 29件、テストが console.error 4件、console.log 11件、console.warn 0件である。

## 開始条件と安全確認

- 開始時の git status --short: 出力なし。docs/audit/ 外を含め未コミット差分なし。
- docs/audit/full-audit-g-2026-07-13.md: 開始時に不存在。
- node_modules/next/package.json: 存在、9,992 bytes。極端に小さいmanifestではないため監査を開始した。
- AGENTS.md: 再帰検索で該当なし。
- 監査開始時の tsconfig.tsbuildinfo: 141,857 bytes、SHA-256 B71482A1F1CC187AA29DFA25F73A6D28585632ACB99868C8AA52E308F125C473。
- rg --files --hidden --no-ignore で node_modules、.next、.git を除外すると177ファイル。git ls-files は176ファイルで、差分はignoredの .env.local 1ファイルだけだった。
- 監査中にコード、テスト、設定、既存文書を編集していない。

## 監査方法

全ファイルの語彙検索には次を使用した。

~~~text
rg -n --hidden --no-ignore -g '!node_modules/**' -g '!.next/**' -g '!.git/**' -g '!docs/audit/full-audit-g-2026-07-13.md' 'console\.(log|error|warn)' .
~~~

結果は143行だった。内訳は実際のCallExpression 127件、ソースコメント1件、Markdown内の説明・過去監査引用・コマンド例15件である。

実行コードの呼び出し抽出には次を使用した。

~~~text
rg -n --no-heading -g '*.ts' -g '*.tsx' -g '*.js' -g '*.cjs' -g '!node_modules/**' -g '!.next/**' 'console\.(log|error|warn)\s*\(' app components lib scripts middleware.ts next.config.js postcss.config.js tailwind.config.js
~~~

空白・改行を挟む表記の見落とし確認には次を使用し、同じ127件だった。

~~~text
rg -n -U --no-heading -g '*.ts' -g '*.tsx' -g '*.js' -g '*.cjs' -g '!node_modules/**' -g '!.next/**' 'console\s*\.\s*(log|error|warn)\s*\(' app components lib scripts middleware.ts next.config.js postcss.config.js tailwind.config.js
~~~

さらに、ローカルTypeScript compiler APIで137ファイルをparseし、console の log / error / warn に対するCallExpressionを列挙した。結果はrgと同じ127件だった。console?.log、console["log"]、consoleからの log / error / warn の分割代入も別grepで確認し、該当はなかった。

.env.local は値を表示せず、代入行を NAME=***REDACTED*** に置換して環境変数名だけを確認した。非コメントの実値をメモリ上で読み、全console CallExpressionのソース文字列と完全一致比較した結果は次のとおりだった。

~~~text
exact-env-value-in-console=<none>
credential-shaped-literal-in-console=<none>
~~~

確認したcredential系名称は ANTHROPIC_API_KEY、GEMINI_API_KEY、OPENAI_API_KEY、NEXT_PUBLIC_SUPABASE_ANON_KEY、SUPABASE_SERVICE_ROLE_KEY、UPSTASH_REDIS_REST_TOKEN、およびコード上の accessToken、authorization、session、password、secret 類である。値は本レポートへ取得・転記していない。

## 指摘

### [G-001] 設定抽出の失敗時に会話由来の生成結果全文を出力する
- 場所: app/api/extract-settings/route.ts:182
- 事実: userContent は受信した messages の content から組み立てられ、外部モデルの応答 rawText を整形した cleanText がJSON parse失敗時に全文のままconsoleへ渡る。

~~~ts
      ...messages.map(m =>
        `<message role="${normalizeMessageRole(m.role)}">\n${sanitizeReferenceText(m.content)}\n</message>`
~~~

~~~ts
const cleanText = rawText
~~~

~~~ts
console.error('[extract-settings] cleanText 全文:', cleanText)
~~~

- 分類: 情報のみ
- 推奨対応: parse失敗時は本文を記録せず、文字数・parseエラー種別・相関IDだけを残す案を検討する。
- 優先度: 高

### [G-002] GitHub連携のrepo・path・ref・ファイル名・AI選択パスを無条件に出力する
- 場所: lib/github.ts:206、lib/github.ts:254、lib/github-tool-loop.ts:335、lib/github-tool-loop.ts:356、app/api/chat/route.ts:1138、app/api/chat/route.ts:1192
- 事実: GitHubディレクトリ取得は repo、path、ref をそのまま出力する。Pinned Files警告はファイル名を含み、同じ警告配列がlib内とAPI routeの双方で出力される。Tool LoopはClaude応答の先頭200文字と、その応答からparseした pathsToRead を出力する。accessToken自体をconsole引数にする箇所はなかった。

~~~ts
console.log("[DEBUG][github.ts listGithubDirectory] fetching", { repo, path, ref: options?.ref });
~~~

~~~ts
console.warn("[Pinned GitHub Files]", warnings);
~~~

~~~ts
console.warn("[Pinned GitHub Files] warnings:", pinnedWarnings);
~~~

~~~ts
console.log("[DEBUG][Phase1] Claude response:", responseText.slice(0, 200));
~~~

~~~ts
console.log("[DEBUG][Phase2] pathsToRead", pathsToRead);
~~~

~~~ts
console.warn("[github-tool-loop] warnings:", discovery.warnings);
~~~

- 分類: 情報のみ
- 推奨対応: private repositoryの座標・ファイル名・モデル応答を既定で記録せず、必要な件数／成否だけを環境条件付きで残す案を検討する。
- 優先度: 高

### [G-003] 外部サービスの未加工エラー本文をconsoleへ渡す経路がある
- 場所: app/api/extract-settings/route.ts:121、app/api/extract-settings/route.ts:141、app/api/extract-settings/route.ts:164、app/page.tsx:860、lib/lore/search.ts:51、app/api/chat/route.ts:1532
- 事実: 設定抽出はAnthropic、Gemini、OpenAIのHTTPエラー本文 errText を無加工で出力する。

~~~ts
const errText = await res.text()
console.error('[extract-settings] Claude API error:', res.status, errText)
~~~

~~~ts
const errText = await res.text()
console.error('[extract-settings] Gemini API error:', res.status, errText)
~~~

~~~ts
const errText = await res.text()
console.error('[extract-settings] OpenAI API error:', res.status, errText)
~~~

画像生成画面の json.error は、app/api/image-gen/route.ts:42、86、127、169で取得したGemini、OpenAI、Ideogram、OpenRouterの res.text() をAPI応答経由で受け取る。

~~~ts
const err = await res.text()
~~~

~~~tsx
console.error('画像生成失敗:', json.error)
~~~

Lore検索は provider mode で取得したOpenAI error.messageをErrorへ移し、そのmessageを出力する。

~~~ts
const message = err instanceof Error ? err.message : String(err);
console.warn("[lore] embedding failed:", message);
~~~

waitUntilのフォールバック保存はSupabase RESTの失敗応答本文を直接出力する。service role key自体はconsole引数ではない。

~~~ts
console.error("[waitUntil] フォールバック保存失敗:", await res.text());
~~~

- 分類: 情報のみ
- 推奨対応: 外部応答本文を固定のエラー分類・HTTP status・相関IDへ置き換え、本文は記録しない案を検討する。
- 優先度: 高

### [G-004] ユーザー・スレッド・メッセージ識別子を構造化引数で出力する
- 場所: app/api/album/route.ts:47、app/api/messages/[id]/route.ts:68、app/api/chat/route.ts:1296
- 事実: ownership検証失敗時に userId、messageId を出力し、assistant保存失敗時に threadId、assistantMessageId を出力する。実際の識別子値は本レポートには含めていない。

~~~ts
console.warn("[album] skipped storagePaths outside user namespace", {
  userId: user.id,
  skippedCount,
~~~

~~~ts
console.warn("[delete_image] storagePath is outside user namespace; skipped storage.remove", {
  messageId: params.id,
  userId: user.id,
~~~

~~~ts
console.error("[chat] エラーパスでのassistantメッセージ保存に失敗しました", { threadId, assistantMessageId });
~~~

- 分類: 情報のみ
- 推奨対応: 永続ログでは内部識別子を省略するか、短期相関ID／不可逆化した値へ置き換える案を検討する。
- 優先度: 高

### [G-005] 本番コードに一般的なエラー／警告のconsole出力が79箇所残る
- 場所:
  - app/album/page.tsx:300、342
  - app/api/arena/route.ts:130
  - app/api/chat/route.ts:483、1105、1195、1221
  - app/api/explore/route.ts:153
  - app/api/extract-settings/route.ts:181、198、204
  - app/api/messages/[id]/route.ts:22、64
  - app/api/reports/route.ts:62、73
  - app/api/threads/[id]/copy/route.ts:79
  - app/api/threads/[id]/likes/route.ts:47、60、96
  - app/api/threads/[id]/messages/[messageId]/route.ts:21
  - app/api/threads/[id]/messages/route.ts:25、82
  - app/api/threads/[id]/route.ts:32、47
  - app/arena/page.tsx:242、333、367
  - app/explore/page.tsx:480
  - app/page.tsx:106、183、206、252、336、353、438、634、691、697、755、884、1029、1035、1086、1113、1126、1152、1172、1194、1207、1225、1260
  - app/settings/page.tsx:313、337、1114
  - app/share/[token]/page.tsx:191
  - components/ChatPanel.tsx:350、436、449、461、541、576、599、641、752、768、782、797、811、827、846
  - components/MarkdownRenderer.tsx:81
  - components/Sidebar.tsx:714
  - lib/github-token-store.ts:75、104
  - lib/lore/search.ts:74、108
  - lib/mcp-auth.ts:34、47、50
- 事実: 79箇所はconsole.error 64件、console.warn 15件で、catch変数、Supabase error object、または error.message を出力する。ソース上のconsole引数にAPIキー、token値、Authorization header、session、password、secretを直接渡す箇所はなかったが、エラー情報の項目をallow-listする処理はない。代表例:

~~~tsx
console.error("アルバム取得失敗:", err);
~~~

~~~ts
console.error("Storage削除エラー:", JSON.stringify(storageError));
~~~

~~~ts
console.error("通報用Supabaseクライアントの初期化エラー:", serviceRoleError);
~~~

~~~ts
console.warn('[mcp-auth] Failed to update MCP token last_used_at:', err)
~~~

~~~ts
console.warn("Failed to archive lore_embeddings for deleted thread:", archiveError.message);
~~~

- 分類: 不統一
- 推奨対応: エラーcode・処理名・相関IDだけをallow-listする共通loggerへ揃え、任意objectの直接出力を避ける案を検討する。
- 優先度: 中

### [G-006] 非センシティブな進捗・件数・状態ログが本番コードに17箇所残る
- 場所: app/api/chat/route.ts:220、231、426、1009、1079、1241、1374、1494、1530、1535、app/arena/page.tsx:309、lib/github-tool-loop.ts:238、310、379、lib/github.ts:262、lib/lore/search.ts:156、185
- 事実: 17箇所はconsole.log 8件、console.warn 8件、console.error 1件。app/api/chat/route.ts:220、231、1241の3件は NODE_ENV === "development" 条件下で、残る14件はソース上に同等の環境条件がない。引数はtoken使用量、HTTP status、件数、boolean、timeout値、成功／失敗状態であり、tokenという語を含む input_tokens 等は認証tokenではなく数値の使用量である。代表例:

~~~ts
console.log("[OpenAI Cache]", { cached: cachedTokens, normal: normalTokens, total: usage?.prompt_tokens });
~~~

~~~ts
console.warn("[lore] combined search timed out — skipping injection");
~~~

~~~ts
console.log("[waitUntil] フォールバック保存成功");
~~~

~~~ts
console.log("[DEBUG][Phase1] root listing", { hasError: "error" in rootResult });
~~~

~~~ts
console.log("[DEBUG][github.ts listGithubDirectory] response status", response.status);
~~~

- 分類: 不統一
- 推奨対応: 本番で必要な運用イベントを定義し、残すものはlevelと環境条件を統一する案を検討する。
- 優先度: 低

### [G-007] テストハーネスが結果表示に15件のconsole出力を使う
- 場所: scripts/ai-context-blocks.test.cjs:78、scripts/branchTree.test.cjs:171、scripts/loadModel.test.cjs:182、scripts/lore-openai.test.cjs:26、28、137、scripts/lore.test.cjs:72、74、80、82、411、412、414、scripts/modelRegistry.test.cjs:124、scripts/pricing.test.cjs:129
- 事実: console.log 11件、console.error 4件で、テスト名、TAP形式の合否、集計件数、失敗時のErrorをCLIへ表示するテスト専用コードである。実行コードからimportされる経路は確認されなかった。代表例:

~~~js
console.log("pricing tests passed");
~~~

~~~js
console.log("modelRegistry tests passed");
~~~

~~~js
console.error(error);
~~~

- 分類: 情報のみ
- 推奨対応: 現行の直接実行テスト出力として許容するか、将来のtest runner移行時にrunnerのreporterへ集約する案を検討する。
- 優先度: 低

## 問題なしと判断した確認

### 実シークレット値の直接ログ出力

問題なし。次の確認を組み合わせた。

1. 127件のconsole CallExpressionについて引数AST内のidentifierを列挙し、apiKey、token、secret、authorization、session、password、serviceRole、accessTokenを大小文字無視で検索した。
2. 該当したのは数値メトリクスの input_tokens、output_tokens、cachedTokens、estimatedInputTokens と、app/api/reports/route.ts:62 の serviceRoleError だけだった。
3. app/api/reports/route.ts:7 の実キー変数は serviceRoleKey であり、console引数は別変数 serviceRoleError だった。components/ChatPanel.tsx:350 もAPIキー値ではなくcatch変数 err、lib/mcp-auth.ts:34、47、50もtoken値ではなくerror.messageまたはerr、app/api/chat/route.ts:1535も環境変数名を含む固定文字列だけだった。
4. .env.local の非コメント実値とconsole CallExpressionソースの完全一致比較は0件、credential形状の文字列literal検索も0件だった。

確認対象はconsole呼び出しを持つ次の33ファイルすべてである。

~~~text
app/album/page.tsx
app/api/album/route.ts
app/api/arena/route.ts
app/api/chat/route.ts
app/api/explore/route.ts
app/api/extract-settings/route.ts
app/api/messages/[id]/route.ts
app/api/reports/route.ts
app/api/threads/[id]/copy/route.ts
app/api/threads/[id]/likes/route.ts
app/api/threads/[id]/messages/[messageId]/route.ts
app/api/threads/[id]/messages/route.ts
app/api/threads/[id]/route.ts
app/arena/page.tsx
app/explore/page.tsx
app/page.tsx
app/settings/page.tsx
app/share/[token]/page.tsx
components/ChatPanel.tsx
components/MarkdownRenderer.tsx
components/Sidebar.tsx
lib/github-token-store.ts
lib/github-tool-loop.ts
lib/github.ts
lib/lore/search.ts
lib/mcp-auth.ts
scripts/ai-context-blocks.test.cjs
scripts/branchTree.test.cjs
scripts/loadModel.test.cjs
scripts/lore-openai.test.cjs
scripts/lore.test.cjs
scripts/modelRegistry.test.cjs
scripts/pricing.test.cjs
~~~

### consoleの代替表記

問題なし。console?.log、console["log"]、console["error"]、console["warn"]、およびconsoleからの log / error / warn の分割代入をgrepしたが0件だった。空白・改行許容regexとTypeScript ASTの件数も通常regexの127件と一致した。

### console呼び出しのない実行コード

問題なし。git ls-files から .ts、.tsx、.js、.cjs の137ファイルを抽出し、上記33ファイルとの差集合104ファイルを確認した。ファイル一覧は「console呼び出しなし実行ファイル」に記載する。

## 全console呼び出し一覧

行番号は呼び出し開始行。全127件を列挙する。

| ファイル | console.log | console.error | console.warn | 計 |
|---|---|---|---|---:|
| app/album/page.tsx | — | 300, 342 | — | 2 |
| app/api/album/route.ts | — | — | 47 | 1 |
| app/api/arena/route.ts | — | 130 | — | 1 |
| app/api/chat/route.ts | 220, 231, 426, 1530 | 483, 1105, 1195, 1296, 1532, 1535 | 1009, 1079, 1138, 1192, 1221, 1241, 1374, 1494 | 18 |
| app/api/explore/route.ts | — | 153 | — | 1 |
| app/api/extract-settings/route.ts | — | 121, 141, 164, 181, 182, 198, 204 | — | 7 |
| app/api/messages/[id]/route.ts | — | 64 | 22, 68 | 3 |
| app/api/reports/route.ts | — | 62, 73 | — | 2 |
| app/api/threads/[id]/copy/route.ts | — | 79 | — | 1 |
| app/api/threads/[id]/likes/route.ts | — | 60, 96 | 47 | 3 |
| app/api/threads/[id]/messages/[messageId]/route.ts | — | — | 21 | 1 |
| app/api/threads/[id]/messages/route.ts | — | 25 | 82 | 2 |
| app/api/threads/[id]/route.ts | — | — | 32, 47 | 2 |
| app/arena/page.tsx | — | 242, 333 | 309, 367 | 4 |
| app/explore/page.tsx | — | 480 | — | 1 |
| app/page.tsx | — | 106, 183, 206, 252, 336, 353, 438, 634, 691, 697, 755, 860, 884, 1029, 1035, 1086, 1113, 1126, 1152, 1172, 1194, 1207, 1225, 1260 | — | 24 |
| app/settings/page.tsx | — | 313, 337, 1114 | — | 3 |
| app/share/[token]/page.tsx | — | 191 | — | 1 |
| components/ChatPanel.tsx | — | 350, 436, 449, 461, 541, 576, 599, 641, 752, 768, 782, 797, 811, 827, 846 | — | 15 |
| components/MarkdownRenderer.tsx | — | 81 | — | 1 |
| components/Sidebar.tsx | — | 714 | — | 1 |
| lib/github-token-store.ts | — | — | 75, 104 | 2 |
| lib/github-tool-loop.ts | 238, 310, 335, 356, 379 | — | — | 5 |
| lib/github.ts | 254, 262 | — | 206 | 3 |
| lib/lore/search.ts | — | — | 51, 74, 108, 156, 185 | 5 |
| lib/mcp-auth.ts | — | — | 34, 47, 50 | 3 |
| scripts/ai-context-blocks.test.cjs | 78 | — | — | 1 |
| scripts/branchTree.test.cjs | 171 | — | — | 1 |
| scripts/loadModel.test.cjs | 182 | — | — | 1 |
| scripts/lore-openai.test.cjs | 26, 137 | 28 | — | 3 |
| scripts/lore.test.cjs | 72, 80, 411, 412 | 74, 82, 414 | — | 7 |
| scripts/modelRegistry.test.cjs | 124 | — | — | 1 |
| scripts/pricing.test.cjs | 129 | — | — | 1 |
| 合計 | 22 | 76 | 29 | 127 |

## 呼び出しではないconsole語彙一致

次の16件は実行時のconsole呼び出しではないため、127件から除外した。

- lib/lore/search.ts:38 — ソースコメント
- CLAUDE.md:482 — 説明文
- docs/audit/full-audit-a-2026-07-13.md:328、336、341 — 過去監査のコード引用
- docs/audit/full-audit-b-2026-07-13.md:46 — 監査用コマンド例
- docs/audit/full-audit-f-2026-07-13.md:387、393、438、460、479、493、499、513、527、639 — 過去監査のコード引用

## console呼び出しなし実行ファイル

次の104ファイルは、上記grepとASTの双方でconsole.log / error / warn CallExpressionが0件だった。

~~~text
app/[handle]/default.tsx
app/[handle]/page.tsx
app/[handle]/ProfilePage.tsx
app/api/auth/github/callback/route.ts
app/api/auth/github/route.ts
app/api/auth/github/status/route.ts
app/api/calendar/route.ts
app/api/fetch-github/route.ts
app/api/folder-settings/route.ts
app/api/image-gen/route.ts
app/api/lore/[id]/route.ts
app/api/lore/batch-train/route.ts
app/api/lore/bulk-archive/route.ts
app/api/lore/chunks/[id]/route.ts
app/api/lore/chunks/route.ts
app/api/lore/consolidate/candidates/route.ts
app/api/lore/consolidate/dismiss/route.ts
app/api/lore/consolidate/merge/route.ts
app/api/lore/consolidate/preview/route.ts
app/api/lore/dreaming-batch/history/route.ts
app/api/lore/dreaming-batch/rollback/route.ts
app/api/lore/dreaming-batch/route.ts
app/api/lore/embed/route.ts
app/api/lore/like/route.ts
app/api/lore/route.ts
app/api/lore/update-temporal-status/route.ts
app/api/mcp-tokens/route.ts
app/api/mcp/threads/[id]/messages/route.ts
app/api/mcp/threads/route.ts
app/api/novel-check/route.ts
app/api/profile/route.ts
app/api/search/route.ts
app/api/share/[token]/fork/route.ts
app/api/share/[token]/route.ts
app/api/stats/route.ts
app/api/threads/[id]/branch-to/route.ts
app/api/threads/[id]/drafts/route.ts
app/api/threads/[id]/message-notes/route.ts
app/api/threads/[id]/messages/restore-branch/route.ts
app/api/threads/[id]/notes/route.ts
app/api/threads/[id]/tags/route.ts
app/api/threads/route.ts
app/arena/[token]/ArenaViewPage.tsx
app/arena/[token]/default.tsx
app/arena/[token]/page.tsx
app/auth/callback/route.ts
app/calendar/page.tsx
app/image/page.tsx
app/layout.tsx
app/legal/page.tsx
app/login/page.tsx
app/memory/page.tsx
app/novel-check/page.tsx
app/privacy/page.tsx
app/sitemap.ts
app/stats/page.tsx
app/terms/page.tsx
app/threads/[id]/tree/page.tsx
components/ArenaTimeline.tsx
components/BranchTree.tsx
components/ChatInput.tsx
components/ChatInputCentered.tsx
components/ExportModal.tsx
components/LegalLayout.tsx
components/MessageBubble.tsx
components/NovelSettingsPane.tsx
components/OutlinePane.tsx
components/PublishConfirmModal.tsx
components/RoleplayBubble.tsx
lib/ai-context-blocks.ts
lib/branching.ts
lib/branchTree.ts
lib/context-window.ts
lib/exportUtils.ts
lib/genres.ts
lib/github-token-crypto.ts
lib/internalModels.ts
lib/lore/batchTrain.ts
lib/lore/consolidation.ts
lib/lore/dreaming.ts
lib/lore/index.ts
lib/lore/mappers.ts
lib/lore/openai.ts
lib/lore/selects.ts
lib/lore/types.ts
lib/loreMemorySelect.ts
lib/mock-db.ts
lib/modelRegistry.ts
lib/pricing.ts
lib/rate-limit.ts
lib/storage-path-guard.ts
lib/stringUtils.ts
lib/supabase-db.ts
lib/supabase.ts
lib/supabase/client.ts
lib/supabase/download-image.ts
lib/supabase/route-handler.ts
lib/supabase/server.ts
middleware.ts
next-env.d.ts
next.config.js
postcss.config.js
tailwind.config.js
types/index.ts
~~~

## 非実行ファイルの確認一覧

次の40ファイルもhidden/ignoredを含む全体grepの対象にした。Markdownとソースコメントの16語彙一致は前節に分離し、実行可能なconsole呼び出しとしては計上していない。.env.local は値をマスクした名前確認とメモリ内の完全一致比較だけを行った。SQLは実行していない。

~~~text
.claude/settings.local.json
.claudeignore
.env.local
.env.local.example
.gitignore
app/globals.css
CLAUDE.md
docs/applied/migration_rls_cleanup_p0.sql
docs/applied/migration_v119_github_oauth.sql
docs/applied/migration_v120_github_phase4.sql
docs/applied/migration_v121_expose_share_token.sql
docs/applied/migration_v122_create_likes.sql
docs/applied/migration_v123_rpc_hardening.sql
docs/applied/migration_v125_reports_thread_fk_set_null.sql
docs/applied/migration_v125b_submit_report_function.sql
docs/applied/migration_v125c_submit_report_permission_fix.sql
docs/applied/migration_v126_find_similar_lore_pairs_liked_ai_protection.sql
docs/applied/migration_v127_public_threads_view_security_invoker.sql
docs/applied/README.md
docs/applied/v141c_migration.sql
docs/applied/v175_migration.sql
docs/applied/v78_mcp_tokens_migration.sql
docs/applied/v89_migration.sql
docs/audit/full-audit-a-2026-07-13.md
docs/audit/full-audit-b-2026-07-13.md
docs/audit/full-audit-c-2026-07-13.md
docs/audit/full-audit-d-2026-07-13.md
docs/audit/full-audit-e-2026-07-13.md
docs/audit/full-audit-f-2026-07-13.md
docs/lore-refactoring-notes.md
docs/schema.sql
LICENSE
package-lock.json
package.json
public/og-image.png
README.en.md
README.md
supabase-schema.OBSOLETE.sql
tsconfig.json
tsconfig.tsbuildinfo
~~~

## 既存検証コマンドの実行結果

package.json にtest scriptはないため、追跡済みの scripts/*.test.cjs 7本をすべて直接実行した。

| コマンド | 結果 | 記録 |
|---|---|---|
| node scripts/ai-context-blocks.test.cjs | 成功（exit 0） | ai-context-blocks tests passed |
| node scripts/branchTree.test.cjs | 成功（exit 0） | branchTree tests passed |
| node scripts/loadModel.test.cjs | 成功（exit 0） | loadModel tests passed |
| node scripts/lore-openai.test.cjs | 成功（exit 0） | 11 lore OpenAI tests passed |
| node scripts/lore.test.cjs | 成功（exit 0） | 20 lore characterization tests passed |
| node scripts/modelRegistry.test.cjs | 成功（exit 0） | modelRegistry tests passed |
| node scripts/pricing.test.cjs | 成功（exit 0） | pricing tests passed |
| npx tsc --noEmit | 成功（exit 0） | stdoutなし |
| npm run build | 成功（exit 0） | Compiled successfully、static pages 26/26 |

npm run build のsandbox内初回実行はNext.js worker生成時の spawn EPERM で終了した。コードのcompile errorではなく子プロセス制限だったため、同一コマンドを許可されたsandbox外で再実行し、上表の成功結果を得た。

### tsconfig.tsbuildinfo 復元記録

- 型検査前: 141,857 bytes、SHA-256 B71482A1F1CC187AA29DFA25F73A6D28585632ACB99868C8AA52E308F125C473
- 型検査／ビルド後: 135,474 bytes、SHA-256 91276E26F6506DEFC29D0617D992505AFAC656227842A02C2499563B33C92794
- git restore --worktree -- tsconfig.tsbuildinfo 実行後: 141,857 bytes、SHA-256 B71482A1F1CC187AA29DFA25F73A6D28585632ACB99868C8AA52E308F125C473
- 復元後のサイズとSHA-256は開始時と一致した。

## 最終 git status --short

~~~text
?? docs/audit/full-audit-g-2026-07-13.md
~~~
