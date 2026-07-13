# KabeHub リポジトリ全体 静的監査レポート — 項目C

- 監査日: 2026-07-13
- 監査対象: リポジトリ全体（重点対象は lib/ 配下のexport、およびリポジトリ内の未使用ローカル宣言）
- 監査方式: 読み取り専用の構文解析・grep・型検査・build・既存テスト
- 非対象: DB接続、SQL実行、node_modules/・.next/の内容監査

## サマリ

| 監査区分 | 指摘件数 | 指摘対象のシンボル／binding数 | 高 | 中 | 低 |
|---|---:|---:|---:|---:|---:|
| 未参照export | 27 | 27 | 0 | 0 | 27 |
| 未使用ローカル宣言・import binding | 10 | 13 | 0 | 0 | 10 |
| **合計** | **37** | **40** | **0** | **0** | **37** |

分類は全件「デッドコード」。DB乖離・セキュリティ影響・実行時障害を示す事実は確認していないため、優先度は全件「低」とした。

## 開始条件の確認

作業開始時に次を確認した。

~~~powershell
git status --short
Test-Path -LiteralPath 'docs/audit/full-audit-c-2026-07-13.md'
Get-Item -LiteralPath 'node_modules/next/package.json'
~~~

- git status --short: 出力なし（作業ツリーはクリーン）
- 対象レポート: 未存在
- node_modules/next/package.json: 存在、9,992 bytes

以上から、開始停止条件には該当しなかった。

## 監査方法と網羅性

### export棚卸し

対象となった lib/ 配下の全34ファイルは次のとおり。

~~~text
lib/ai-context-blocks.ts
lib/branchTree.ts
lib/branching.ts
lib/exportUtils.ts
lib/context-window.ts
lib/genres.ts
lib/supabase.ts
lib/supabase-db.ts
lib/supabase/server.ts
lib/supabase/route-handler.ts
lib/supabase/download-image.ts
lib/supabase/client.ts
lib/stringUtils.ts
lib/storage-path-guard.ts
lib/rate-limit.ts
lib/pricing.ts
lib/modelRegistry.ts
lib/mock-db.ts
lib/mcp-auth.ts
lib/loreMemorySelect.ts
lib/lore/types.ts
lib/lore/selects.ts
lib/lore/search.ts
lib/lore/openai.ts
lib/lore/mappers.ts
lib/lore/index.ts
lib/lore/dreaming.ts
lib/lore/consolidation.ts
lib/lore/batchTrain.ts
lib/internalModels.ts
lib/github.ts
lib/github-tool-loop.ts
lib/github-token-store.ts
lib/github-token-crypto.ts
~~~

TypeScript Compiler APIのmodule symbolからexport名・宣言ファイル・宣言行を取得した。物理宣言は179件、lib/lore/index.ts の export * と明示的re-exportを各module surfaceで数えた行数は188件、名前の重複を除いた検索語は167件だった。

各検索語にはPowerShellのループから次のgrepを実行し、node_modules/・.next/・作成予定レポートを除くTypeScript/JavaScript/CommonJSソースを検索した。

~~~powershell
rg -n --no-heading --color never -w -g '!node_modules/**' -g '!.next/**' -g '!docs/audit/**' -g '*.ts' -g '*.tsx' -g '*.js' -g '*.cjs' -g '*.mjs' -- <EXPORT_NAME> .
~~~

同名だが別シンボルの宣言を参照と誤認しないため、TypeScript Language Serviceの findReferences で宣言ごとに照合した。scripts/*.test.cjs は上記grepの対象に含め、requireまたはテスト用export抽出元のファイルまで確認した。定義行だけ、または同名の別定義だけが見つかった27件を指摘とした。残る152物理宣言には少なくとも1件の非定義参照があった。

### ローカル宣言の検査

次を実行し、TS6133・TS6196・TS6198を確認した。

~~~powershell
npx tsc --noEmit --noUnusedLocals --incremental false --pretty false
~~~

さらに allowJs: true、checkJs: true、noUnusedLocals: true のCompiler API診断を、source glob 137件から next-env.d.ts を除いた全136実装ソースに対して実行した。両者とも同じ21診断を返した。うち13 bindingを本レポートの指摘とし、types/index.ts:13、:14、:16、:17、:19、:20、:22、:23 の8型aliasは、types/index.ts:8-11に目的が明記された AssertNever<T extends never> による型整合性検査であるためデッドコードから除外した。scripts/*.test.cjs から追加の未使用ローカル診断は出なかった。

各候補は次の形式のgrepでも実ファイルを再確認した。

~~~powershell
rg -n --no-heading --color never -w -- <LOCAL_NAME> <FILE_PATH>
~~~

## 指摘

### [C-001] ExportFormat が定義以外から参照されていない

- 場所: lib/exportUtils.ts:43
- 事実: ExportFormat のsource grep結果はこの宣言1行だけで、symbol参照も0件だった。

  ~~~ts
  export type ExportFormat = "txt" | "md" | "md2" | "csv";
  ~~~
- 分類: デッドコード
- 推奨対応: 公開型として残す予定を確認し、予定がなければexport宣言の削除を提案する。
- 優先度: 低

### [C-002] getParentGenre が定義以外から参照されていない

- 場所: lib/genres.ts:126
- 事実: getParentGenre のsource grep結果はこの宣言1行だけで、symbol参照も0件だった。

  ~~~ts
  export function getParentGenre(genreId: GenreId) {
  ~~~
- 分類: デッドコード
- 推奨対応: 利用予定を確認し、予定がなければ関数の削除を提案する。
- 優先度: 低

### [C-003] getGenreLabel が定義以外から参照されていない

- 場所: lib/genres.ts:133
- 事実: getGenreLabel のsource grep結果はこの宣言1行だけで、symbol参照も0件だった。

  ~~~ts
  export function getGenreLabel(genreId: GenreId): string {
  ~~~
- 分類: デッドコード
- 推奨対応: 利用予定を確認し、予定がなければ関数の削除を提案する。
- 優先度: 低

### [C-004] LoreSearchResult が定義およびbarrel公開以外から参照されていない

- 場所: lib/lore/search.ts:35
- 事実: LoreSearchResult の名前付きsource grep結果はこの宣言1行だけだった。lib/lore/index.ts:1 の export * で公開surfaceにも載るが、symbol参照は0件だった。

  ~~~ts
  export type LoreSearchResult = LoreSearchV2Result;
  ~~~
- 分類: デッドコード
- 推奨対応: 互換aliasとして必要か確認し、不要なら型aliasの削除を提案する。
- 優先度: 低

### [C-005] searchLore が定義およびbarrel公開以外から参照されていない

- 場所: lib/lore/search.ts:136
- 事実: source-code globの searchLore grep結果はこの宣言だけだった。lib/lore/index.ts:1 の export * で公開surfaceにも載るが、symbol参照は0件だった。

  ~~~ts
  export async function searchLore(
  ~~~
- 分類: デッドコード
- 推奨対応: 旧検索entry pointの互換性要否を確認し、不要なら削除を提案する。
- 優先度: 低

### [C-006] mock-db の getThreads が参照されていない

- 場所: lib/mock-db.ts:61
- 事実: mock-db というmodule pathのsource grepは0件で、getThreads のsymbol参照も0件だった。同名の lib/supabase-db.ts:30 は別宣言である。

  ~~~ts
  export function getThreads(): Thread[] {
  ~~~
- 分類: デッドコード
- 推奨対応: mock DB自体の利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-007] mock-db の getThread が参照されていない

- 場所: lib/mock-db.ts:67
- 事実: mock-db というmodule pathのsource grepは0件で、getThread のsymbol参照も0件だった。同名の lib/supabase-db.ts:41 は別宣言である。

  ~~~ts
  export function getThread(id: string): Thread | undefined {
  ~~~
- 分類: デッドコード
- 推奨対応: mock DB自体の利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-008] mock-db の createThread が参照されていない

- 場所: lib/mock-db.ts:71
- 事実: mock-db というmodule pathのsource grepは0件で、createThread のsymbol参照も0件だった。同名の lib/supabase-db.ts:51 は別宣言である。

  ~~~ts
  export function createThread(id: string, firstMessage: string): Thread {
  ~~~
- 分類: デッドコード
- 推奨対応: mock DB自体の利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-009] mock-db の deleteThread が参照されていない

- 場所: lib/mock-db.ts:82
- 事実: mock-db というmodule pathのsource grepは0件で、deleteThread のsymbol参照も0件だった。同名の lib/supabase-db.ts:67 は別宣言である。

  ~~~ts
  export function deleteThread(id: string): void {
  ~~~
- 分類: デッドコード
- 推奨対応: mock DB自体の利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-010] mock-db の getMessages が参照されていない

- 場所: lib/mock-db.ts:88
- 事実: mock-db というmodule pathのsource grepは0件で、getMessages のsymbol参照も0件だった。同名の lib/supabase-db.ts:73 は別宣言である。

  ~~~ts
  export function getMessages(threadId: string): Message[] {
  ~~~
- 分類: デッドコード
- 推奨対応: mock DB自体の利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-011] mock-db の addMessage が参照されていない

- 場所: lib/mock-db.ts:94
- 事実: mock-db というmodule pathのsource grepは0件で、addMessage のsymbol参照も0件だった。同名の lib/supabase-db.ts:83 は別宣言である。

  ~~~ts
  export function addMessage(message: Message): Message {
  ~~~
- 分類: デッドコード
- 推奨対応: mock DB自体の利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-012] supabase-db の getThreads が参照されていない

- 場所: lib/supabase-db.ts:30
- 事実: supabase-db というmodule pathのsource grepは0件で、getThreads のsymbol参照も0件だった。同名の lib/mock-db.ts:61 は別宣言である。

  ~~~ts
  export async function getThreads(supabase: AppSupabaseClient, userId: string): Promise<Thread[]> {
  ~~~
- 分類: デッドコード
- 推奨対応: DB helper moduleの利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-013] supabase-db の getThread が参照されていない

- 場所: lib/supabase-db.ts:41
- 事実: supabase-db というmodule pathのsource grepは0件で、getThread のsymbol参照も0件だった。同名の lib/mock-db.ts:67 は別宣言である。

  ~~~ts
  export async function getThread(supabase: AppSupabaseClient, id: string): Promise<Thread | null> {
  ~~~
- 分類: デッドコード
- 推奨対応: DB helper moduleの利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-014] supabase-db の createThread が参照されていない

- 場所: lib/supabase-db.ts:51
- 事実: supabase-db というmodule pathのsource grepは0件で、createThread のsymbol参照も0件だった。同名の lib/mock-db.ts:71 は別宣言である。

  ~~~ts
  export async function createThread(
  ~~~
- 分類: デッドコード
- 推奨対応: DB helper moduleの利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-015] supabase-db の deleteThread が参照されていない

- 場所: lib/supabase-db.ts:67
- 事実: supabase-db というmodule pathのsource grepは0件で、deleteThread のsymbol参照も0件だった。同名の lib/mock-db.ts:82 は別宣言である。

  ~~~ts
  export async function deleteThread(supabase: AppSupabaseClient, id: string): Promise<void> {
  ~~~
- 分類: デッドコード
- 推奨対応: DB helper moduleの利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-016] supabase-db の getMessages が参照されていない

- 場所: lib/supabase-db.ts:73
- 事実: supabase-db というmodule pathのsource grepは0件で、getMessages のsymbol参照も0件だった。同名の lib/mock-db.ts:88 は別宣言である。

  ~~~ts
  export async function getMessages(supabase: AppSupabaseClient, threadId: string): Promise<Message[]> {
  ~~~
- 分類: デッドコード
- 推奨対応: DB helper moduleの利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-017] supabase-db の addMessage が参照されていない

- 場所: lib/supabase-db.ts:83
- 事実: supabase-db というmodule pathのsource grepは0件で、addMessage のsymbol参照も0件だった。同名の lib/mock-db.ts:94 は別宣言である。

  ~~~ts
  export async function addMessage(
  ~~~
- 分類: デッドコード
- 推奨対応: DB helper moduleの利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-018] supabase-db の getNotes が参照されていない

- 場所: lib/supabase-db.ts:99
- 事実: getNotes のsource grep結果はこの宣言1行だけで、symbol参照も0件だった。supabase-db というmodule pathのsource grepも0件だった。

  ~~~ts
  export async function getNotes(supabase: AppSupabaseClient, threadId: string): Promise<ThreadNote[]> {
  ~~~
- 分類: デッドコード
- 推奨対応: DB helper moduleの利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-019] supabase-db の addNote が参照されていない

- 場所: lib/supabase-db.ts:109
- 事実: addNote のsource grep結果はこの宣言だけで、symbol参照も0件だった。supabase-db というmodule pathのsource grepも0件だった。

  ~~~ts
  export async function addNote(
  ~~~
- 分類: デッドコード
- 推奨対応: DB helper moduleの利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-020] supabase-db の updateNote が参照されていない

- 場所: lib/supabase-db.ts:124
- 事実: updateNote のsource grep結果はこの宣言だけで、symbol参照も0件だった。supabase-db というmodule pathのsource grepも0件だった。

  ~~~ts
  export async function updateNote(
  ~~~
- 分類: デッドコード
- 推奨対応: DB helper moduleの利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-021] supabase-db の deleteNote が参照されていない

- 場所: lib/supabase-db.ts:139
- 事実: deleteNote のsource grep結果はこの宣言1行だけで、symbol参照も0件だった。supabase-db というmodule pathのsource grepも0件だった。

  ~~~ts
  export async function deleteNote(supabase: AppSupabaseClient, id: string): Promise<void> {
  ~~~
- 分類: デッドコード
- 推奨対応: DB helper moduleの利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-022] supabase-db の getMessageNotes が参照されていない

- 場所: lib/supabase-db.ts:145
- 事実: getMessageNotes のsource grep結果はこの宣言1行だけで、symbol参照も0件だった。supabase-db というmodule pathのsource grepも0件だった。

  ~~~ts
  export async function getMessageNotes(supabase: AppSupabaseClient, threadId: string): Promise<MessageNote[]> {
  ~~~
- 分類: デッドコード
- 推奨対応: DB helper moduleの利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-023] supabase-db の addMessageNote が参照されていない

- 場所: lib/supabase-db.ts:155
- 事実: addMessageNote のsource grep結果はこの宣言だけで、symbol参照も0件だった。supabase-db というmodule pathのsource grepも0件だった。

  ~~~ts
  export async function addMessageNote(
  ~~~
- 分類: デッドコード
- 推奨対応: DB helper moduleの利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-024] supabase-db の deleteMessageNote が参照されていない

- 場所: lib/supabase-db.ts:171
- 事実: deleteMessageNote のsource grep結果はこの宣言1行だけで、symbol参照も0件だった。supabase-db というmodule pathのsource grepも0件だった。

  ~~~ts
  export async function deleteMessageNote(supabase: AppSupabaseClient, id: string): Promise<void> {
  ~~~
- 分類: デッドコード
- 推奨対応: DB helper moduleの利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-025] supabase-db の getDrafts が参照されていない

- 場所: lib/supabase-db.ts:177
- 事実: getDrafts のsource grep結果はこの宣言1行だけで、symbol参照も0件だった。supabase-db というmodule pathのsource grepも0件だった。

  ~~~ts
  export async function getDrafts(supabase: AppSupabaseClient, threadId: string): Promise<Draft[]> {
  ~~~
- 分類: デッドコード
- 推奨対応: DB helper moduleの利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-026] supabase-db の addDraft が参照されていない

- 場所: lib/supabase-db.ts:187
- 事実: addDraft のsource grep結果はこの宣言だけで、symbol参照も0件だった。supabase-db というmodule pathのsource grepも0件だった。

  ~~~ts
  export async function addDraft(
  ~~~
- 分類: デッドコード
- 推奨対応: DB helper moduleの利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-027] supabase-db の deleteDraft が参照されていない

- 場所: lib/supabase-db.ts:202
- 事実: deleteDraft のsource grep結果はこの宣言1行だけで、symbol参照も0件だった。supabase-db というmodule pathのsource grepも0件だった。

  ~~~ts
  export async function deleteDraft(supabase: AppSupabaseClient, id: string): Promise<void> {
  ~~~
- 分類: デッドコード
- 推奨対応: DB helper moduleの利用予定を確認し、不要なら関数またはmoduleの整理を提案する。
- 優先度: 低

### [C-028] AlbumPage の page state値が読まれていない

- 場所: app/album/page.tsx:262
- 事実: noUnusedLocalsは page にTS6133を出した。setPage は app/album/page.tsx:298 で呼ばれるが、page binding自体を読むsymbol参照はなかった。

  ~~~tsx
  const [page, setPage] = useState(0);
  ~~~
- 分類: デッドコード
- 推奨対応: setterだけが必要なら配列分割の未使用要素を省略することを提案する。
- 優先度: 低

### [C-029] ContentBlock 型が参照されていない

- 場所: app/api/chat/route.ts:20
- 事実: noUnusedLocalsは ContentBlock にTS6196を出し、名前のgrep結果もこの宣言1行だけだった。

  ~~~ts
  type ContentBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } } | ImageBlock;
  ~~~
- 分類: デッドコード
- 推奨対応: 今後の利用予定を確認し、不要なら型aliasの削除を提案する。
- 優先度: 低

### [C-030] Provider のtype importが使用されていない

- 場所: app/settings/page.tsx:7
- 事実: noUnusedLocalsは Provider bindingにTS6133を出し、このファイル内のgrep結果はimport行だけだった。

  ~~~tsx
  import { MODEL_CONFIG, loadModel, saveModel, type Provider, type ModelId } from '@/components/ChatInput'
  ~~~
- 分類: デッドコード
- 推奨対応: import specifierから未使用の Provider を外すことを提案する。
- 優先度: 低

### [C-031] getOrderNo のimport bindingが使用されていない

- 場所: components/ChatPanel.tsx:21
- 事実: noUnusedLocalsは getOrderNo bindingにTS6133を出し、このファイル内のgrep結果はimport行だけだった。lib/branching.ts 内部では別途利用されているため、関数本体ではなくこのimportだけが未使用である。

  ~~~tsx
    getAnchorKey,
    getOrderNo,
    resolveBranchBlockAnchor,
  ~~~
- 分類: デッドコード
- 推奨対応: ChatPanelのimport specifierから getOrderNo を外すことを提案する。
- 優先度: 低

### [C-032] sharedAt state値が読まれていない

- 場所: components/ChatPanel.tsx:181
- 事実: noUnusedLocalsは sharedAt にTS6133を出した。setSharedAt は components/ChatPanel.tsx:407、:504で呼ばれるが、sharedAt binding自体を読むsymbol参照はなかった。

  ~~~tsx
  const [sharedAt, setSharedAt] = useState<string | null>(null);  // ✅ v76
  ~~~
- 分類: デッドコード
- 推奨対応: state値が不要なら保持方法を見直し、少なくとも未使用bindingを除くことを提案する。
- 優先度: 低

### [C-033] hasAnyApiKey が参照されていない

- 場所: components/ChatPanel.tsx:327
- 事実: noUnusedLocalsは hasAnyApiKey にTS6133を出し、名前のgrep結果もこの宣言1行だけだった。

  ~~~tsx
  const hasAnyApiKey = !!(apiKeyDrafts.anthropic || apiKeyDrafts.gemini || apiKeyDrafts.openai);
  ~~~
- 分類: デッドコード
- 推奨対応: UI条件として使う予定がなければ定数の削除を提案する。
- 優先度: 低

### [C-034] useMemo結果から分割した3 bindingが使用されていない

- 場所: components/ChatPanel.tsx:947
- 事実: noUnusedLocalsは外側の activeAnchorByInactiveRootKeyDirect、childGroupKeysByParentRootId、parentAnchorByInactiveRootKeyDirect にそれぞれTS6133を出した。同名のuseMemo内部ローカルは別symbolであり、外側bindingの参照にはならない。

  ~~~tsx
      activeAnchorByInactiveRootKeyDirect,
      childGroupKeysByParentRootId,
      parentAnchorByInactiveRootKeyDirect,
  ~~~
- 分類: デッドコード
- 推奨対応: useMemoの返却形または外側の分割代入から未使用3項目を外すことを提案する。
- 優先度: 低

### [C-035] useMemo結果から分割した2 bindingが使用されていない

- 場所: components/ChatPanel.tsx:950
- 事実: noUnusedLocalsは外側の activeAnchorByInactiveRootKey と branchGroupsByAnchor にそれぞれTS6133を出した。同名のuseMemo内部ローカルは別symbolであり、外側bindingの参照にはならない。

  ~~~tsx
      activeAnchorByInactiveRootKey,
      branchGroupsByAnchor,
  ~~~
- 分類: デッドコード
- 推奨対応: useMemoの返却形または外側の分割代入から未使用2項目を外すことを提案する。
- 優先度: 低

### [C-036] callAnthropicMessages が参照されていない

- 場所: lib/github-tool-loop.ts:209
- 事実: noUnusedLocalsは callAnthropicMessages にTS6133を出し、リポジトリ全体の名前grep結果もこの定義行だけだった。

  ~~~ts
  async function callAnthropicMessages(
    params: GithubToolLoopParams,
    messages: AnthropicToolMessage[],
  ~~~
- 分類: デッドコード
- 推奨対応: 旧Anthropic tool loop経路の利用予定を確認し、不要なら関数の削除を提案する。
- 優先度: 低

### [C-037] getToolUseBlocks が参照されていない

- 場所: lib/github-tool-loop.ts:288
- 事実: noUnusedLocalsは getToolUseBlocks にTS6133を出し、リポジトリ全体の名前grep結果もこの定義行だけだった。

  ~~~ts
  function getToolUseBlocks(content: AnthropicContentBlock[] | undefined): Extract<AnthropicContentBlock, { type: "tool_use" }>[] {
    if (!Array.isArray(content)) {
      return [];
  ~~~
- 分類: デッドコード
- 推奨対応: 旧tool_use抽出経路の利用予定を確認し、不要なら関数の削除を提案する。
- 優先度: 低

## 問題なしとした範囲・確認根拠

### 指摘外のexport

179物理export宣言のうち、上記27件を除く152件には定義以外の参照があった。grepだけで同名シンボルを混同しないよう、宣言単位の findReferences とimport元を併用した。

scripts/*.test.cjs だけがmodule外の直接利用元だったexportは次の10件である。これらは未参照には数えなかった。いずれも定義module内部では実処理から参照されている。

| export | 定義 | テスト専用のmodule外参照 |
|---|---|---|
| SYNTHETIC_ROOT_ID | lib/branchTree.ts:8 | scripts/branchTree.test.cjs:36 |
| buildDisplayParentIdMap | lib/branchTree.ts:86 | scripts/branchTree.test.cjs:37 |
| buildChildrenOf | lib/branchTree.ts:146 | scripts/branchTree.test.cjs:38 |
| MODEL_REGISTRY | lib/modelRegistry.ts:55 | scripts/modelRegistry.test.cjs:96 |
| PROVIDER_CONFIG | lib/modelRegistry.ts:101 | scripts/modelRegistry.test.cjs:102 |
| buildGreedyChainClusters | lib/lore/dreaming.ts:35 | scripts/lore.test.cjs:129 |
| hasSameFolderNameAndMemoryKind | lib/lore/dreaming.ts:76 | scripts/lore.test.cjs:402 |
| buildUserPrompt | lib/lore/dreaming.ts:83 | scripts/lore.test.cjs:194 |
| isJsonStringLike | lib/lore/dreaming.ts:104 | scripts/lore.test.cjs:206 |
| validateMergedText | lib/lore/dreaming.ts:116 | scripts/lore.test.cjs:201 |

確認コマンドは次の形式で全export名に対して実行した。

~~~powershell
rg -n --no-heading --color never -w -g '*.test.cjs' -- <EXPORT_NAME> scripts
rg -n --no-heading --color never -w -- <EXPORT_NAME> app components lib types middleware.ts next.config.js tailwind.config.js
~~~

buildUserPrompt は app/api/lore/consolidate/preview/route.ts:34 に同名の別ローカル関数があるため、symbol単位で別物と確認した。

### ローカル宣言

allowJs/checkJsを含む全136実装ソース（next-env.d.ts を除外）の未使用診断は前述の21件だけだった。指摘13 binding以外の8件は、次の目的コメントとgeneric constraintを確認した。

~~~ts
// ⚠️ このブロックが型エラーになったら、types/index.ts のUnion型と
// lib/modelRegistry.ts の MODEL_REGISTRY がズレている。
type AssertNever<T extends never> = T;
~~~

場所は types/index.ts:8、:9、:11。各aliasは未参照でも型引数が never であることをコンパイル時に強制するため、意図的な型整合性検査として問題なしとした。

確認したJavaScript/CommonJSファイルは次の7件で、追加のTS6133・TS6196・TS6198はなかった。

~~~text
scripts/ai-context-blocks.test.cjs
scripts/branchTree.test.cjs
scripts/loadModel.test.cjs
scripts/lore-openai.test.cjs
scripts/lore.test.cjs
scripts/modelRegistry.test.cjs
scripts/pricing.test.cjs
~~~

## 検証結果

| コマンド | 結果 | 記録 |
|---|---|---|
| npx tsc --noEmit | 成功（exit 0） | 出力なし |
| npx tsc --noEmit --noUnusedLocals --incremental false --pretty false | 監査用診断あり（exit 1） | 21診断。13 bindingを指摘、8型aliasを意図的検査として除外 |
| node scripts/ai-context-blocks.test.cjs | 成功（exit 0） | ai-context-blocks tests passed |
| node scripts/branchTree.test.cjs | 成功（exit 0） | branchTree tests passed |
| node scripts/loadModel.test.cjs | 成功（exit 0） | loadModel tests passed |
| node scripts/lore-openai.test.cjs | 成功（exit 0） | 11 lore OpenAI tests passed |
| node scripts/lore.test.cjs | 成功（exit 0） | 20 lore characterization tests passed |
| node scripts/modelRegistry.test.cjs | 成功（exit 0） | modelRegistry tests passed |
| node scripts/pricing.test.cjs | 成功（exit 0） | pricing tests passed |
| npm run build | 成功（exit 0） | Compiled successfully、26/26 static pages生成完了 |

npm run build のsandbox内初回実行は、Next.jsのjest-workerが子プロセスを生成する箇所で spawn EPERM（exit 1）となった。同一コマンドをsandbox外で再実行すると上表のとおり成功したため、初回失敗はコードやnode_modules破損ではなく実行環境のプロセス生成制限と切り分けた。

npx tsc --noEmit 後に tsconfig.tsbuildinfo が変更されたことを git status --short で確認し、指示どおり次を実行した。

~~~powershell
git restore --worktree -- tsconfig.tsbuildinfo
~~~

復元後およびbuild後の git status --short は出力なしだった。

## 最終 git status --short

~~~text
?? docs/audit/full-audit-c-2026-07-13.md
~~~
