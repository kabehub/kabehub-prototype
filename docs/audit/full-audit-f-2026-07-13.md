# KabeHub リポジトリ全体 静的監査レポート — 項目F（エラーハンドリング）

- 監査日: 2026-07-13（Asia/Tokyo）
- 対象: Git追跡済み175ファイルを棚卸しし、項目Fの実コード確認は実行コード137ファイルに実施（`node_modules`・`.next` は対象外）
- 変更方針: コード・テスト・設定・既存文書は変更せず、本レポートだけを新規作成
- 判定基準: Supabase結果の `error` を受け取らずに後続処理へ進む呼び出し、および空／ログ出力のみで終了する `catch` を実ファイルで確認した場合だけ計上
- 非実施: DB接続、SQL実行、依存更新、コード修正

## サマリ

| 区分 | 指摘件数 | 対象箇所数 | 高 | 中 | 低 |
|---|---:|---:|---:|---:|---:|
| Supabaseの `{ error }` 未確認（意図不明） | 21 | 138 | 1 | 20 | 0 |
| 空／ログのみの例外処理 | 9 | 50 | 0 | 9 | 0 |
| **実指摘 合計** | **30** | **188** | **1** | **29** | **0** |
| 意図的ベストエフォート／明示的フォールバック（参考） | 5 | 11 | 0 | 0 | 5 |

補足:

- Supabase呼び出しは、`await` の分割代入・結果破棄、`Promise.all`、`.then(...)`、クエリ変数経由を区別して確認した。`error` を受け取る140呼び出し（object binding 139件、既存変数への分割代入1件）では、後続の条件分岐・throw・return等から一度も参照されない例は0件だった。
- `catch` は通常の `CatchClause` 157件、Promise `.catch(...)` 33件、`app/layout.tsx` のインラインJavaScript 1件を確認した。空またはconsole出力だけだったものは通常55件、Promise 4件、インライン1件の計60件で、そのうち明示的フォールバック等10件を参考情報へ分けた。
- 「意図不明」は、コードまたは隣接コメントに失敗を無視する契約・理由がなく、Supabaseの `error` を受け取らない、または例外を空／ログだけで終了させる事実を表す。意図そのものは推測していない。

## 開始条件と安全確認

- 開始時の `git status --short`: 出力なし。`docs/audit/` 外を含め未コミット差分なし。
- `docs/audit/full-audit-f-2026-07-13.md`: 開始時に不存在。
- `node_modules/next/package.json`: 存在、9,992 bytes。極端に小さいmanifestではないため監査を開始した。
- `AGENTS.md`: `rg --files -g 'AGENTS.md' -g '!node_modules/**' -g '!.next/**'` は該当なし。

## 指摘 — Supabaseの `{ error }` 未確認

### [F-001] API Routeの認証62箇所が `getUser()` の `error` を受け取らない
- 場所: `app/api/album/route.ts:10`、`app/api/arena/route.ts:108`、`app/api/auth/github/route.ts:12`、`app/api/auth/github/route.ts:34`、`app/api/auth/github/status/route.ts:12`、`app/api/calendar/route.ts:9`、`app/api/chat/route.ts:498`、`app/api/explore/route.ts:50`、`app/api/extract-settings/route.ts:16`、`app/api/extract-settings/route.ts:45`、`app/api/folder-settings/route.ts:11`、`app/api/folder-settings/route.ts:55`、`app/api/image-gen/route.ts:195`、`app/api/lore/[id]/route.ts:17`、`app/api/lore/batch-train/route.ts:21`、`app/api/lore/bulk-archive/route.ts:11`、`app/api/lore/chunks/[id]/route.ts:9`、`app/api/lore/chunks/route.ts:9`、`app/api/lore/consolidate/candidates/route.ts:19`、`app/api/lore/consolidate/dismiss/route.ts:12`、`app/api/lore/consolidate/merge/route.ts:28`、`app/api/lore/consolidate/preview/route.ts:64`、`app/api/lore/dreaming-batch/history/route.ts:19`、`app/api/lore/dreaming-batch/rollback/route.ts:11`、`app/api/lore/dreaming-batch/route.ts:21`、`app/api/lore/embed/route.ts:10`、`app/api/lore/like/route.ts:14`、`app/api/lore/route.ts:13`、`app/api/lore/route.ts:70`、`app/api/lore/update-temporal-status/route.ts:32`、`app/api/mcp-tokens/route.ts:7`、`app/api/mcp-tokens/route.ts:23`、`app/api/mcp-tokens/route.ts:53`、`app/api/messages/[id]/route.ts:11`、`app/api/messages/[id]/route.ts:42`、`app/api/novel-check/route.ts:10`、`app/api/reports/route.ts:48`、`app/api/search/route.ts:12`、`app/api/stats/route.ts:9`、`app/api/threads/[id]/drafts/route.ts:12`、`app/api/threads/[id]/drafts/route.ts:33`、`app/api/threads/[id]/drafts/route.ts:63`、`app/api/threads/[id]/likes/route.ts:14`、`app/api/threads/[id]/likes/route.ts:75`、`app/api/threads/[id]/message-notes/route.ts:10`、`app/api/threads/[id]/message-notes/route.ts:28`、`app/api/threads/[id]/message-notes/route.ts:47`、`app/api/threads/[id]/messages/[messageId]/route.ts:10`、`app/api/threads/[id]/messages/[messageId]/route.ts:41`、`app/api/threads/[id]/messages/restore-branch/route.ts:12`、`app/api/threads/[id]/messages/route.ts:10`、`app/api/threads/[id]/messages/route.ts:39`、`app/api/threads/[id]/notes/route.ts:10`、`app/api/threads/[id]/notes/route.ts:28`、`app/api/threads/[id]/notes/route.ts:47`、`app/api/threads/[id]/notes/route.ts:67`、`app/api/threads/[id]/route.ts:11`、`app/api/threads/[id]/route.ts:60`、`app/api/threads/[id]/tags/route.ts:10`、`app/api/threads/[id]/tags/route.ts:29`、`app/api/threads/[id]/tags/route.ts:66`、`app/api/threads/route.ts:10`
- 事実: 62呼び出しはいずれも `data.user` だけを分割代入し、`error` bindingを作らない。多くは `user` の有無で401へ分岐するが、認証エラーそのものを分岐条件にしていない。例:

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

- 分類: 不統一
- 推奨対応: `authError` と未ログインを同じ応答にするか区別するかを決め、Route共通の認証結果処理へ揃える案を検討する。
- 優先度: 中

### [F-002] middlewareとクライアント画面8箇所が `getUser()` の `error` を受け取らない
- 場所: `middleware.ts:26`、`app/album/page.tsx:277`、`app/page.tsx:83`、`app/explore/page.tsx:466`、`app/settings/page.tsx:267`、`app/settings/page.tsx:347`、`app/share/[token]/page.tsx:128`、`app/share/[token]/page.tsx:173`
- 事実: middlewareは `data.user` のみを取り、クライアント側の2箇所は `.then(({ data }) => ...)` で `data` だけを受け取る。残る画面も `data` または `data.user` だけを分割代入する。

```ts
supabase.auth.getUser().then(({ data }) => setUser(data.user));
```

```ts
const { data } = await supabase.auth.getUser();
if (!data.user) {
```

- 分類: 不統一
- 推奨対応: middlewareと画面初期化で認証取得失敗を匿名状態と同一視するか、再試行・表示を行うかを明文化する案を検討する。
- 優先度: 中

### [F-003] OAuth開始とsign-out 3箇所がSupabase結果を破棄する
- 場所: `app/login/page.tsx:16`、`app/page.tsx:157`、`app/settings/page.tsx:1111`
- 事実: OAuth開始と2つのsign-outは戻り値を分割代入せず、直後に画面遷移する。`app/settings/page.tsx` の外側 `catch` も、戻り値の `error` をthrowする処理を持たない。

```ts
await supabase.auth.signOut();
window.location.href = "/login";
```

```ts
await supabase.auth.signInWithOAuth({
  provider: "google",
```

- 分類: 不統一
- 推奨対応: OAuth/sign-outの返却 `error` を確認してから遷移するか、失敗時も遷移する契約を明示する案を検討する。
- 優先度: 中

### [F-004] 公開プロフィールの4クエリが失敗と「データなし」を同一視する
- 場所: `app/[handle]/page.tsx:18`、`app/[handle]/page.tsx:52`、`app/[handle]/page.tsx:62`、`app/[handle]/page.tsx:79`
- 事実: profile、公開thread、likeの取得はいずれも `data` だけを受け取る。profileがfalsyならnot-found相当へ進み、thread/likeは `?? []` で空配列になる。

```ts
const { data: profile } = await supabase
  .from('profiles')
```

```ts
const threadList = (threads ?? []).map((thread) => ({
```

- 分類: 不統一
- 推奨対応: 公開データの不存在とDB取得失敗を別の結果として扱う案を検討する。
- 優先度: 中

### [F-005] Exploreの補助4クエリが各 `error` を確認せず集計を続ける
- 場所: `app/api/explore/route.ts:171`、`app/api/explore/route.ts:172`、`app/api/explore/route.ts:173`、`app/api/explore/route.ts:174`
- 事実: like、message、profile、tagを `Promise.all` で取得した後、各resultの `.data ?? []` だけを読む。4つの `.error` を参照するコードはない。

```ts
const [likeRes, messageRes, profileRes, tagRes] = await Promise.all([
  supabase.from("likes").select("thread_id, user_id").in("thread_id", threadIds),
  supabase.from("messages").select("thread_id").in("thread_id", threadIds),
```

- 分類: 不統一
- 推奨対応: 補助情報をベストエフォートにするかAPI全体を失敗させるかを決め、4resultの `error` を明示処理する案を検討する。
- 優先度: 中

### [F-006] Searchの検索対象4クエリだけ `error` を確認しない
- 場所: `app/api/search/route.ts:38`、`app/api/search/route.ts:39`、`app/api/search/route.ts:48`、`app/api/search/route.ts:51`
- 事実: 空query時と最終thread取得は `error` を確認する一方、title/message IDの検索は `Promise.all` resultまたは `{ data }` のみを読み、失敗時は空集合として後続へ進む。

```ts
const { data } = await supabase.from("threads").select("id").ilike("title", pattern).eq("user_id", user.id);
(data ?? []).forEach((t) => threadIds.add(t.id));
```

- 分類: 不統一
- 推奨対応: 全検索分岐で同じDB error応答を返すか、部分検索失敗を明示する案を検討する。
- 優先度: 中

### [F-007] 一括エクスポートの8クエリが `data` だけを受け取る
- 場所: `app/settings/page.tsx:283`、`app/settings/page.tsx:284`、`app/settings/page.tsx:285`、`app/settings/page.tsx:286`、`app/settings/page.tsx:287`、`app/settings/page.tsx:288`、`app/settings/page.tsx:289`、`app/settings/page.tsx:290`
- 事実: `Promise.all` の8resultは分割代入時に `data` だけを取り、各値を `?? []` でZIP生成へ渡す。Supabaseの `{ error }` はPromise rejectionではないため、同関数の外側 `catch` が参照するコードもない。

```ts
const [
  { data: threads },
  { data: messages },
```

```ts
] = await Promise.all([
  supabase.from("threads").select("*").eq("user_id", userId),
```

- 分類: 不統一
- 推奨対応: 8resultを一度そのまま受けて全 `error` を検査し、不完全なexportを生成するか中止するかを明示する案を検討する。
- 優先度: 中

### [F-008] 画像URL・画像コンテキスト取得4箇所がDB/Storageの `error` を捨てる
- 場所: `app/api/album/route.ts:55`、`app/api/chat/route.ts:1066`、`app/api/chat/route.ts:1081`、`components/MessageBubble.tsx:195`
- 事実: Albumの署名URL、ChatのmessageとStorage download、MessageBubbleの署名URLはいずれも `data` だけを受け取る。Chatの外側 `catch` は例外だけを捕捉し、Supabase resultの `error` はthrowしていない。

```ts
const { data: blob } = await supabase.storage
  .from('generated-images')
  .download(storagePath)
```

```ts
.createSignedUrl(message.metadata.storagePath, 3600)
.then(({ data }) => {
```

- 分類: 不統一
- 推奨対応: DB取得・Storage取得・署名失敗を同じ画像取得エラー契約へ集約する案を検討する。
- 優先度: 中

### [F-009] Chatのthread・設定・再生成対象5クエリが失敗をnot-foundまたは設定なしへ畳み込む
- 場所: `app/api/chat/route.ts:609`、`app/api/chat/route.ts:630`、`app/api/chat/route.ts:649`、`app/api/chat/route.ts:672`、`app/api/chat/route.ts:693`
- 事実: 5クエリは `data` だけを受け取る。最初のthreadがfalsyならupsertへ進み、確認後または再生成対象がfalsyなら404を返し、folder settingがfalsyなら既定値のまま進む。

```ts
let { data: thread } = await supabase
  .from('threads')
```

```ts
if (!thread) {
  const title = userContent.slice(0, 20) + (userContent.length > 20 ? "…" : "");
```

- 分類: 不統一
- 推奨対応: Chat初期化の各selectでDB errorと行不存在を別に処理する案を検討する。
- 優先度: 中

### [F-010] Chatの分岐編集用5クエリが失敗時に404・0・空履歴へフォールバックする
- 場所: `app/api/chat/route.ts:748`、`app/api/chat/route.ts:798`、`app/api/chat/route.ts:811`、`app/api/chat/route.ts:855`、`app/api/chat/route.ts:874`
- 事実: base message、最大branch index、最大message number、active履歴、直近active messageは `data` だけを受け取る。最大値は `?? 0`、履歴は `?? []` を使う。

```ts
const nextBranchIndex = (maxBranchRow?.branch_index ?? 0) + 1;
```

```ts
...(activeMessages ?? []).map((m) => ({
```

- 分類: 不統一
- 推奨対応: 採番・履歴構築に使うselectは `error` 時に処理を止め、fallbackを行不存在だけへ限定する案を検討する。
- 優先度: 中

### [F-011] Arenaが存在確認と4 INSERTの `error` を確認せずレスポンスを返す
- 場所: `app/api/arena/route.ts:145`、`app/api/arena/route.ts:204`、`app/api/arena/route.ts:207`、`app/api/arena/route.ts:222`、`app/api/arena/route.ts:286`
- 事実: thread存在確認は `{ data: exists }` だけを取り、human、thread、intervention、assistantのINSERTはresult全体を破棄する。各分岐はその後JSON successを返す。

```ts
await supabase.from("messages").insert({
  id: humanMsg.id,
```

```ts
const { data: exists } = await supabase.from("threads").select("id").eq("id", threadId).single();
if (!exists) {
```

- 分類: 不統一
- 推奨対応: Arenaの全永続化で `error` を確認し、DB保存済みのmessageだけをsuccessとして返す案を検討する。
- 優先度: 中

### [F-012] Lore再埋め込みがDELETEと各INSERTの結果を破棄する
- 場所: `app/api/lore/embed/route.ts:22`、`app/api/lore/embed/route.ts:39`
- 事実: 同folderのDELETEと、loop内のlore INSERTはいずれも戻り値を受け取らない。INSERT後はDB resultを確認せずcountを増やす。

```ts
await supabase.from('lore_embeddings').delete()
  .eq('user_id', user.id).eq('folder_name', folderName);
```

```ts
await supabase.from('lore_embeddings').insert({
  user_id: user.id,
```

- 分類: 不統一
- 推奨対応: DELETE/INSERTの `error` を確認し、洗い替えの原子性と返却countの意味を合わせてレビューする。
- 優先度: 中

### [F-013] notes・message notes・draftsのDELETEが結果を確認せずsuccessを返す
- 場所: `app/api/threads/[id]/notes/route.ts:71`、`app/api/threads/[id]/message-notes/route.ts:51`、`app/api/threads/[id]/drafts/route.ts:67`
- 事実: 3つのDELETE RouteはいずれもSupabase resultを受け取らず、直後にsuccess JSONを返す。

```ts
await supabase.from("thread_notes").delete().eq("id", id).eq("user_id", user.id);
return NextResponse.json({ success: true });
```

- 分類: 不統一
- 推奨対応: 3つのCRUD Routeで共通のmutation error応答を使う案を検討する。
- 優先度: 中

### [F-014] GitHub tokenの2 SELECTとDELETEがDB errorを接続なし・削除成功として扱う
- 場所: `lib/github-token-store.ts:28`、`lib/github-token-store.ts:47`、`lib/github-token-store.ts:62`
- 事実: token取得とstatus取得は `{ data }` だけを受け、falsyならnull/未接続を返す。削除はresultを破棄して `Promise<void>` を正常完了する。

```ts
const { data } = await supabase
  .from("user_github_tokens")
```

```ts
await supabase.from("user_github_tokens").delete().eq("user_id", userId);
```

- 分類: 不統一
- 推奨対応: 暗号化アクセストークンの取得・状態取得・削除すべてでDB errorを呼出元へ返す案を検討する。
- 優先度: 高

### [F-015] MCP message Routeの所有確認2件とtimestamp更新が `error` を確認しない
- 場所: `app/api/mcp/threads/[id]/messages/route.ts:42`、`app/api/mcp/threads/[id]/messages/route.ts:76`、`app/api/mcp/threads/[id]/messages/route.ts:100`
- 事実: GET/POSTの所有thread selectは `{ data: thread }` だけを受け、falsyなら404を返す。POST後のthread `updated_at` UPDATEはresultを破棄して201を返す。

```ts
const { data: thread } = await supabase
  .from('threads')
```

```ts
await supabase
  .from('threads')
  .update({ updated_at: new Date().toISOString() })
```

- 分類: 不統一
- 推奨対応: ownership queryのDB失敗を404と分け、timestamp更新を明示的ベストエフォートにするならコメントと観測方法を追加する案を検討する。
- 優先度: 中

### [F-016] Thread系4 Routeの事前selectが `error` を確認せず後続mutationへ進む
- 場所: `app/api/threads/[id]/likes/route.ts:22`、`app/api/threads/[id]/messages/route.ts:64`、`app/api/threads/[id]/route.ts:14`、`app/api/threads/[id]/tags/route.ts:41`
- 事実: like対象thread、削除対象message IDs、削除対象thread、重複tagは `data` だけを受け取る。falsy/空の場合は404、archive省略、または新規INSERTへ分岐する。

```ts
const { data: targetMessages } = await supabase
  .from("messages")
```

```ts
const { data: existing } = await supabase
  .from("thread_tags")
```

- 分類: 不統一
- 推奨対応: mutation前の存在・重複確認で `error` と0件を区別する案を検討する。
- 優先度: 中

### [F-017] Lore like/cleaningの3 SELECTが `error` を確認せず既定動作へ進む
- 場所: `app/api/lore/like/route.ts:39`、`app/api/lore/like/route.ts:59`、`lib/lore/dreaming.ts:134`
- 事実: liked loreの重複確認、service-roleでのthread folder取得、cleaning対象取得は `data` のみを受ける。結果がfalsyならそれぞれ新規生成、folder null、cleaned 0件へ進む。

```ts
const { data: records } = await supabase
  .from("lore_embeddings")
```

```ts
if (!records?.length) return { cleaned: 0, failed: 0 };
```

- 分類: 不統一
- 推奨対応: 重複確認・folder解決・batch対象取得のDB errorを各正常系fallbackと区別する案を検討する。
- 優先度: 中

### [F-018] Auth callbackのprofile SELECTがDB errorをオンボーディング条件と同一視する
- 場所: `app/auth/callback/route.ts:43`
- 事実: session交換成功後のprofile queryは `{ data: profile }` だけを受け、`!profile?.handle` の場合にsettingsへredirectする。

```ts
const { data: profile } = await supabase
  .from("profiles")
```

```ts
if (!profile?.handle) {
  return NextResponse.redirect(`${origin}/settings?onboarding=true`);
```

- 分類: 不統一
- 推奨対応: profile未作成とprofile取得失敗をredirect先または応答で区別する案を検討する。
- 優先度: 中

### [F-019] Share画面のlike件数・自分のlike取得が `error` を確認しない
- 場所: `app/share/[token]/page.tsx:129`、`app/share/[token]/page.tsx:135`
- 事実: countとmyLikeはそれぞれ `{ count }`、`{ data: myLike }` だけを受け取り、null/undefinedなら0またはfalseを画面stateへ設定する。

```ts
const { count } = await supabase
  .from("likes")
```

```ts
setLikedByMe(!!myLike);
```

- 分類: 不統一
- 推奨対応: like情報取得失敗時に既定値表示を続けるか、再試行可能な状態を出すかを明示する案を検討する。
- 優先度: 中

### [F-020] 4つの補償DELETEが自身の失敗を確認しない
- 場所: `app/api/lore/consolidate/merge/route.ts:99`、`app/api/share/[token]/fork/route.ts:104`、`app/api/threads/[id]/branch-to/route.ts:136`、`app/api/threads/[id]/copy/route.ts:81`
- 事実: 先行INSERT後の後続処理が失敗した際、作成済み行をDELETEしてからエラー応答するが、4つともDELETE resultを受け取らない。copyには「中途半端な状態を防ぐ」とコメントがあるが、DELETE errorを意図的に無視する記述はない。

```ts
// スレッドだけ作成されてメッセージが入らない中途半端な状態を防ぐ
await supabase.from('threads').delete().eq('id', newThread.id)
```

- 分類: 不統一
- 推奨対応: 補償操作の `error` を記録・返却し、補償自体が失敗した状態を識別できるようにする案を検討する。
- 優先度: 中

### [F-021] fork count増加RPCの結果を破棄してfork成功を返す
- 場所: `app/api/share/[token]/fork/route.ts:109`
- 事実: `increment_fork_count` のresultを受け取らず、その直後に新threadを含む成功JSONを返す。意図的ベストエフォートとするコメントはない。

```ts
await authSupabase.rpc("increment_fork_count", { p_thread_id: sourceThread.id });

return NextResponse.json({
```

- 分類: 不統一
- 推奨対応: fork作成とcount更新の整合性要件を決め、RPC errorを返すか明示的ベストエフォートにする案を検討する。
- 優先度: 中

## 指摘 — 空またはログ出力のみの例外処理

### [F-022] Chat APIの4つの補助機能が例外をログだけで終了して本処理を続ける
- 場所: `app/api/chat/route.ts:1007`、`app/api/chat/route.ts:1104`、`app/api/chat/route.ts:1194`、`app/api/chat/route.ts:1220`
- 事実: combined lore、画像コンテキスト、GitHub tool loop、RAG memoryの `catch` はthrow・return・応答変更を行わない。combined loreはAbortErrorだけwarnし、それ以外の例外ではログも出さない。

```ts
} catch (err) {
  console.error("[github-tool-loop] error:", err);
}
```

```ts
} catch (err) {
  console.warn("[rag-memory] skipped:", err);
}
```

- 分類: 不統一
- 推奨対応: 各補助機能をベストエフォートとする契約をコメント・レスポンスmetadata・監視のいずれかで明示する案を検討する。
- 優先度: 中

### [F-023] Novel Checkのサーバー・クライアント双方がstream JSON parse例外を空catchで捨てる
- 場所: `app/api/novel-check/route.ts:110`、`app/novel-check/page.tsx:132`
- 事実: server側とclient側のstream chunk parseは、いずれもcatch bodyが `// 無視` のみである。分割chunkを許容する説明や、最終chunkで再試行する処理は隣接コメントにない。

```ts
} catch {
  // 無視
}
```

- 分類: 不統一
- 推奨対応: 分割chunkを許容する仕様なら再構成条件を明記し、それ以外のparse errorは観測または通知する案を検討する。
- 優先度: 中

### [F-024] LocalStorage読込5箇所のcatchが完全に空である
- 場所: `app/layout.tsx:38`、`app/arena/page.tsx:51`、`app/page.tsx:171`、`app/settings/page.tsx:127`、`components/ChatPanel.tsx:324`
- 事実: font scale、API key header、設定画面のfont scale、ChatPanelのAPI key draftの読込例外を、空のcatchで終了する。`app/layout.tsx` はtemplate string内の実行時JavaScriptなのでTypeScript AST外だが、実コードの `catch (e) {}` を確認した。

```tsx
} catch (e) {}
```

```ts
} catch {}
return headers;
```

- 分類: 不統一
- 推奨対応: 保存領域利用不可を既定値へ落とす設計なら共通helperとコメントへ集約し、必要な画面では通知する案を検討する。
- 優先度: 中

### [F-025] Album・Calendar・Share・Novel Settingsの5 catchが空またはログのみである
- 場所: `app/album/page.tsx:299`、`app/calendar/page.tsx:36`、`app/share/[token]/page.tsx:143`、`components/NovelSettingsPane.tsx:145`、`components/NovelSettingsPane.tsx:206`
- 事実: Album取得はconsole errorだけ、Calendar取得は `// noop`、Shareのlike情報は空、Novel Settingsの取得・削除は `/* 無視 */` だけで終了する。例外を再throw、利用者state、戻り値へ反映する処理は各catch bodyにない。

```ts
} catch (err) {
  console.error("アルバム取得失敗:", err);
}
```

```ts
} catch { /* 無視 */ }
```

- 分類: 不統一
- 推奨対応: 読込・削除失敗時の画面stateを定義し、少なくとも削除操作は成功表示と失敗表示を区別する案を検討する。
- 優先度: 中

### [F-026] Home画面の14 catch handlerが空またはconsole出力だけで操作を終了する
- 場所: `app/page.tsx:251`、`app/page.tsx:288`、`app/page.tsx:335`、`app/page.tsx:352`、`app/page.tsx:633`、`app/page.tsx:691`、`app/page.tsx:696`、`app/page.tsx:1029`、`app/page.tsx:1034`、`app/page.tsx:1085`、`app/page.tsx:1112`、`app/page.tsx:1125`、`app/page.tsx:1171`、`app/page.tsx:1193`
- 事実: 検索、設定取得、thread作成・削除、送信、memo化、再生成、message削除、branch復元等の例外処理は、空のPromise `.catch` 1件とconsole出力のみ13件である。catch bodyから利用者向けerror state設定・alert・throwを行う箇所はない。

```ts
.catch(() => {});
```

```ts
} catch (err) {
  console.error("メッセージ削除失敗:", err);
}
```

- 分類: 不統一
- 推奨対応: 操作種別ごとの失敗UIとoptimistic更新のrollback方針を定め、console-only handlerを置き換える案を検討する。
- 優先度: 中

### [F-027] ChatPanelのtag・note・draft読込4箇所が空またはconsole出力だけである
- 場所: `components/ChatPanel.tsx:420`、`components/ChatPanel.tsx:435`、`components/ChatPanel.tsx:448`、`components/ChatPanel.tsx:460`
- 事実: tag取得のPromise `.catch` は空で、thread note、message note、draft取得のcatchはconsole errorだけである。既存stateのclearやerror state設定はcatch bodyにない。

```ts
.then((data: ThreadTag[]) => { if (Array.isArray(data)) setTags(data); })
.catch(() => {});
```

```ts
} catch (err) {
  console.error("下書き取得失敗:", err);
}
```

- 分類: 不統一
- 推奨対応: 読込中・空データ・取得失敗を別stateにし、4種類の補助データで共通表示を使う案を検討する。
- 優先度: 中

### [F-028] ChatPanelの保存・CRUD 12箇所が例外をconsole出力だけで終了する
- 場所: `components/ChatPanel.tsx:349`、`components/ChatPanel.tsx:540`、`components/ChatPanel.tsx:575`、`components/ChatPanel.tsx:598`、`components/ChatPanel.tsx:640`、`components/ChatPanel.tsx:751`、`components/ChatPanel.tsx:767`、`components/ChatPanel.tsx:781`、`components/ChatPanel.tsx:796`、`components/ChatPanel.tsx:810`、`components/ChatPanel.tsx:826`、`components/ChatPanel.tsx:845`
- 事実: API key、公開設定、Push、system prompt、roleplay、thread note、message note、draftの保存・更新・削除catchはconsole errorだけである。成功時にstateを更新する処理がある操作でも、catch bodyには利用者通知またはrollbackがない。

```ts
} catch (err) {
  console.error("公開設定保存失敗:", err);
}
```

```ts
} catch (err) {
  console.error("下書き削除失敗:", err);
}
```

- 分類: 不統一
- 推奨対応: ChatPanel内のmutationを共通request helperへ寄せ、失敗通知とrollback要否を操作ごとに定義する案を検討する。
- 優先度: 中

### [F-029] Arena送信・Markdownコピー・Sidebar保存が例外をconsole出力だけで終了する
- 場所: `app/arena/page.tsx:332`、`components/MarkdownRenderer.tsx:80`、`components/Sidebar.tsx:713`
- 事実: human submit、clipboard copy、folder settings保存のcatchは、それぞれconsole errorだけを実行する。利用者向けerror state・alert・throwはcatch bodyにない。

```ts
} catch (err) {
  console.error("copy failed:", err);
}
```

- 分類: 不統一
- 推奨対応: 直接操作の失敗が利用者から判別できるよう、各UIの既存stateに失敗表示を追加する案を検討する。
- 優先度: 中

### [F-030] MCP tokenの `last_used_at` 更新例外をログだけで終了して認証成功を返す
- 場所: `lib/mcp-auth.ts:49`
- 事実: UPDATEの `{ error }` はwarnする一方、UPDATE自体がthrowした場合もcatchでwarnするだけで、その後 `data.user_id` を返す。更新を意図的ベストエフォートにするコメントはないため意図不明として計上した。

```ts
} catch (err) {
  console.warn('[mcp-auth] Failed to update MCP token last_used_at:', err)
}
```

- 分類: 不統一
- 推奨対応: usage timestampを認証非阻害とする契約をコメント・metricとともに明示するか、更新失敗を呼出元へ返す案を検討する。
- 優先度: 中

## 参考情報 — 意図またはフォールバックが実コードに明示されている箇所

### [F-031] Chat streamの5 catchは壊れた行・分割chunkを捨てる意図がコメントにある
- 場所: `app/api/chat/route.ts:126`、`app/api/chat/route.ts:1319`、`app/api/chat/route.ts:1387`、`app/page.tsx:524`、`app/page.tsx:534`
- 事実: SSE pumpには「既存挙動維持: 壊れたSSE行・イベント処理中例外は握りつぶす」、JSON処理には「分割チャンクは無視」「JSON parseエラーは無視」と明記されているため、意図不明の指摘から除外した。

```ts
} catch {
  // 既存挙動維持: 壊れたSSE行・イベント処理中例外は握りつぶす
}
```

- 分類: 情報のみ
- 推奨対応: stream framingの仕様を変更する際に、この許容条件と再構成挙動を合わせて再確認する。
- 優先度: 低

### [F-032] Sidebarの2 catchは画面全体を壊さないためのbest-effortと明記されている
- 場所: `components/Sidebar.tsx:619`、`components/Sidebar.tsx:639`
- 事実: folder typeとfolder settingsの補助取得を行うcatchはいずれも「サイドバーが壊れないよう握りつぶす」とコメントし、主要thread一覧を維持する設計判断がコードにある。

```ts
} catch {
  // サイドバーが壊れないよう握りつぶす
}
```

- 分類: 情報のみ
- 推奨対応: 補助取得を非阻害とするコメントを維持し、必要なら失敗metricだけを追加する案を検討する。
- 優先度: 低

### [F-033] GitHub取得・JSON抽出の2 catchは次のfallbackを試すと明記されている
- 場所: `lib/github.ts:112`、`lib/github-tool-loop.ts:348`
- 事実: Raw取得失敗時はGitHub Contents APIへ進み、JSON配列parse失敗時は次の候補へ進むことがcatch内コメントに記載され、catch後に実際のfallback処理が続く。

```ts
} catch {
  // Raw取得に失敗した場合はGitHub Contents APIにフォールバックする。
}
```

- 分類: 情報のみ
- 推奨対応: fallback経路を維持し、両経路とも失敗した最終結果だけを呼出元へ返す現行契約をテストで保持する案を検討する。
- 優先度: 低

### [F-034] Server Componentでのcookie書込例外は無視可能と明記されている
- 場所: `lib/supabase/server.ts:19`
- 事実: Supabase server clientのcookie `setAll` 内catchは「Server Componentからの呼び出し時は無視してOK」とコメントしているため、意図不明の空catchから除外した。

```ts
} catch {
  // Server Componentからの呼び出し時は無視してOK
}
```

- 分類: 情報のみ
- 推奨対応: Supabase SSR adapter更新時にServer Componentでのcookie書込契約を再確認する。
- 優先度: 低

### [F-035] `markMessageLearnedBestEffort` はSupabase resultだけを意図的に無視し、例外は呼出元へ伝播させる
- 場所: `lib/lore/batchTrain.ts:174`、`lib/lore/batchTrain.ts:175`、`lib/lore/batchTrain.ts:206`
- 事実: 関数名がBestEffortで、隣接コメントに「現行挙動を維持するため意図的に握りつぶしている」とある。関数内にcatchはなく、`await` 自体がthrowした場合は呼出元のcatchがfailure resultへ変換するため、デッドコード／不統一の指摘から除外した。

```ts
async function markMessageLearnedBestEffort(supabase: SupabaseClient, userId: string, messageId: string): Promise<void> {
  // 現行挙動を維持するため意図的に握りつぶしている。将来の改善候補
  await supabase
```

```ts
await markMessageLearnedBestEffort(supabase, userId, message.id);
} catch (error) {
```

- 分類: 情報のみ
- 推奨対応: result error非阻害・例外伝播という現在の境界をコメントとcharacterization testで維持する案を検討する。
- 優先度: 低

## 問題なし・対象外と判断した範囲と確認方法

### `{ error }` を受け取ったSupabase呼び出し

- TypeScript ASTで、Supabase chainを含む `await` とobject binding patternを全137コードファイルから抽出した。
- `{ error }` または `{ error: alias }` をobject bindingで受け取る呼び出しは139件、`app/api/reports/route.ts:55` で既存変数へ分割代入する呼び出しは1件だった。TypeCheckerのsymbol照合と代入後の実コード確認で、未参照は0件だった。
- 実ファイルでは `if (error)`、複合条件、throw、error response、呼出元へ返すresultのいずれかを確認した。確認ファイルは後掲「確認ファイル一覧」のうちSupabase hitがあった全ファイル。
- クエリを変数へ構築して後からawaitする `app/api/explore/route.ts:70`・`app/api/explore/route.ts:115`、`app/api/lore/route.ts:25`、`app/api/lore/dreaming-batch/history/route.ts:27`、`app/api/share/[token]/route.ts:26`、`app/api/share/[token]/fork/route.ts:31`・`:49` も、最終awaitで `error` を受け取り分岐することを個別確認した。

確認例:

```ts
const { data: { user }, error: authError } = await supabase.auth.getUser()
if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

### 空／ログのみではないcatch

- `CatchClause` 157件から空20件・console-only 35件を除いた102件は、return、throw、HTTP response、利用者向けstate/alert、rollback、fallback値、失敗countのいずれかをcatch bodyで実行していた。
- Promise `.catch(...)` 33件から空2件・console-only 2件を除いた29件は、JSON parseのfallback object/null、test runnerのexit code、または再throwを実行していた。
- テスト内の通常catchはログ後にthrowするため、握りつぶしには計上していない。確認ファイル: `scripts/lore.test.cjs`、`scripts/lore-openai.test.cjs`。
- `next.config.js:11` はURL parse失敗時にCSP用originを空文字へ設定し、`lib/github.ts:43`、`lib/github-token-store.ts:38`、`lib/lore/openai.ts:38` 等はfallback値をreturnするため、「空またはログのみ」には計上していない。

確認例:

```js
} catch (error) {
  console.error(`not ok - ${name}`);
  throw error;
```

### 実行した主要検索コマンド

```text
git ls-files
```

```text
rg -n -U -g '*.ts' -g '*.tsx' -g '*.js' -g '*.cjs' -g '!node_modules/**' -g '!.next/**' 'catch\s*(\([^)]*\))?\s*\{' .
```

```text
rg -n -g '*.ts' -g '*.tsx' -g '*.js' -g '*.cjs' -g '!node_modules/**' -g '!.next/**' '\.catch\s*\(' .
```

```text
rg -n -g '*.ts' -g '*.tsx' -g '*.js' -g '*.cjs' -g '!node_modules/**' -g '!.next/**' '(\.from\(|\.rpc\(|\.auth\.|\.storage\.)' .
```

追加で、read-onlyのinline Node scriptからTypeScript compiler APIを用い、各 `AwaitExpression`、binding symbol、`CatchClause`、Promise `.catch` callbackを列挙した。スクリプトや中間ファイルはリポジトリに作成していない。`Array.from`、`Buffer.from`、通常のfetch、Supabase resultを最終awaitで検査するquery builderは実ファイルを開いて非該当と判定した。

## 確認ファイル一覧（追跡済み実行コード137件）

抽出コマンド: `git ls-files | Where-Object { $_ -match '\.(ts|tsx|js|cjs)$' }`

### ルート（5件）

- `middleware.ts`
- `next-env.d.ts`
- `next.config.js`
- `postcss.config.js`
- `tailwind.config.js`

### `app/`（76件）

- `app/[handle]/ProfilePage.tsx`
- `app/[handle]/default.tsx`
- `app/[handle]/page.tsx`
- `app/album/page.tsx`
- `app/api/album/route.ts`
- `app/api/arena/route.ts`
- `app/api/auth/github/callback/route.ts`
- `app/api/auth/github/route.ts`
- `app/api/auth/github/status/route.ts`
- `app/api/calendar/route.ts`
- `app/api/chat/route.ts`
- `app/api/explore/route.ts`
- `app/api/extract-settings/route.ts`
- `app/api/fetch-github/route.ts`
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
- `app/api/mcp-tokens/route.ts`
- `app/api/mcp/threads/[id]/messages/route.ts`
- `app/api/mcp/threads/route.ts`
- `app/api/messages/[id]/route.ts`
- `app/api/novel-check/route.ts`
- `app/api/profile/route.ts`
- `app/api/reports/route.ts`
- `app/api/search/route.ts`
- `app/api/share/[token]/fork/route.ts`
- `app/api/share/[token]/route.ts`
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
- `app/arena/[token]/ArenaViewPage.tsx`
- `app/arena/[token]/default.tsx`
- `app/arena/[token]/page.tsx`
- `app/arena/page.tsx`
- `app/auth/callback/route.ts`
- `app/calendar/page.tsx`
- `app/explore/page.tsx`
- `app/image/page.tsx`
- `app/layout.tsx`
- `app/legal/page.tsx`
- `app/login/page.tsx`
- `app/memory/page.tsx`
- `app/novel-check/page.tsx`
- `app/page.tsx`
- `app/privacy/page.tsx`
- `app/settings/page.tsx`
- `app/share/[token]/page.tsx`
- `app/sitemap.ts`
- `app/stats/page.tsx`
- `app/terms/page.tsx`
- `app/threads/[id]/tree/page.tsx`

### `components/`（14件）

- `components/ArenaTimeline.tsx`
- `components/BranchTree.tsx`
- `components/ChatInput.tsx`
- `components/ChatInputCentered.tsx`
- `components/ChatPanel.tsx`
- `components/ExportModal.tsx`
- `components/LegalLayout.tsx`
- `components/MarkdownRenderer.tsx`
- `components/MessageBubble.tsx`
- `components/NovelSettingsPane.tsx`
- `components/OutlinePane.tsx`
- `components/PublishConfirmModal.tsx`
- `components/RoleplayBubble.tsx`
- `components/Sidebar.tsx`

### `lib/`（34件）

- `lib/ai-context-blocks.ts`
- `lib/branchTree.ts`
- `lib/branching.ts`
- `lib/context-window.ts`
- `lib/exportUtils.ts`
- `lib/genres.ts`
- `lib/github-token-crypto.ts`
- `lib/github-token-store.ts`
- `lib/github-tool-loop.ts`
- `lib/github.ts`
- `lib/internalModels.ts`
- `lib/lore/batchTrain.ts`
- `lib/lore/consolidation.ts`
- `lib/lore/dreaming.ts`
- `lib/lore/index.ts`
- `lib/lore/mappers.ts`
- `lib/lore/openai.ts`
- `lib/lore/search.ts`
- `lib/lore/selects.ts`
- `lib/lore/types.ts`
- `lib/loreMemorySelect.ts`
- `lib/mcp-auth.ts`
- `lib/mock-db.ts`
- `lib/modelRegistry.ts`
- `lib/pricing.ts`
- `lib/rate-limit.ts`
- `lib/storage-path-guard.ts`
- `lib/stringUtils.ts`
- `lib/supabase-db.ts`
- `lib/supabase.ts`
- `lib/supabase/client.ts`
- `lib/supabase/download-image.ts`
- `lib/supabase/route-handler.ts`
- `lib/supabase/server.ts`

### `scripts/`（7件）

- `scripts/ai-context-blocks.test.cjs`
- `scripts/branchTree.test.cjs`
- `scripts/loadModel.test.cjs`
- `scripts/lore-openai.test.cjs`
- `scripts/lore.test.cjs`
- `scripts/modelRegistry.test.cjs`
- `scripts/pricing.test.cjs`

### `types/`（1件）

- `types/index.ts`

### 非実行ファイル（38件）

以下も `git ls-files` で棚卸しした。文書、SQL、JSON、lockfile、画像、CSS、compiler cacheであり、実行時のSupabase client callまたはJavaScript `catch` を持つファイルではないため、項目FのAST母集団から除外した。`package.json` は検証コマンド確認に使用し、SQLは実行していない。

- `.claude/settings.local.json`
- `.claudeignore`
- `.env.local.example`
- `.gitignore`
- `CLAUDE.md`
- `LICENSE`
- `README.en.md`
- `README.md`
- `app/globals.css`
- `docs/applied/README.md`
- `docs/applied/migration_rls_cleanup_p0.sql`
- `docs/applied/migration_v119_github_oauth.sql`
- `docs/applied/migration_v120_github_phase4.sql`
- `docs/applied/migration_v121_expose_share_token.sql`
- `docs/applied/migration_v122_create_likes.sql`
- `docs/applied/migration_v123_rpc_hardening.sql`
- `docs/applied/migration_v125_reports_thread_fk_set_null.sql`
- `docs/applied/migration_v125b_submit_report_function.sql`
- `docs/applied/migration_v125c_submit_report_permission_fix.sql`
- `docs/applied/migration_v126_find_similar_lore_pairs_liked_ai_protection.sql`
- `docs/applied/migration_v127_public_threads_view_security_invoker.sql`
- `docs/applied/v141c_migration.sql`
- `docs/applied/v175_migration.sql`
- `docs/applied/v78_mcp_tokens_migration.sql`
- `docs/applied/v89_migration.sql`
- `docs/audit/full-audit-a-2026-07-13.md`
- `docs/audit/full-audit-b-2026-07-13.md`
- `docs/audit/full-audit-c-2026-07-13.md`
- `docs/audit/full-audit-d-2026-07-13.md`
- `docs/audit/full-audit-e-2026-07-13.md`
- `docs/lore-refactoring-notes.md`
- `docs/schema.sql`
- `package-lock.json`
- `package.json`
- `public/og-image.png`
- `supabase-schema.OBSOLETE.sql`
- `tsconfig.json`
- `tsconfig.tsbuildinfo`

## 既存検証コマンドの実行結果

`package.json` にtest scriptはないため、追跡済みの `scripts/*.test.cjs` 7本をすべて直接実行した。

| コマンド | 結果 | 記録 |
|---|---|---|
| `node scripts/ai-context-blocks.test.cjs` | 成功（exit 0） | `ai-context-blocks tests passed` |
| `node scripts/branchTree.test.cjs` | 成功（exit 0） | `branchTree tests passed` |
| `node scripts/loadModel.test.cjs` | 成功（exit 0） | `loadModel tests passed` |
| `node scripts/lore-openai.test.cjs` | 成功（exit 0） | 11 tests passed |
| `node scripts/lore.test.cjs` | 成功（exit 0） | 20 characterization tests passed |
| `node scripts/modelRegistry.test.cjs` | 成功（exit 0） | `modelRegistry tests passed` |
| `node scripts/pricing.test.cjs` | 成功（exit 0） | `pricing tests passed` |
| `npx tsc --noEmit` | 成功（exit 0） | stdoutなし |
| `npm run build` | 成功（exit 0） | `Compiled successfully`、static pages 26/26 |

`npm run build` のsandbox内初回実行はNext worker生成時の `spawn EPERM` で終了した。コードのcompile errorではなく子プロセス制限だったため、同一コマンドを許可されたsandbox外で再実行し、上表の成功結果を得た。

### `tsconfig.tsbuildinfo` 復元記録

- `npx tsc --noEmit` 前: 141,857 bytes、SHA-256 `B71482A1F1CC187AA29DFA25F73A6D28585632ACB99868C8AA52E308F125C473`
- 型検査後: 135,474 bytes、SHA-256 `91276E26F6506DEFC29D0617D992505AFAC656227842A02C2499563B33C92794`（更新を確認）
- `git restore --worktree -- tsconfig.tsbuildinfo` 実行後: 141,857 bytes、SHA-256 `B71482A1F1CC187AA29DFA25F73A6D28585632ACB99868C8AA52E308F125C473`（開始時と一致）

## 最終 `git status --short`

```text
?? docs/audit/full-audit-f-2026-07-13.md
```
