# 抽出メモ: auth-and-security（2/3：監査F〜I・総括・MH-5b・MH-6）（①-2）

作成: 2026-11-25／担当: B7／対象: 監査F（エラーハンドリング）・G（ログとセンシティブ情報）・H（TODO／文書と実装の一致）・I（依存）と総括、`docs/audit/` の MH-5b・MH-6（MS-1 は参考のみ）。
タグ: 【資料】【コード】（実ファイルを grep で確認）【未確認】。ID は必ず「監査F: F-0xx」のように監査名を前に付ける（チケットは `MF-`／`MG-`／`MH-`／`MS-`）。
略称: F最終＝`KabeHub_監査F対応ロードマップ_全完了.md`、G最終＝`…監査G…_全完了.md`、HI＝`KabeHub_監査H_I対応_実装方針_引き継ぎ資料_v2_2_2026-08-09.md`、総括＝`KabeHub_監査対応A-I_MH-MS総括引き継ぎ資料_2026-08-16更新版.md`、CC＝CLAUDE.md。B6 の `auth-and-security-1.md` に既出の事項は書かない。
**公開リポジトリ向けの注意**: 未修正・未確定の弱点は項目名と状態だけ書き、詳細は `docs/internal/internal-notes-security-2.md`（gitignore）に分けた。

## 確定した判断

判断者は、資料が「Rui の決定」と明記するものだけ「Rui」と書く。それ以外は「ChatGPTレビューをClaudeが採用」または「不明」。

### 監査F（エラーハンドリング）

1. **監査Fには監査E の判定基準を流用せず、専用基準を置く**（監査Fは修正すると必ず実行時の挙動が変わるため）。対象化＝P1 書き込み系の黙殺／P2 DB 失敗と「データなし」の同一視／P3 横展開で集約可。除外＝Q1 意図が明示済み／Q2 別チケットで解消済み／Q3 構造的に実害なし。格上げ＝P1 かつ「保存されていないのに成功と表示」が本番で起こりうる場合。軸は3つ（認証 `getUser()` の `error` 未確認／Supabase result の `error` 未確認／catch の握りつぶし）。軸3は影響の大小で MF-5a（UI 通知）と MF-5b（コメントで契約明示）に二分。判断者: 不明（MF-0 で策定、「完了後に CLAUDE.md へ反映を検討」とされた）。出典: F最終。【資料】【コード】（CC に監査F の基準は無い。監査E の基準だけが反映されている）
2. **`requireRouteUser()`／`getOptionalRouteUser()`（`lib/supabase/route-auth.ts`）への集約（MF-1）**：`authError || !user` は 401（本文 `{"error":"Unauthorized"}`）に正規化。DB／Auth の障害を未ログインと同一視する点は、監査F が「同じにするか区別するか決める」ことを求めたに留まり、クライアントが 401 を一律ログイン誘導として扱うため実害なし（Q3）として受容。`explore`・`reports` は匿名を許す Route なので `requireRouteUser` を当てると匿名閲覧・匿名通報が壊れるため、`user: User | null` を返す別ヘルパー。クライアント側の共通ヘルパーは `lib/supabase/client-auth.ts`（当初案の名前 `getCurrentUser` は「エラーでも匿名扱いにする best-effort」が名前で分かるよう変更）。判断者: ChatGPTレビューをClaudeが採用。【資料】【コード】（`requireRouteUser`・`getOptionalRouteUser`・`client-auth.ts` が存在、`explore`・`reports` は `getOptionalRouteUser`）
3. **「Route Handler の Cookie 書き戻し横断監査」（監査B 側で未採番だったチケット）は MF-1 に統合してクローズ**。判断者: Rui。実調査で「Cookie 受け皿を宣言しつつ別オブジェクトを返してセッション更新 Cookie を捨てる」パターンが 24 ファイル・32 箇所あり、MF-1 は全 return を finalizer 経由にする作業になった。→ B6 `auth-and-security-1.md` 矛盾4 の解消元。【資料】【コード】（`as never` は0件、`NextResponse.next()` は匿名公開の `app/api/share/[token]/route.ts` のみ）
4. **MF-1 の「完了」判定は訂正された**: MF-2 の方針レビューで「`lore/like`・`lore/dreaming-batch` が未移行」と指摘され、`git grep -L`／`-l` で全量を取り直すと 14 ファイル（Pattern A: 受け皿宣言＋別オブジェクト返却 11、Pattern B: 受け皿をインライン生成して破棄 3）の移行漏れが判明。以後、完了報告は「対象ファイル数を `git grep` の積集合で数えた一覧」と突き合わせて出す。認証より前に置かれた API キー不足の 400（`batch-train`・`consolidate/merge`・`consolidate/preview`・`dreaming-batch` の4本）は、認証との優先順位を変えないため `NextResponse.json` のまま維持。`chat/route.ts` は SSE・`waitUntil` 絡みで延期。判断者: ChatGPTレビューをClaudeが採用。【資料】【コード】（`chat/route.ts` は現在 `requireRouteUser` を使用 → 矛盾5）
5. **MF-2（読み取り系の error 確認）の契約は Route ごとに分ける**: `explore` はベストエフォート継続＋warn、`search` は 500 に統一。監査F: F-008 は3方向に分割（`chat/route.ts` の画像取得は監査D の D-09 のヘルパー化で Q2 クローズ、`album` の署名 URL は失敗した画像だけ `signedUrl: null`、`MessageBubble` の署名 URL は MF-5b へ）。判断者: 不明。【資料】【未確認】
6. **MF-3（書き込み系 error 確認・補償操作）**: 補償 DELETE の結果確認と `increment_fork_count` の戻り値確認を追加。Lore の手動マージは複数ステップの補償をやめ、単一トランザクションの RPC（v177 `merge_user_edited_lore_pair`、現行は `…_by_project`）へ。検討中に原監査になかった2件を MF-6a・MF-6b として正式チケット化。判断者: 不明。詳細は別資料（未読）。【資料】【コード】
7. **MF-4（`lib/mcp-auth.ts` の `last_used_at` 更新）**: ベストエフォート契約をコメントで明示し、ログを構造化形式に統一（トークン照会の失敗＝主処理なので error、更新失敗＝warn。戻り値・呼出元は無変更）。判断者: 不明。【資料】【コード】
8. **MF-5a・MF-5b**: `components/Toast.tsx`（Toast Provider＋`useToast`）を新設し、楽観的更新後に API が失敗する操作（スレッド削除・メッセージ削除・分岐復元・公開設定など）は rollback＋通知（入力復元はしない）。`handleSaveShare` は連打対策。MF-5b の22箇所は19箇所がコメント追加のみ、3箇所（`Sidebar` の `handleSaveFolderSettings`・`MessageBubble` の署名 URL・`NovelSettingsPane` の `fetchLoreChunks`）は実害があり最小限の挙動修正。判断者: 不明。【資料】【コード】
9. **MF-6a・MF-6b の RPC 化規約**（`restore_message_branch`＝v178、`apply_branch_edit`＝v179）: `security invoker`（RLS を効かせる）、`set search_path = ''`、同一 thread 内の同時実行を直列化するため **`threads` 行を先に `for update` でロック**（前例のない新規パターンで Rui が採用）、本人確認 `42501`、入力不正 `P0001`（→400）、DB 内部不整合 `XX000`（→500）、HTTP 変換は固定文言＋`[db-operation-failed]` 形式の構造化ログのみ（DB の生エラーは出さない）。`restore` は「activate 0件でも成功扱い」を事前確認＋事後 assert で解消。`apply_branch_edit` は `RETURNS TABLE` 列名と実列名の衝突を `new_` 接頭辞で回避、採番順序は現行 route.ts（archive 後に採番）を維持、base message 不在は 404→400 に契約変更（呼出側にステータス別分岐なし）、commit 後の履歴取得が失敗したら 500＋フロントは messages を再 GET して同期（rollback しない）。両チケットとも migration と Route 切替は密結合のため1コミット。判断者: Rui（threads 先行ロック・1コミット）＋ChatGPTレビューをClaudeが採用。【資料】【コード】（両関数とも schema に `security invoker`・revoke→grant authenticated）

### 監査G（ログとセンシティブ情報）

10. **`lib/logger.ts` の設計**（MG-1）：型だけでは変数経由の余分なプロパティ（`userId` 等）を防げないため、**logger 内部で許可フィールドだけを pick して新しいオブジェクトを再構築してから console へ渡す（allow-list 再構築）**。未指定のキーは conditional spread で出力オブジェクトに含めない（`undefined` キーも残さない）、`errorCode`（DB／外部 API のコード）と `errorType`（例外名）を分離、`ExternalApiParams` に `errorCode` を追加。関数は `dbOperationFailed`／`dbOperationFailedBestEffort`／`dbCompensationFailed`／`externalApiFailed`／`bestEffortFailed`／`securityGuardRejected`／`claudeRefusal`／`geminiAbnormalFinish`。回帰テストで「余分なキーが出ない・未指定時はキー自体が無い」まで固定。判断者: ChatGPTレビューをClaudeが採用。出典: G最終。【資料】【コード】（`lib/logger.ts` に上記の export）
11. **監査G のスコープ確定（L1〜L7）**: 脅威モデルは Vercel Hobby・ランタイムログ保持1時間・閲覧者は Rui のみ・外部ドレインなし。共通 logger は**サーバー側（`app/api/**` と server の `lib/**`）のみ**で、`"use client"` の page／component のブラウザ console は対象外（利用者本人しか見ないため脅威モデルが異なる）。相関 ID は非導入。テストコードの console（G-007）は対象外。H-06・H-33 は監査H 側で処理。判断者: 不明。【資料】
12. **監査G: G-004（ログに `userId` 等が出る）の是正**: `album`・`messages/[id]` の画像パス検査ログは識別子を除去して `securityGuardRejected` へ。`chat/route.ts` のエラーパスの assistant 保存失敗ログは `saveAssistantMessage` との二重ログなので logger 化せず削除。MG-4 で `lib/github.ts` の成功時 status 行を削除、`[waitUntil]` の成功ログは維持、provider API エラーを `externalApiFailed` に統一。判断者: ChatGPTレビューをClaudeが採用。【資料】【コード】
13. **監査G の G-001〜G-003 は監査F 対応の副産物として大部分が解消済みだった**。console 呼び出しは監査時点 127→再突合時 252 へ増加。【資料】

### 監査H・I（文書と実装の一致・依存）

14. **MH のスコープ原則は「コメント・文書と実装の一致」に限る。未実装機能の実装はしない**。着手順は MH-3→MH-4→MH-5a→MH-5b→MH-6→**MH-1（CLAUDE.md 全面再生成）を最後**（先にやると後続の変更で再び陳腐化するため）→MH-2（README 日英同期）。H-06（`markMessageLearnedBestEffort` のコメント）は契約の正式確定のみで**ログ追加はしない**（機能変更になる）。`lore_embeddings.source_message_id` は UNIQUE ではなく（1メッセージ→複数メモリ行を許容する設計）、重複防止は別チケット。H-33（Pinned Files の UI 通知）は記述訂正のみ。判断者: ChatGPTレビューをClaudeが採用（MH-1 を最後に回す、ログ追加をしない、等）。出典: HI §0・§3。【資料】【コード】（`markMessageLearnedBestEffort` は `lib/lore/batchTrain.ts` に存在）
15. **H-08（`uuid-ossp`）と H-09（旧いいねカウンター RPC）**: schema の整理と live DB の変更は分離する。`uuid-ossp` は canonical schema から削除し、live DB の `DROP EXTENSION` は別判断（今回は行わず）。旧 RPC `increment_likes_count`／`decrement_likes_count` は呼び出し0件を確認して専用 migration v180（`begin; drop function if exists …; commit`、`CASCADE` 不使用）で削除、`docs/applied/README.md` への追記は見送り（一覧が v177〜v179 を未掲載のまま「適用済み一覧」の体裁と矛盾するため）。判断者: ChatGPTレビューをClaudeが採用。【資料】【コード】（`migration_v180_drop_legacy_counter_rpcs.sql` あり、schema に旧関数なし）
16. **証跡の置き場の原則**: `docs/applied/` は凍結（後追い追記しない）、事後の確認記録は `docs/audit/` に新規ファイルで集約（MH-5b・MH-6・MS-1 が第1号）。DB など設計と実測が乖離しうる対象は、**canonical 定義と production の実測値を区別し、証跡は実測を優先する**。判断者: 不明。【資料】【コード】
17. **H-10・H-11 は DB の read-only 確認でクローズ**（MH-5b）。H-10 は旧 `messages` policy 2本が本番に存在しないことを確認、混入経路は当時のログが無く特定不能のまま追加調査せず、再発検知機構も導入しない。H-11 は公開スレッドの `thread_tags` 所有者不一致行が0件で、UI の目視確認を DB 照会で代替したとは主張しない。→ 詳細・現状との差は internal。【資料】
18. **H-40（MCP サーバーの実装状況）**: 別 repo `kabehub/kabehub-mcp` の実在を Rui が提示し、Claude の「web 検索で見つからないので却下」を訂正。教訓: ChatGPT の事実主張は実ファイル grep か直接取得で確認し、**検証できない場合の結論は「却下」ではなく「保留・要ユーザー確認」**（「検索で見つからない」は不在の証明にならない）。判断者: Rui。【資料】
19. **D 群（未実装機能）9件の出口**（2026-08-13 の最終仕分け）: H-01（CSP Enforce）クローズ、H-46（GitHub disconnect 時の revoke）は個別実装済み（CC 訂正候補 #30 既出）、H-24（pg_bigm 検索）はバックログ（優先度「高」維持）、H-23（PWA／Capacitor）・H-45（MCP 拡張ツール）・H-33（Pinned Files UI 通知）は将来トラック、H-42（口述筆記）・H-43（非同期整合性チェック）は起票せずバックログ、H-22（マネタイズ）は Phase 4 トラック。**H-01・H-23・H-24・H-45・H-46 の「個別ロードマップ」は旧資料に作られた形跡がない（未作成）**。判断者: Rui（08-13 のセッション。出典の `KabeHub_引き継ぎ資料_2026-08-13_v2.md` は本メモでは未読）。【資料】
20. **監査 I と MS-1（npm）**: MH-6 で未使用依存 `rehype-highlight`（と専用の推移依存5本）を削除。実測は vulnerable package 5件・advisory 7件（MH-0 の「4パッケージ5件」とはカウント単位が違いうる）。MS-1a は `next` を `16.2.11`→`16.3.0` の1行のみ変更（`npm audit fix` 不使用）、MS-1b は `uuid` を `14` ではなく `11.1.1`（脆弱範囲は `<11.1.1`、CommonJS 廃止は v12 以降のため意図的に上げない）にし `@types/uuid` を削除。`npm audit` は `fixAvailable` だけでなく `range` も確認、バージョン可否は npm レジストリで確認。判断者: ChatGPTレビューをClaudeが採用。【資料】【コード】（現行 `next 16.4.6`・`uuid ^11.1.1`、lock の `postcss 8.5.23`・`nanoid 3.3.18`・`sharp 0.35.5`、`rehype-highlight` は無し。`npm audit` の再実行はしていない【未確認】）
21. **総括の位置づけ**: 各シリーズの原文を一本化した git 非管理の引き継ぎ資料（先頭 §0〜§4 が横断サマリー、付録A〜H が原文再掲）。2026-08-16 の更新で CSP Enforce 切替・D 群仕分け・`app/test-login/` の扱い（`.gitignore` で追跡対象外、2026-08-15 確定）を更新。判断者: 不明。【資料】【コード】（`.gitignore` に `app/test-login/`、現行リポジトリに該当ディレクトリなし）
22. **全体監査 A〜I（2026-07-13）の実施方式**: Codex の読み取り専用静的監査を9項目に分け「1項目＝1レポート＝1コミット」で実施（コード変更なし、ChatGPT レビューは省略）。指示書の開始時チェックに「`node_modules/next/package.json` が無ければ停止して報告」を追加（`node_modules` 破損で誤った build 失敗が出たため）。判断者: 不明。【資料】

CLAUDE.mdに既出: 5項目（`lib/logger.ts` と Toast の所在、`requireRouteUser`／`getOptionalRouteUser`、v178・v179 の RPC 履歴、`docs/audit/` の MH-5b・MH-6、`docs/applied/` を再実行しない規則）。

## 地雷（CLAUDE.mdに載っていないもの）

1. **「Cookie 受け皿を宣言して別オブジェクトを返す」静かなバグ**: `new NextResponse()` や `NextResponse.next()` を Cookie の書き込み先として宣言しつつ、全 return が別の `NextResponse.json(...)` だと、Supabase のセッション更新 Cookie がレスポンスに乗らず捨てられる。`as never` と違い型エラーにならず気づきにくい（24 ファイル・32 箇所で発見）。新しい Route で認証するなら `requireRouteUser()`（匿名を許す Route は `getOptionalRouteUser()`）を必ず使い、認証成功後の全 return を `finalizeJson`／`finalizeResponse` 経由にする。認証より前に置く検証（API キー不足の 400 等）は優先順位を変えない。【資料】【コード】
2. **移行漏れの全量確認は `git grep -L`（一致しないファイル）と `-l`（一致するファイル）の両方を取って積集合を目視する**。1行マッチの `git grep -n` は、`error: authError` が別行にある複数行 destructure を見落とす（`fetch-github/route.ts` が例）。【資料】
3. **RPC 化チケットの共通規約**（判断9 の補足）: `threads` 行ロックは `set_message_number()`（trigger 基準の採番）を使う通常の message INSERT 経路とは直列化されない既知の制約。`RETURNS TABLE` の出力列名は `plpgsql.variable_conflict = error` で実列名と衝突するため接頭辞を付ける。RPC の 500 を返す条件（`XX000`）と 400 を返す条件（`P0001`）は、事前確認を済ませた後の内部不整合かユーザー入力起因かで分ける。検証はローカル PGlite（INSERT 失敗を trigger で注入して全体ロールバックを確認）とテスト Supabase の実データの両方で行う。【資料】
4. **logger への移行・ログ棚卸しの落とし穴**: タグ文字列（`[db-operation-failed]` 等）だけで grep すると `[db-insert-failed]` 等の表記ゆれを見落とす／`error.message` の grep は `cleanupError.message` のような変数名のゆれを見落とす／`"use client"` の検索はシングルクォート表記（`'use client'`）も併用する。`console.error`／`console.warn` という表層ではなく、失敗後の制御フロー（primary／best-effort／compensation／security-guard）を呼び出し元ファイルまたいで読んで分類する（`consumeOAuthState()` は warn＋`return null` の体裁だが呼出元が OAuth 全体を中断する fail-closed）。severity を変えるときは、その箇所を検証するテストが `console.warn` を monkey-patch していないか確認する。ヘルパーと caller が両方ログを出す構造は二重ログに注意（機械的に両方 logger 化しない）。【資料】
5. **件数・行番号は固定値として記録しない**（監査D・H・G で繰り返し）: 着手時に `git grep` で再集計する。MF-0 の見積り（F-001 は62箇所・単一パターン）は MF-1 実調査で覆り、「MF-1 完了」判定も後の調査で覆った。方針資料の記述自体も陳腐化する（MG-4 で「github-tool-loop の3箇所は既に NODE_ENV 条件下」という確定方針の記述が誤りと判明）。【資料】
6. **DB スキーマの証跡は production の実測を優先する**: canonical（`docs/schema.sql`）の形を根拠に「この policy はこうなっているはず」と主張した ChatGPT の指摘が、production の実際の構成（MH-5b）と乖離していた。`schema.sql` 冒頭には「2026-07-10 に本番を直接照会して完全突き合わせ済み」とあるが、MH-5b 時点の本番と一致しない箇所がある（矛盾7）。【資料】【コード】
7. **migration のステータス表記は適用後に更新し忘れやすい**: v180 のコミット時に schema.sql ヘッダーを「DB 未適用」に更新し、その後テスト・本番へ適用したのに「適用済み」へ戻していなかった（MH-5b で発見・訂正）。v177〜v179 も同様の「DB 未適用」表記が残っていた（MH-1 で schema.sql と migration 本体の両方を訂正）。現行 schema.sql 冒頭の v206・v207 は「適用済み」表記。【資料】【コード】
8. **`docs/applied/` は凍結**: 適用済み migration を後から書き換えない。事後の確認記録は `docs/audit/` に新規ファイルとして置く（CC の「`docs/applied/` へ移動し再実行しない」と整合するが、「凍結＋証跡は audit」という規則は CC に無い）。【資料】
9. **開発環境の事故（Windows／Codex）**: `npm install` が途中で止まると `node_modules/next` が不完全になり tsc／build／テストが誤って全滅する（`rmdir /s /q node_modules` → `npm install`）。プロジェクト外で `npx tsc` を実行すると別物の `tsc` パッケージが入りかける。一時 worktree・junction の片付けで `node_modules` が空になった事例があり、未追跡の `app/test-login/` の有無で静的生成ページ数のベースラインが 27→28 に変わる。Windows の cmd には `sed` が無い。プロジェクト外の親ディレクトリの `package-lock.json` を Next.js が拾い、サンドボックスで build が `EPERM` になることがある（`outputFileTracingRoot` で警告解消）。【資料】
10. **Codex の出力検証**: ログの `⋮`・`+N lines`・FAIL 表記は生ログで確認し、貼り付けの行欠落や一部テストの `ok` 行の欠落は実ファイル全文・個別再実行で確かめる。技術データ（バージョン・モデル ID）の正本は package.json・`lib/modelRegistry.ts` で、README の言語版の新旧では判断しない。【資料】

## 未実装・宿題

1. **`app/api/chat/route.ts` の GitHub Tool Loop の best-effort catch（MG-FU1）**: production は `errorType` のみ出力するが、development では生の `err` を `console.error` に出し、`logger.bestEffortFailed` へ未移行。同ファイルの RAG memory の catch は移行済みで不統一。優先度低、着手可否は未判断（2026-08-16 時点でも未着手）。【コード】
2. **`README.en.md` の Contributing 節に完了済み機能の文言**（`UI design for threaded conversation trees (Branching Mode)`）が残る。【コード】（現行にも存在）
3. **D 群の個別ロードマップ（CSP Enforce 運用・PWA／Capacitor・pg_bigm 検索・MCP 拡張・GitHub revoke）は旧資料に作られた形跡がない（未作成）**。CC は「個別ロードマップへ移管済み」と書くが、実体は `docs/` にも旧フォルダにも無い。H-24（pg_bigm）のみ優先度「高」のバックログ。【未確認】
4. **H-33（Pinned Files 失敗時の UI 通知）は未実装のまま**（development 限定の console 出力に変わっただけ）。CC の「既知の課題」に既出。【コード】
5. **`logger` の対象外（クライアントの console）は件数を固定せず着手時に再集計**する運用。クライアント側 console の統一は将来も対象外。【資料】
6. **Disposition 表（監査H・I の全75件の最終処理記録）の置き場**: 資料は「新規 git 管理ファイル `KabeHub_監査H_I対応_実装方針_引き継ぎ資料.md`（リポジトリルート、版番号なし）に格納」と書く。現行リポジトリに該当ファイルは無い（矛盾3）。75件の処理結果を再編後のどこへ移すか（`docs/history`・backlog 等）が未決。【資料】【コード】
7. **MS-1 後の現状確認**: 総括 §4 は「主資料の技術スタック表が Next 16.3.0 を反映しているか確認」とした。現行 CC は `Next.js 16.4.6` で解消。`npm audit` の現在値は【未確認】。
8. **`messages`・`threads` 等の RLS 構成の本番実測と canonical の再突合**: 詳細は `docs/internal/internal-notes-security-2.md`（公開しない）。

## 矛盾・要照合

1. **B-05b／H-21 の状態（総括 vs 監査A最終）**: 総括 §0・§3・§4（2026-08-09 作成・08-16 更新）は「監査A: B-05b／H-21（API キー保存方式）は未着手」とし、付録A は B-05a 完了時点の版を再掲して B-05b の節を持たない。一方、A最終（2026-07-25）は B-05b 完了・B-05 全体クローズと記録し、CC も H-21 をリスク受容でクローズ済みと書く（B6 `auth-and-security-1.md` 判断11）。総括は A最終 を取り込んでいない（付録A が古い）。正は A最終・CC【コード】。
2. **2026-07-13 の「npm audit 0件」の説明**: `全体監査A-I完了`（07-13）は「依存先の下流で自然にパッチが当たった可能性」と推測するが、A更新版（同日）は「Codex の静的監査環境の `node_modules/next` が不完全だったため誤って 0 件を返した」と原因を特定していた。後者が正（同日の `node_modules` 破損の記録とも一致）。MH-6 の実測は 5 package・7 advisory（記録 2026-08-09）。
3. **Disposition 表ファイルが存在しない**: 総括・HI は「`KabeHub_監査H_I対応_実装方針_引き継ぎ資料.md` をリポジトリルートに git 管理で作成した」と書くが、`git ls-files` にもルートにも無い（B6 で見たとおり総括も「git 非管理が妥当」と記述）。作られたが後に消えたのか、コミットされなかったのかは資料から確定できない【未確認】。
4. **監査の件数の揺れ**: 監査 I は `全体監査A-I完了` では「未使用1件」、HI・総括では「I-1・I-2の2件」。監査F は「実指摘30＋参考5」と「35件」が併存。ID を引用するときは必ず監査名を付ける。
5. **MF-1 の延期分（`chat/route.ts`）**: F最終の MF-1 は `chat/route.ts` を「SSE・`waitUntil` 絡みの専用設計が必要」として延期のまま完了扱いにした。現行 `app/api/chat/route.ts` は `requireRouteUser` を import して使い、`as never` は0件【コード】。いつ移行されたか（MF-6b の後か）は資料に記述なし。F最終の「残る延期範囲は未検討」という記述は現状と合わない可能性が高い。
6. **B6 の矛盾7（CC の「CSP 切替は v178」）の解消**: 総括・HI は「CSP Enforce の切替は引き継ぎ資料 v178（2026-08-13 のセッション）で Vercel 環境変数を確認してクローズ」と記録。CC の履歴表の v178 は migration（分岐復元 RPC）で別系列なので、CC の BYOK 節の「v178」は「引き継ぎ資料 v178（2026-08-13）」を指すと読める【資料】。CC の記述に版の種類を補うと誤読を防げる（corrections に追記）。
7. **`docs/schema.sql` の「本番と完全突き合わせ済み」と MH-5b**: schema.sql 冒頭は「2026-07-10 に本番を直接照会して完全突き合わせを実施。差分はすべて反映済み」と書く。MH-5b（2026-08-09、production）は `messages` の policy が canonical（4本＋公開 SELECT）ではなく「単一 ALL＋公開 SELECT」だったと記録し、B-01 の preflight（2026-07-19）で既知の環境差として扱った。冒頭の記述はその後の環境差を反映していない。詳細は internal。
8. **分類の疑問（直さない）**: 総括は付録で A〜H の原文を再掲し、A〜E は個別最終版と重なる（付録A は A最終 より古い）。inventory は08-09版 C・08-16版 B と分けるが、付録の大半は他の B 扱い資料と重複する。F・G・H の付録と各最終版が同一かは未照合。

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| KabeHub_監査F対応ロードマップ_全完了.md（139KB） | B | 冒頭・判定基準・チケット表・MF-1 進捗／Commit 5・MF-2・地雷表・MF-0 再突合・軸3 分類・MF-6a・6b・開発環境メモを本文まで。MF-1 Commit 1〜4、MF-3〜MF-5b の実装詳細は見出し・表のみ |
| KabeHub_監査G対応ロードマップ_全完了.md（56KB） | B | §0〜§9。§10〜§13 の実装詳細は見出しのみ |
| KabeHub_監査H_I対応_実装方針_引き継ぎ資料_v2_2_2026-08-09.md（75KB） | B | §0〜§3・MH-4・MH-5a・§4・§7・§8・§10。MH-3・MH-5b・MH-1・MH-2 の詳細と §9 は見出しと要点のみ |
| KabeHub_監査対応A-I_MH-MS総括引き継ぎ資料_2026-08-16更新版.md（625KB） | B | §0〜§4（先頭110行）と見出し一覧。**付録A〜H（約4,400行）は原文再掲のため読まず**、個別最終版で代えた |
| KabeHub_引き継ぎ資料_全体監査A-I完了_2026-07-13.md | B | 全文（9.7KB） |
| docs/audit/mh-5b-db-verification-2026-08-09.md | — | 全文（2.2KB） |
| docs/audit/mh-6-npm-audit-2026-08-09.md | — | 全文（7.7KB） |
| docs/audit/ms-1-npm-vuln-remediation-2026-08-09.md（45KB） | — | 見出しと冒頭のみ（生出力が大半。要点は HI §8） |
| リポジトリ実ファイル | — | `lib/supabase/route-auth.ts`・`lib/logger.ts`・`lib/mcp-auth.ts`・`app/api/chat/route.ts`・`docs/schema.sql`・`package.json`／lock・`.gitignore`・`README.en.md` を grep／部分読み |

読まなかった旧資料（C 扱い・中間版）: 監査F 15本・G 3本・H_I 9本・総括 08-09 版。`docs/audit/full-audit-f〜i-2026-07-13.md`（原本）と B 扱いの `MF-3実装方針（MF-3完了）`・`MF-5a実装方針v3`・`MG実装方針v3`・`MF-2a着手前`・`MF-2実装方針確定`・`実装方針資料.txt`・`引き継ぎ資料_2026-08-13_v2` も未読（F・G の最終版が内容を含むため）。30KB に収めるため削った項目: MF-1 Commit 1〜4 のファイル一覧、MF-5a の handler 単位の rollback 設計、H-40 の裏取り経緯の詳細。
