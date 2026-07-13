# KabeHub リポジトリ全体 静的監査レポート

- 監査日: 2026-07-13（Asia/Tokyo）
- 監査方式: 読み取り専用の静的確認。DB接続・SQL実行なし
- 正本スキーマ: `docs/schema.sql`
- 対象: Git追跡ファイル全体（`node_modules/`・`.next/` は監査対象外）
- 開始条件: 開始時の `git status --short` は出力なし（クリーン）
- 結論: 指摘17件。DBオブジェクト名の欠落はなかったが、DB/RLS・RPC権限・列参照・Storage前提に高優先度の乖離がある
- 検証状態: **全緑ではない**。既存 `node_modules/next` が不完全で、型検査・build・`lore.test.cjs` が実行環境起因で失敗した。監査によるコード変更はない

## サマリ

| 項目 | 監査内容 | 高 | 中 | 低 | 合計 |
|---|---|---:|---:|---:|---:|
| A | DB前提・正本スキーマ整合 | 3 | 0 | 0 | 3 |
| B | セキュリティ・プライバシー | 6 | 0 | 0 | 6 |
| C | 正確性・データ整合性・エラー処理 | 0 | 4 | 0 | 4 |
| D | 設定・重複・デッドコード・文書 | 1 | 1 | 2 | 4 |
| **合計** |  | **10** | **5** | **2** | **17** |

## 監査方法とカバレッジ

### 実行した主要コマンド

```powershell
git status --short
git ls-files
rg --files app/api -g 'route.ts'
rg -n --glob 'app/api/**/route.ts' '\.(rpc|from)\s*\(' app/api
rg -n --glob 'app/api/**/route.ts' '\.select\s*\(' app/api
rg -n -i '^\s*create\s+(or\s+replace\s+)?(table|view|function)' docs/schema.sql
rg -n -i 'security definer|revoke execute|grant execute|auth\.uid\(\)' docs/schema.sql
rg -n 'generated-images|storage\.buckets|storage\.objects|insert into storage' docs
rg -n 'SUPABASE_SERVICE_ROLE_KEY|createRouteHandlerSupabaseClient|serviceRoleClient|auth\.getUser|authenticateMcpToken' app/api lib middleware.ts
rg -n 'dangerouslySetInnerHTML|eval\(|new Function|innerHTML|target="_blank"|window\.open\(' app components lib middleware.ts next.config.js
rg -n 'TODO|FIXME|HACK|XXX|ts-ignore|ts-expect-error|eslint-disable|\bas any\b|: any\b|<any>' app components lib middleware.ts types scripts
```

加えて、ファイルを生成しないNode/TypeScript ASTスクリプトで、全 `route.ts` の文字列リテラル `.from()` / `.rpc()`、直接チェーンの `.select()`、filter列、insert/update/upsertのオブジェクトキーを抽出し、`docs/schema.sql` から抽出したテーブル列集合と突合した。リポジトリ全体の同じ突合では、未知列は [A-01] の1件だけだった。

### A-1. `app/api/**/route.ts` の全件確認

- Route数: 51
- 直接 `.from()` するDBテーブル/ビュー: 14種
- 直接 `.rpc()` するRPC: 7種
- Supabase Storageバケット: 1種（`generated-images`。DBテーブルとは分離して集計）
- 直接DB呼び出しがないRoute: 7件。そのうち5件は到達可能helperを別途追跡し、2件はDB非依存だった
- 全51ファイルの一覧は「付録1」に記載

### A-2. 直接参照DBオブジェクト一覧

すべて `docs/schema.sql` に定義があった。以下の「利用Route」は同名への全利用ファイル（同一ファイル内の複数呼び出しは集約）である。

| `.from()` 名 | 正本定義 | 利用Route | 結果 |
|---|---:|---|---|
| `drafts` | `docs/schema.sql:509` | `app/api/threads/[id]/drafts/route.ts` | 実在 |
| `folder_settings` | `docs/schema.sql:807` | `app/api/chat/route.ts`<br>`app/api/folder-settings/route.ts` | 実在 |
| `likes` | `docs/schema.sql:577` | `app/api/explore/route.ts`<br>`app/api/threads/[id]/likes/route.ts` | 実在 |
| `lore_consolidation_dismissals` | `docs/schema.sql:965` | `app/api/lore/consolidate/candidates/route.ts`<br>`app/api/lore/consolidate/dismiss/route.ts` | 実在 |
| `lore_embeddings` | `docs/schema.sql:907` | `app/api/lore/[id]/route.ts`<br>`app/api/lore/bulk-archive/route.ts`<br>`app/api/lore/chunks/[id]/route.ts`<br>`app/api/lore/chunks/route.ts`<br>`app/api/lore/consolidate/dismiss/route.ts`<br>`app/api/lore/consolidate/merge/route.ts`<br>`app/api/lore/consolidate/preview/route.ts`<br>`app/api/lore/dreaming-batch/history/route.ts`<br>`app/api/lore/embed/route.ts`<br>`app/api/lore/like/route.ts`<br>`app/api/lore/route.ts`<br>`app/api/messages/[id]/route.ts`<br>`app/api/threads/[id]/messages/[messageId]/route.ts`<br>`app/api/threads/[id]/messages/route.ts`<br>`app/api/threads/[id]/route.ts` | 実在 |
| `mcp_tokens` | `docs/schema.sql:852` | `app/api/mcp-tokens/route.ts` | 実在 |
| `message_notes` | `docs/schema.sql:335` | `app/api/threads/[id]/message-notes/route.ts` | 実在 |
| `messages` | `docs/schema.sql:140` | `app/api/album/route.ts`<br>`app/api/arena/route.ts`<br>`app/api/chat/route.ts`<br>`app/api/explore/route.ts`<br>`app/api/image-gen/route.ts`<br>`app/api/lore/like/route.ts`<br>`app/api/mcp/threads/[id]/messages/route.ts`<br>`app/api/messages/[id]/route.ts`<br>`app/api/search/route.ts`<br>`app/api/share/[token]/fork/route.ts`<br>`app/api/share/[token]/route.ts`<br>`app/api/stats/route.ts`<br>`app/api/threads/[id]/branch-to/route.ts`<br>`app/api/threads/[id]/copy/route.ts`<br>`app/api/threads/[id]/messages/[messageId]/route.ts`<br>`app/api/threads/[id]/messages/restore-branch/route.ts`<br>`app/api/threads/[id]/messages/route.ts` | 実在 |
| `novel_settings` | `docs/schema.sql:987` | `app/api/extract-settings/route.ts` | 実在 |
| `profiles` | `docs/schema.sql:52` | `app/api/explore/route.ts`<br>`app/api/profile/route.ts` | 実在 |
| `public_threads_view` | `docs/schema.sql:492` | `app/api/explore/route.ts` | 実在 |
| `thread_notes` | `docs/schema.sql:266` | `app/api/threads/[id]/notes/route.ts` | 実在 |
| `thread_tags` | `docs/schema.sql:405` | `app/api/explore/route.ts`<br>`app/api/threads/[id]/tags/route.ts` | 実在 |
| `threads` | `docs/schema.sql:96` | `app/api/arena/route.ts`<br>`app/api/calendar/route.ts`<br>`app/api/chat/route.ts`<br>`app/api/explore/route.ts`<br>`app/api/image-gen/route.ts`<br>`app/api/lore/like/route.ts`<br>`app/api/mcp/threads/[id]/messages/route.ts`<br>`app/api/mcp/threads/route.ts`<br>`app/api/search/route.ts`<br>`app/api/share/[token]/fork/route.ts`<br>`app/api/share/[token]/route.ts`<br>`app/api/threads/[id]/branch-to/route.ts`<br>`app/api/threads/[id]/copy/route.ts`<br>`app/api/threads/[id]/likes/route.ts`<br>`app/api/threads/[id]/messages/route.ts`<br>`app/api/threads/[id]/route.ts`<br>`app/api/threads/route.ts` | 実在 |

### A-3. 直接RPC一覧

全RPC名・呼び出し引数名は正本の関数名・シグネチャに一致した。実在性は問題なし。ただし、権限設計は [B-02] に指摘がある。

| RPC名 | 呼び出し場所 | 正本定義 | 結果 |
|---|---|---:|---|
| `find_similar_lore_pairs` | `app/api/lore/consolidate/candidates/route.ts:29` | `docs/schema.sql:1209` | 実在・引数一致 |
| `increment_fork_count` | `app/api/share/[token]/fork/route.ts:109` | `docs/schema.sql:710` | 実在・引数一致 |
| `recalc_fork_count` | `app/api/threads/[id]/route.ts:42` | `docs/schema.sql:682` | 実在・引数一致 |
| `recalc_likes_count` | `app/api/threads/[id]/likes/route.ts:42,55,91` | `docs/schema.sql:653` | 実在・引数一致 |
| `rollback_dreaming_batch_multi` | `app/api/lore/dreaming-batch/rollback/route.ts:22` | `docs/schema.sql:1579` | 実在・引数一致 |
| `submit_report` | `app/api/reports/route.ts:55` | `docs/schema.sql:750` | 実在・引数一致 |
| `update_lore_temporal_status` | `app/api/lore/update-temporal-status/route.ts:41` | `docs/schema.sql:1158` | 実在・引数一致 |

### A-4. Routeから到達するhelper内DB前提

直接DB呼び出しがないRouteもimport/exportを再帰追跡した。追加で到達したDB前提は以下で、Storage以外はすべて正本に実在した。

| helper側オブジェクト/RPC | 場所 | 正本定義 | 結果 |
|---|---|---:|---|
| `user_github_tokens` | `lib/github-token-store.ts:12,29,48,62` | `docs/schema.sql:871` | 実在 |
| `github_oauth_states` | `lib/github-token-store.ts:70,80,95` | `docs/schema.sql:889` | 実在 |
| `messages`, `lore_embeddings` | `lib/lore/batchTrain.ts:80,98,148,177` | `docs/schema.sql:140,907` | 実在 |
| `lore_embeddings` | `lib/lore/dreaming.ts:135,165,193,280` | `docs/schema.sql:907` | 実在 |
| `mcp_tokens` | `lib/mcp-auth.ts:28,42` | `docs/schema.sql:852` | 実在 |
| `match_lore_embeddings` | `lib/lore/search.ts:65` | `docs/schema.sql:1052` | 実在・引数一致 |
| `match_lore_embeddings_v2` | `lib/lore/search.ts:98` | `docs/schema.sql:1070,1123` | 実在・該当overloadと引数一致 |
| `consolidate_dreaming_batch` | `lib/lore/dreaming.ts:223` | `docs/schema.sql:1324,1387` | 実在・該当overloadと引数一致 |
| `consolidate_dreaming_batch_multi` | `lib/lore/dreaming.ts:235` | `docs/schema.sql:1443` | 実在・引数一致 |
| `find_similar_lore_pairs_v2` | `lib/lore/dreaming.ts:257` | `docs/schema.sql:1258` | 実在・引数一致 |
| Storage `generated-images` | `lib/supabase/download-image.ts:8` ほか | 正本SQL定義なし | [A-03] |

直接DB呼び出しがない7 Routeは次のとおり。

- helper経由でDBを使う: `app/api/auth/github/callback/route.ts`、`app/api/auth/github/route.ts`、`app/api/auth/github/status/route.ts`、`app/api/lore/batch-train/route.ts`、`app/api/lore/dreaming-batch/route.ts`
- DB非依存: `app/api/fetch-github/route.ts`、`app/api/novel-check/route.ts`

### A-5. select/filter/write列の確認結果

- Route内の静的 `.select("...")`、`.eq()` 等のfilter列、insert/update/upsertの明示キーを全件抽出した。
- `LORE_MEMORY_SELECT` は `lib/lore/selects.ts` の19列、`CONSOLIDATION_SOURCE_SELECT` は `lib/lore/consolidation.ts` の列へ展開して確認した。
- `public_threads_view` は `docs/schema.sql:495-502` の出力列を個別に確認した。
- `*` / 引数なし `select()` は対象テーブルの全列取得であるため、列名不存在の判定対象外とした。
- **`app/api/**/route.ts` 内の不存在列は0件**。全リポジトリへ範囲を広げると [A-01] の1件を検出した。

## 指摘事項

### [A-01] 一括エクスポートが存在しない `profiles.user_id` を参照する
- 場所: `app/settings/page.tsx:289`, `docs/schema.sql:52`
- 事実: 一括エクスポートは `profiles` を `user_id` でfilterしている。

```tsx
supabase.from("drafts").select("*").eq("user_id", userId),
supabase.from("profiles").select("*").eq("user_id", userId),
supabase.from("likes").select("*").eq("user_id", userId),
```

正本の `profiles` はユーザー識別列が `id` であり、全列定義に `user_id` はない。

```sql
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  handle        text unique,
```

Promise結果は `data` だけを分割代入し `error` を確認しないため、このクエリ失敗は例外にならず `profiles ?? []` として空データがZIPへ渡る。
- 分類: 乖離
- 推奨対応: `profiles.id` との照合へ統一し、全エクスポートクエリの `error` も明示確認する案をレビューする。
- 優先度: 高

### [A-02] 未分類スレッドの「フォルダ横断検索」意図とRPCのNULL条件が一致しない
- 場所: `app/api/chat/route.ts:956`, `lib/lore/search.ts:98`, `docs/schema.sql:1111`
- 事実: Routeのコメントは `null` により未分類スレッドでフォルダ横断検索すると明記し、実際に `currentFolderName ?? null` を渡す。

```ts
// 併せて "" ではなく null を渡す形に統一した（RAG memory contextの currentFolderName ?? null と揃え、
// 未分類スレッドでもフォルダ横断検索されるようにする挙動変更）。
const [loreChunks, memoryResults] = await Promise.all([
```

```ts
? searchLoreV2ByEmbedding(supabase, embedding, {
    folderName: currentFolderName ?? null,
    userId,
```

一方、該当overloadのSQL条件は `f_folder_name` がNULLのとき `le.folder_name is null` の行だけを残し、非NULLフォルダの行を横断しない。

```sql
where le.user_id = f_user_id
  and (le.folder_name = f_folder_name or le.folder_name is null)
  and le.is_archived = false
```

- 分類: 乖離
- 推奨対応: NULL時の期待仕様を確定し、SQL条件またはRouteコメント・引数のどちらかを同じ仕様へ合わせる案をレビューする。
- 優先度: 高

### [A-03] `generated-images` Storageバケットとpolicyが正本に表現されていない
- 場所: `app/api/image-gen/route.ts:270`, `app/api/album/route.ts:56`, `app/api/chat/route.ts:1082`, `app/api/messages/[id]/route.ts:61`, `lib/supabase/download-image.ts:8`
- 事実: コードは `generated-images` バケットの存在を前提にupload/download/sign/removeを行う。

```ts
const { error: uploadError, data: uploadData } = await supabase.storage
  .from('generated-images')
  .upload(storagePath, buffer, { contentType: mimeType })
```

`rg -n 'generated-images|storage\.buckets|storage\.objects|insert into storage' docs` は0件で、`docs/schema.sql` と `docs/applied/` のいずれにもバケット作成・Storage policyがない。このためリポジトリだけでは環境再現性とアクセス制御を検証できない。
- 分類: 乖離
- 推奨対応: Storageバケット作成、公開/非公開属性、`storage.objects` policyを正本SQLまたは専用の正本文書へ明記する案をレビューする。
- 優先度: 高

### [B-01] 公開スレッドのRLSが `system_prompt` 等の非公開想定列を隠さない
- 場所: `docs/schema.sql:102`, `docs/schema.sql:131`
- 事実: `threads` には `system_prompt`、`allow_prompt_fork`、`metadata` 等が同じテーブル列として存在する。

```sql
system_prompt     text,
share_token       text unique,
is_public         boolean not null default false,
```

公開SELECT policyは `is_public = true` だけを条件に行全体を許可する。RLSは行制御であり、列を制限しない。正本にはanon/authenticatedからの直接table SELECTを列単位でrevokeする記述がなく、コメントでview利用を求めるだけである。

```sql
create policy "Public threads are readable by anyone"
  on threads for select
  using (is_public = true);
```

```sql
-- Public thread reads should use public_threads_view to avoid exposing private columns.
```

このため、少なくともauthenticatedロールはアプリの `public_threads_view` や `allow_prompt_fork` の分岐を介さず、公開行の全列を直接要求できるスキーマになっている。
- 分類: 乖離
- 推奨対応: 公開閲覧をviewだけに限定するtable権限、または列権限を正本で明示する案を最優先でレビューする。
- 優先度: 高

### [B-02] 2つの `SECURITY DEFINER` RPCが呼出者と `p_user_id` の一致を検証せず、EXECUTE制限もない
- 場所: `docs/schema.sql:1443`, `docs/schema.sql:1579`
- 事実: 両関数は呼び出し引数として `p_user_id` を受け取り、`SECURITY DEFINER` で実行する。

```sql
create or replace function consolidate_dreaming_batch_multi(
  p_user_id uuid, p_source_ids uuid[], p_merged_text text, p_embedding vector,
  p_memory_kind text, p_temporal_status text, p_folder_name text,
```

```sql
returns uuid
language plpgsql
security definer
```

```sql
create or replace function rollback_dreaming_batch_multi(
  p_user_id uuid, p_consolidated_id uuid
)
```

```sql
returns void
language plpgsql
security definer
```

関数本体には `auth.uid() = p_user_id` の検査がない。`rg -n -i 'revoke execute|grant execute' docs/schema.sql` でも両シグネチャに対するrevoke/grantは0件だった。PostgreSQLの新規関数は既定でPUBLICにEXECUTEが付くため、Routeが正しいuser IDを渡していても、直接RPC呼び出しに同じ制約はかからない。
- 分類: 乖離
- 推奨対応: `auth.uid()` の一致検証、固定 `search_path`、PUBLIC/anonのEXECUTE revokeと必要roleだけへのgrantを一体でレビューする。
- 優先度: 高

### [B-03] GitHub連携解除がDB削除エラーを無視して成功を返す
- 場所: `lib/github-token-store.ts:60`, `app/api/auth/github/route.ts:38`
- 事実: helperはservice roleでアクセストークン行をDELETEするが、Supabaseの `{ error }` を受け取らない。

```ts
export async function deleteGithubToken(userId: string): Promise<void> {
  const supabase = serviceRoleClient();
  await supabase.from("user_github_tokens").delete().eq("user_id", userId);
```

呼び出しRouteはそのまま `ok: true` を返す。

```ts
await deleteGithubToken(user.id);

return NextResponse.json({ ok: true });
```

DB側で削除が失敗してもHTTP成功となり、保存済みGitHubアクセストークンが残った状態を利用者が認識できない。
- 分類: 不統一
- 推奨対応: DELETE結果のerrorを例外化し、Routeが非2xxを返す案をレビューする。
- 優先度: 高

### [B-04] アカウント・スレッド・メッセージ削除経路にStorageオブジェクトの削除がない
- 場所: `docs/schema.sql:1041`, `app/settings/page.tsx:1109`, `app/api/image-gen/route.ts:267`, `app/api/threads/[id]/route.ts:35`, `app/api/messages/[id]/route.ts:25`
- 事実: 画像はユーザー/スレッド配下のStorageパスへ保存される。

```ts
const storagePath = `${userId}/${threadId}/${crypto.randomUUID()}.png`

const buffer = Buffer.from(imageData, 'base64')
```

アカウント削除RPCが行うのは `auth.users` のDELETEだけである。

```sql
as $$
begin
  delete from auth.users where id = auth.uid();
```

UIもこのRPC実行後にsign outするだけである。

```tsx
const { error } = await supabase.rpc('delete_current_user')
if (error) throw error
await supabase.auth.signOut()
```

`rg -n 'storage.*remove|\.remove\(' app lib` で確認したStorage削除は `app/api/messages/[id]/route.ts` の明示的 `delete_image` actionだけで、アカウント・スレッド・メッセージDELETEにはない。リポジトリ内の削除保証だけではStorageオブジェクトが対象外になる。
- 分類: 乖離
- 推奨対応: DB削除とStorage cleanupの責務、再試行、孤児オブジェクト回収を含む削除設計をレビューする。
- 優先度: 高

### [B-05] Provider APIキーをlocalStorageへ永続化する一方、CSPはReport-Onlyである
- 場所: `app/settings/page.tsx:229`, `next.config.js:51`
- 事実: Anthropic/Gemini/OpenAI/Ideogram/OpenRouterのキーを平文文字列としてlocalStorageへ保存する。

```tsx
if (claudeKey.trim()) {
  localStorage.setItem(LS_KEYS.claude, claudeKey.trim())
} else {
```

全パスに設定するCSPヘッダーは強制ではなく `Content-Security-Policy-Report-Only` である。

```js
{
  key: "Content-Security-Policy-Report-Only",
  value: cspReportOnly,
},
```

危険な動的HTML検索では `app/layout.tsx:30` の固定文字列scriptだけを確認し、現時点の具体的XSS sinkは検出しなかった。ただし、同一originでscript実行が成立した場合にキーを読める構成で、強制CSPによる防御はない。
- 分類: 情報のみ
- 推奨対応: BYOKキーの保持方式と強制CSP/noncesへの移行を、UXと脅威モデルを含めてレビューする。
- 優先度: 高

### [B-06] GitHub Tool Loopの本番コードにrepo/path/AI応答のDEBUGログが残る
- 場所: `lib/github.ts:254`, `lib/github-tool-loop.ts:335`
- 事実: GitHubディレクトリ取得時にrepo、path、refを無条件にconsoleへ出力する。

```ts
try {
  console.log("[DEBUG][github.ts listGithubDirectory] fetching", { repo, path, ref: options?.ref });
  const response = await fetchWithTimeout(url, {
```

Tool LoopはAI応答先頭200文字と選択ファイルパスも無条件に出力する。

```ts
const responseText = phaseOneResponse.text ?? "";
console.log("[DEBUG][Phase1] Claude response:", responseText.slice(0, 200));

```

```ts
console.log("[DEBUG][Phase2] pathsToRead", pathsToRead);
```

private repository名・構造・AI応答に含まれた内容がアプリログへ残る経路である。
- 分類: 情報のみ
- 推奨対応: DEBUGログを非本番条件へ限定し、repo/path/応答本文を既定で記録しない方針をレビューする。
- 優先度: 高

### [C-01] Lore再埋め込みが既存データを先に全削除し、DELETE/INSERTエラーも確認しない
- 場所: `app/api/lore/embed/route.ts:21`, `app/api/lore/embed/route.ts:39`
- 事実: 洗い替え開始時に同フォルダの既存行をDELETEするが、結果のerrorを確認しない。

```ts
// 同フォルダの既存レコードを全削除（洗い替え方式）
await supabase.from('lore_embeddings').delete()
  .eq('user_id', user.id).eq('folder_name', folderName);
```

各chunkのINSERTも結果を確認せず、直後に `count++` する。

```ts
await supabase.from('lore_embeddings').insert({
  user_id: user.id,
  folder_name: folderName,
```

Embedding APIが途中で失敗した場合は即500を返すため、先行DELETE後の部分投入状態が残る。DB書き込み失敗時も返却countは成功件数を表さない。
- 分類: 不統一
- 推奨対応: Embedding生成を破壊操作より前に完了し、DB error・原子性・ロールバック方法を含む洗い替え方式をレビューする。
- 優先度: 中

### [C-02] Registryは `gpt-5.5-pro` をArena対応とするが、Arenaだけ専用endpoint分岐がない
- 場所: `lib/modelRegistry.ts:77`, `app/api/arena/route.ts:67`, `app/api/chat/route.ts:376`
- 事実: model registryは `gpt-5.5-pro` のArena surfaceを有効にしている。

```ts
{ kind: "text", id: "gpt-5.5-pro", provider: "openai", label: "GPT-5.5 Pro", badge: "最上位", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "none" }, pricing: price(30.00, 180.00) },
```

ArenaのOpenAI呼び出しは全モデルをChat Completionsへ送る。

```ts
const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
```

同じrepoのchat Routeは、このモデルがChat Completions非対応としてResponses APIへ分岐する。

```ts
// gpt-5.5-pro は /v1/chat/completions 非対応 → Responses API 経由
if (modelId === "gpt-5.5-pro") {
  const input = msgs.map((m) => ({ role: m.role, content: m.content as string }));
```

- 分類: 不統一
- 推奨対応: Arena surfaceを無効にするか、Responses API対応を追加するかをmodel registryと同時にレビューする。
- 優先度: 中

### [C-03] 公開一覧のfork可否と公開プロフィールのfork数が固定値になる
- 場所: `app/api/explore/route.ts:206`, `app/explore/page.tsx:178`, `app/[handle]/page.tsx:71`
- 事実: Explore APIはDBの `allow_prompt_fork` 値を取得せず、常にtrueを返す。

```ts
created_at: thread.created_at,
updated_at: thread.updated_at,
allow_prompt_fork: true,
```

UIの「システムプロンプトは非公開」表示条件はfalse時なので、このAPI経由では成立しない。

```tsx
{!thread.allow_prompt_fork && (
  <span
    title="システムプロンプトは非公開です"
```

公開プロフィールは全threadの `fork_count` を0で初期化し、その後likesだけを再集計するため、`totalForks` は常に0になる。

```tsx
...thread,
likes_count: 0,
fork_count: 0,
```

- 分類: ハードコード
- 推奨対応: 公開view/APIで公開可能な実値を取得するか、表示自体を外すかをレビューする。
- 優先度: 中

### [C-04] 複数のDELETE RouteがSupabaseエラーを確認せず成功を返す
- 場所: `app/api/threads/[id]/route.ts:35`, `app/api/threads/[id]/drafts/route.ts:67`, `app/api/threads/[id]/notes/route.ts:71`, `app/api/threads/[id]/message-notes/route.ts:51`
- 事実: drafts、thread notes、message notesはDELETE結果を受け取らず、直後にsuccessを返す。

```ts
const { id } = await req.json();
await supabase.from("drafts").delete().eq("id", id).eq("user_id", user.id);
return NextResponse.json({ success: true });
```

```ts
const { id } = await req.json();
await supabase.from("thread_notes").delete().eq("id", id).eq("user_id", user.id);
return NextResponse.json({ success: true });
```

```ts
const { id } = await req.json();
await supabase.from("message_notes").delete().eq("id", id).eq("user_id", user.id);
return NextResponse.json({ success: true });
```

thread DELETEは `deleteError` を取得するが、fork count再計算の条件にだけ使い、最後はエラー有無にかかわらずsuccessを返す。同型の未確認書き込みはArenaのmessage/thread INSERTにもある。
- 分類: 不統一
- 推奨対応: mutation共通のerror処理方針を定め、永続化失敗時に成功レスポンスを返さない案をレビューする。
- 優先度: 中

### [D-01] `.env.local.example` が実装の必須/任意環境変数と一致しない
- 場所: `.env.local.example:12`, `.env.local.example:19`, `lib/mcp-auth.ts:7`, `lib/github-token-crypto.ts:4`, `app/api/chat/route.ts:921`
- 事実: サンプルはSupabaseの必須項目として公開URL/anon keyだけを列挙する。

```dotenv
# Supabase（必須）
# Supabaseダッシュボード → Project Settings → API から取得
# ------------------------------------------------------------
```

一方、MCP/share/explore/GitHub token helper等のservice-role clientは `SUPABASE_SERVICE_ROLE_KEY` を必須参照し、GitHub連携暗号化は64桁の `GITHUB_TOKEN_ENCRYPTION_KEY` を必須とする。

```ts
return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
```

```ts
const hex = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
if (!hex || hex.length !== 64) {
  throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY が未設定または不正です");
```

実装から抽出したアプリ固有変数のうち、サンプルにないものは `SUPABASE_SERVICE_ROLE_KEY`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`GITHUB_REDIRECT_URI`、`GITHUB_TOKEN_ENCRYPTION_KEY`、`NEXT_PUBLIC_SITE_URL`、`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`。逆にサンプルはAIキーを `.env.local` に置けると説明するが、chat Routeはrequest headerからだけ読む。

```ts
const anthropicKey = req.headers.get("x-anthropic-api-key");
const geminiKey    = req.headers.get("x-gemini-api-key");
const openaiKey    = req.headers.get("x-openai-api-key");
```

- 分類: 乖離
- 推奨対応: 必須・機能別必須・任意・platform提供を区別した完全な環境変数一覧へ更新し、AIキーのserver env対応有無を明示する。
- 優先度: 高

### [D-02] Storageパス所有権guardが重複し、判定条件が一致しない
- 場所: `app/api/chat/route.ts:71`, `lib/storage-path-guard.ts:15`
- 事実: chat Routeは共通helperと同名のローカル関数を持ち、TODOも共通helperへの移管を示している。

```ts
// TODO: T-03/T-09で lib/storage-path-guard.ts に移管する
function isOwnedStoragePath(path: unknown, userId: string): path is string {
  return (
```

chat版はbackslashを拒否する。

```ts
!path.startsWith("/") &&
!path.includes("..") &&
!path.includes("\\")
```

共通helperは先頭slashと `..` は拒否するが、backslash条件がない。

```ts
if (path.startsWith('/')) return false
if (path.includes('..')) return false
return path.startsWith(`${userId}/`)
```

- 分類: 重複
- 推奨対応: 期待する正規化・区切り文字仕様を決め、全Storage操作を単一helperへ統一する案をレビューする。
- 優先度: 中

### [D-03] `lib/mock-db.ts` と `lib/supabase-db.ts` に参照元がない
- 場所: `lib/mock-db.ts:1`, `lib/supabase-db.ts:1`
- 事実: `lib/mock-db.ts` はプロセス内可変配列を持つ旧モック実装である。

```ts
import { Thread, Message } from "@/types";

// In-memory store — swap this module for Supabase calls when ready.
```

`lib/supabase-db.ts` は別のCRUD helper一式を定義する。

```ts
import { SupabaseClient } from "@supabase/supabase-js";
import { Thread, Message, ThreadNote, MessageNote, Draft } from "@/types";

```

`rg -n 'mock-db|supabase-db' app components lib scripts` と全ローカルimport/exportの再帰追跡で、両ファイル自身以外のimport元は0件だった。Next.jsのroute/page規約上のentry fileでもない。
- 分類: デッドコード
- 推奨対応: 将来用途を明記して隔離するか、履歴で十分なら削除するかをレビューする。
- 優先度: 低

### [D-04] `CLAUDE.md` のモデル台帳・ファイル存在説明が現行コードとずれている
- 場所: `CLAUDE.md:73`, `CLAUDE.md:218`, `app/api/chat/route.ts:12`, `app/api/arena/route.ts:4`
- 事実: 文書はchat/arenaにモデルID配列が重複すると説明する。

```md
**モデルID定義は `types/index.ts` が正**（`ClaudeModel` / `GeminiModel` / `OpenAIModel` / `ImageGenModel` / `Provider`型）。`app/api/chat/route.ts` と `app/api/arena/route.ts` に同じ配列が重複定義されているため、新モデル追加時は必ず両方更新すること。
```

現行の両Routeは `lib/modelRegistry.ts` の `isAllowedModel` / `getDefaultModel` をimportしており、文書記載の配列はない。

```ts
import { isAllowedModel, getDefaultModel, supportsExtendedThinking } from "@/lib/modelRegistry";
```

```ts
import { isAllowedModel, getDefaultModel } from "@/lib/modelRegistry";
```

また文書は `lib/genres.ts` と `lib/exportUtils.ts` が見当たらないとするが、両ファイルは追跡済みで、`exportUtils.ts` は `components/ChatPanel.tsx:11` と `app/settings/page.tsx:6` から利用されている。

```md
⚠️ 旧CLAUDE.mdに記載のあった `lib/genres.ts`（ジャンルマスタ）・`lib/exportUtils.ts`（エクスポートロジック）は最新のファイル構成一覧に見当たらない。
```

- 分類: 不統一
- 推奨対応: model registry一元化後の構造と実在ファイルに合わせてプロジェクト説明を更新する。
- 優先度: 低

## 問題なしと判断した確認項目

### DBオブジェクトの名前・直接select列

- 確認方法: 前掲の `.from()` / `.rpc()` / `.select()` の `rg` とAST抽出、`docs/schema.sql` のCREATE定義・列定義との突合。
- 確認ファイル: 付録1の全51 Route、`lib/lore/search.ts`、`lib/lore/dreaming.ts`、`lib/lore/batchTrain.ts`、`lib/github-token-store.ts`、`lib/mcp-auth.ts`、`lib/lore/selects.ts`、`lib/lore/consolidation.ts`、`docs/schema.sql`。
- 結論: Routeから到達するDBテーブル/ビュー/RPC名に不存在はない。直接Routeの静的select/filter/write列にも不存在はない。意味・権限上の乖離は [A-02]、[B-01]、[B-02] に分離して指摘した。

### Git追跡ファイルへの実シークレット混入

- 確認方法:

```powershell
git grep -n -I -E '(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|SUPABASE_SERVICE_ROLE_KEY\s*=|GITHUB_CLIENT_SECRET\s*=|ANTHROPIC_API_KEY\s*=|OPENAI_API_KEY\s*=)' -- ':!package-lock.json'
```

- 確認範囲: `git ls-files` のテキストファイル。ローカルの `.env.local` は追跡外かつ内容をレポートへ出していない。
- 結果: `.env.local.example:26,34` の空プレースホルダーだけ。実値らしいtoken/keyは0件。

### 動的HTML・コード実行・外部リンク

- 確認方法:

```powershell
rg -n 'dangerouslySetInnerHTML|eval\(|new Function|innerHTML|target="_blank"|window\.open\(' app components lib middleware.ts next.config.js
```

- 確認ファイル: `app/layout.tsx`、`app/explore/page.tsx`、`app/arena/[token]/ArenaViewPage.tsx`、`app/arena/page.tsx`、`app/legal/page.tsx`、`app/privacy/page.tsx`。
- 結果: `dangerouslySetInnerHTML` は `app/layout.tsx:30` の固定フォント初期化scriptのみ。`target="_blank"` の全箇所に `rel="noopener noreferrer"` があった。`eval` / `new Function` / user由来 `innerHTML` は0件。

### API認証入口

- 確認方法: 全51 Routeを `auth.getUser()` / `authenticateMcpToken()` で抽出し、該当しないRouteと `middleware.ts` matcherを目視確認。
- 直接認証がないファイル: `app/api/auth/github/callback/route.ts`（one-time state検証）、`app/api/share/[token]/route.ts`（公開share token）、`app/api/fetch-github/route.ts`（middlewareの保護対象）。
- middleware除外: MCP（Bearer認証）、share（公開token）、reports（匿名通報を仕様化）、GitHub callback（OAuth state）を各Route/Helperと照合した。
- 結論: 認証入口の単純な欠落は検出しなかった。RLS/RPC権限の問題は [B-01]、[B-02] に記載した。

### モデル台帳・料金ロジック

- 確認方法: `types/index.ts`、`lib/modelRegistry.ts`、`lib/pricing.ts`、chat/arena/image UIとRouteを検索し、既存characterization testも実行。
- 結果: `scripts/modelRegistry.test.cjs` と `scripts/pricing.test.cjs` は成功。Arena endpointの実装差だけを [C-02] に記載した。

## 既存検証コマンドの実行結果

監査開始時と各検証後に `git status --short` を確認した。型検査で更新された `tsconfig.tsbuildinfo` は、指示どおり次のコマンドで復元し、復元直後のstatusがクリーンであることを確認した。

```powershell
git restore --worktree -- tsconfig.tsbuildinfo
```

### テスト

| コマンド | 終了 | 結果 |
|---|---:|---|
| `node scripts/ai-context-blocks.test.cjs` | 0 | `ai-context-blocks tests passed` |
| `node scripts/branchTree.test.cjs` | 0 | `branchTree tests passed` |
| `node scripts/loadModel.test.cjs` | 0 | `loadModel tests passed` |
| `node scripts/lore-openai.test.cjs` | 0 | 11件成功 |
| `node scripts/modelRegistry.test.cjs` | 0 | `modelRegistry tests passed` |
| `node scripts/pricing.test.cjs` | 0 | `pricing tests passed` |
| `node scripts/lore.test.cjs` | 1 | `Cannot find module 'next/server'`。最初のrequire先は `app/api/lore/consolidate/candidates/route.ts` |

### 型検査・build

| コマンド | 終了 | 結果 |
|---|---:|---|
| `npx tsc --noEmit` | 1 | `next/server` / `next` / Next metadata型を解決できず失敗。更新された `tsconfig.tsbuildinfo` は復元済み |
| `npm run build` | 1 | `'next' is not recognized as an internal or external command` |

読み取り確認では `node_modules/next` ディレクトリ自体はあるが、`node_modules/next/package.json` と `node_modules/next/server.js` はなく、`node_modules/.bin/next*` も0件だった。よって上記3失敗は現在の依存配置が不完全なことと一致する。読み取り専用制約に従い、`npm install` / `npm ci` は実行していない。

したがって、受け入れ条件の「現状が全緑」はこの作業環境では満たせなかった。6テスト成功、1テスト・型検査・build失敗をそのまま記録する。コード・テスト・設定の変更は行っていない。

## 付録1: 確認した全 `app/api/**/route.ts`（51件）

```text
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
```

## 最終 `git status --short`

レポート作成後の最終確認結果:

```text
?? docs/audit/full-audit-2026-07-13.md
```

