# KabeHub リポジトリ全体 静的監査レポート — 項目D（重複ロジック）

- 監査日: 2026-07-13（Asia/Tokyo）
- 監査方式: 読み取り専用の静的監査（本レポート以外のコード・テスト・設定は未変更）
- 対象: 追跡済みのアプリケーションコード、API route、共通ライブラリ、UI component、テストスクリプト、ルート設定、現行 `docs/schema.sql`
- 非対象: `node_modules/`、`.next/`、画像、ライセンス、説明文書内のサンプルコード、履歴として保存された `docs/applied/*.sql` 間の重複、`supabase-schema.OBSOLETE.sql`

## サマリ

| 優先度 | 件数 |
|---|---:|
| 高 | 2 |
| 中 | 19 |
| 低 | 0 |
| **合計** | **21** |

| 分類 | 件数 |
|---|---:|
| 乖離 | 0 |
| デッドコード | 0 |
| 重複 | 16 |
| ハードコード | 1 |
| 不統一 | 4 |
| 情報のみ | 0 |

既知のローカル `clamp` 4箇所は **4/4箇所すべて残存しており、未解消**。さらに、共通化先になり得る `lib/lore/mappers.ts` に同一本体のexport済み `clamp` があり、実装総数は5である。

## 開始条件と安全確認

開始時に次を確認した。

- `git status --short`: 出力なし（clean）。`docs/audit/` 配下を含め、未コミット差分なし。
- `docs/audit/full-audit-d-2026-07-13.md`: 未存在。
- `node_modules/next/package.json`: 存在、9,992 bytes。極端に小さいファイルではないため監査を続行。
- `rg --files -g 'AGENTS.md' -g '!node_modules/**' -g '!.next/**'`: 該当なし。

## 確認方法

実行した主な検索コマンドは以下。いずれもファイルを書き換えない。

- `rg --files -g '!node_modules/**' -g '!.next/**' -g '!.git/**'`
- `rg -n -C 3 "clamp|Math\\.min\\(|Math\\.max\\(" app/api/lore/consolidate/candidates/route.ts app/api/lore/dreaming-batch/route.ts app/api/lore/batch-train/route.ts lib/lore/batchTrain.ts`
- `rg -n --glob '*.ts' --glob '*.tsx' "^(export\\s+)?(async\\s+)?function\\s+[A-Za-z_$][\\w$]*|^(export\\s+)?const\\s+[A-Za-z_$][\\w$]*\\s*=\\s*(async\\s*)?\\(" app/api lib`
- `rg -n --glob '*.ts' --glob '*.tsx' "^(export\\s+)?const\\s+[A-Z][A-Z0-9_]*\\s*=" app/api lib`
- `rg -n "DREAMING_DEFAULTS|LIKED_AI_DEFAULTS|BATCH_TRAIN_UI_REQUEST_LIMIT" app components lib`
- `rg -n "downloadImageAsBase64|supabase/download-image" app components lib scripts`
- `rg -n "serviceRoleClient|createServiceRoleSupabaseClient" app lib`
- `rg -n -i "create\\s+(or\\s+replace\\s+)?function|create\\s+(or\\s+replace\\s+)?procedure" docs/schema.sql`
- `rg -n -i "create\\s+(or\\s+replace\\s+)?function|create\\s+(or\\s+replace\\s+)?procedure" docs/applied supabase-schema.OBSOLETE.sql`

加えて、ローカルの `typescript` Compiler APIを標準入力から起動する一時Nodeスクリプト（ファイル作成なし）で、関数宣言・function expression・arrow function・const initializerを抽出した。次の比較を行った。

1. コメントと空白を除いた関数本体の完全一致。
2. identifier名を捨象し、構文kind・property名・literalを使った構造一致。
3. identifier/string/numberを正規化したtoken 3-gramのJaccard類似度とtoken長比。
4. 同名関数のファイル横断一覧。
5. `docs/schema.sql` の22関数について、dollar-quoted bodyを抽出して空白・コメントを正規化しSHA-256を比較。

`app/api` と `lib` の85ファイルでは277関数・1,027個のconst宣言を抽出した。範囲を `app`、`components`、`lib`、`types`、`scripts`、`middleware.ts`、`next.config.js` に広げた比較では134ファイル・547関数・2,205個のconst宣言を抽出した。候補は必ず後述の実ファイルを開いて照合し、単なる同種API呼び出しや単一の `map`、共通する認証prefixだけでは指摘にしていない。

## 指摘

### [D-01] 既知4箇所を含む `clamp` が5重定義されている
- 場所: `app/api/lore/consolidate/candidates/route.ts:10`、`app/api/lore/dreaming-batch/route.ts:7`、`app/api/lore/batch-train/route.ts:7`、`lib/lore/batchTrain.ts:30`、`lib/lore/mappers.ts:22`
- 事実: 5箇所すべてで引数、返却式、処理ステップが完全一致する。既知の4箇所はすべて残存し、`lib/lore/mappers.ts` には同一のexport済み実装も存在する。

`app/api/lore/consolidate/candidates/route.ts:10`:

```ts
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
```

`app/api/lore/dreaming-batch/route.ts:7`:

```ts
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
```

`app/api/lore/batch-train/route.ts:7`:

```ts
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
```

`lib/lore/batchTrain.ts:30`:

```ts
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
```

`lib/lore/mappers.ts:22`:

```ts
export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
```

- 分類: 重複
- 推奨対応: `clamp` の配置先とclient/server依存境界をレビューし、単一実装への集約を検討する。
- 優先度: 中

### [D-02] Dreamingの既定値が共通定数とroute内に二重定義されている
- 場所: `lib/lore/types.ts:23`、`app/api/lore/dreaming-batch/route.ts:28`、`app/api/lore/dreaming-batch/route.ts:29`、`app/memory/page.tsx:841`
- 事実: UIは `DREAMING_DEFAULTS` を送信する一方、API routeは同じ `limit: 5` と `threshold: 0.92` をimportせず、fallback literalとして再定義している。

`lib/lore/types.ts:23`:

```ts
export const DREAMING_DEFAULTS = { limit: 5, threshold: 0.92 } as const;
```

`app/api/lore/dreaming-batch/route.ts:28`:

```ts
const limit = clamp(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 5, 1, 5);
const threshold = clamp(Number.isFinite(rawThreshold) ? rawThreshold : 0.92, 0.80, 0.98);
```

`app/memory/page.tsx:841`:

```ts
body: JSON.stringify(DREAMING_DEFAULTS),
```

- 分類: ハードコード
- 推奨対応: API fallbackとUI request defaultを同一のserver-safe定数から参照する案を検討する。
- 優先度: 中

### [D-03] chat/arenaの既定モデルmapと3つのtype guardが同型で重複している
- 場所: `app/api/chat/route.ts:43`、`app/api/chat/route.ts:59`、`app/api/chat/route.ts:63`、`app/api/chat/route.ts:67`、`app/api/arena/route.ts:12`、`app/api/arena/route.ts:18`、`app/api/arena/route.ts:22`、`app/api/arena/route.ts:26`
- 事実: `DEFAULT_MODELS` は3 providerを同じ順序・同じ関数で組み立て、差はsurface literalの `"chat"` / `"arena"` のみ。3つのtype guardも引数型・型述語・1ステップの処理が一致し、同じsurface literalだけが異なる。

`app/api/chat/route.ts:43`:

```ts
const DEFAULT_MODELS: Record<string, ModelId> = {
  claude: getDefaultModel("claude", "chat") as ModelId,
  gemini: getDefaultModel("gemini", "chat") as ModelId,
```

`app/api/arena/route.ts:12`:

```ts
const DEFAULT_MODELS: Record<string, ModelId> = {
  claude: getDefaultModel("claude", "arena") as ModelId,
  gemini: getDefaultModel("gemini", "arena") as ModelId,
```

`app/api/chat/route.ts:59`:

```ts
function isClaudeModel(modelId: string): modelId is ClaudeModel {
  return isAllowedModel("claude", modelId, "chat");
}
```

`app/api/arena/route.ts:18`:

```ts
function isClaudeModel(modelId: string): modelId is ClaudeModel {
  return isAllowedModel("claude", modelId, "arena");
}
```

`app/api/chat/route.ts:63`:

```ts
function isGeminiModel(modelId: string): modelId is GeminiModel {
  return isAllowedModel("gemini", modelId, "chat");
}
```

`app/api/arena/route.ts:22`:

```ts
function isGeminiModel(modelId: string): modelId is GeminiModel {
  return isAllowedModel("gemini", modelId, "arena");
}
```

`app/api/chat/route.ts:67`:

```ts
function isOpenAIModel(modelId: string): modelId is OpenAIModel {
  return isAllowedModel("openai", modelId, "chat");
}
```

`app/api/arena/route.ts:26`:

```ts
function isOpenAIModel(modelId: string): modelId is OpenAIModel {
  return isAllowedModel("openai", modelId, "arena");
}
```

- 分類: 重複
- 推奨対応: surfaceを引数に取るmodel resolver/type-guard factoryへ寄せるか、重複を許容する理由を明文化する。
- 優先度: 中

### [D-04] Storage所有権guardが二重定義され、backslash判定が一致しない
- 場所: `app/api/chat/route.ts:72`、`lib/storage-path-guard.ts:15`
- 事実: 関数名・引数型・型述語・目的は同一。chat版は `\\` を拒否するが、共通helper版にはその条件がない。

`app/api/chat/route.ts:72`:

```ts
function isOwnedStoragePath(path: unknown, userId: string): path is string {
  return (
    typeof path === "string" &&
```

`app/api/chat/route.ts:76`:

```ts
!path.startsWith("/") &&
!path.includes("..") &&
!path.includes("\\")
```

`lib/storage-path-guard.ts:15`:

```ts
export function isOwnedStoragePath(path: unknown, userId: string): path is string {
  if (typeof path !== 'string' || path.length === 0) return false
  if (path.startsWith('/')) return false
```

`lib/storage-path-guard.ts:18`:

```ts
if (path.includes('..')) return false
return path.startsWith(`${userId}/`)
```

- 分類: 不統一
- 推奨対応: Storage pathの正規化・区切り文字仕様を決め、全利用箇所を単一guardに統一する案を検討する。
- 優先度: 高

### [D-05] middlewareがroute handler用Supabase cookie adapterを再実装している
- 場所: `middleware.ts:7`、`lib/supabase/route-handler.ts:4`
- 事実: URL/key、`req.cookies.getAll()`、`res.cookies.set()` を渡す `createServerClient` 構築手順が一致する。middlewareは共通helperを使わず同じadapterを関数内に展開している。

`middleware.ts:7`:

```ts
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
```

`middleware.ts:15`:

```ts
setAll(cookiesToSet) {
  cookiesToSet.forEach(({ name, value, options }) => {
    res.cookies.set(name, value, options);
```

`lib/supabase/route-handler.ts:8`:

```ts
return createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
```

`lib/supabase/route-handler.ts:16`:

```ts
setAll(cookiesToSet) {
  cookiesToSet.forEach(({ name, value, options }) => {
    res.cookies.set(name, value, options);
```

- 分類: 重複
- 推奨対応: Edge runtime互換性を確認したうえでcookie adapter構築を共通化するか、分離理由をコメントで固定する。
- 優先度: 中

### [D-06] MCP tokenのSHA-256 hex化が発行routeと認証libに重複している
- 場所: `app/api/mcp-tokens/route.ts:31`、`lib/mcp-auth.ts:21`
- 事実: raw tokenを `TextEncoder` でbyte列化し、SHA-256 digestを各byteの2桁hexへ連結する全手順が一致する。token認証に直結する同一処理が2箇所にある。

`app/api/mcp-tokens/route.ts:31`:

```ts
const hashBuffer = await crypto.subtle.digest(
  "SHA-256",
  new TextEncoder().encode(rawToken)
```

`app/api/mcp-tokens/route.ts:35`:

```ts
const tokenHash = Array.from(new Uint8Array(hashBuffer))
  .map((b) => b.toString(16).padStart(2, "0"))
  .join("");
```

`lib/mcp-auth.ts:21`:

```ts
const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken))
const tokenHash = Array.from(new Uint8Array(hashBuffer))
  .map(b => b.toString(16).padStart(2, '0'))
```

`lib/mcp-auth.ts:24`:

```ts
.join('')
```

- 分類: 重複
- 推奨対応: token文字列から固定形式hashを返す単一helperを発行・照合の双方から使う案を検討する。
- 優先度: 高

### [D-07] Rate limitの判定wrapperとMCP 429応答adapterがそれぞれ重複している
- 場所: `lib/rate-limit.ts:35`、`lib/rate-limit.ts:42`、`app/api/mcp/threads/route.ts:5`、`app/api/mcp/threads/[id]/messages/route.ts:5`
- 事実: `checkChatRateLimit` と `checkMcpRateLimit` はprefix/limit以外の処理が同一。さらに `checkMcpLimitResponse` は2 routeで関数本体が完全一致する。

`lib/rate-limit.ts:35`:

```ts
export async function checkChatRateLimit(userId: string): Promise<RateLimitResult> {
  const rl = createRateLimiter("kabehub:chat", 20, "1 m");
  if (!rl) return { allowed: true, limit: 0, remaining: 0, resetAt: 0 };
```

`lib/rate-limit.ts:42`:

```ts
export async function checkMcpRateLimit(userId: string): Promise<RateLimitResult> {
  // MCP limit starts at 60 requests/minute and is expected to be tuned in operations.
  const rl = createRateLimiter("kabehub:mcp", 60, "1 m");
```

`app/api/mcp/threads/route.ts:5`:

```ts
async function checkMcpLimitResponse(userId: string): Promise<NextResponse | null> {
  const rl = await checkMcpRateLimit(userId)
  if (rl.allowed) return null
```

`app/api/mcp/threads/[id]/messages/route.ts:5`:

```ts
async function checkMcpLimitResponse(userId: string): Promise<NextResponse | null> {
  const rl = await checkMcpRateLimit(userId)
  if (rl.allowed) return null
```

`app/api/mcp/threads/route.ts:9`:

```ts
const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
return NextResponse.json(
  {
```

`app/api/mcp/threads/[id]/messages/route.ts:9`:

```ts
const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
return NextResponse.json(
  {
```

- 分類: 重複
- 推奨対応: policy引数を取る内部判定helperと、共有MCP 429 response helperへの集約を検討する。
- 優先度: 中

### [D-08] GitHub Contents APIのpath encoding・切り詰め・base64 decodeが二重実装されている
- 場所: `lib/github-tool-loop.ts:103`、`lib/github-tool-loop.ts:107`、`lib/github-tool-loop.ts:115`、`lib/github.ts:48`、`lib/github.ts:66`、`lib/github.ts:92`
- 事実: path segmentごとのencodeと30,000文字でのtruncateは関数本体が完全一致する。`readGithubFileByPath` と `fetchGithubFile` のContents API fallbackも、JSON shape確認、空白除去、base64 decode、truncate返却が一致する。

`lib/github-tool-loop.ts:103`:

```ts
function encodeGithubPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
```

`lib/github.ts:48`:

```ts
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
```

`lib/github-tool-loop.ts:107`:

```ts
function truncateGithubContent(content: string): { content: string; truncated: boolean } {
  if (content.length <= MAX_CHARS_PER_FILE) {
    return { content, truncated: false };
```

`lib/github.ts:66`:

```ts
function truncateContent(content: string): { content: string; truncated: boolean } {
  if (content.length <= MAX_CHARS_PER_FILE) {
    return { content, truncated: false };
```

`lib/github-tool-loop.ts:148`:

```ts
const content = Buffer
  .from((data as { content: string }).content.replace(/\s/g, ""), "base64")
  .toString("utf8");
```

`lib/github.ts:139`:

```ts
const content = Buffer
  .from((data as { content: string }).content.replace(/\s/g, ""), "base64")
  .toString("utf8");
```

- 分類: 重複
- 推奨対応: repo/path/refを受け取る共有Contents API readerへ寄せ、URL検証とtool-loop固有制約だけを呼び出し側に残す案を検討する。
- 優先度: 中

### [D-09] chat routeが既存のSupabase画像download helperをインライン再実装している
- 場所: `app/api/chat/route.ts:1081`、`lib/supabase/download-image.ts:3`
- 事実: 同じbucketからstorage pathをdownloadし、BlobをArrayBuffer経由でbase64化する処理が一致する。`app/api/image-gen/route.ts:230` は既存helperを利用する一方、chat routeは利用していない。

`app/api/chat/route.ts:1081`:

```ts
const { data: blob } = await supabase.storage
  .from('generated-images')
  .download(storagePath)
```

`app/api/chat/route.ts:1085`:

```ts
if (blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
```

`lib/supabase/download-image.ts:3`:

```ts
export async function downloadImageAsBase64(
  supabase: SupabaseClient,
  storagePath: string
```

`lib/supabase/download-image.ts:7`:

```ts
const { data: blob, error } = await supabase.storage
  .from('generated-images')
  .download(storagePath)
```

`lib/supabase/download-image.ts:11`:

```ts
const arrayBuffer = await blob.arrayBuffer()
const base64 = Buffer.from(arrayBuffer).toString('base64')
return { base64, mimeType: blob.type || 'image/png' }
```

- 分類: 重複
- 推奨対応: 所有権検証後のdownload/base64化を既存helperに委譲できるかレビューする。
- 優先度: 中

### [D-10] 2件previewと複数件DreamingのLLM統合pipelineが重複している
- 場所: `app/api/lore/consolidate/preview/route.ts:13`、`app/api/lore/consolidate/preview/route.ts:34`、`app/api/lore/consolidate/preview/route.ts:42`、`lib/lore/dreaming.ts:20`、`lib/lore/dreaming.ts:83`、`lib/lore/dreaming.ts:92`
- 事実: system promptは「2つ」/「複数」と新旧判定表現だけが異なる。`generateMergedText` は同じ `chatCompleteMini` 呼び出し、空文字検証、trim返却の順で、引数表現だけが2 sourceとsource配列に分かれる。

`app/api/lore/consolidate/preview/route.ts:13`:

```ts
const CONSOLIDATION_PROMPT = `2つの記憶を、重複を取り除いて1つに統合してください。
元の記憶にない新事実は追加しないでください。
矛盾がある場合は、より新しい記憶を優先し、古い内容は「以前は〜だったが、現在は〜」のように整理してください。
```

`lib/lore/dreaming.ts:20`:

```ts
const CONSOLIDATION_PROMPT = `複数の記憶を、重複を取り除いて1つに統合してください。
元の記憶にない新事実は追加しないでください。
矛盾がある場合は、created_at が新しい記憶を優先し、古い内容は「以前は〜だったが、現在は〜」のように整理してください。
```

`app/api/lore/consolidate/preview/route.ts:42`:

```ts
async function generateMergedText(openaiKey: string, sourceA: ConsolidationSourceRow, sourceB: ConsolidationSourceRow) {
  const mergedText = await chatCompleteMini(
    openaiKey,
```

`lib/lore/dreaming.ts:92`:

```ts
async function generateMergedText(openaiKey: string, sources: ConsolidationSourceRow[]) {
  const mergedText = await chatCompleteMini(
    openaiKey,
```

`app/api/lore/consolidate/preview/route.ts:48`:

```ts
if (typeof mergedText !== "string" || mergedText.trim().length === 0) {
  throw new Error("Missing merged text");
}
```

`lib/lore/dreaming.ts:98`:

```ts
if (typeof mergedText !== "string" || mergedText.trim().length === 0) {
  throw new Error("Missing merged text");
}
```

- 分類: 重複
- 推奨対応: source配列を受け取る共通prompt builder/LLM validatorを基底にし、2件preview固有の表示だけを分離する案を検討する。
- 優先度: 中

### [D-11] Lore V1/V2検索wrapperがtimeout・embedding・例外処理を二重実装している
- 場所: `lib/lore/search.ts:136`、`lib/lore/search.ts:164`
- 事実: 両関数はoption展開後にAbortControllerとtimerを作成し、embedding生成、空結果、ByEmbedding関数への委譲、AbortError警告、空配列、timer解放を同じ順序で行う。V2の追加処理は `matchThreshold` を委譲先へ渡す部分だけである。

`lib/lore/search.ts:136`:

```ts
export async function searchLore(
  supabase: SupabaseClient,
  opts: LoreSearchOptions,
```

`lib/lore/search.ts:142`:

```ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
```

`lib/lore/search.ts:164`:

```ts
export async function searchLoreV2(
  supabase: SupabaseClient,
  opts: LoreSearchOptionsV2,
```

`lib/lore/search.ts:170`:

```ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
```

`lib/lore/search.ts:145`:

```ts
try {
  const embedding = await embedQuery(openaiKey, query, controller.signal);
  if (!embedding) return [];
```

`lib/lore/search.ts:173`:

```ts
try {
  const embedding = await embedQuery(openaiKey, query, controller.signal);
  if (!embedding) return [];
```

- 分類: 重複
- 推奨対応: timeout付きembedding検索の共通executorへ、V1/V2固有のByEmbedding callbackを渡す形を検討する。
- 優先度: 中

### [D-12] 同じメッセージ削除workflowを2つのendpointが持ち、thread scopeだけが乖離している
- 場所: `app/api/messages/[id]/route.ts:5`、`app/api/threads/[id]/messages/[messageId]/route.ts:4`
- 事実: 両DELETEは認証、対象message由来のunpinned lore archive、message delete、error/success応答を同じ順序で行う。nested routeだけがmessage deleteに `thread_id` 条件を追加し、archive queryにはどちらもthread条件がない。

`app/api/messages/[id]/route.ts:14`:

```ts
const { error: archiveError } = await supabase
  .from("lore_embeddings")
  .update({ is_archived: true })
```

`app/api/threads/[id]/messages/[messageId]/route.ts:13`:

```ts
const { error: archiveError } = await supabase
  .from("lore_embeddings")
  .update({ is_archived: true })
```

`app/api/messages/[id]/route.ts:25`:

```ts
const { error } = await supabase
  .from("messages")
  .delete()
```

`app/api/messages/[id]/route.ts:28`:

```ts
.eq("id", params.id)
.eq("user_id", user.id);
```

`app/api/threads/[id]/messages/[messageId]/route.ts:24`:

```ts
const { error } = await supabase
  .from("messages")
  .delete()
```

`app/api/threads/[id]/messages/[messageId]/route.ts:27`:

```ts
.eq("id", params.messageId)
.eq("thread_id", params.id)
.eq("user_id", user.id);
```

- 分類: 不統一
- 推奨対応: canonical endpointを決めるか、共通削除serviceへscopeを明示的に渡して挙動を揃える案を検討する。
- 優先度: 中

### [D-13] notes・message notes・draftsのCRUD templateがrouteとDAL内で反復されている
- 場所: `app/api/threads/[id]/message-notes/route.ts:4`、`app/api/threads/[id]/message-notes/route.ts:22`、`app/api/threads/[id]/message-notes/route.ts:41`、`app/api/threads/[id]/notes/route.ts:4`、`app/api/threads/[id]/notes/route.ts:22`、`app/api/threads/[id]/notes/route.ts:61`、`app/api/threads/[id]/drafts/route.ts:57`、`lib/supabase-db.ts:67`、`lib/supabase-db.ts:73`、`lib/supabase-db.ts:99`、`lib/supabase-db.ts:109`、`lib/supabase-db.ts:139`、`lib/supabase-db.ts:145`、`lib/supabase-db.ts:171`、`lib/supabase-db.ts:187`、`lib/supabase-db.ts:202`
- 事実: routeではmessage notes/thread notesのGETがtable名以外同一、3 resourceのDELETEがtable名以外同一である。`lib/supabase-db.ts` でも3つのthread-scoped GET、4つのID delete、`addNote`/`addDraft`がtable名・返却型以外同じquery chainを持つ。

`app/api/threads/[id]/message-notes/route.ts:13`:

```ts
const { data, error } = await supabase
  .from("message_notes")
  .select("*")
```

`app/api/threads/[id]/notes/route.ts:13`:

```ts
const { data, error } = await supabase
  .from("thread_notes")
  .select("*")
```

`app/api/threads/[id]/message-notes/route.ts:31`:

```ts
const { messageId, content } = await req.json();
const { data, error } = await supabase
  .from("message_notes")
```

`app/api/threads/[id]/notes/route.ts:31`:

```ts
const { content } = await req.json();
const { data, error } = await supabase
  .from("thread_notes")
```

`app/api/threads/[id]/message-notes/route.ts:50`:

```ts
const { id } = await req.json();
await supabase.from("message_notes").delete().eq("id", id).eq("user_id", user.id);
return NextResponse.json({ success: true });
```

`app/api/threads/[id]/notes/route.ts:70`:

```ts
const { id } = await req.json();
await supabase.from("thread_notes").delete().eq("id", id).eq("user_id", user.id);
return NextResponse.json({ success: true });
```

`app/api/threads/[id]/drafts/route.ts:66`:

```ts
const { id } = await req.json();
await supabase.from("drafts").delete().eq("id", id).eq("user_id", user.id);
return NextResponse.json({ success: true });
```

`lib/supabase-db.ts:73`:

```ts
export async function getMessages(supabase: AppSupabaseClient, threadId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
```

`lib/supabase-db.ts:99`:

```ts
export async function getNotes(supabase: AppSupabaseClient, threadId: string): Promise<ThreadNote[]> {
  const { data, error } = await supabase
    .from("thread_notes")
```

`lib/supabase-db.ts:145`:

```ts
export async function getMessageNotes(supabase: AppSupabaseClient, threadId: string): Promise<MessageNote[]> {
  const { data, error } = await supabase
    .from("message_notes")
```

`lib/supabase-db.ts:67`:

```ts
export async function deleteThread(supabase: AppSupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("threads").delete().eq("id", id);
  if (error) throw error;
```

`lib/supabase-db.ts:139`:

```ts
export async function deleteNote(supabase: AppSupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("thread_notes").delete().eq("id", id);
  if (error) throw error;
```

`lib/supabase-db.ts:171`:

```ts
export async function deleteMessageNote(supabase: AppSupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("message_notes").delete().eq("id", id);
  if (error) throw error;
```

`lib/supabase-db.ts:202`:

```ts
export async function deleteDraft(supabase: AppSupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("drafts").delete().eq("id", id);
  if (error) throw error;
```

`lib/supabase-db.ts:109`:

```ts
export async function addNote(
  supabase: AppSupabaseClient,
  threadId: string,
```

`lib/supabase-db.ts:187`:

```ts
export async function addDraft(
  supabase: AppSupabaseClient,
  threadId: string,
```

- 分類: 重複
- 推奨対応: resource差分を引数化できるprivate query helperと、route/DALの責務整理を別々にレビューする。
- 優先度: 中

### [D-14] `ChatInput` と `ChatInputCentered` が入力・添付・GitHub取得ロジックを広範囲に複製している
- 場所: `components/ChatInput.tsx:109`、`components/ChatInput.tsx:112`、`components/ChatInput.tsx:117`、`components/ChatInput.tsx:236`、`components/ChatInput.tsx:273`、`components/ChatInput.tsx:290`、`components/ChatInput.tsx:298`、`components/ChatInput.tsx:310`、`components/ChatInput.tsx:355`、`components/ChatInput.tsx:376`、`components/ChatInput.tsx:456`、`components/ChatInput.tsx:492`、`components/ChatInput.tsx:497`、`components/ChatInput.tsx:540`、`components/ChatInput.tsx:548`、`components/ChatInputCentered.tsx:53`、`components/ChatInputCentered.tsx:56`、`components/ChatInputCentered.tsx:61`、`components/ChatInputCentered.tsx:111`、`components/ChatInputCentered.tsx:137`、`components/ChatInputCentered.tsx:154`、`components/ChatInputCentered.tsx:162`、`components/ChatInputCentered.tsx:187`、`components/ChatInputCentered.tsx:194`、`components/ChatInputCentered.tsx:275`、`components/ChatInputCentered.tsx:283`、`components/ChatInputCentered.tsx:300`、`components/ChatInputCentered.tsx:305`、`components/ChatInputCentered.tsx:320`、`components/ChatInputCentered.tsx:328`
- 事実: `LS_ENTER_MODE`、enter mode読込、mobile判定、resize更新、2種類のoutside-click、Escape処理、model変更、file処理、file input、drag leave、file削除、GitHub取得は同じ引数・返却・処理順である。`handlePaste`/`handleDragOver` は通常版だけ `disabled` も見るという差がある。AST比較では `processFiles` の220 tokenと `handleGithubFetch` の150 tokenがidentifier/literal正規化後に完全一致した。

`components/ChatInput.tsx:109`:

```ts
const LS_ENTER_MODE = "kabehub_enter_mode" as const;
type EnterMode = "send" | "newline";
```

`components/ChatInputCentered.tsx:53`:

```ts
const LS_ENTER_MODE = "kabehub_enter_mode" as const;
type EnterMode = "send" | "newline";
```

`components/ChatInput.tsx:112`:

```ts
function loadEnterMode(): EnterMode {
  if (typeof window === "undefined") return "send";
  return localStorage.getItem(LS_ENTER_MODE) === "newline" ? "newline" : "send";
```

`components/ChatInputCentered.tsx:56`:

```ts
function loadEnterMode(): EnterMode {
  if (typeof window === "undefined") return "send";
  return localStorage.getItem(LS_ENTER_MODE) === "newline" ? "newline" : "send";
```

`components/ChatInput.tsx:117`:

```ts
function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
```

`components/ChatInputCentered.tsx:61`:

```ts
function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
```

`components/ChatInput.tsx:236`:

```ts
const updateIsMobile = () => setIsMobile(isMobileViewport());
updateIsMobile();
window.addEventListener("resize", updateIsMobile);
```

`components/ChatInputCentered.tsx:111`:

```ts
const updateIsMobile = () => setIsMobile(isMobileViewport());
updateIsMobile();
window.addEventListener("resize", updateIsMobile);
```

`components/ChatInput.tsx:273`:

```ts
const handlePointerDown = (event: PointerEvent) => {
  if (
    toolMenuRef.current &&
```

`components/ChatInputCentered.tsx:137`:

```ts
const handlePointerDown = (event: PointerEvent) => {
  if (
    toolMenuRef.current &&
```

`components/ChatInput.tsx:290`:

```ts
const handlePointerDown = (event: PointerEvent) => {
  if (
    modelMenuRootRef.current &&
```

`components/ChatInputCentered.tsx:154`:

```ts
const handlePointerDown = (event: PointerEvent) => {
  if (
    modelMenuRootRef.current &&
```

`components/ChatInput.tsx:298`:

```ts
const handleKeyDown = (event: globalThis.KeyboardEvent) => {
  if (event.key === "Escape") { event.stopPropagation(); setOpenModelProvider(null); }
};
```

`components/ChatInputCentered.tsx:162`:

```ts
const handleKeyDown = (event: globalThis.KeyboardEvent) => {
  if (event.key === "Escape") { event.stopPropagation(); setOpenModelProvider(null); }
};
```

`components/ChatInput.tsx:310`:

```ts
const handleModelChange = (targetProvider: Provider, modelId: ModelId) => {
  setSelectedModel(modelId);
  saveModel(targetProvider, modelId);
```

`components/ChatInputCentered.tsx:187`:

```ts
const handleModelChange = (targetProvider: Provider, modelId: ModelId) => {
  setSelectedModel(modelId);
  saveModel(targetProvider, modelId);
```

`components/ChatInput.tsx:355`:

```ts
const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
  if (isLoading || disabled) return;
```

`components/ChatInputCentered.tsx:283`:

```ts
const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
  if (isLoading) return;
```

`components/ChatInput.tsx:376`:

```ts
const processFiles = async (files: FileList | File[]) => {
  setFileError(null);
  if (fileInputRef.current) fileInputRef.current.value = "";
```

`components/ChatInputCentered.tsx:194`:

```ts
const processFiles = async (files: FileList | File[]) => {
  setFileError(null);
  if (fileInputRef.current) fileInputRef.current.value = "";
```

`components/ChatInput.tsx:456`:

```ts
const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (files && files.length > 0) {
```

`components/ChatInputCentered.tsx:275`:

```ts
const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (files && files.length > 0) {
```

`components/ChatInput.tsx:492`:

```ts
const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  if (!isLoading && !disabled) setIsDragging(true);
```

`components/ChatInputCentered.tsx:300`:

```ts
const handleDragOver = (e: DragEvent) => {
  e.preventDefault();
  if (!isLoading) setIsDragging(true);
```

`components/ChatInput.tsx:497`:

```ts
const handleDragLeave = (e: React.DragEvent) => {
  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
    setIsDragging(false);
```

`components/ChatInputCentered.tsx:305`:

```ts
const handleDragLeave = (e: DragEvent) => {
  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
    setIsDragging(false);
```

`components/ChatInput.tsx:540`:

```ts
const handleRemoveFile = (index: number) => {
  setAttachedFiles((prev) => {
    const target = prev[index];
```

`components/ChatInputCentered.tsx:320`:

```ts
const handleRemoveFile = (index: number) => {
  setAttachedFiles((prev) => {
    const target = prev[index];
```

`components/ChatInput.tsx:548`:

```ts
const handleGithubFetch = async () => {
  const trimmed = githubUrl.trim();
  if (!trimmed) return;
```

`components/ChatInputCentered.tsx:328`:

```ts
const handleGithubFetch = async () => {
  const trimmed = githubUrl.trim();
  if (!trimmed) return;
```

- 分類: 重複
- 推奨対応: 添付・GitHub取得・enter mode・responsive/menu hooksを共有hookまたはheadless input controllerへ段階的に抽出する案を検討する。
- 優先度: 中

### [D-15] 通常/Roleplay bubbleがprovider・note・mask編集ロジックを複製している
- 場所: `components/MessageBubble.tsx:254`、`components/MessageBubble.tsx:256`、`components/MessageBubble.tsx:259`、`components/MessageBubble.tsx:268`、`components/MessageBubble.tsx:283`、`components/MessageBubble.tsx:330`、`components/RoleplayBubble.tsx:72`、`components/RoleplayBubble.tsx:74`、`components/RoleplayBubble.tsx:84`、`components/RoleplayBubble.tsx:92`、`components/RoleplayBubble.tsx:106`、`components/RoleplayBubble.tsx:119`
- 事実: provider配列/label、note保存、hidden楽観更新、編集保存はコメントを除く関数本体が完全一致する。選択範囲を `[[...]]` で囲う処理もDOM id prefix以外が一致する。

`components/MessageBubble.tsx:254`:

```ts
const ALL_PROVIDERS = ["claude", "gemini", "openai"] as const;
const regenTargets = ALL_PROVIDERS.filter((p) => p !== message.provider);
const regenLabel = (p: string) =>
```

`components/RoleplayBubble.tsx:72`:

```ts
const ALL_PROVIDERS = ["claude", "gemini", "openai"] as const;
const regenTargets = ALL_PROVIDERS.filter((p) => p !== message.provider);
const regenLabel = (p: string) =>
```

`components/MessageBubble.tsx:259`:

```ts
const handleSaveNote = async () => {
  if (!noteContent.trim() || !onAddMessageNote) return;
  await onAddMessageNote(message.id, noteContent.trim());
```

`components/RoleplayBubble.tsx:84`:

```ts
const handleSaveNote = async () => {
  if (!noteContent.trim() || !onAddMessageNote) return;
  await onAddMessageNote(message.id, noteContent.trim());
```

`components/MessageBubble.tsx:268`:

```ts
const handleToggleHidden = async () => {
  if (!onUpdateMessage || isSavingHidden) return;
  const next = !isHidden;
```

`components/RoleplayBubble.tsx:92`:

```ts
const handleToggleHidden = async () => {
  if (!onUpdateMessage || isSavingHidden) return;
  const next = !isHidden;
```

`components/MessageBubble.tsx:283`:

```ts
const handleSaveEdit = async () => {
  if (!onUpdateMessage || isSavingEdit) return;
  setIsSavingEdit(true);
```

`components/RoleplayBubble.tsx:106`:

```ts
const handleSaveEdit = async () => {
  if (!onUpdateMessage || isSavingEdit) return;
  setIsSavingEdit(true);
```

`components/MessageBubble.tsx:330`:

```ts
const handleMaskSelection = () => {
  const textarea = document.getElementById(`mask-editor-${message.id}`) as HTMLTextAreaElement | null;
  if (!textarea) return;
```

`components/RoleplayBubble.tsx:119`:

```ts
const handleMaskSelection = () => {
  const textarea = document.getElementById(`rp-mask-editor-${message.id}`) as HTMLTextAreaElement | null;
  if (!textarea) return;
```

- 分類: 重複
- 推奨対応: bubble固有renderを残し、message action state/handlersとprovider metadataを共有hookへ抽出する案を検討する。
- 優先度: 中

### [D-16] 右ペインのresponsive判定とstyle定数が2 componentで完全一致する
- 場所: `components/NovelSettingsPane.tsx:209`、`components/NovelSettingsPane.tsx:218`、`components/OutlinePane.tsx:16`、`components/OutlinePane.tsx:33`
- 事実: 1280px判定、resize listener、pane幅、およびdesktop/mobile双方の `paneStyle` initializerが完全一致する。

`components/NovelSettingsPane.tsx:209`:

```ts
useEffect(() => {
  const check = () => setIsWide(window.innerWidth >= 1280);
  check();
```

`components/OutlinePane.tsx:16`:

```ts
useEffect(() => {
  const check = () => setIsWide(window.innerWidth >= 1280);
  check();
```

`components/NovelSettingsPane.tsx:218`:

```ts
const paneStyle: React.CSSProperties = isWide
  ? {
      width: paneWidth,
```

`components/OutlinePane.tsx:33`:

```ts
const paneStyle: React.CSSProperties = isWide
  ? {
      width: paneWidth,
```

- 分類: 重複
- 推奨対応: 共通responsive side-pane componentまたはstyle builderへの抽出を検討する。
- 優先度: 中

### [D-17] 相対時刻・日時・USD formatterが複数実装され、表示規則が一致しない
- 場所: `app/explore/page.tsx:26`、`components/Sidebar.tsx:24`、`app/album/page.tsx:20`、`lib/exportUtils.ts:47`、`app/novel-check/page.tsx:23`、`lib/pricing.ts:29`
- 事実: `timeAgo` 2実装は同じ引数・経過分/時/日算出を持つが、explore版だけ30日以上をlocale日付にする。日時formatterは年月日時分の5段階が同じで区切りだけ `/` と `-` が異なる。USD formatterは同じ閾値処理だが空白と小数桁数が異なる。

`app/explore/page.tsx:26`:

```ts
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
```

`components/Sidebar.tsx:24`:

```ts
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
```

`app/explore/page.tsx:33`:

```ts
const days = Math.floor(hrs / 24);
if (days < 30) return `${days}日前`;
return new Date(dateStr).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
```

`components/Sidebar.tsx:29`:

```ts
const hrs = Math.floor(mins / 60);
if (hrs < 24) return `${hrs}時間前`;
return `${Math.floor(hrs / 24)}日前`;
```

`app/album/page.tsx:20`:

```ts
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
```

`lib/exportUtils.ts:47`:

```ts
const formatTimestamp = (isoString: string): string => {
  const d = new Date(isoString);
  const yyyy = d.getFullYear();
```

`app/album/page.tsx:25`:

```ts
const h = String(d.getHours()).padStart(2, "0");
const mi = String(d.getMinutes()).padStart(2, "0");
return `${y}/${mo}/${day} ${h}:${mi}`;
```

`lib/exportUtils.ts:52`:

```ts
const HH = String(d.getHours()).padStart(2, "0");
const mm = String(d.getMinutes()).padStart(2, "0");
return `${yyyy}-${MM}-${dd} ${HH}:${mm}`;
```

`app/novel-check/page.tsx:23`:

```ts
function formatCost(usd: number): string {
  if (usd < 0.001) return "< $0.001";
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
```

`lib/pricing.ts:29`:

```ts
export function formatUSD(usd: number): string {
  if (usd < 0.001) return "<$0.001";
  if (usd < 0.01)  return `$${usd.toFixed(4)}`;
```

- 分類: 不統一
- 推奨対応: formatterごとに表示仕様を決め、共有utilityへ統合するか意図的な差を命名で明示する。
- 優先度: 中

### [D-18] `updated_at` trigger関数が現行schema内に別名で完全重複している
- 場所: `docs/schema.sql:835`、`docs/schema.sql:1019`
- 事実: 関数名は `update_updated_at_column` と `update_updated_at` で異なるが、引数なし、`returns trigger`、PL/pgSQL本体が完全一致する。正規化body SHA-256（先頭12桁）は双方 `9561857baa89` だった。

`docs/schema.sql:835`:

```sql
create or replace function update_updated_at_column()
returns trigger
language plpgsql
```

`docs/schema.sql:839`:

```sql
begin
  new.updated_at = now();
  return new;
```

`docs/schema.sql:1019`:

```sql
create or replace function update_updated_at()
returns trigger
language plpgsql
```

`docs/schema.sql:1023`:

```sql
begin
  new.updated_at = now();
  return new;
```

- 分類: 重複
- 推奨対応: 両triggerが参照する単一の更新時刻関数へ統合するmigration案をレビューする。
- 優先度: 中

### [D-19] `consolidate_dreaming_batch` overloadが統合transaction本体を複製している
- 場所: `docs/schema.sql:1324`、`docs/schema.sql:1387`
- 事実: 2件統合の2 overloadは、片方がsource tagsを集約し、もう片方が `p_tags` を受け取る点だけが主差分。source lock、insert、2 source archive、row count検証、UUID返却は同じ順序・同じSQLである。

`docs/schema.sql:1324`:

```sql
create or replace function consolidate_dreaming_batch(
  p_user_id uuid, p_lore_id_a uuid, p_lore_id_b uuid, p_merged_text text,
  p_embedding vector, p_memory_kind text, p_temporal_status text, p_folder_name text,
```

`docs/schema.sql:1387`:

```sql
create or replace function consolidate_dreaming_batch(
  p_user_id uuid, p_lore_id_a uuid, p_lore_id_b uuid, p_merged_text text,
  p_embedding vector, p_memory_kind text, p_temporal_status text, p_folder_name text,
```

`docs/schema.sql:1356`:

```sql
perform id from lore_embeddings
where id in (p_lore_id_a, p_lore_id_b)
order by id
```

`docs/schema.sql:1412`:

```sql
perform id from lore_embeddings
where id in (p_lore_id_a, p_lore_id_b)
order by id
```

`docs/schema.sql:1371`:

```sql
update lore_embeddings
set is_archived = true, superseded_by = new_id
where id in (p_lore_id_a, p_lore_id_b)
```

`docs/schema.sql:1427`:

```sql
update lore_embeddings
set is_archived = true, superseded_by = new_id
where id in (p_lore_id_a, p_lore_id_b)
```

- 分類: 重複
- 推奨対応: tags解決だけを分離し、保護・lock・insert・archive処理を単一RPC本体へ委譲する設計を検討する。
- 優先度: 中

### [D-20] 2件版/複数件版rollback RPCが同じ復元・archive workflowを持つがpredicateが異なる
- 場所: `docs/schema.sql:1523`、`docs/schema.sql:1579`
- 事実: 両関数は同じ引数型と `returns void` を持ち、統合record検証、source件数確認、source復元、row count照合、統合record archiveを同順で行う。一方、2件版のsource queryには `is_archived`、`is_pinned`、`extraction_version` 条件があり、multi版の対応queryにはない。

`docs/schema.sql:1523`:

```sql
create or replace function rollback_dreaming_batch(
  p_user_id uuid, p_consolidated_id uuid
)
```

`docs/schema.sql:1579`:

```sql
create or replace function rollback_dreaming_batch_multi(
  p_user_id uuid, p_consolidated_id uuid
)
```

`docs/schema.sql:1557`:

```sql
update lore_embeddings
set is_archived = false, superseded_by = null
where superseded_by = p_consolidated_id
```

`docs/schema.sql:1624`:

```sql
update lore_embeddings
set is_archived = false, superseded_by = null
where superseded_by = p_consolidated_id
```

`docs/schema.sql:1571`:

```sql
update lore_embeddings
set is_archived = true
where id = p_consolidated_id
```

`docs/schema.sql:1635`:

```sql
update lore_embeddings
set is_archived = true
where id = p_consolidated_id
```

- 分類: 不統一
- 推奨対応: pair/multi共通のrollback invariantを定義し、source countだけをparameter化した単一実装を検討する。
- 優先度: 中

### [D-21] CJSテスト7本がTypeScript読込bootstrapを各自実装している
- 場所: `scripts/ai-context-blocks.test.cjs:9`、`scripts/ai-context-blocks.test.cjs:22`、`scripts/branchTree.test.cjs:9`、`scripts/branchTree.test.cjs:22`、`scripts/loadModel.test.cjs:27`、`scripts/loadModel.test.cjs:40`、`scripts/lore.test.cjs:10`、`scripts/lore.test.cjs:30`、`scripts/lore-openai.test.cjs:6`、`scripts/modelRegistry.test.cjs:9`、`scripts/modelRegistry.test.cjs:13`、`scripts/pricing.test.cjs:18`、`scripts/pricing.test.cjs:31`
- 事実: 6本が `@/` aliasを `Module._resolveFilename` で解決し、7本すべてが `ts.transpileModule` と `module._compile` で `.ts`（一部 `.tsx`）を読込む。JSX指定やtest export注入の差はあるが、引数、返却、読込→transpile→compileの手順は同じである。

`scripts/ai-context-blocks.test.cjs:9`:

```js
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
```

`scripts/branchTree.test.cjs:9`:

```js
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
```

`scripts/loadModel.test.cjs:27`:

```js
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
```

`scripts/lore.test.cjs:10`:

```js
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(rootDir, request.slice(2)), parent, isMain, options);
```

`scripts/modelRegistry.test.cjs:9`:

```js
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(rootDir, request.slice(2));
  return originalResolveFilename.call(this, request, parent, isMain, options);
```

`scripts/pricing.test.cjs:18`:

```js
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
```

`scripts/ai-context-blocks.test.cjs:22`:

```js
require.extensions[".ts"] = function compileTypescript(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
```

`scripts/branchTree.test.cjs:22`:

```js
require.extensions[".ts"] = function compileTypescript(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
```

`scripts/loadModel.test.cjs:40`:

```js
function compileTsx(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
```

`scripts/lore.test.cjs:30`:

```js
function compile(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  let output = ts.transpileModule(source, {
```

`scripts/lore-openai.test.cjs:6`:

```js
require.extensions[".ts"] = function compile(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
```

`scripts/modelRegistry.test.cjs:13`:

```js
function compile(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
```

`scripts/pricing.test.cjs:31`:

```js
require.extensions[".ts"] = function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
```

- 分類: 重複
- 推奨対応: 共通のCJS test bootstrap moduleを作り、各testは対象moduleと固有のtest export注入だけを設定する案を検討する。
- 優先度: 中

## 非指摘候補と「追加問題なし」の確認

次は類似度検索で候補になったが、指定された「引数型・返り値型・処理ステップがほぼ一致し、変数名程度の差」という基準を満たさないため指摘から除外した。これらも実ファイルを開いて確認した。

- `app/api/reports/route.ts:5` と `lib/mcp-auth.ts:7` のservice-role client: 前者はenv欠落検証とsession無効化optionを持ち、後者は非null assertionで直接生成するため、処理ステップが同一ではない。
- `lib/supabase/server.ts:4` と `lib/supabase/route-handler.ts:4`: 前者はNext server componentのcookie store、後者はrequest/response cookieを扱い、set失敗の扱いも異なる。
- `components/ChatInput.tsx:41` と `components/ChatPanel.tsx:649` の画像圧縮: 最大辺、JPEG品質、返却型が異なる。
- `app/novel-check/page.tsx:29` と `components/ChatInput.tsx:155` の文字コードfallback: Promise返却とcallback API、FileReader/TextDecoder、error経路が異なる。
- `app/api/image-gen/route.ts:13`、`:62`、`:99`、`:149` および `app/api/arena/route.ts:30`、`:47`、`:63`: providerごとにrequest/response schemaと返却型が異なるadapterであり、共通する `fetch` だけでは対象にしない。
- `app/api/threads/[id]/copy/route.ts:4`、`app/api/threads/[id]/branch-to/route.ts:12`、`app/api/share/[token]/fork/route.ts:6`: 所有権、対象message選別、ID/parent再構築、secret mask、返却metadataが異なる。
- `docs/schema.sql:1070` と `docs/schema.sql:1123` の `match_lore_embeddings_v2` overload: 引数名/数、return table、score計算、filterが異なる。
- `lib/lore/types.ts:29` のコメントどおり、`BATCH_TRAIN_UI_REQUEST_LIMIT = 100` と `app/api/lore/batch-train/route.ts:27` のclamp上限100は別概念と明記されているため、同一default定数とは判定しない。
- API routeに広く存在する `NextResponse.next()` → route Supabase client → `auth.getUser()` → 401 のprefixは、route handler全体の引数/返却/後続処理が異なる標準setupであり、独立した同一関数定義とは判定しない。
- `docs/applied/*.sql` は適用履歴であり、現行 `docs/schema.sql` と同名SQLが残ること自体は履歴の目的に沿うため、migration間の重複は対象外とした。

上記の除外後、完全一致group、同名関数group、構造一致上位pairを再確認し、D-01〜D-21以外に基準を満たすactiveな関数・定数は確認できなかった。

## 確認ファイル一覧

### アプリケーションコード（125ファイル）

```text
app/[handle]/default.tsx
app/[handle]/page.tsx
app/[handle]/ProfilePage.tsx
app/album/page.tsx
app/api/album/route.ts
app/api/arena/route.ts
app/api/auth/github/callback/route.ts
app/api/auth/github/route.ts
app/api/auth/github/status/route.ts
app/api/calendar/route.ts
app/api/chat/route.ts
app/api/explore/route.ts
app/api/extract-settings/route.ts
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
app/api/messages/[id]/route.ts
app/api/novel-check/route.ts
app/api/profile/route.ts
app/api/reports/route.ts
app/api/search/route.ts
app/api/share/[token]/fork/route.ts
app/api/share/[token]/route.ts
app/api/stats/route.ts
app/api/threads/[id]/branch-to/route.ts
app/api/threads/[id]/copy/route.ts
app/api/threads/[id]/drafts/route.ts
app/api/threads/[id]/likes/route.ts
app/api/threads/[id]/message-notes/route.ts
app/api/threads/[id]/messages/[messageId]/route.ts
app/api/threads/[id]/messages/restore-branch/route.ts
app/api/threads/[id]/messages/route.ts
app/api/threads/[id]/notes/route.ts
app/api/threads/[id]/route.ts
app/api/threads/[id]/tags/route.ts
app/api/threads/route.ts
app/arena/[token]/ArenaViewPage.tsx
app/arena/[token]/default.tsx
app/arena/[token]/page.tsx
app/arena/page.tsx
app/auth/callback/route.ts
app/calendar/page.tsx
app/explore/page.tsx
app/image/page.tsx
app/layout.tsx
app/legal/page.tsx
app/login/page.tsx
app/memory/page.tsx
app/novel-check/page.tsx
app/page.tsx
app/privacy/page.tsx
app/settings/page.tsx
app/share/[token]/page.tsx
app/sitemap.ts
app/stats/page.tsx
app/terms/page.tsx
app/threads/[id]/tree/page.tsx
components/ArenaTimeline.tsx
components/BranchTree.tsx
components/ChatInput.tsx
components/ChatInputCentered.tsx
components/ChatPanel.tsx
components/ExportModal.tsx
components/LegalLayout.tsx
components/MarkdownRenderer.tsx
components/MessageBubble.tsx
components/NovelSettingsPane.tsx
components/OutlinePane.tsx
components/PublishConfirmModal.tsx
components/RoleplayBubble.tsx
components/Sidebar.tsx
lib/ai-context-blocks.ts
lib/branching.ts
lib/branchTree.ts
lib/context-window.ts
lib/exportUtils.ts
lib/genres.ts
lib/github-token-crypto.ts
lib/github-token-store.ts
lib/github-tool-loop.ts
lib/github.ts
lib/internalModels.ts
lib/lore/batchTrain.ts
lib/lore/consolidation.ts
lib/lore/dreaming.ts
lib/lore/index.ts
lib/lore/mappers.ts
lib/lore/openai.ts
lib/lore/search.ts
lib/lore/selects.ts
lib/lore/types.ts
lib/loreMemorySelect.ts
lib/mcp-auth.ts
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
types/index.ts
```

### テストスクリプト（7ファイル）

```text
scripts/ai-context-blocks.test.cjs
scripts/branchTree.test.cjs
scripts/loadModel.test.cjs
scripts/lore-openai.test.cjs
scripts/lore.test.cjs
scripts/modelRegistry.test.cjs
scripts/pricing.test.cjs
```

### ルート設定・宣言（7ファイル）

```text
middleware.ts
next.config.js
postcss.config.js
tailwind.config.js
next-env.d.ts
tsconfig.json
package.json
```

### SQL（現行schema 1ファイルを実指摘対象、適用履歴15ファイルを同名定義確認用に検索）

```text
docs/schema.sql
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
docs/applied/v141c_migration.sql
docs/applied/v175_migration.sql
docs/applied/v78_mcp_tokens_migration.sql
docs/applied/v89_migration.sql
```

## 検証結果

すべて2026-07-13にリポジトリrootで実行した。

| コマンド | 結果 | 記録 |
|---|---|---|
| `npx tsc --noEmit` | PASS（exit 0） | 標準出力なし |
| `node scripts/ai-context-blocks.test.cjs` | PASS（exit 0） | `ai-context-blocks tests passed` |
| `node scripts/branchTree.test.cjs` | PASS（exit 0） | `branchTree tests passed` |
| `node scripts/loadModel.test.cjs` | PASS（exit 0） | `loadModel tests passed` |
| `node scripts/lore-openai.test.cjs` | PASS（exit 0） | 11 tests passed |
| `node scripts/lore.test.cjs` | PASS（exit 0） | 20 characterization tests passed |
| `node scripts/modelRegistry.test.cjs` | PASS（exit 0） | `modelRegistry tests passed` |
| `node scripts/pricing.test.cjs` | PASS（exit 0） | `pricing tests passed` |
| `npm run build` | PASS（exit 0） | Compiled successfully、type check成功、static pages 26/26生成 |

`npm run build` のsandbox内初回実行はNext worker作成時の `spawn EPERM` で終了した。これはコードのcompile errorではなく実行環境の子プロセス制限だったため、許可されたsandbox外で同一コマンドを再実行し、上表のとおり成功した。

### `tsconfig.tsbuildinfo` 復元記録

- 実行前: 141,857 bytes、SHA-256 `B71482A1F1CC187AA29DFA25F73A6D28585632ACB99868C8AA52E308F125C473`。
- `npx tsc --noEmit` 後: 135,474 bytes、SHA-256 `91276E26F6506DEFC29D0617D992505AFAC656227842A02C2499563B33C92794`、`git status --short` は ` M tsconfig.tsbuildinfo`。
- 指定どおり `git restore --worktree -- tsconfig.tsbuildinfo` を実行。
- 復元後およびbuild後: 141,857 bytes、SHA-256が実行前と一致。レポート作成前の `git status --short` は出力なし。

## 最終 `git status --short`

最終確認の実測値を以下に記録する。

```text
?? docs/audit/full-audit-d-2026-07-13.md
```
