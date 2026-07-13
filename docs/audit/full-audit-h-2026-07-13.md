# KabeHub 全体監査 H — TODO / FIXME / 要確認コメント棚卸し

- 監査日: 2026-07-13（Asia/Tokyo）
- 対象: Git 管理下のリポジトリ全体、およびルートに存在した無視ファイル（node_modules・.next・.git は除外）
- 方針: 読み取り専用監査。コード、テスト、設定、既存文書は変更していない。
- 集計単位: 同じ対象を指す重複メモは1指摘に集約し、場所欄に全出現行を列挙した。

## サマリ

| 項目 | 件数 |
|---|---:|
| 指摘件数 | 73 |
| うち取り残しコメント（実装済み・確認済みなのに残存） | 28 |

優先度「高」はDB・認証・セキュリティに直接関係するもの、「中」はその他の未対応、「低」は取り残し・条件付き注意・軽微な文書表現とした。

## 事前条件

開始時に次を実行した。

~~~powershell
git status --short
Test-Path -LiteralPath 'docs/audit/full-audit-h-2026-07-13.md'
(Get-Item -LiteralPath 'node_modules/next/package.json').Length
~~~

結果は、git status --short が空、対象レポートは False、node_modules/next/package.json は存在し 9,992 bytes だった。停止条件には該当しなかった。

## 全体検索方法

標準タグ、類似日本語、英語の将来メモ、Markdown の未完了チェック項目を別々に検索した。すべて大文字小文字を区別せず、node_modules・.next・.git を除外した。

~~~powershell
rg -n -i -uu -g '!node_modules/**' -g '!.next/**' -g '!.git/**' -g '!docs/audit/full-audit-h-2026-07-13.md' '(TODO|FIXME|HACK|XXX|要確認|未実装|あとで直す|後で直す|暫定|一時的|仮実装|仮置き|応急|要対応|未対応|後回し|将来対応|保留)' .
~~~

~~~powershell
rg -n -i -uu -g '!node_modules/**' -g '!.next/**' -g '!.git/**' -g '!docs/audit/**' -g '!tsconfig.tsbuildinfo' -g '!package-lock.json' '(TODO|FIXME|HACK|XXX|TBD|TO[ -]?DO|要確認|未確認|未実装|未対応|未完(?:成)?|あとで|後で直|後日|後ほど|将来(?:対応|的)?|今後(?:対応)?|残課題|実装予定|対応予定|要対応|要検討|要調査|要修正|要改善|暫定(?:的)?|一時的|仮実装|仮置き|仮対応|応急|後回し|保留|とりあえず|一旦|workaround|temporary|not implemented|pending)' .
~~~

~~~powershell
rg -n -i -uu -g '*.md' -g '!docs/audit/**' -g '!node_modules/**' -g '!.next/**' '(^\s*[-*]\s+\[[ xX]\]|TODO|FIXME|HACK|XXX|TBD|要確認|未確認|未実装|未対応|未適用|未反映|未着手|未了|未完|未使用|将来|今後|後回し|あとで|後で|暫定|一時的|仮実装|応急|残課題|既知の課題|技術負債|実装予定|対応予定|要対応|要検討|要調査|要修正|要改善|改善候補|保留)' .
~~~

rg --files -uu の対象は178ファイル、git ls-files は177ファイルだった。差分の1件は無視対象の .env.local であり、ここも候補検索だけは行った。過去監査レポート docs/audit/full-audit-a〜g-2026-07-13.md は検索対象に含めたが、そこにある TODO の引用・監査用grep例は一次コメントではないため重複指摘から除外した。

## 指摘

### [H-01] CSP nonce化TODOは未対応
- 場所: next.config.js:19
- 事実: コメントは nonce 化を求める。script-src は現在も unsafe-inline を含み、ヘッダー自体も強制ではなく Report-Only であるため未対応のまま。

~~~js
const scriptSrc = [
  "'self'",
  "'unsafe-inline'", // TODO: replace unsafe-inline with nonces when CSP is enforced.
~~~

~~~js
key: "Content-Security-Policy-Report-Only",
value: cspReportOnly,
~~~

- 分類: 乖離
- 推奨対応: nonce導入と強制CSPへの移行条件をレビューし、実施チケットへ切り出す。
- 優先度: 高

### [H-02] chat RouteのStorageパスガード共通化TODOは未対応
- 場所: app/api/chat/route.ts:71
- 事実: TODO直後にローカル isOwnedStoragePath が残る一方、lib/storage-path-guard.ts:15 に同名の共通関数が既にある。chat Routeは共通関数をimportしておらず、移管は未対応。

~~~ts
// TODO: T-03/T-09で lib/storage-path-guard.ts に移管する
function isOwnedStoragePath(path: unknown, userId: string): path is string {
  return (
~~~

~~~ts
export function isOwnedStoragePath(path: unknown, userId: string): path is string {
  if (typeof path !== 'string' || path.length === 0) return false
~~~

- 分類: 重複
- 推奨対応: 両実装の検証条件差を確認してから共通helperへ統一する案をレビューする。
- 優先度: 高

### [H-03] 生成画像のAPI Route配信TODOは未対応
- 場所: components/MessageBubble.tsx:194
- 事実: TODO直後でブラウザ用Supabaseクライアントから署名URLを直接作成し、components/MessageBubble.tsx:552 では img 要素へ渡している。API Route経由・Next Imageキャッシュ化は未対応。

~~~tsx
// TODO: 将来的にAPI Route経由の画像配信に変更し、Next.js <Image> のキャッシュを効かせる
supabase.storage
  .from("generated-images")
~~~

~~~tsx
<img
  src={imageUrl}
  alt={message.content}
~~~

- 分類: 乖離
- 推奨対応: 認可済み配信Routeとキャッシュ方針を設計する案をレビューする。
- 優先度: 中

### [H-04] 生成画像WebP圧縮TODOは未対応
- 場所: app/api/image-gen/route.ts:278, CLAUDE.md:480
- 事実: Storage upload は生成元bufferとmimeTypeをそのまま渡し、その直後に未圧縮と明記するTODOが残る。sharp依存もpackage.jsonにない。

~~~ts
.from('generated-images')
.upload(storagePath, buffer, { contentType: mimeType })
~~~

~~~ts
// TODO: sharp による WebP 圧縮対応（現在は未圧縮のままアップロード）
~~~

- 分類: 乖離
- 推奨対応: 圧縮率・画質・mimeType/拡張子整合を含む変換仕様をレビューする。
- 優先度: 中

### [H-05] 利用統計のDB集計RPC化メモは未対応
- 場所: app/api/stats/route.ts:34
- 事実: コメント直後で対象期間のmessages行を全取得し、app/api/stats/route.ts:52以降でJS集計している。RPC化は未対応。

~~~ts
// 将来的にRPC化推奨: 現在は個人ユーザー向けのためJSで集計
const { data: messages, error } = await supabase
  .from("messages")
~~~

- 分類: 乖離
- 推奨対応: 行数上限と実測負荷を確認し、DB集計へ移す閾値を決める案をレビューする。
- 優先度: 高

### [H-06] 学習済みフラグ更新エラーの握りつぶし改善メモは未対応
- 場所: lib/lore/batchTrain.ts:175
- 事実: コメント直後のmessages UPDATEは返却errorを受け取らず、呼び出し元は常に処理継続する。コメントどおり現行挙動が残る。

~~~ts
// 現行挙動を維持するため意図的に握りつぶしている。将来の改善候補
await supabase
  .from("messages")
~~~

~~~ts
.update({ is_learned: true })
.eq("id", messageId)
~~~

- 分類: 乖離
- 推奨対応: lore保存成功後のフラグ更新失敗を再試行・警告・失敗扱いのどれにするかレビューする。
- 優先度: 高

### [H-07] GitHub参照データの共通封筒化メモは未対応
- 場所: lib/ai-context-blocks.ts:3
- 事実: コメントはPinned Files / Tool Loopの共通封筒化を将来作業としている。lib/github.ts:213では独自の区切り文字列を組み立て、chat Routeはその文字列を直接連結しており、buildReferenceBlockは使われていない。

~~~ts
// 【今後の拡張予定・地雷メモ】
// GitHub Pinned Files / Tool Loop をこの封筒形式に統一する作業（ご神託01-05
// チケット3・5）は本セッションのスコープ外。
~~~

~~~ts
context: [
  "---",
  "【Pinned GitHub Files】",
~~~

- 分類: 不統一
- 推奨対応: GitHub由来テキストも同じ参照データ無害化境界へ統一する案をレビューする。
- 優先度: 高

### [H-08] canonical schemaのuuid-ossp要確認は未解消
- 場所: docs/schema.sql:46
- 事実: canonical schema内でuuid-osspを作成するが、同ファイルのUUID既定値はgen_random_uuidのみだった。uuid_generate系はsupabase-schema.OBSOLETE.sqlにだけ存在し、要確認事項は未整理。

~~~sql
create extension if not exists "uuid-ossp";  -- 現状 gen_random_uuid() 主体のため実質未使用の可能性あり（要確認）
create extension if not exists vector;        -- lore_embeddings.embedding 用（pgvector）
~~~

- 分類: デッドコード
- 推奨対応: 新規環境で必要な拡張かを確認し、canonical schemaから外すか理由を明記する案をレビューする。
- 優先度: 高

### [H-09] 旧likesカウンターRPCの削除予定は未対応
- 場所: docs/schema.sql:600, docs/schema.sql:602, docs/applied/migration_v123_rpc_hardening.sql:7, docs/applied/migration_v123_rpc_hardening.sql:103
- 事実: v124で削除予定とするコメントに対し、canonical schemaはincrement_likes_countとdecrement_likes_countを現在も作成する。アプリ呼び出しはrecalc_likes_countだけで、v124ファイルは存在しない。

~~~sql
-- 【旧関数・v124で削除予定】±1方式（本番で数日〜1週間の安定稼働確認後、
-- migration_v124_drop_legacy_counter_rpcs.sql で削除する。それまでは
-- app/api/threads/[id]/likes/route.ts からは呼ばれておらず未使用（呼び出し側は
~~~

~~~sql
create or replace function increment_likes_count(p_thread_id uuid)
returns void
~~~

- 分類: デッドコード
- 推奨対応: 本番互換要件を確認し、旧RPC削除マイグレーションを別チケットでレビューする。
- 優先度: 高

### [H-10] 旧messages RLSポリシーの混入経路は未特定
- 場所: docs/schema.sql:35
- 事実: コメントは公開制御を迂回した旧ポリシー2本を削除済みと記録する一方、混入経路は未特定と明記する。リポジトリ検索でも原因を確定する追加記録はなかった。

~~~sql
--     混入経路は未特定（v121〜v126のいずれにも当該ポリシー名は含まれず、
--     バックアップ/復元系操作の副作用の可能性が高い）。
~~~

- 分類: 情報のみ
- 推奨対応: 再発検知方法とDB変更経路の監査証跡を残すかレビューする。
- 優先度: 高

### [H-11] thread_tags移行後の目視確認メモは完了記録がない
- 場所: docs/applied/migration_rls_cleanup_p0.sql:309
- 事実: コメントは所有者不一致タグが公開表示から消えないか目視確認を要求する。canonical schemaには所有者一致条件が反映済みだが、当該目視確認の完了記録はリポジトリ内にない。DB接続禁止のためデータ実測はしていない。

~~~sql
--       【要確認】この条件追加により、もし過去に所有者以外のuser_idで
--       登録されたタグ行が本番に存在した場合、それは公開閲覧から見えなく
--       なる（= public_threads_viewと同じ挙動になるだけで、後退ではない）。
~~~

~~~sql
and threads.is_public = true
and threads.user_id = thread_tags.user_id
~~~

- 分類: 情報のみ
- 推奨対応: 適用時の確認結果を履歴へ追記するか、未実施なら別途確認する案をレビューする。
- 優先度: 高

### [H-12] Memory検索経路の二重注入要確認は未対応
- 場所: docs/lore-refactoring-notes.md:11, app/api/chat/route.ts:936
- 事実: 文書が指すMEMORY_TRIGGER_PATTERNはapp/api/chat/route.ts:939に残り、その後app/api/chat/route.ts:1200で包含関係にあるRAGキーワード検索を独立実行する。memoryとrag_memoryの両ブロック生成も残り、未統合のまま。

~~~md
## 要確認③: トリガー語の包含関係

`MEMORY_TRIGGER_PATTERN`（正規表現、11語）の全キーワードは、`RAG_TRIGGER_KEYWORDS`（配列、19語）に包含されている。そのため、通常の非一時チャットで②（旧Memory）の検索条件を満たした場合、③（rule-based RAG）の検索条件も必ず満たされ、**同一リクエスト内で両方の検索処理が実行される**。
~~~

~~~ts
if (openaiKey && shouldSearchRagMemory(userContent)) {
  try {
    const ragFolderName = currentFolderName ?? null;
~~~

- 分類: 重複
- 推奨対応: 検索・embedding・注入結果を一本化するか、二重注入を仕様化する案をレビューする。
- 優先度: 中

### [H-13] clamp共通化の先送り事項は未対応
- 場所: docs/lore-refactoring-notes.md:19
- 事実: 文書に列挙された4ファイルすべてに同一のローカルclampが残ることを実コードで確認した。

~~~md
## 先送り事項

次の4ファイルにあるローカル `clamp` の重複は、T5引き継ぎ資料でT7送りとされていたが、今回のスコープでは対象外とし、次回以降の課題とする。
~~~

~~~ts
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
~~~

- 分類: 重複
- 推奨対応: 数値正規化helperへ集約する価値があるかレビューする。
- 優先度: 中

### [H-14] ThinkingモデルID直書きの既知コメントは取り残し
- 場所: scripts/loadModel.test.cjs:184
- 事実: コメントはChatInputのモデルID直書き3回を未カバーとするが、現在のボタンはisThinkingUnsupportedとgetThinkingSupportを使い、対象ID比較は存在しない。registry化で対応済みなのにコメントだけ残る。

~~~js
// ⚠️ 未カバー・既知の重複（コードコメントとして記録。registry化(T1)で解消予定）:
// JSX内の「深く考える」ボタンのtitle文言分岐は THINKING_UNSUPPORTED_MODELS とは別に
// モデルIDが直接3回ハードコードされており（selectedModel === "claude-haiku-4-5-20251001" 等）、
~~~

~~~tsx
disabled={isThinkingUnsupported(selectedModel) || isLoading || !!disabled}
title={getThinkingSupport(selectedModel).note ?? "Extended Thinking: AIが回答前に深く考えます"}
~~~

- 分類: 乖離
- 推奨対応: 現在のregistry由来実装に合わせて既知問題コメントを整理する案をレビューする。
- 優先度: 低

### [H-15] Embeddingモデル変更時の整合確認は条件付き注意
- 場所: lib/internalModels.ts:6
- 事実: コメントはモデル変更時の再生成・次元・RPC整合確認を要求する条件付き保守注意であり、現在値はtext-embedding-3-small、schemaはvector(1536)で一致する。現時点の未対応作業ではない。

~~~ts
* 変更時は既存embeddingの再生成、およびベクトル次元・
* インデックス・検索RPCとの整合確認が必要。
*/
~~~

~~~ts
export const LORE_EMBEDDING_MODEL = "text-embedding-3-small" as const;
~~~

- 分類: 情報のみ
- 推奨対応: 条件付き保守注意として維持するか、運用文書へ移すかをレビューする。
- 優先度: 低

### [H-16] OAuth stateの将来cron化は条件付き注意
- 場所: lib/github-token-store.ts:68
- 事実: 現在はOAuth state作成時に24時間超の期限切れ行を削除し、コメントは件数増大時だけ日次pg_cronへ移すとしている。現行cleanupは実装済みで、直ちに未対応の欠陥ではない。

~~~ts
// Future cleanup can move to a daily Supabase pg_cron job if this grows.
const { error: cleanupError } = await supabase
  .from("github_oauth_states")
~~~

- 分類: 情報のみ
- 推奨対応: 件数監視の閾値を定める場合のみ運用課題へ昇格する案をレビューする。
- 優先度: 低

### [H-17] MCP将来メソッドの認証後rate limit注意は条件付き注意
- 場所: app/api/mcp/threads/route.ts:32, app/api/mcp/threads/route.ts:54, app/api/mcp/threads/[id]/messages/route.ts:35, app/api/mcp/threads/[id]/messages/route.ts:69
- 事実: 4箇所とも現在のGET/POSTで認証直後・DBアクセス前にrate limitを実行し、将来DELETE等にも同順序を適用するよう注意している。現行メソッドは対応済み。

~~~ts
// Future MCP methods such as DELETE should apply this after authentication and before DB access.
const rateLimitResponse = await checkMcpLimitResponse(userId)
if (rateLimitResponse) return rateLimitResponse
~~~

- 分類: 情報のみ
- 推奨対応: 新メソッド追加時のセキュリティ要件として維持する案をレビューする。
- 優先度: 低

### [H-18] v126の将来呼び出し元変更コメントは実装理由
- 場所: docs/applied/migration_v126_find_similar_lore_pairs_liked_ai_protection.sql:10
- 事実: least/greatest正規化を採用した理由を説明する将来耐性メモであり、直後のSQLに反映済み。未対応作業ではない。

~~~sql
--       結果は同じだが、将来の呼び出し元変更に対しても壊れにくい書き方にする）

begin;
~~~

- 分類: 情報のみ
- 推奨対応: 適用済みマイグレーションの設計理由として維持する。
- 優先度: 低

### [H-19] test transpileの将来耐性コメントは実装理由
- 場所: scripts/loadModel.test.cjs:49
- 事実: ReactJSXを選んだ理由を説明し、直後でjsx: ts.JsxEmit.ReactJSXを設定している。未対応作業ではない。

~~~js
// 依存せず将来的なトップレベルJSX定数の追加にも耐性があるためこちらを採用
jsx: ts.JsxEmit.ReactJSX,
~~~

- 分類: 情報のみ
- 推奨対応: テスト変換設定の設計理由として維持する。
- 優先度: 低

### [H-20] Arenaストリーミング化メモは条件付き将来設計
- 場所: CLAUDE.md:287
- 事実: コメントは「ストリーミング化する場合」の条件付き注意である。現在のcallOpenAIはawait res.jsonで一括取得しており、非ストリーミング方針と一致する。

~~~md
- **`app/api/arena/route.ts` はこのパターンを採用していない**（非ストリーミング・単純JSON取得）。今後arenaもストリーミング化する場合は要新規設計
~~~

~~~ts
const data = await res.json();
if (!res.ok) throw new Error(data.error?.message ?? "OpenAI API error");
~~~

- 分類: 情報のみ
- 推奨対応: ストリーミング化の要求が生じるまで条件付き注意として維持する。
- 優先度: 低

### [H-21] BYOKのLocalStorage保存強化方針は未対応
- 場所: README.md:142
- 事実: READMEはサーバー側暗号化から完全プロキシへの将来移行を明記する。現在も設定画面がAPIキーをLocalStorageへ保存し、リクエストヘッダーへ載せる方式であり、強化は未対応。

~~~md
BYOKは当面、A案としてLocalStorage保存を継続します。将来的な強化方針として、C案（サーバー側暗号化保存）からD案（完全プロキシ）への段階的移行を検討しますが、C/D案は今回の実装スコープには含めません。
~~~

~~~ts
localStorage.setItem(LS_KEYS.openai, openaiKey.trim())
~~~

- 分類: 情報のみ
- 推奨対応: 脅威モデルと運用コストを比較し、移行要否をセキュリティレビューする。
- 優先度: 高

### [H-22] Phase 4マネタイズの未完了メモは未対応
- 場所: CLAUDE.md:12, CLAUDE.md:509, README.md:171, README.en.md:146, app/settings/page.tsx:941
- 事実: Stripe、クレジット制、上限誘導UIが未着手として列挙される。コード全体のstripe/checkout/webhook検索はコメント以外0件で、設定画面も「プレミアム（準備中）」ティーザーだけを表示する。

~~~md
**Phase 4 マネタイズ**（最優先・未着手）
- おまかせプラン（クレジット制・月額500〜1,000円）
- Stripe連携
~~~

~~~tsx
{/* 将来の有料機能ティーザー */}
<section className="space-y-3">
  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
~~~

- 分類: 情報のみ
- 推奨対応: プロダクト判断後に決済・残高・権限境界を個別設計する案をレビューする。
- 優先度: 中

### [H-23] PWA・スマホアプリ化の未完了項目は未対応
- 場所: README.md:170, README.md:188, CLAUDE.md:501, CLAUDE.md:504
- 事実: manifest、アイコン、safe-area、Capacitorが予定として残る。manifest/service worker/Capacitor/viewport-fit/safe-area検索は予定文以外0件で、現在のviewportはwidthとinitialScaleだけ。

~~~md
**PWA対応**
- `manifest.json` 追加・アイコン整備・`viewport-fit=cover`・`env(safe-area-inset-bottom)` を入力欄 padding に追加
~~~

~~~tsx
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
~~~

- 分類: 情報のみ
- 推奨対応: PWAとCapacitorの先行順序を決め、必要資産を別チケット化する案をレビューする。
- 優先度: 中

### [H-24] pg_bigm Full-Text Searchの未完了項目は未対応
- 場所: README.md:172, README.md:187, README.en.md:162
- 事実: READMEはpg_bigm化を未完了項目としている。現在の検索Routeはthreads.titleとmessages.contentへilikeを実行し、pg_bigm・全文検索関数は存在しない。

~~~md
* [ ] 検索の `pg_bigm` を使った Full-Text Search 化
~~~

~~~ts
supabase.from("threads").select("id").ilike("title", pattern).eq("user_id", user.id),
supabase.from("messages").select("id, thread_id").ilike("content", pattern).eq("user_id", user.id),
~~~

- 分類: 乖離
- 推奨対応: データ量と検索品質を計測し、拡張導入・索引・RLS影響をレビューする。
- 優先度: 高

### [H-25] 英語READMEのBranching未完了チェックは取り残し
- 場所: README.en.md:145
- 事実: 英語READMEだけBranching Modeを未完了としているが、日本語README.md:166は完了済みで、components/BranchTree.tsxとapp/threads/[id]/tree/page.tsxが実装されている。

~~~md
* [ ] Branching Mode
~~~

~~~tsx
export default function BranchTree({ threadId, nodes, edges }: BranchTreeProps) {
~~~

- 分類: 不統一
- 推奨対応: 英語READMEのロードマップを現行実装へ同期する案をレビューする。
- 優先度: 低

### [H-26] khub CLIの未完了項目は未対応
- 場所: README.en.md:147
- 事実: 英語READMEに未完了項目があるが、khub検索は当該行だけで、package.jsonのscriptsもdev/build/startのみ。CLI実装はない。

~~~md
* [ ] `khub` CLI
~~~

~~~json
"scripts": {
  "dev": "next dev",
  "build": "next build",
~~~

- 分類: 情報のみ
- 推奨対応: MCPとの役割分担を確認してロードマップに残すか削除するかレビューする。
- 優先度: 中

### [H-27] iPhone実機確認メモは未完了
- 場所: CLAUDE.md:337, CLAUDE.md:478, CLAUDE.md:495, README.md:169
- 事実: 同じ実機確認項目が複数箇所に残る。app/page.tsxにはモバイルサイドバー分岐があるが、実機確認結果・自動E2E・端末テスト記録はリポジトリ内にないため未完了と判断した。

~~~md
- **iPhone実機確認未了**: モデルドロップダウン・サイドバードロワー・ヘッダー・＋ドロップアップ・会話履歴ドロワー・サイドバー折り畳みボタンの動作確認
~~~

~~~tsx
{isMobileViewport && isMobileSidebarOpen && (
  <div
    aria-hidden="true"
~~~

- 分類: 情報のみ
- 推奨対応: 対象端末・Safari版・確認観点と結果をQA記録へ残す案をレビューする。
- 優先度: 中

### [H-28] ProfilePage日本語化課題は未対応
- 場所: CLAUDE.md:479
- 事実: 課題が指す公開プロフィールの統計・空状態は現在も英語文字列で描画される。

~~~md
- `ProfilePage.tsx` の日本語テキストが英語になっている（v112でCodex文字化け対処のため・手動修正要）
~~~

~~~tsx
<span>{stats.publicThreadCount} public threads</span>
<span>{stats.totalLikes} likes</span>
<span>{stats.totalForks} forks</span>
~~~

- 分類: 不統一
- 推奨対応: 日本語UI方針に合わせて表示文言をレビューする。
- 優先度: 中

### [H-29] 生成画像のpg_cron自動削除メモは未対応
- 場所: CLAUDE.md:480
- 事実: 画像Tech Debtにpg_cron自動削除が列挙される。cron.schedule/生成画像自動削除のSQLは存在せず、現在あるのはユーザー操作起点のdelete_imageだけ。

~~~md
- 画像生成 Tech Debt（sharp圧縮・pg_cron自動削除・⭐Saveボタン・設定ページのデフォルトプロバイダー選択UI）
~~~

~~~ts
body: JSON.stringify({ action: "delete_image" }),
~~~

- 分類: 乖離
- 推奨対応: 保持期間・tombstone・Storage/DB整合を定めて削除ジョブを設計する案をレビューする。
- 優先度: 高

### [H-30] 画像ページの⭐Saveボタンメモは未対応
- 場所: CLAUDE.md:480
- 事実: app/image/page.tsxの生成結果操作はダウンロードリンクだけで、⭐SaveまたはDB保存操作はない。

~~~tsx
<a
  href={objectUrl}
  download="kabehub-image.png"
~~~

~~~tsx
⬇ ダウンロード
~~~

- 分類: 乖離
- 推奨対応: Saveの保存先・認証・既存チャット画像との重複を定義する案をレビューする。
- 優先度: 中

### [H-31] 設定ページの画像デフォルトプロバイダーUIは未対応
- 場所: CLAUDE.md:480
- 事実: modelRegistryにはimage_gen用LocalStorageキーとload/save処理があるが、設定ページの保存処理はclaude/gemini/openaiだけでimage_genを扱わない。メモどおり設定ページUIは未対応。

~~~ts
saveModel('claude', claudeModel)
saveModel('gemini', geminiModel)
saveModel('openai', openaiModel)
~~~

~~~ts
export function saveModel(provider: UIProvider, modelId: ModelId): void {
  localStorage.setItem(buildLegacyModelConfig()[provider].lsKey, modelId);
}
~~~

- 分類: 乖離
- 推奨対応: チャット内モデル選択との責務重複を確認して設定UI追加要否をレビューする。
- 優先度: 中

### [H-32] Opus 4.8 Extended Thinking将来対応メモは取り残し
- 場所: CLAUDE.md:481
- 事実: modelRegistryはclaude-opus-4-8をthinking.mode=extendedで登録し、loadModelテストもcanUseDeepThinkingがtrueと確認する。既に対応済みでコメントだけ残る。

~~~md
- Opus 4.8 の Extended Thinking 対応（将来対応）
~~~

~~~ts
{ kind: "text", id: "claude-opus-4-8", provider: "claude", label: "Opus 4.8", badge: "最高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "extended" }, pricing: price(5.00, 25.00) },
~~~

- 分類: 乖離
- 推奨対応: 対応済み項目として既知課題から外す案をレビューする。
- 優先度: 低

### [H-33] Pinned Files失敗時のUI通知は未対応
- 場所: CLAUDE.md:482, CLAUDE.md:530
- 事実: buildPinnedGithubContextのwarningsはchat Routeでconsole.warnするだけで、ResponseやUI stateへ渡されない。メモどおり未対応。

~~~md
- GitHub連携 Pinned Files失敗時のUI通知未実装（現状はconsole.warnのみ）
~~~

~~~ts
if (pinnedWarnings.length > 0) {
  console.warn("[Pinned GitHub Files] warnings:", pinnedWarnings);
}
~~~

- 分類: 乖離
- 推奨対応: 部分成功を維持しつつ警告をストリームまたはレスポンスでUIへ返す案をレビューする。
- 優先度: 中

### [H-34] 統合後に候補が消えない既知課題は取り残し
- 場所: CLAUDE.md:483
- 事実: 現在のhandleSaveMergeは成功後にfetchCards、fetchHistory、fetchConsolidationCandidatesをPromise.allで再取得する。記載されたタイミング問題への対応コードが既にある。

~~~md
- 統合成功後にF5なしで候補リストが消えないケース（fetchConsolidationCandidatesのタイミング問題）
~~~

~~~ts
closePreviewModal();
await Promise.all([fetchCards(), fetchHistory(), fetchConsolidationCandidates()]);
~~~

- 分類: 乖離
- 推奨対応: 再現確認後、解消済みなら既知課題から外す案をレビューする。
- 優先度: 低

### [H-35] 入力helperの重複共通化メモは未対応
- 場所: CLAUDE.md:343, CLAUDE.md:484
- 事実: ChatInput.tsxとChatInputCentered.tsxの双方にloadEnterModeとisMobileViewportの同一定義が残り、lib/inputUtils.tsは存在しない。

~~~ts
function loadEnterMode(): EnterMode {
  if (typeof window === "undefined") return "send";
  return localStorage.getItem(LS_ENTER_MODE) === "newline" ? "newline" : "send";
~~~

~~~ts
function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
~~~

- 分類: 重複
- 推奨対応: 入力共通helperへ移すか、意図的重複として同期テストを置くかレビューする。
- 優先度: 中

### [H-36] 世界線ラベルの一意連番化は未対応
- 場所: CLAUDE.md:396, CLAUDE.md:527
- 事実: UIは各branch_root内のbranchIndexをそのまま「世界線N」と表示する。branch_indexはrootごとに採番されるため、文書どおり複数rootで同じ番号が表示されうる。

~~~md
| 残課題（軽微・表示のみ） | `branch_index` が `branch_root_id` ごとのローカル番号のため「世界線0」が複数表示されることがある |
~~~

~~~tsx
.eq("branch_root_id", branchRootId)
.order("branch_index", { ascending: false })
.limit(1)
~~~

- 分類: 不統一
- 推奨対応: 表示専用の全体連番を導入するか、root単位番号だと明示する案をレビューする。
- 優先度: 中

### [H-37] 深い入れ子分岐のツリー表示課題は未解消
- 場所: CLAUDE.md:397, CLAUDE.md:485
- 事実: 既知課題は④'''が表示されないとする。branchTreeテストの入れ子fixtureは③''・④''までで、さらに編集した④'''のfixture/アサーションはないため、対応済みと確認できる実コード証跡がない。

~~~md
| Phase Bその3（未着手・優先度低） | ③''の④''をさらに編集した④'''がツリーに表示されない問題。原因未調査 |
~~~

~~~js
msg({ id: "u3c", message_number: 7, parent_id: "u3b", branch_root_id: "u3c", branch_index: 0, is_active: true, content: "③ double prime" }),
msg({ id: "u4c", message_number: 8, parent_id: "u3c", branch_root_id: "u3c", branch_index: 0, is_active: true, content: "④ double prime" }),
~~~

- 分類: 情報のみ
- 推奨対応: 既知再現データをfixture化してから原因調査する案をレビューする。
- 優先度: 中

### [H-38] textarea高さ再計算のResizeObserverは未対応
- 場所: CLAUDE.md:423, CLAUDE.md:486
- 事実: ChatInputの高さ計算effectはvalue変更だけに依存する。ChatPanelにResizeObserverはあるが、スクロール領域のナビ点位置compute用でtextareaを監視していない。

~~~ts
textareaRef.current.style.height = Math.min(scrollHeight, 240) + "px";
}
}, [value]);
~~~

~~~ts
const ro = new ResizeObserver(compute);
ro.observe(el);
return () => ro.disconnect();
~~~

- 分類: 乖離
- 推奨対応: textareaまたは入力欄コンテナの幅変化を監視して再計算する案をレビューする。
- 優先度: 中

### [H-39] Arenaのgpt-5.5-proメモは一部陳腐化し機能差は残存
- 場所: CLAUDE.md:66, CLAUDE.md:84, CLAUDE.md:330, CLAUDE.md:331, CLAUDE.md:487, CLAUDE.md:518, CLAUDE.md:519
- 事実: 文書はOPENAI_MODEL_IDSへの未反映とするが、現在のArenaは配列を持たずmodelRegistry経由でgpt-5.5-proを許可するため、その説明は陳腐化している。一方callOpenAIは全モデルを/v1/chat/completionsへ送り、chat Routeにあるpro専用/v1/responses分岐はなく、機能対応は未完了。

~~~ts
{ kind: "text", id: "gpt-5.5-pro", provider: "openai", label: "GPT-5.5 Pro", badge: "最上位", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "none" }, pricing: price(30.00, 180.00) },
~~~

~~~ts
const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
~~~

- 分類: 乖離
- 推奨対応: 文書をregistry構成へ更新し、ArenaのResponses API対応可否を別途レビューする。
- 優先度: 中

### [H-40] MCP実装状況の要確認メモは部分対応
- 場所: CLAUDE.md:132, CLAUDE.md:352, CLAUDE.md:488, CLAUDE.md:514, CLAUDE.md:516
- 事実: mcp_tokensテーブル、設定画面の発行UI、Bearer認証付きthreads/messages GET/POSTは実装済み。一方kabehub-mcp npmパッケージはpackage.json・package-lock・ソースに存在せず、「MCPサーバー」項目は部分対応のまま。

~~~sql
create table if not exists mcp_tokens (
  id           uuid primary key default gen_random_uuid(),
~~~

~~~ts
const res = await fetch('/api/mcp-tokens', {
  method: 'POST',
~~~

- 分類: 乖離
- 推奨対応: 実装済みAPI/UIと未実装配布物を分けてロードマップを更新する案をレビューする。
- 優先度: 高

### [H-41] genres/exportUtils不在の要確認メモは取り残し
- 場所: CLAUDE.md:218, CLAUDE.md:489, components/ChatPanel.tsx:9
- 事実: lib/genres.tsとlib/exportUtils.tsは両方存在し、ChatPanelが同時にimportして使用する。ファイル不在という記載は事実と反する。

~~~md
⚠️ 旧CLAUDE.mdに記載のあった `lib/genres.ts`（ジャンルマスタ）・`lib/exportUtils.ts`（エクスポートロジック）は最新のファイル構成一覧に見当たらない。リネーム・統合（`components/ExportModal.tsx`等）・削除のいずれかと思われるが未確認。次回コード確認時に要確認。
~~~

~~~tsx
import { GENRES } from "@/lib/genres";
import { generateMessageSummary } from "@/lib/stringUtils";
import { buildExportContent, ExportOptions } from "@/lib/exportUtils";
~~~

- 分類: 乖離
- 推奨対応: 両ファイルを主要ファイル表へ戻し、重複する要確認メモを削除する案をレビューする。
- 優先度: 低

### [H-42] 口述筆記モードの後回し項目は未対応
- 場所: CLAUDE.md:525
- 事実: OpenAI Whisper、SpeechRecognition、音声入力の検索結果は当該ロードマップ行だけで、実装はない。

~~~md
- 口述筆記モード（OpenAI Whisper API）
~~~

- 分類: 情報のみ
- 推奨対応: ブラウザ音声認識とWhisper APIの要件・費用を比較して残置可否をレビューする。
- 優先度: 中

### [H-43] 非同期整合性チェックの後回し項目は未対応
- 場所: CLAUDE.md:526
- 事実: Responses API Background modeまたは非同期整合性チェックの実装検索は当該行だけで、実装はない。

~~~md
- 非同期整合性チェック（OpenAI Responses API Background mode）
~~~

- 分類: 情報のみ
- 推奨対応: novel-checkとの役割とジョブ永続化要件を整理して残置可否をレビューする。
- 優先度: 中

### [H-44] visibleMessagesのuseMemo化項目は取り残し
- 場所: CLAUDE.md:528
- 事実: ChatPanelのvisibleMessagesは既にuseMemoで計算されるため対応済み。

~~~md
- `visibleMessages` 等の `useMemo` 化（パフォーマンス問題が出た場合に検討）
~~~

~~~ts
const visibleMessages = useMemo(
  () => dbActiveMessages.filter((msg) => {
~~~

- 分類: 乖離
- 推奨対応: 対応済み項目として後回し一覧から外す案をレビューする。
- 優先度: 低

### [H-45] MCP拡張ツールの後回し項目は未対応
- 場所: CLAUDE.md:529
- 事実: MCP Routeが公開するのはthreads GET/POSTとmessages GET/POSTで、publish_thread、add_tag、bulk_add_messagesは存在しない。

~~~md
- MCP拡張ツール（publish_thread / add_tag / bulk_add_messages）
~~~

~~~ts
export async function GET(req: NextRequest) {
~~~

~~~ts
export async function POST(req: NextRequest) {
~~~

- 分類: 情報のみ
- 推奨対応: 権限・rate limit・一括操作の原子性を含め、必要なツールだけを設計する案をレビューする。
- 優先度: 高

### [H-46] GitHub disconnect時のGitHub側revokeは未対応
- 場所: CLAUDE.md:531
- 事実: DELETE /api/auth/githubはローカルのuser_github_tokens行を削除するだけで、GitHub revoke APIを呼ばない。認証トークンはGitHub側で有効なままになりうるというメモの対象は未対応。

~~~ts
await deleteGithubToken(user.id);
return NextResponse.json({ ok: true });
~~~

~~~ts
await supabase.from("user_github_tokens").delete().eq("user_id", userId);
~~~

- 分類: 乖離
- 推奨対応: OAuth App認可取消APIとローカル削除の失敗順序をセキュリティレビューする。
- 優先度: 高

### [H-47] GitHub blob URLのブランチ制限緩和は未対応
- 場所: CLAUDE.md:532
- 事実: parseGithubBlobUrlはmain/master/develop/devの固定Set以外をnullにする。後回し項目どおり制限は残る。

~~~ts
const SUPPORTED_BRANCHES = new Set(["main", "master", "develop", "dev"]);
~~~

~~~ts
if (!owner || !repo || !SUPPORTED_BRANCHES.has(branch) || pathParts.length === 0) {
  return null;
}
~~~

- 分類: ハードコード
- 推奨対応: URL構造だけで任意ブランチを安全に解析する方式をレビューする。
- 優先度: 中

### [H-48] Arena人間ターンの送信キー統一は未対応
- 場所: CLAUDE.md:533, app/arena/page.tsx:870
- 事実: ArenaのtextareaはLocalStorage設定を読まず、Enter送信・Shift+Enter改行を固定している。

~~~md
- `app/arena/page.tsx` 人間ターン入力の送信キー設定への統一
~~~

~~~tsx
onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleHumanSubmit(); } }}
placeholder="発言を入力してください（Enter送信 / Shift+Enter改行）"
~~~

- 分類: 不統一
- 推奨対応: 通常チャットの送信キー設定をArenaにも適用するか、仕様差として明記する案をレビューする。
- 優先度: 中

### [H-49] share fork Routeの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:87
- 事実: POST handlerが元threads/messagesを読み、新規thread/messagesを作成してfork countを再計算する実装を確認した。表の「内容未確認」だけが残る。

~~~md
| `app/api/share/[token]/fork/route.ts` | 共有スレッドのフォーク処理 ⚠️内容未確認 |
~~~

~~~ts
export async function POST(
  req: NextRequest,
~~~

- 分類: 乖離
- 推奨対応: 実装確認済みとしてマーカーを外す案をレビューする。
- 優先度: 低

### [H-50] threads Routeの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:88
- 事実: GET handlerが認証ユーザーのthreads一覧を取得する実装を確認した。

~~~md
| `app/api/threads/route.ts` | スレッド一覧関連 ⚠️内容未確認 |
~~~

~~~ts
export async function GET(req: NextRequest) {
~~~

- 分類: 乖離
- 推奨対応: 「認証ユーザーのスレッド一覧GET」と確認済みの役割へ更新する案をレビューする。
- 優先度: 低

### [H-51] thread messages 2 Routeの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:95
- 事実: collection RouteはGET/DELETE、messageId RouteはDELETE/PATCHを実装していることを確認した。

~~~md
| `app/api/threads/[id]/messages/route.ts` / `messages/[messageId]/route.ts` | メッセージ操作 ⚠️内容未確認 |
~~~

~~~ts
export async function GET(
export async function DELETE(
~~~

~~~ts
export async function DELETE(
export async function PATCH(
~~~

- 分類: 乖離
- 推奨対応: 各HTTPメソッドの役割を表へ反映してマーカーを外す案をレビューする。
- 優先度: 低

### [H-52] messages/[id] Routeの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:99
- 事実: DELETEとPATCHを実装し、PATCHには画像削除も含むことを確認した。

~~~md
| `app/api/messages/[id]/route.ts` | メッセージ単体操作 ⚠️内容未確認 |
~~~

~~~ts
export async function DELETE(
~~~

~~~ts
export async function PATCH(
~~~

- 分類: 乖離
- 推奨対応: 単体削除・更新・画像tombstone操作として役割を確定する案をレビューする。
- 優先度: 低

### [H-53] Lore chunks 2 Routeの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:110
- 事実: collection Routeはlore_embeddings一覧GET、id Routeは指定chunk DELETEを実装している。

~~~md
| `app/api/lore/chunks/route.ts` / `chunks/[id]/route.ts` | Lore chunk関連 ⚠️内容未確認 |
~~~

~~~ts
export async function GET(req: NextRequest) {
~~~

~~~ts
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
~~~

- 分類: 乖離
- 推奨対応: 一覧取得・削除の役割を表へ反映する案をレビューする。
- 優先度: 低

### [H-54] Lore embed Routeの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:111
- 事実: POST handlerが既存lore_embeddingsを削除し、新しいembedding行をinsertする実装を確認した。

~~~md
| `app/api/lore/embed/route.ts` | Embedding生成関連 ⚠️内容未確認 |
~~~

~~~ts
export async function POST(req: NextRequest) {
~~~

~~~ts
await supabase.from('lore_embeddings').insert({
~~~

- 分類: 乖離
- 推奨対応: embedding再生成Routeとしてマーカーを外す案をレビューする。
- 優先度: 低

### [H-55] GitHub OAuth Routeの未確認記載は役割が不完全
- 場所: CLAUDE.md:126
- 事実: GETはOAuth開始だが、同じRouteのDELETEはローカル連携解除も実装する。未確認マーカーに加え、表の役割がGETだけを説明している。

~~~md
| `app/api/auth/github/route.ts` | GitHub OAuth開始 ⚠️内容未確認 |
~~~

~~~ts
export async function GET(req: NextRequest) {
~~~

~~~ts
export async function DELETE(req: NextRequest) {
~~~

- 分類: 乖離
- 推奨対応: OAuth開始・ローカル連携解除の両方を役割表へ記載する案をレビューする。
- 優先度: 低

### [H-56] album API Routeの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:144
- 事実: GET handlerが画像生成messagesを取得し、generated-imagesの署名URLを付けるアルバムAPIだと確認した。

~~~md
| `app/api/album/route.ts` | アルバム機能 ⚠️内容未確認 |
~~~

~~~ts
export async function GET(req: NextRequest) {
~~~

~~~ts
.from("generated-images")
.createSignedUrls(storagePaths, 3600);
~~~

- 分類: 乖離
- 推奨対応: 生成画像一覧・署名URL発行APIとしてマーカーを外す案をレビューする。
- 優先度: 低

### [H-57] calendar API Routeの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:145
- 事実: GET handlerが年月範囲でthreadsを取得する実装を確認した。

~~~md
| `app/api/calendar/route.ts` | カレンダー機能 ⚠️内容未確認 |
~~~

~~~ts
export async function GET(req: NextRequest) {
~~~

~~~ts
.from("threads")
~~~

- 分類: 乖離
- 推奨対応: 月別スレッド取得APIとして役割を確定する案をレビューする。
- 優先度: 低

### [H-58] extract-settings Routeの推測記載は対象が不正確
- 場所: CLAUDE.md:146
- 事実: GET/POSTともnovel_settingsを扱い、POSTは会話から小説設定を抽出して保存する。表の「おそらくLore Book関連」は実コードと一致しない。

~~~md
| `app/api/extract-settings/route.ts` | 設定抽出（おそらくLore Book関連） ⚠️内容未確認 |
~~~

~~~ts
export async function POST(req: NextRequest) {
~~~

~~~ts
.from('novel_settings')
.upsert({
~~~

- 分類: 乖離
- 推奨対応: 「会話からnovel_settingsを抽出・取得/保存」と役割を訂正する案をレビューする。
- 優先度: 低

### [H-59] novel-check API Routeの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:148
- 事実: POST handlerが入力を検証し、外部AI APIで小説整合性チェックを行う実装を確認した。

~~~md
| `app/api/novel-check/route.ts` | 小説整合性チェック機能 ⚠️内容未確認 |
~~~

~~~ts
export async function POST(req: NextRequest) {
~~~

- 分類: 乖離
- 推奨対応: 実装確認済みとしてマーカーを外す案をレビューする。
- 優先度: 低

### [H-60] reports API Routeの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:150
- 事実: POST handlerがservice role経由でsubmit_report RPCを呼ぶ通報APIだと確認した。

~~~md
| `app/api/reports/route.ts` | 通報機能 ⚠️内容未確認 |
~~~

~~~ts
export async function POST(req: NextRequest) {
~~~

~~~ts
({ error } = await serviceRoleSupabase.rpc("submit_report", {
~~~

- 分類: 乖離
- 推奨対応: 通報作成POSTとしてマーカーを外す案をレビューする。
- 優先度: 低

### [H-61] search API Routeの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:151
- 事実: GET handlerが認証ユーザーのthread title/message contentをilike検索する実装を確認した。

~~~md
| `app/api/search/route.ts` | 検索機能 ⚠️内容未確認 |
~~~

~~~ts
export async function GET(req: NextRequest) {
~~~

~~~ts
supabase.from("messages").select("id, thread_id").ilike("content", pattern).eq("user_id", user.id),
~~~

- 分類: 乖離
- 推奨対応: 所有スレッド全文部分一致検索として役割を確定する案をレビューする。
- 優先度: 低

### [H-62] album pageの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:160
- 事実: AlbumPageが/api/albumをページング取得し、選択・画像削除UIを提供する実装を確認した。

~~~md
| `app/album/page.tsx` | アルバム機能 ⚠️内容未確認 |
~~~

~~~tsx
export default function AlbumPage() {
~~~

- 分類: 乖離
- 推奨対応: 生成画像の一覧・選択・削除ページとしてマーカーを外す案をレビューする。
- 優先度: 低

### [H-63] calendar pageの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:163
- 事実: CalendarPageが選択年月で/api/calendarを取得し日付別表示する実装を確認した。

~~~md
| `app/calendar/page.tsx` | カレンダー機能 ⚠️内容未確認 |
~~~

~~~tsx
export default function CalendarPage() {
~~~

- 分類: 乖離
- 推奨対応: 月別スレッドカレンダーページとしてマーカーを外す案をレビューする。
- 優先度: 低

### [H-64] ArenaTimelineの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:185
- 事実: provider別Bubble、thinking表示、messages timelineをexportするコンポーネントだと確認した。

~~~md
| `components/ArenaTimeline.tsx` | AI闘技場のタイムライン表示 ⚠️内容未確認 |
~~~

~~~tsx
export function ArenaTimeline({ messages }: { messages: Message[] }) {
~~~

- 分類: 乖離
- 推奨対応: 実装確認済みとしてマーカーを外す案をレビューする。
- 優先度: 低

### [H-65] ExportModalをexportUtils後継とする要確認は不正確
- 場所: CLAUDE.md:187
- 事実: ChatPanelはExportModalとbuildExportContentを同時にimportする。前者は選択UI、後者は出力生成であり、後継・置換関係ではない。

~~~md
| `components/ExportModal.tsx` | TXT/MD/CSVエクスポートUI（旧`lib/exportUtils.ts`の後継の可能性・要確認） |
~~~

~~~tsx
import ExportModal from "./ExportModal";
import { GENRES } from "@/lib/genres";
import { buildExportContent, ExportOptions } from "@/lib/exportUtils";
~~~

- 分類: 乖離
- 推奨対応: UIと生成ロジックの分担として役割表を訂正する案をレビューする。
- 優先度: 低

### [H-66] OutlinePaneの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:190
- 事実: messagesを受け取り、開閉可能なあらすじ・アウトラインペインを描画する実装を確認した。

~~~md
| `components/OutlinePane.tsx` | あらすじ・アウトラインペイン ⚠️内容未確認 |
~~~

~~~tsx
export default function OutlinePane({ messages, isOpen, onToggle }: OutlinePaneProps) {
~~~

- 分類: 乖離
- 推奨対応: 実装確認済みとしてマーカーを外す案をレビューする。
- 優先度: 低

### [H-67] download-image helperの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:200
- 事実: generated-imagesからdownloadし、base64とmimeTypeを返すhelperだと確認した。

~~~md
| `lib/supabase/download-image.ts` | 画像ダウンロードヘルパー ⚠️内容未確認 |
~~~

~~~ts
export async function downloadImageAsBase64(
~~~

~~~ts
.from('generated-images')
.download(storagePath)
~~~

- 分類: 乖離
- 推奨対応: 実装確認済みとしてマーカーを外す案をレビューする。
- 優先度: 低

### [H-68] lib/supabase barrelの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:202
- 事実: browser/server/Route Handler用Supabase helperを再exportするbarrelだと確認した。

~~~md
| `lib/supabase.ts` | Supabase関連の共通処理 ⚠️内容未確認 |
~~~

~~~ts
export { supabase } from "./supabase/client";
export { createServerSupabaseClient } from "./supabase/server";
export { createRouteHandlerSupabaseClient } from "./supabase/route-handler";
~~~

- 分類: 乖離
- 推奨対応: Supabase helperのbarrel exportとして役割を確定する案をレビューする。
- 優先度: 低

### [H-69] branching helperの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:206
- 事実: 表示順・anchor・chain block・lane構築を提供する分岐ロジックだと確認した。

~~~md
| `lib/branching.ts` | 分岐関連ロジック ⚠️内容未確認 |
~~~

~~~ts
export const compareMessagesForDisplay = (a: Message, b: Message) => {
~~~

~~~ts
export function buildChainBlocksByRootAnchor(
~~~

- 分類: 乖離
- 推奨対応: 分岐表示用helper群としてマーカーを外す案をレビューする。
- 優先度: 低

### [H-70] GitHub token cryptoの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:210
- 事実: AES-GCMでGitHub tokenを暗号化・復号する実装を確認した。

~~~md
| `lib/github-token-crypto.ts` | GitHubトークンの暗号化 ⚠️内容未確認 |
~~~

~~~ts
const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;
~~~

~~~ts
export async function encryptToken(plaintext: string): Promise<string> {
~~~

- 分類: 乖離
- 推奨対応: AES-GCM暗号化helperとしてマーカーを外す案をレビューする。
- 優先度: 低

### [H-71] MCP auth helperの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:213
- 事実: Authorization Bearerをhash化し、mcp_tokens照合・last_used_at更新を行う認証helperだと確認した。

~~~md
| `lib/mcp-auth.ts` | MCP用Bearer認証処理 ⚠️内容未確認 |
~~~

~~~ts
export async function authenticateMcpToken(req: Request): Promise<string | null> {
~~~

~~~ts
.from('mcp_tokens')
.select('id, user_id')
~~~

- 分類: 乖離
- 推奨対応: 実装確認済みとしてマーカーを外す案をレビューする。
- 優先度: 低

### [H-72] mock-dbの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:214
- 事実: in-memoryのthreads/messages取得・作成・削除関数を提供する開発用mockだと確認した。

~~~md
| `lib/mock-db.ts` | 開発用モックDB ⚠️内容未確認 |
~~~

~~~ts
export function createThread(id: string, firstMessage: string): Thread {
~~~

~~~ts
export function addMessage(message: Message): Message {
~~~

- 分類: 乖離
- 推奨対応: 実装確認済みとしてマーカーを外す案をレビューする。
- 優先度: 低

### [H-73] stringUtilsの内容未確認マーカーは取り残し
- 場所: CLAUDE.md:216
- 事実: secret notationのmaskとmessage summary生成を提供する文字列helperだと確認した。

~~~md
| `lib/stringUtils.ts` | 文字列処理ユーティリティ ⚠️内容未確認 |
~~~

~~~ts
export function maskSecretNotation(text: string): string {
~~~

~~~ts
export function generateMessageSummary(content: string, maxLength: number = 35): string {
~~~

- 分類: 乖離
- 推奨対応: 実装確認済みとしてマーカーを外す案をレビューする。
- 優先度: 低

## 非指摘候補と「問題なし」の確認

### FIXME / HACK / TBD

次の完全一致系検索を、下記「確認対象ファイル一覧」の全テキストファイルに対して実行した。

~~~powershell
rg -n -i -uu -g '!node_modules/**' -g '!.next/**' -g '!.git/**' -g '!docs/audit/full-audit-h-2026-07-13.md' '(TODO|FIXME|HACK|XXX|TBD)' .
~~~

生の一致は43行だった。一次ソースの作業コメントとして成立したTODOはH-01〜H-04の4件。FIXME、HACK、TBDの作業コメントは0件だった。XXX一致は次の例示・hashだけで、修正タグではなかった。

- app/api/folder-settings/route.ts:4

~~~ts
// GET /api/folder-settings?folder_name=xxx
~~~

- app/api/extract-settings/route.ts:5

~~~ts
// GET /api/extract-settings?thread_id=xxx
~~~

- scripts/pricing.test.cjs:17

~~~js
// "@/xxx" エイリアスの解決（lib/pricing.ts自体は@/を使わないが、既存テストとの方式統一のため用意）
~~~

- .env.local:4, .env.local:7 は無視ファイル内の伏字例、package-lock.json:1099 はintegrity hash中の偶然一致だった。

### TODO / 要確認を機能データとして使う箇所

次はコメントではなく、KabeHubの記憶種別・状態・画面表示であるため指摘から除外した。

- app/memory/page.tsx:46, app/memory/page.tsx:1173

~~~tsx
{ value: "todo", label: "TODO" },
~~~

~~~tsx
予定・TODO
~~~

- app/memory/page.tsx:59, app/memory/page.tsx:1154

~~~tsx
{ value: "uncertain", label: "要確認" },
~~~

- docs/schema.sql:1102, docs/schema.sql:1157, docs/schema.sql:1169, docs/schema.sql:1181、lib/lore/batchTrain.ts:20, lib/lore/batchTrain.ts:61、scripts/lore.test.cjs:238 はmemory_kindのtodoまたはtemporal statusの仕様値だった。

### コメントではない日本語類似表現

次はユーザー向け文言・識別子・説明文であり、未対応メモではないことを前後コードで確認した。

- app/api/arena/route.ts:102, app/api/chat/route.ts:563, app/api/chat/route.ts:1276 — 不正providerに対する実行時エラー「未対応のプロバイダー」
- app/settings/page.tsx:527 — 「あとで設定する場合は」というオンボーディング案内
- components/ChatPanel.tsx:1556 — APIキー入力欄の画面文言「将来用」
- app/api/profile/route.ts:50 — 大文字ID制限の画面エラー「将来の限定機能」
- app/page.tsx、components/ChatPanel.tsx、app/api/chat/route.tsのisTemporary/temporaryMessages — 実装済みの「一時モード」識別子
- README.md:44 — 開発経緯の「とりあえず動くもの」という説明
- scripts/lore.test.cjsのpendingTests — 非同期テストPromiseの配列名

### 過去監査レポート内の二次一致

docs/audit/full-audit-a-2026-07-13.md:36, :495, :498 にはgrep例とapp/api/chat/route.ts:71のTODO引用がある。一次コメントはH-02で実コード確認済みのため、二重計上しなかった。full-audit-b〜g内の「未確認」「将来」等も各監査の説明・推奨文であり、製品コードの作業コメントではないことを開いて確認した。

## 確認対象ファイル一覧

git ls-files | Sort-Object の出力177件を次に記録する。さらに無視ファイル .env.local も候補grepだけは実行した。public/og-image.png はバイナリのため一覧確認のみ、tsconfig.tsbuildinfoとpackage-lock.jsonは生成物/lock内容の偶然一致を切り分けるため検索対象に含めた。

~~~text
.claude/settings.local.json
.claudeignore
.env.local.example
.gitignore
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
app/globals.css
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
CLAUDE.md
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
docs/audit/full-audit-g-2026-07-13.md
docs/lore-refactoring-notes.md
docs/schema.sql
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
LICENSE
middleware.ts
next-env.d.ts
next.config.js
package-lock.json
package.json
postcss.config.js
public/og-image.png
README.en.md
README.md
scripts/ai-context-blocks.test.cjs
scripts/branchTree.test.cjs
scripts/loadModel.test.cjs
scripts/lore-openai.test.cjs
scripts/lore.test.cjs
scripts/modelRegistry.test.cjs
scripts/pricing.test.cjs
supabase-schema.OBSOLETE.sql
tailwind.config.js
tsconfig.json
tsconfig.tsbuildinfo
types/index.ts
~~~

## 検証コマンドと結果

### TypeScript

~~~powershell
npx tsc --noEmit
~~~

- 終了コード: 0
- 標準出力: なし
- 実行後に tsconfig.tsbuildinfo が変更されたため、指定どおり git restore --worktree -- tsconfig.tsbuildinfo を実行した。
- 復元確認: git hash-object tsconfig.tsbuildinfo と git rev-parse HEAD:tsconfig.tsbuildinfo はともに 4f3da47c4b4cfcc789ed5bccc47ec0475e8080b0。

### 既存スクリプトテスト

scripts/*.test.cjs を列挙し、全7本を実行した。

| コマンド | 終了コード | 結果 |
|---|---:|---|
| node scripts/ai-context-blocks.test.cjs | 0 | ai-context-blocks tests passed |
| node scripts/branchTree.test.cjs | 0 | branchTree tests passed |
| node scripts/loadModel.test.cjs | 0 | loadModel tests passed |
| node scripts/lore-openai.test.cjs | 0 | 11 lore OpenAI tests passed |
| node scripts/lore.test.cjs | 0 | 20 lore characterization tests passed |
| node scripts/modelRegistry.test.cjs | 0 | modelRegistry tests passed |
| node scripts/pricing.test.cjs | 0 | pricing tests passed |

### Next.js production build

~~~powershell
npm run build
~~~

最初のサンドボックス内実行はNext.js jest-workerの子プロセス起動時に spawn EPERM となった。コード・型エラーではなく実行環境制限だったため、同一コマンドを許可済みのサンドボックス外環境で再実行した。

- 再実行終了コード: 0
- Compiled successfully
- Linting and checking validity of types: 成功
- Generating static pages: 26/26 成功
- Collecting build tracesまで完了
- ビルド後の git status --short はレポート作成前時点で空だった。

## 最終Git状態

レポート作成後に git diff --name-only が空（追跡済みファイルの変更なし）であることを確認し、git status --short を実行した。出力は次の1行だけだった。

~~~text
?? docs/audit/full-audit-h-2026-07-13.md
~~~
