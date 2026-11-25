# 抽出メモ: auth-and-security（1/3：監査A〜E）（①-2）

作成: 2026-11-25／担当: B6／対象: 監査A〜E（2026-07-13 の Codex 静的監査の指摘と、その対応ロードマップの最終版）。F〜I・総括は B7（-2）、その他は B8（-3）。
タグ: 【資料】＝読んだ資料に書かれている／【コード】＝実ファイルを grep で確認／【未確認】＝資料のみで現行コードと未突合。
略称: A最終＝`KabeHub_監査A対応ロードマップ_B-05b完了.md`、A更新版＝`KabeHub_監査A_2026-07-13_更新版.md`、B最終＝`…監査B…_MB-e完了.md`、C最終＝`…監査C…_MC-4完了.md`、D最終＝`…監査D…_MD-3_全完了.md`、E最終＝`KabeHub_監査Eロードマップ_E完了.md`、CC＝CLAUDE.md。
**公開リポジトリ向けの注意**: 未修正・未確定の弱点や、実在値（管理者UUID等）を含む項目は本メモに詳細を書かず、`docs/internal/` で扱う（詳細は commit 対象外の `docs/internal/internal-notes-security-1.md`）。本メモでは項目名と状態だけ書く。

## 確定した判断

判断者は、資料に「Rui氏の決定／承認」と明記があるものだけ「Rui」と書く。それ以外は「ChatGPTレビューをClaudeが採用」または「不明」。

### 監査A（DB・RPC・Storage・CSP・BYOK）

1. **A-02（フォルダ横断検索の意図とRPCの NULL 条件の不一致）は案2**：「未分類スレッドは未分類の内容だけ検索する」を正仕様とし、SQL（RPC）は現状維持、`app/api/chat/route.ts` のコメント側を実挙動に合わせる。判断者: 不明（A更新版は「決定」とだけ記す）。出典: A更新版 §1。【資料】【未確認】（その後 v186〜v192 で `project_id` 基準のRPCへ置換されており、元の条件は現行 DB に残っていない）
2. **Storage パス所有権 guard（監査A D-02＝監査D D-04）は案1**：backslash 拒否を残し、`lib/storage-path-guard.ts` に統一、`app/api/chat/route.ts` の独自実装は削除。判断者: 不明。出典: A更新版 §1。【資料】【コード】（`isOwnedStoragePath` は `..`・先頭`/`・backslash を拒否し `${userId}/` 配下のみ許可。chat・account・album・image-gen・messages・`lib/messages/delete.ts` が利用）
3. **B-01（公開スレッド RLS が非公開列を隠さない）は「SECURITY DEFINER 関数による公開データ投影」**：`get_public_threads_projection()`・`is_visible_public_message()`・`is_visible_public_thread_tag()`、`public_threads_view` は `security_invoker=true` を維持して投影関数経由、`messages`・`thread_tags` の公開 policy も関数経由、`threads` の列制限なし公開 policy は削除。当初案（view維持＋公開policy削除）は他人の公開スレッドが一切見えなくなると ChatGPT が指摘して差し戻し。適用前に `relforcerowsecurity=false` を確認。migration v128。判断者: ChatGPTレビューをClaudeが採用。【資料】【コード】（schema.sql に3関数と B-01 コメント）
4. **新規 SECURITY DEFINER 関数の標準**（B-01で確立、B-02・v130・v131 で踏襲）：`set search_path = ''`＋全参照を `public.` 完全修飾（旧来の `set search_path to 'public'` とは意図的に流儀を分離）。判断者: ChatGPTレビューをClaudeが採用。出典: A最終 B-01・B-02。【資料】【コード】（`delete_current_user`・`rollback_dreaming_batch_multi` が `set search_path = ''`）
5. **B-02（`*_multi` Dreaming RPC の認証欠如）**：修正は `_multi` 版2関数のみ（非 multi 版は `security definer` なしでRLSが効く）。判定は `p_user_id is null or auth.uid() is distinct from p_user_id`、`errcode = '42501'`、revoke→grant authenticated を関数作成と同一トランザクション。呼出元は常に本人の `user.id` を渡すためアプリ無改修。migration v129。判断者: ChatGPTレビュー4点をClaudeが採用。【資料】【コード】（`rollback_dreaming_batch_multi` は現行も同ガード。旧 `consolidate_dreaming_batch_multi` は v199 で削除 → 矛盾3）
6. **`delete_current_user()` の ACL 修正は B-02 から分離した小チケット**（引数なし・`auth.uid()` のみで偽装不能、anon 呼び出しは実質 no-op）。`auth.uid() is null` の単純ガード、`v_user_id` ローカル変数化、`public.` 完全修飾、revoke→grant を同一トランザクション。migration v130。判断者: ChatGPTレビュー3点をClaudeが採用。【資料】【コード】（関数本体は schema.sql に一致。**ACL文は schema.sql に無い**→ 矛盾2）
7. **B-04（Storage オブジェクト削除）は2段に分割**：B-04a＝同期削除（スレッド・メッセージ単体・範囲削除・アカウント削除の5経路。当初想定2経路から実ファイル調査で拡大）、B-04b／H-29＝孤児回収バッチ。判断者: 不明（設計セッションで確定）。出典: A最終 B-04a。【資料】【コード】
   - **削除の失敗方針を2種に分けて着手前に明示**：通常削除（スレッド・メッセージ）は DB 確定を優先し Storage 失敗は best-effort、アカウント削除は Storage の列挙・検証・remove のいずれか失敗で 500 を返し RPC を呼ばない（fail closed。Storage の owner が `auth.users` を FK 参照しているため）。共通 helper は構造化結果を返し、1000件 chunk 分割は `lib/supabase/storage-cleanup.ts` に集約。【資料】【コード】（`app/api/account/route.ts`）
   - 共通 helper は best-effort 専用にせず構造化結果（`StorageCleanupResult`）を返し、呼び出し元が方針を決める。`storage.remove()` は1回1000件上限のため chunk 分割を `lib/supabase/storage-cleanup.ts` に集約。ログは scope・件数のみで storagePath・userId 等を出さない。【資料】【コード】
8. **B-04b／H-29 は案B（Vercel Cron＋Node.js Storage SDK）採用、案A（pg_cron＋pg_net＋Vault）不採用**。検出は `find_orphan_storage_candidates`（service_role 限定）、削除は `removeStoragePaths` 再利用、猶予24時間、service role クライアントは `lib/supabase/admin.ts` に分離、初回は dry-run。判断者: 不明。migration v131。【資料】【コード】（`STORAGE_CLEANUP_DRY_RUN` が `"false"` 完全一致のときだけ削除、`vercel.json` は `0 18 * * *`）
9. **B-05 は3チケットに分割**：①Next.js アップグレード（前提）→②B-05a／H-01（CSP強制化・nonce）→③B-05b／H-21（APIキー）。「主要ページのみ nonce 対応」は不可能と実測（全ページ動的化を受け入れて nonce 方式）。CVE-2026-44581（公開済み）の影響範囲を脱するためアップグレードを先行。判断者: Rui。【資料】
10. **B-05a の設計**：`middleware.ts`→`proxy.ts`、CSP 付与とセッション確認を独立変数で計算、外部由来の CSP リクエストヘッダーを削除してから自前 nonce、レポートは `Reporting-Endpoints`（`CSP_REPORT_ENDPOINT` 未設定なら送出しない）、`/api/csp-report` は 32KB 早期拒否・IPハッシュのレート制限（fail-open）・常に 204、`CSP_REPORT_ONLY` は `"false"` 完全一致のみ Enforce。v2.1 で「prefetch 時にセッション確認が欠落する matcher 不備」を発見し保護ページを独立エントリ化。判断者: ChatGPTレビューをClaudeが採用。【資料】【コード】（`proxy.ts` に `requestHeaders.delete("content-security-policy")`・`x-nonce`）
11. **B-05b／H-21 は「A＋案」でクローズ**：LocalStorage 保存は変更せず、①ユーザー向け文言（`settings`・`privacy` 第4条・`terms` 第6条）を実態に一致、②送信経路の全棚卸し（件数固定せず横断 grep を正とする）、③DB 非保存の回帰テスト（`scripts/api-key-handling.test.cjs`）、④Gemini キーを `x-goog-api-key` ヘッダーへ統一、⑤外部APIエラー本文の固定メッセージ化（`AiProviderRequestError`）。sessionStorage 化は再入力頻度が悪化するため不採用、サーバー側暗号化は H-21C へ。判断者: Rui（BYOK 継続・A＋案・エラー具体性低下の承認）。【資料】【コード】（`?key=` は0件）
12. **Next.js 16 化と npm audit の判断**（当時）：`next/image` 不使用のため sharp は実質無害、uuid は v4 のみで実害なし、postcss は next 内部で待ち。判断者: 不明。現行は `next 16.4.6`・`uuid ^11.1.1`。npm audit の本体は B7（監査I）。【資料】【コード】
13. **ロードマップ文書は git 管理外**。Codex に更新を指示するときは同名ファイルを git に作らせず、内容をレポートで返させる（Codex が作りかけた事例）。判断者: Claude の運用判断。【資料】

### 監査B（未認証応答・matcher・`next` 往復）

14. **未認証 API 応答は段階移行**（MB-a1→a2→a3）：まず proxy を307から**空ボディ401**（既存の無条件 `res.json()` 箇所が従来と同じ例外経路を辿り呼出側無改修で導入可）、次に呼出側15箇所を「`res.ok` 確認→パース」へ（見積り12を再棚卸しで訂正）、最後に `{"error":"Unauthorized"}`（`Cache-Control: no-store`）に統一。MCP の `{error, hint}` は独自契約で対象外。`fetchWithStreaming` の `res.ok` 確認は Content-Type 分岐の内側でなく `fetch()` 直後に置く。判断者: ChatGPTレビューをClaudeが採用。【資料】【コード】（`unauthorizedApiResponse` は `finalizeWithCookies` 経由）
    - `fetchWithStreaming`（`app/page.tsx`）の `res.ok` 確認は Content-Type 分岐の内側ではなく `fetch()` 直後に置く（空ボディ401・text/plain 500・HTML 502 が SSE 側へ流れ「成功に見える空メッセージ」になるのを防ぐ）。【資料】【未確認】
15. **`mcp`・`share` の除外は fail-closed（原則保護・公開GET/HEADだけ免除）**（MB-b）：「forkだけ保護へ戻す」方式は将来の子 Route が無保護になるため不採用。`isMcpBearerApi`（セグメント境界）と `isPublicShareReadApi(pathname, method)` を `lib/proxy-paths.ts` に集約。`config.matcher` は静的リテラル必須のため「一本化」はロジック集約＋テストによる対応保証と再定義。matcher と セッション確認は別概念。判断者: ChatGPTレビュー2ラウンドをClaudeが採用。【資料】【コード】
16. **監査B [B-01]（`/api/explore` の匿名閲覧）はコード変更なしでクローズ**（`isPublicOptionalAuthApi` で未ログインでも通過）。**[B-05]（`/auth/callback` のデッドコード）は到達不能の理由が変化していた**（監査時点＝matcherに無い、MB-b以降＝matcherは通るが `shouldRunSupabaseSessionCheck` が false）。条件削除＋専用テスト1件＋CLAUDE.md の認証境界表を新設。【資料】【コード】
17. **`/api/fetch-github` に Route 内 guard を追加（二重防御）**（MB-c-2）：Cookie accumulator（`new NextResponse()`）＋`finalizeJson`。`createRouteHandlerSupabaseClient` の第2引数にネイティブ `Response` を `as never` で渡す既存パターンはセッション更新時に実行時エラーになりうるため新規コードで流用しない。curl では proxy 層と Route 層を区別できないため Route 単体テスト（Supabase モック）で証明。判断者: ChatGPTレビューをClaudeが採用。【資料】【コード】（現行は `requireRouteUser` に集約、`as never` は0件）
18. **8ページ（`/stats`・`/memory`・`/album`・`/arena`・`/calendar`・`/image`・`/novel-check`・`/threads/[id]/tree`）を一律「未ログインは `/login?next=…` へ307」に昇格**（MB-d）。データ漏洩はなかったが未ログイン時の挙動が3種に割れていた体験の統一が目的。判断者: Rui。個別 matcher エントリは `missing` を付けない（Codex が誤って付けテストも実装に合わせて書かれていた→rebase で是正）。tree の判定は `isProtectedPagePath` の正規表現。`stats`・`calendar`・`novel-check` の Cookie finalization も是正。【資料】【コード】
19. **`next` 往復（MB-e）**：許可先を保護ページ全体＋`/share/<単一セグメント>` に拡張（汎用相対パス検証は不採用）。**handle 未設定は `next` に関わらず常に `/settings?onboarding=true`**（従来の `/share/` バイパスも廃止）。処理順「セッション交換→handle 確認→`next` 判定」は「オンボーディング必須」という不変条件の強制。未信頼の `next` は `resolveAllowedNextRedirect(rawNext, origin)` で `new URL` 解決→同一 origin→search／hash なし→**正規化後 pathname** で判定（`startsWith("/share/")` は dot-segment に脆弱）。`isProtectedRedirectPath` は `/login` を含まない。判断者: Rui＋ChatGPTレビュー4点をClaudeが採用。【資料】【コード】（`scripts/auth-callback-route.test.cjs` 8件）

### 監査C・D・E（デッドコード・重複・ハードコード）

20. **監査C**：C-006〜C-027（22件）は T6（`ad84b47`）の `lib/mock-db.ts`・`lib/supabase-db.ts` 削除で解消済み（記録のみ）。MC-4 は「将来機能用に保持」とした `page`・`sharedAt`・`hasAnyApiKey` も ChatGPT の指摘で全件削除へ方針転換（将来 state を足し直す）。判断者: Rui。【資料】【コード】（mock-db 系・`callAnthropicMessages` は存在しない）
21. **監査D（MD-3）**：機械的共通化10件を5グループで実施。判断: ①`lib/lore/consolidationLlm.ts`（server-only）と `consolidation.ts`（client からも参照）を分離、`server-only` パッケージの新規導入は却下、②notes／message-notes／drafts の CRUD 共通化（`lib/threadResourceCrud.ts`）と Cookie 転記漏れの是正を同梱、③RLS が保護済みのため `.eq("user_id", …)` 追加は defense-in-depth（脆弱性修正ではない）、④テスト bootstrap（`scripts/testBootstrap.cjs`）→ formatter（`lib/formatters.ts`）の順。判断者: ChatGPTレビューをClaudeが採用。【資料】【コード】（上記ファイルの存在を確認）
22. **監査E の判定基準（A二重定義／B境界契約／C手順依存、X単一箇所／Y テスト期待値／Z 外部仕様固定、A・Bで既に食い違いなら格上げ）**を CLAUDE.md へ反映。個別34件のクローズ理由は陳腐化回避のため転記しない。判断者: Rui。【資料】【コード】
23. **監査E の実施結果**：ME-1＝registry 由来型へ一本化・既定モデルの関数引数を廃止・画像ページ／Novel Check 専用 metadata・`novel-check` route に modelId allowlist（`isAllowedNovelCheckModel`。UIで絞っても Route が無検証だった境界契約の欠落）。ME-2＝`getOpenAICapability`、出力 budget を `OPENAI_RESPONSES_CONFIG`（Chat・Arena共通）と `CHAT_OPENAI_CONFIG`（Chat専用）に分離、`EXTRACT_SETTINGS_CONFIG`・`NOVEL_CHECK_CONFIG`、画像4プロバイダーは registry 不備時 fail-fast、Arena へスコープ拡大（Rui承認）。ME-3＝`lib/validationLimits.ts`。ME-4＝`CHAT_LORE_SEARCH_POLICY`。【資料】【コード】（各定数・関数の存在を確認）
    - ME-3 の個別判断：E-19（通報理由1000文字）は UI が固定5択のためクローズ、E-18b（`github_ref`）は UI 制限なしでクローズ、E-28（bulk archive 50件）は全選択で51件以上に到達可能なため対象化、E-30（タグ20文字）はサーバーの到達不能な切り詰めと UI の off-by-one を含むため挙動修正込み。handle は全大文字のみ拒否の既存契約を維持。【資料】【コード】

CLAUDE.mdに既出: 8項目（BYOK のリスク受容＋H-21C の暗号化候補順序、CSP 本番 Enforce と `CSP_REPORT_ONLY` の完全一致規則、`proxy.ts` 認証境界対応表と `next` 往復の正本、`docs/api-key-flow-inventory.md`、Gemini の `x-goog-api-key`、ハードコード監査の判定基準、`THREAD_TRASH_PURGE_DRY_RUN` と Cron の `CRON_SECRET` 共用、`storage-path-guard`／`storage-cleanup` の所在）。

## 地雷（CLAUDE.mdに載っていないもの）

1. **Next.js の fetch キャッシュが supabase-js（service role）の RPC を握る**：`global.fetch` で `cache: "no-store"` を指定しないと、同一URL・body の POST が古い応答（空配列）を返し続ける。エラーが出ない（H-29 で発生）。【資料】【コード】（`lib/supabase/admin.ts` は指定済み。**`lib/mcp-auth.ts` の `serviceRoleClient()`（`github-token-store`・`aiUsage` 利用）と `app/api/reports/route.ts` は未指定**。横展開は資料も「別チケット」のまま）
2. **SECURITY DEFINER 関数を変更する migration**：`CREATE OR REPLACE` は既存 ACL を保持するので明示 `REVOKE` が必須（同一トランザクション）。SQL Editor は `auth.uid()` が null のため本人一致の成功パスを再現できない（実ログインのブラウザか一時 test-login で検証）。不可逆 RPC の成功パスは使い捨てアカウントで検証。migration 番号は `migration_v{n}_*.sql` の連番と旧 `v{n}[文字]_migration.sql` が混在、前者の最新だけを見る。【資料】
3. **`proxy.ts` の matcher**：配列は OR 評価（広い CSP 用と認証用を混ぜない）。保護ページの個別エントリに `missing` を付けない。`config.matcher` は静的リテラルのみ。`unstable_doesMiddlewareMatch()` は method を取れない。末尾スラッシュは Next.js の308正規化が proxy より先に働き、静的な matcher 照合と実 HTTP が別レイヤーになる（308 を見て matcher を疑わず、遷移先が307になることを確認）。【資料】【コード】
4. **無条件の `await res.json()` は 401 本文変更の影響を受ける**：呼出側の棚卸しは `await res.json()` だけでなく `.then(r => r.json())` も対象にし、件数は実装セッション開始時に `git grep` で再確認する（12→15箇所、`ChatPanel.tsx` の `.then()` チェーン1箇所は grep に掛からず見落としかけた）。判定基準は「`res.json()` の前にも後にも HTTP ステータス確認が無い箇所」。【資料】
5. **個別 `git add` は削除・リネームも列挙しないと反映されない**：`middleware.ts` の削除を add し忘れ Vercel ビルドが失敗した。複数サブチケットを扱うときはコミット直前に `git status --short`・`git diff --cached --stat`。【資料】
6. **ビルド失敗（EPERM 等）の直後に再ビルドすると `.next` の不整合でルート一覧から実在ページが欠落する**（`/novel-check`・`/privacy` が消えて見えた）。異常終了したら必ず `.next` を削除してクリーンビルドし、ルート数を直近の正常ベースラインと突合する。【資料】
7. **`docs/schema.sql` の `<ADMIN_USER_ID>` プレースホルダー**：`storage_cleanup_runs` の管理者 SELECT policy は `auth.uid() = '<ADMIN_USER_ID>'::uuid`。schema.sql／migration v131 をそのまま実行しても UUID キャストで失敗するため、適用前に実際の管理者 UUID への置換が必須（本番は適用済み）。【コード】
8. **Storage の環境差**：テスト環境にバケットが無いまま同名 policy だけが残る「ゴースト policy」が過去にあった（B-04a 検証時に `docs/storage.sql` を適用して解消）。Storage を触る検証の前にバケットの存在を確認する。`generated-images` の正本設定は private・10MB・png／jpeg／webp、policy は INSERT／SELECT／DELETE の3件（`auth.uid()` ＝パス先頭セグメント）で、`docs/storage.sql` が再現用。【資料】【コード】（`docs/storage.sql` に `public=false`・`10485760`・3 mime）
9. **外部APIエラーを固定メッセージに変えるとユーザーが原因（キー無効かレート制限か）を切り分けにくくなる**。詳細文言を汎用文言へ変える変更は仕様変更として Rui の確認を取る（B-05b で承認済みのトレードオフ）。【資料】
10. **「同じ数値」と「同じ概念」を混同しない**（監査E）：Chat と Arena の OpenAI 出力 budget は Responses 側だけ共通概念。再突合の判定は先行する別チケットの変更を追跡できていないことがあるため、着手直前に実ファイルで再確認（ME-0 の「格上げ」判定が ME-1 着手時に覆った）。【資料】
11. **作業環境の癖**：Codex サンドボックスでは `rg` が使えないことがあり `git grep -F` を優先。Windows の `findstr` は UTF-8 日本語検索が不安定。Codex ログの `⋮` 省略 diff は受け入れ判断に使わない。ChatGPT の「ファイルの具体的な中身」の主張は `git grep` で裏取りしてから採用。【資料】

## 未実装・宿題

1. **H-21C**（BYOK 資格情報の任意暗号化同期・複数端末対応）: 未着手・「H-21C ロードマップ」は未作成（CC に既出）。【資料】
2. **Storage 孤児回収の本番削除モード切替（`STORAGE_CLEANUP_DRY_RUN`）**: 資料時点（2026-07-22〜）は dry-run の観察期間で、`false` への切替予定。現在の Vercel 環境変数の値は資料からは分からない。【未確認】
3. **service role クライアントの `global.fetch` no-store の横展開**（地雷1）: `lib/mcp-auth.ts`・`app/api/reports/route.ts` 等。【コード】
4. **`app/api/lore/embed`**: 既存 Embedding の DELETE 後に bulk INSERT する構造のまま（同一 folder への並行実行の競合、INSERT 失敗時の旧データ喪失）。資料は「RPC 化する別チケット」としたが、現行コードは `delete()`→`insert()`。【資料】【コード】
5. **`GET /api/lore`（記憶一覧）に `.limit()` が無い**: UI 側の選択上限（50）で bulk archive だけ対処。一覧のページネーションは判定基準A〜C に非該当として監査E は起票せず。【コード】
6. **アカウント削除の fail closed 分岐の実機検証**（他ユーザー名前空間のダミーパスを混入させる検証）: 資料時点で未実施、コードレビューのみ。【未確認】
7. **`messages` PATCH の `delete_image` と DELETE 経路の Storage 削除ロジックの重複**（`isOwnedStoragePath` の使い方）: D-04 と合わせて統合を検討とされた。現行は `app/api/messages/[id]/route.ts` が `isOwnedStoragePath` を使い、`lib/messages/delete.ts` も存在するが、統合済みかは未確認。【未確認】
8. **`/api/fetch-github` の 401 時 UI**: 呼出側（`ChatInput`・`ChatInputCentered`）は `"error" in result` の形状チェックのため安全に「GitHub取得エラー」と出るが原因不明の表示。低優先度の監査クローズにUI文言変更を混ぜない判断で未対応。【資料】
9. **handle 未設定ユーザーがオンボーディング完了後に元の `next` へ戻る流れ**（MB-e の3案目）: 将来のオンボーディング強化チケットへ。【資料】
10. **`RESERVED_HANDLES`（`app/api/profile/route.ts`）に対応する UI 側チェックの有無**: ME-3A で発見、未確認のまま。【コード】（サーバー側の Set は存在、UI 側は未確認）
11. **Next 16 化で見つかった軽微な警告**（`/settings` の `value` が null になる controlled／uncontrolled 警告、`outputFileTracingRoot` 未設定によるワークスペースルート推定警告）: 別チケットの扱いで未追跡。現状は【未確認】。
12. **以下は詳細を `docs/internal/` で扱う**（項目名・状態のみ）: 本番管理者UUIDが過去コミットに残る件（履歴書き換えの要否は未決）／テスト環境の OAuth クライアント共用／テスト・本番の RLS policy 構成差／`docs/schema.sql` の `delete_current_user` ACL記載。→ `docs/internal/internal-notes-security-1.md`

## 矛盾・要照合

1. **`/api/reports` の matcher**: 資料（B最終 MB-c-1 の表）と CC の表は `/api/reports`・GitHub callback・Cron・CSP report を一括で「matcher ✕」とする。現行 `config.matcher` が除外するのは `mcp`・GitHub callback（`mobile-callback` を含む）・`cron/*`・`csp-report` のみで、**`reports` は matcher を通過**し `shouldRunSupabaseSessionCheck` だけが false【コード】→ corrections #35。
2. **`docs/schema.sql` の `delete_current_user` に revoke／grant が無い**: A最終は「`docs/schema.sql` を migration と同内容に置き換えた」と記録するが、現行 schema.sql（アカウント削除RPCの節）は関数本体だけで `revoke`／`grant` が見当たらない。`docs/applied/migration_v130_delete_current_user_hardening.sql` には両方ある。本番 DB の実 ACL は【未確認】（schema.sql が canonical である建前と食い違う）。詳細は internal。
3. **B-02 の対象関数の現状**: A最終は `consolidate_dreaming_batch_multi`／`rollback_dreaming_batch_multi` を強化したと記録。v199 で旧 `consolidate_dreaming_batch_multi` は削除され（`consolidate_dreaming_batch_multi_by_project` に置換。`security invoker`・revoke→grant authenticated・ownership guard 維持）、`rollback_dreaming_batch_multi` だけが現役で同ガードを保つ【コード】。資料の「現行は両関数」とは読めない。
4. **「Route Handler Cookie 書き戻し方式の横断監査」は未着手**（B最終の「残るチケット」）と書かれているが、現行コードに `res as never` は0件で、`album`・`arena`・`image-gen` も `requireRouteUser`／`getOptionalRouteUser` を使う【コード】。いつ解消したかは未特定（後続のリファクタで `lib/supabase/route-auth.ts` に集約されたとみられるが【未確認】）。
5. **監査IDの衝突**: 監査A内の `D-02`（Storage guard）＝監査D の `D-04`。監査A の `B-01`〜`B-05` ≠ 監査B の `[B-01]`〜`[B-05]`（`MB-` で別採番）。A更新版の `C-0x` ≠ 監査C の `C-0xx`。資料内の ID は文脈でどの監査か読み分ける。監査D の D-06（MCP token の SHA-256 重複）は `lib/mcp-token-hash.ts` で解消済みとみられる【コード】。
6. **A最終の見出しの日付**: 節見出し「現在の進捗（2026-07-22時点）」「次セッションで最初にやること」は B-05b 完了後も当時の状態（dry-run・Report-Only の観察待ち）のまま。現状（CSP 本番 Enforce）は CC が正【コード】。
7. **CC の「CSP 切替は v178」**: CC の履歴表の v178 は migration（分岐復元RPC）で、引き継ぎ資料の v178 は別系列。どちらを指すか資料から確定できない【未確認】。
8. **inventory の分類**（直さない）: 監査C＝デッドコード、D＝重複、E＝ハードコードで認証・セキュリティ以外が主。C・D は横断（`operations`／`history`）、E は `models-and-pricing` 等に近い。A最終・B最終の運用ルール節の参照先 `…T12終了.md`（inventory は C 扱い）に原文があるとみられる。
9. **ME-0 の判定は先行変更を追跡できていない**（資料自身が記録）: E-11・E-12（Claude部分）の解消元は D-03 ではなく `95a6283`（Claude Opus 5 対応、チケット番号採番前）。E最終の「出所不明コミット特定」節で訂正済み。`resolveClaudeRequestOverrides` は現行 `lib/modelRegistry.ts` に存在【コード】。

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| KabeHub_監査A_2026-07-13_更新版.md | B | 全文（8.9KB） |
| KabeHub_監査A対応ロードマップ_B-05b完了.md（A最終） | A | 冒頭〜進捗・B-01／middleware／B-02／delete_current_user／B-04a／B-04b／B-05系・地雷表・残チケット・次セッション節を本文まで。**モデル追加チケット節は見出しのみ**。T1〜T12 は別ファイル（C扱い）で未読 |
| KabeHub_監査B対応ロードマップ_MB-e完了.md（B最終） | B | 冒頭・MB-a2・a3・b・c・d・e・地雷表・運用ルールを読んだ。MB-a1 の検証手順・MB-b の確認ケース・MB-a2 の行番号一覧は軽読 |
| KabeHub_監査C対応ロードマップ_MC-4完了.md（C最終） | B | 冒頭・MC-0再突合・MC-4の判断・次のアクションを読んだ。MC-2・MC-3 の実装詳細は見出しと進捗要約のみ |
| KabeHub_監査D対応ロードマップ_MD-3_全完了.md（D最終） | B | 冒頭・グループ分け・グループ1／2／4／5 の対象と事前確認・次のアクション・開発環境メモ。**グループ3は本文が「既存記載のまま」で内容なし**。実装内容・検証内容は軽読 |
| KabeHub_監査Eロードマップ_E完了.md（E最終） | B | 冒頭・判定基準・チケット一覧・ME-1／2／3・ME-0 判定一覧・出所不明コミット特定・開発環境メモ。ME-4 の再突合・実装、ME-5 の反映内容は見出しのみ |
| docs/_reorg の方針書・inventory・chat-core.md・claude-md-corrections.md | — | 指定箇所のみ |
| リポジトリ実ファイル（コード照合用） | — | `proxy.ts`・`lib/proxy-paths.ts`・`app/auth/callback/route.ts`・`app/api/account/route.ts`・`app/api/cron/storage-cleanup/route.ts`・`lib/supabase/admin.ts`・`lib/storage-path-guard.ts`・`lib/validationLimits.ts`・`docs/schema.sql`（該当関数）・`docs/storage.sql`・`.env.local.example`・`vercel.json` を grep／部分読み |

読まなかった中間版（C扱い）: 監査A 18本、B 6本、C 3本、D 10本、E 8本。`docs/audit/full-audit-a〜e-2026-07-13.md`（指摘の原本）も未読で、指摘の詳細は A更新版と各最終版の記述による。`KabeHub_引き継ぎ資料_全体監査A-I完了_2026-07-13.md` は F〜I と重なるため B7 に委ねた。
