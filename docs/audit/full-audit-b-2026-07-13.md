# KabeHub リポジトリ全体 静的監査レポート — 項目B

- 監査日: 2026-07-13（Asia/Tokyo）
- 監査方式: 読み取り専用の静的確認。DB接続・SQL実行なし
- 対象: `middleware.ts` と全 `app/**/route.ts`（`node_modules/`・`.next/` は監査対象外）
- 開始条件: 開始時の `git status --short` は出力なし（クリーン）。対象レポートは未存在
- Routeカバレッジ: `app/api/**/route.ts` 51ファイル、`app/auth/callback/route.ts` 1ファイル、計52ファイル・75ハンドラ
- 結論: 指摘5件。公開APIがmatcherで保護される乖離1件、matcher除外内のCookie認証Routeとの逆方向の乖離2件、未認証レスポンス契約の不統一1件、到達しない条件1件
- 検証状態: **全緑ではない**。既存 `node_modules/next` の不完全な配置により型検査・build・`lore.test.cjs` が失敗した。監査によるコード・テスト・設定の変更はない

## サマリ

| 監査項目 | 高 | 中 | 低 | 合計 |
|---|---:|---:|---:|---:|
| B. middlewareとRoute側の認証前提 | 0 | 4 | 1 | 5 |
| **合計** | **0** | **4** | **1** | **5** |

## 監査方法

### 実行した主要コマンド

```powershell
git status --short
Test-Path -LiteralPath 'docs/audit/full-audit-b-2026-07-13.md'
rg --files app -g 'route.ts'
rg -n "export (async )?function (GET|POST|PUT|PATCH|DELETE)" app -g 'route.ts'
rg -n "getUser|getSession|auth\.get|user\?\.|user\.id|Unauthorized|401|redirect|NextResponse\.redirect" app -g 'route.ts'
rg -n "public|公開|匿名|anonymous|optional|未ログイン|login|ログイン" app/api -g 'route.ts'
rg -n "/api/explore|/api/reports|/api/share/.*/fork|/api/mcp-tokens|/api/fetch-github" app components lib -g '*.ts' -g '*.tsx'
```

各 `route.ts` は `Get-Content -Raw -LiteralPath` で開き、`export async function GET/POST/PUT/PATCH/DELETE` ごとに次の関数宣言までを分割して、`auth.getUser()`、未ログインguard、`user?.` / `if (user)`、`authenticateMcpToken()`、`consumeOAuthState()` の有無を確認した。集計は次のとおり。

| ハンドラ側の認証前提 | ハンドラ数 | 確認内容 |
|---|---:|---|
| Supabase Cookie必須 | 65 | 各メソッド内に `auth.getUser()` と未ログインguardがある |
| Supabase Cookie任意 | 2 | `/api/explore` と `/api/reports`。未ログインでも後続処理を継続する |
| MCP Bearer必須 | 4 | 2ファイルのGET/POSTが `authenticateMcpToken()` を呼ぶ |
| OAuth state必須 | 1 | GitHub callbackが `consumeOAuthState()` を呼ぶ |
| ハンドラ内の認証呼び出しなし | 3 | `/api/fetch-github`、公開share GET、Supabase Auth callback |
| **合計** | **75** | 全ハンドラを確認 |

matcherの否定先読みは、リポジトリ記載の式と同じ正規表現部分を次のコマンドでも個別評価した。

```powershell
node -e "const re=/^(?!mcp|share|reports(?:\/|$)|auth\/github\/callback).*$/; for (const p of ['explore','reports','reports/x','mcp','mcp/threads','mcp-tokens','share/abc','share/abc/fork','auth/github/callback','auth/github/status','threads']) console.log(p, re.test(p) ? 'MATCHED_PROTECTED' : 'EXCLUDED')"
```

結果は `explore`、`auth/github/status`、`threads` が保護対象、`reports`、`reports/x`、`mcp`、`mcp/threads`、`mcp-tokens`、`share/abc`、`share/abc/fork`、`auth/github/callback` が除外だった。

## middleware matcherの列挙

`middleware.ts:54-64` のmatcherは次の4エントリだけである。

| matcher | 効果 |
|---|---|
| `/` | ルートだけを対象にする |
| `/settings/:path*` | `/settings` 配下を対象にする |
| `/login` | ログインページを対象にし、ログイン済みなら `/` へ戻す |
| `/api/((?!mcp\|share\|reports(?:/\|$)\|auth/github/callback).*)` | `/api/` を原則対象にし、否定先読みの4パターンを除外する |

API側の除外パターンの実際の境界は次のとおり。

- `mcp`: セグメント境界がなく、`/api/mcp` と `/api/mcp/...` だけでなく `/api/mcp-tokens` も除外する。
- `share`: セグメント境界がなく、`/api/share/...` 全体を除外する。
- `reports(?:/|$)`: `/api/reports` とその配下だけを除外する。`/api/reports-x` は除外しない。
- `auth/github/callback`: セグメント境界がなく、この文字列で始まるAPIパスを除外する。現存Routeは `/api/auth/github/callback` の1件だけ。
- 上記4エントリに合致しないページRouteはmiddleware自体を通らない。コードコメントが例示する `/[handle]`、`/explore`、`/share`、`/arena` のほか、その他の未指定ページも同様である。

## 指摘事項

### [B-01] 匿名閲覧を実装した `/api/explore` がAPI matcherで保護されている
- 場所: `middleware.ts:63`, `app/api/explore/route.ts:115`, `app/api/explore/route.ts:177`, `app/explore/page.tsx:388`
- 事実: API matcherの否定先読みには `explore` がないため、`/api/explore` はmiddleware対象になる。

```ts
// この除外（"(?!mcp|...)"）を消すとMCPが全滅する。
"/api/((?!mcp|share|reports(?:/|$)|auth/github/callback).*)",
```

Routeは公開viewから取得し、`user` が存在する場合だけ本人のlike状態を付ける。未ログインを拒否するguardはない。

```ts
let dbQuery = supabase
  .from("public_threads_view")
  .select("id, title, is_public, created_at, updated_at, user_id, genre, share_token, tags")
```

```ts
for (const row of likeRes.data ?? []) {
  likeCounts[row.thread_id] = (likeCounts[row.thread_id] ?? 0) + 1;
  if (user && row.user_id === user.id) likedByMe[row.thread_id] = true;
```

middleware対象外の公開ページ `/explore` は、このAPIをクライアントから呼ぶ。

```ts
const res = await fetch(`/api/explore?${params.toString()}`, { cache: "no-store" });
if (!res.ok) return;
const json = await res.json();
```

したがって、未ログイン時はRouteの匿名分岐へ到達する前にmiddlewareのログインredirectが返る。
- 分類: 乖離
- 推奨対応: `/api/explore` を匿名許可の除外へ明示追加するか、公開ページ・Route双方をログイン必須へ変更するかをレビューで決める。
- 優先度: 中

### [B-02] Bearer用の `mcp` 除外がCookie認証の `/api/mcp-tokens` まで除外する
- 場所: `middleware.ts:61`, `middleware.ts:63`, `app/api/mcp-tokens/route.ts:7`, `app/api/mcp-tokens/route.ts:23`, `app/api/mcp-tokens/route.ts:53`
- 事実: コメントはMCPをBearer認証としてmiddleware対象外にするが、境界のない `mcp` 否定先読みは `/api/mcp-tokens` にも適用される。

```ts
// mcpはBearer認証のためmiddleware対象外。
// この除外（"(?!mcp|...)"）を消すとMCPが全滅する。
"/api/((?!mcp|share|reports(?:/|$)|auth/github/callback).*)",
```

一方、`mcp-tokens` のGET・POST・DELETEはすべてSupabase Cookieユーザーを必須にし、Bearer認証は使わない。

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

Route自身のguardがあるため、この静的確認で未認証のDB操作は確認していない。ただしmatcher層の前提はRouteと逆である。
- 分類: 乖離
- 推奨対応: `mcp(?:/|$)` のようにBearer APIのセグメントだけを除外し、`mcp-tokens` の扱いを明示する案をレビューする。
- 優先度: 中

### [B-03] 公開share用の除外内にログイン必須のfork Routeが混在する
- 場所: `middleware.ts:63`, `app/api/share/[token]/fork/route.ts:14`, `app/api/share/[token]/fork/route.ts:16`
- 事実: `share` は境界のないprefix除外なので、公開取得用 `/api/share/[token]` だけでなく `/api/share/[token]/fork` もmiddleware対象外になる。

```ts
"/api/((?!mcp|share|reports(?:/|$)|auth/github/callback).*)",
```

fork RouteはSupabase Cookie認証を行い、ユーザーがなければ401を返す。

```ts
} = await authSupabase.auth.getUser();

if (authError || !user) {
```

```ts
return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

Route自身のguardがあるため、この静的確認で未認証forkは確認していない。ただし公開GETと認証必須POSTが同じ広いmatcher除外に入っている。
- 分類: 乖離
- 推奨対応: 公開share GETだけを除外するmatcher構成、またはforkをRoute認証専用とする設計の明文化をレビューする。
- 優先度: 中

### [B-04] `/api/stats` の401契約がmiddlewareのログインredirectに先取りされる
- 場所: `middleware.ts:31`, `middleware.ts:40`, `middleware.ts:43`, `middleware.ts:63`, `app/api/stats/route.ts:9`, `app/api/stats/route.ts:11`, `app/stats/page.tsx:59`
- 事実: middlewareは未ログインかつmatcher対象のパスを `NextResponse.redirect()` で返す。

```ts
const redirectWithCookies = (url: URL) => {
  const redirect = NextResponse.redirect(url);
```

```ts
if (!user && pathname !== "/login" && pathname !== "/auth/callback") {
```

```ts
return redirectWithCookies(loginUrl);
```

`/api/stats` はAPI matcherの除外に含まれないが、Route側は未ログイン時にJSON 401を返す契約である。

```ts
const { data: { user } } = await supabase.auth.getUser();

if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

呼出側も401だけをログイン遷移の条件にしている。

```ts
const res = await fetch(`/api/stats?period=${period}&tz=${encodeURIComponent(tz)}`);
if (res.status === 401) {
  router.push("/login");
```

middlewareが未ログインを検出した要求ではRouteの401分岐より先にredirectが返るため、middlewareとRoute・呼出側で未認証レスポンス形式が統一されていない。
- 分類: 不統一
- 推奨対応: APIではJSON 401、ページではログインredirectとする分岐、または呼出側がredirectを扱う契約のどちらかへ統一する案をレビューする。
- 優先度: 中

### [B-05] `/auth/callback` の未ログイン例外は現在のmatcherから到達しない
- 場所: `middleware.ts:40`, `middleware.ts:55`
- 事実: 未ログインredirect条件は `/auth/callback` を例外にしている。

```ts
if (!user && pathname !== "/login" && pathname !== "/auth/callback") {
```

しかしmatcherのページエントリは `/`、`/settings/:path*`、`/login` だけであり、残る1件は `/api/...` である。`/auth/callback` はmatcherに入らないため、このpathname例外が判定を変える経路はない。

```ts
"/",
"/settings/:path*",
"/login",
```

- 分類: デッドコード
- 推奨対応: callbackをmiddleware対象外にする現仕様を維持するなら条件を整理し、意図をmatcher側に集約する案をレビューする。
- 優先度: 低

## 問題なしと確認した組み合わせ

### S21 `/api/reports` は現在整合している

`middleware.ts:63` は `reports(?:/|$)` を除外する。`app/api/reports/route.ts:46-49` は未ログインを明示的に `null` とし、そのまま通報処理を継続する。

```ts
// ログイン中ユーザーのIDを取得（未ログインはnull）
const supabase = createRouteHandlerSupabaseClient(req, new NextResponse());
const { data: { user } } = await supabase.auth.getUser();
```

```ts
const reporterUserId = user?.id ?? null;
```

公開shareページの呼出箇所 `app/share/[token]/page.tsx:198-205` も開いて確認した。過去事例S21の「匿名通報をmatcherがredirectする」状態は、現在の実ファイルでは再現しない構成である。

### 公開share GET、MCP Bearer、OAuth callbackは除外と整合している

- `app/api/share/[token]/route.ts`: `auth.getUser()` を呼ばず、`is_public` を確認して公開データだけを返す。`share` 除外と整合。
- `app/api/mcp/threads/route.ts`: GET/POSTとも `authenticateMcpToken()` と未認証401を確認。`mcp` 除外と整合。
- `app/api/mcp/threads/[id]/messages/route.ts`: GET/POSTとも `authenticateMcpToken()` と未認証401を確認。`mcp` 除外と整合。
- `lib/mcp-auth.ts:1-3`: Cookie / Supabaseセッションを読まないBearer専用であることと、実装がAuthorizationヘッダを読むことを確認。
- `app/api/auth/github/callback/route.ts`: Cookieユーザーを要求せず、`consumeOAuthState()` がuserIdを返さない場合は処理を継続しない。callback除外と整合。
- `lib/github-token-store.ts:91-108`: stateの未使用・有効期限を条件に一度だけconsumeすることを確認。
- `app/auth/callback/route.ts`: `/auth/callback` はmatcher対象外で、認可codeを `exchangeCodeForSession()` へ渡すログイン入口であることを確認。

### matcher対象のCookie必須Route

次の42ファイルは、全エクスポートメソッド内に `auth.getUser()` と未ログインguardがあり、API matcherの除外には該当しないことを確認した。アクセス要否の前提自体はmatcherと整合している。ただし未認証レスポンス形式の代表的な不統一は [B-04] に記載した。

- `app/api/album/route.ts`
- `app/api/arena/route.ts`
- `app/api/auth/github/route.ts`
- `app/api/auth/github/status/route.ts`
- `app/api/calendar/route.ts`
- `app/api/chat/route.ts`
- `app/api/extract-settings/route.ts`
- `app/api/folder-settings/route.ts`
- `app/api/image-gen/route.ts`
- `app/api/lore/[id]/route.ts`
- `app/api/lore/batch-train/route.ts`
- `app/api/lore/bulk-archive/route.ts`
- `app/api/lore/chunks/[id]/route.ts`
- `app/api/lore/chunks/route.ts`
- `app/api/lore/consolidate/candidates/route.ts`
- `app/api/lore/consolidate/dismiss/route.ts`
- `app/api/lore/consolidate/merge/route.ts`
- `app/api/lore/consolidate/preview/route.ts`
- `app/api/lore/dreaming-batch/history/route.ts`
- `app/api/lore/dreaming-batch/rollback/route.ts`
- `app/api/lore/dreaming-batch/route.ts`
- `app/api/lore/embed/route.ts`
- `app/api/lore/like/route.ts`
- `app/api/lore/route.ts`
- `app/api/lore/update-temporal-status/route.ts`
- `app/api/messages/[id]/route.ts`
- `app/api/novel-check/route.ts`
- `app/api/profile/route.ts`
- `app/api/search/route.ts`
- `app/api/stats/route.ts`
- `app/api/threads/[id]/branch-to/route.ts`
- `app/api/threads/[id]/copy/route.ts`
- `app/api/threads/[id]/drafts/route.ts`
- `app/api/threads/[id]/likes/route.ts`
- `app/api/threads/[id]/message-notes/route.ts`
- `app/api/threads/[id]/messages/[messageId]/route.ts`
- `app/api/threads/[id]/messages/restore-branch/route.ts`
- `app/api/threads/[id]/messages/route.ts`
- `app/api/threads/[id]/notes/route.ts`
- `app/api/threads/[id]/route.ts`
- `app/api/threads/[id]/tags/route.ts`
- `app/api/threads/route.ts`

### middlewareだけで保護するRoute

`app/api/fetch-github/route.ts` はハンドラ内に認証呼び出しがないが、API matcherの除外には該当しない。匿名継続用の `user?.` / `if (user)` 分岐もない。呼出箇所は `components/ChatInput.tsx:556` と `components/ChatInputCentered.tsx:336` で、いずれもmiddleware対象の `/` から使われるコンポーネントであることを確認した。このRouteはmiddlewareを唯一の認証gateとする構成として、今回の「匿名前提を保護している」乖離には数えていない。

## 全Routeファイルの確認一覧

上記42ファイルに加え、次の10ファイルを確認したことで、`rg --files app -g 'route.ts'` の全52ファイルを網羅した。

| ファイル | matcher / 認証前提 | 結果 |
|---|---|---|
| `app/api/explore/route.ts` | matcher対象 / Cookie任意 | [B-01] |
| `app/api/fetch-github/route.ts` | matcher対象 / middlewareだけで保護 | 問題なし |
| `app/api/mcp-tokens/route.ts` | `mcp` prefixで除外 / Cookie必須 | [B-02] |
| `app/api/mcp/threads/route.ts` | `mcp` prefixで除外 / Bearer必須 | 問題なし |
| `app/api/mcp/threads/[id]/messages/route.ts` | `mcp` prefixで除外 / Bearer必須 | 問題なし |
| `app/api/reports/route.ts` | `reports` で除外 / Cookie任意 | 問題なし（S21解消済み構成） |
| `app/api/share/[token]/route.ts` | `share` prefixで除外 / 公開GET | 問題なし |
| `app/api/share/[token]/fork/route.ts` | `share` prefixで除外 / Cookie必須 | [B-03] |
| `app/api/auth/github/callback/route.ts` | callback prefixで除外 / OAuth state必須 | 問題なし |
| `app/auth/callback/route.ts` | matcher対象外 / Supabase Auth callback | 問題なし |

## 検証結果

監査対象コードには変更を加えず、指定コマンドと既存の全 `scripts/*.test.cjs` を実行した。

| コマンド | 終了コード | 結果 |
|---|---:|---|
| `npx tsc --noEmit` | 1 | 失敗。`.next/types` と実コードの双方で `next/server`、`next`、metadata型宣言等を解決できない。`app/[handle]/page.tsx` のnull関連エラーも出力 |
| `npm run build` | 1 | 失敗。`next build` 実行時に `'next' is not recognized as an internal or external command` |
| `node scripts/ai-context-blocks.test.cjs` | 0 | `ai-context-blocks tests passed` |
| `node scripts/branchTree.test.cjs` | 0 | `branchTree tests passed` |
| `node scripts/loadModel.test.cjs` | 0 | `loadModel tests passed` |
| `node scripts/lore-openai.test.cjs` | 0 | 11件成功、`11 lore OpenAI tests passed` |
| `node scripts/lore.test.cjs` | 1 | 失敗。`app/api/lore/consolidate/candidates/route.ts` の読込時に `Cannot find module 'next/server'` |
| `node scripts/modelRegistry.test.cjs` | 0 | `modelRegistry tests passed` |
| `node scripts/pricing.test.cjs` | 0 | `pricing tests passed` |

失敗原因の環境確認では、`node_modules/next/dist/server/next-server.js` は存在した一方、`node_modules/next/package.json`、`node_modules/next/server.js`、`node_modules/.bin/next` は存在せず、`node_modules/.bin/tsc` だけが存在した。依存パッケージの修復・更新は本監査の非対象なので実施していない。

`npx tsc --noEmit` により `tsconfig.tsbuildinfo` が更新されたことを `git status --short -- tsconfig.tsbuildinfo` で確認し、指示どおり次を実行して復元した。復元後の `git diff -- tsconfig.tsbuildinfo` は出力なし。

```powershell
git restore --worktree -- tsconfig.tsbuildinfo
```

したがって、受け入れ条件の「現状が全緑」はこの作業環境では満たしていない。成功6テスト・失敗1テスト、型検査失敗、build失敗という現状を改変せず記録した。

## 最終 `git status --short`

```text
?? docs/audit/full-audit-b-2026-07-13.md
```
