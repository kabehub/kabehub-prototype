# 抽出メモ: cross-operations（operations／runbooks の素材）（①-2）

作成: 2026-11-26／担当: B10-2／対象: 運用手順・環境・デプロイ・Cron・Git／Windows 運用・Codex／Claude／ChatGPT の作業ルール・トラブル対応・runbook 候補。出典は運用知見アーカイブ v178-v191（A）、引き継ぎ資料 v194 の運用節、Supabase 法人移行 トラブルシューティング記録（A）、npm audit 対応・ノート PC 同期の引き継ぎ（B）、統合バックログ v3（運用項目）、リポジトリの設定ファイル（`package.json`・`vercel.json`・`.env.local.example`・`.gitignore`）。想定の出力先は `docs/operations/{dev-workflow,environments,testing}.md` と `runbooks/`。
既出の運用知見は参照にとどめる: ログインループ・新ドメイン追加時の設定は `auth-and-security-3.md` 地雷1、Next.js fetch キャッシュ・Storage 回収は `auth-and-security-1.md` 地雷1・`-3.md` 地雷2、GitHub OAuth の環境変数は `github-integration.md`、モバイルのビルド・Android 実機は `mobile.md`、ゴミ箱 Cron は `trash.md`、監査系の開発環境の事故は `auth-and-security-2.md` 地雷9〜10。
タグ: 【資料】【コード】【未確認】。略称: 運用A＝運用知見アーカイブ v178-v191、v194＝引き継ぎ資料 v194、BL3＝統合バックログ v3、CC＝CLAUDE.md。
**公開リポジトリ向けの注意**: runbook にする際は、本番・テストの Supabase project ref、Vercel のプロジェクト名、管理者アドレス以外のメール、PC ユーザー名・パスを `<project-ref>`・`<prod-project>`・`<user>` 等に置換する。所在は `docs/internal/internal-notes-cross-1.md`。

## 確定した判断

判断者は、資料に「Rui 氏確認／決定」とあるものだけ「Rui」。それ以外は「不明」。

### 役割分担と進め方（dev-workflow）

1. **役割分担**: Claude＝設計・レビュー、ChatGPT＝セカンドオピニオン（敵対レビュー。Claude が実コードで裏取りする）、Codex＝実装（作業ツリーを編集し commit・push はさせない）、Rui＝add／commit／push と本番確認。Claude の作業環境（VM）では `node_modules` が Windows 用のため `npm install`・`npm test`・`tsc`・実機相当の確認が信頼できず、検証は Rui の環境で `npm test`／`npx tsc --noEmit`／`next build` を実行する。`@kabehub/shared` のシンボリックリンクが Linux 側で読めず shared を使うテストが動かない。判断者: 不明。出典: v194。【資料】
2. **進め方の型（リッチ会話UIで確立）**: 方針ドラフト→ChatGPT レビュー→Claude が実コードで裏取り→Codex 指示書（段階制: テスト先行→実装→検証）→Codex が作業ツリーを編集→Claude が差分を読む→Rui が add／commit／push→本番確認→CLAUDE.md へのハッシュ反映は別の docs コミット。OFF 時の request body は変更前コミットの golden（baseline）でバイト一致を保証し、baseline は実装前に採取する。「事前調査（読み取り専用）→実装」の順で Codex に投げると手戻りが少ない。判断者: 不明。出典: v194。【資料】
3. **指示書の形**: Goal／Constraints／Acceptance criteria の3点セット（CC の「指示フォーマット」）。冒頭に共通ルール（ブランチ運用、本番 DB に接続しない、`git add` の個別指定、CRLF／LF と BOM の維持、`apps/mobile` 不可侵、推測で埋めない、`npm test` と `tsc` の検証、レポート作成）を付ける。変更前の `npm test`／`npm run test:all` のベースライン（件数・失敗有無）の取得を含め、既存失敗を変更起因と切り分ける。Acceptance で差分スコープを指定するときは「正常系の最終差分」と「調査時の一時変更」を区別する。実機確認を必須にする項目は、指示書の段階で確認手段（一時ログの要否等）まで具体化する。判断者: 不明。出典: v194・運用A（v188）・mobile.md 判断28。【資料】
4. **レビューの原則**: 一次情報（公式ドキュメント・実ファイル・実 DB の read-only クエリ）で裏取りする。ChatGPT の技術指摘は、結論が正しくても個別の根拠まで実ファイルで確認する（例: 「共通 Provider 型に "human" がある」は誤りで、実際は別のローカル型だった）。一次情報どうしが矛盾する主張も Claude が直接 fetch して検証する（OpenAI 価格の「矛盾」指摘が誤りだった v179）。資料どうしが矛盾するときは推測で採用せず、read-only の DB クエリ等で決着させてから着手する（v181）。検証できない場合は「却下」でなく「保留・要確認」（auth-and-security-2.md 判断18）。出典: 運用A・v194。【資料】
5. **Codex 報告の検証**: 自己検証の報告（「完全一致を確認」等）は生の diff を人間も確認して初めて信頼する。ログが `ctrl+t` で省略されるときは `git status --short`／`git diff --stat`／各ファイルの `git diff` を個別に取り直す。新規（未追跡）ファイルは `git diff` に出ないため `type` か `git add -N` 後の `git diff` で確認する。集計値（文字数一致等）だけでは列・行の欠落を検出できないので、構造化された内容は項目リストの `Compare-Object` 等で突合する（v181）。Codex が WebSocket 不安定で同じ調査を繰り返すことがあるため、長いログは「新情報があるか」でなく「同じ調査の再実行でないか」を先に見て、未完了項目だけを絞って続ける（v187）。出典: 運用A。【資料】
6. **設計・実装の横断原則**: 共通化で「表示結果は不変」を条件にするなら変更関数の全 caller を確認し、避けられない変化はコードコメントとテストで固定する（v191）。新しいクライアント⇄サーバー契約は配布済みの旧クライアントが新フィールドを送らないケースを想定し値の有無で旧方式にフォールバックする（`undefined === undefined` が `true` になる誤判定に注意。v187）。発言者・モデルの識別情報は表示時に推定せず生成時に確定値として記録する。既存分岐へ処理を足すときは失敗系の分岐でも実行されるか確認し、`f(g())` の外側の評価例外は内側の try/catch では拾えない（v184）。DB スキーマ新設時は既存テーブルの FK `ON DELETE` の思想に合わせる（監査証跡は `SET NULL`、アカウント削除は `CASCADE`。v179）。モデル差し替え時は、公式の注意書き（新 tokenizer で入力が増える等）を出力側・`max_tokens` にも波及しうるものとして確認し、reasoning 系パラメータは実測する（v188・v190）。出典: 運用A。【資料】
7. **migration と並行実行の検証**: migration は冪等に（CC に既出）。RPC を変えたら `NOTIFY pgrst, 'reload schema';`。並行実行（INSERT と soft delete の競合等）の検証は Node `pg` の別セッションで行い、**SQL Editor ではロックを保持できず検証にならない**。`characterization test` は参照先ロジックが別レイヤー（JS→DB RPC）へ移ると後始末漏れを起こしやすい（v189 の `normalizeTags`）。切り分けは「対象シンボルが実装側に存在するか」→`git log -S` でテスト追加と移設の前後関係。出典: v194・運用A。【資料】

### Git／Windows 運用

8. **`git add` は個別指定（`-A` 禁止）**。`[id]` を含むパスは引用符で囲み `git --literal-pathspecs add`。Codex のログ置き場 `artifacts/`・`apps/.idea/`・`test-result.txt`・`tsc-result.txt`・`docs/thread-trash-phase*-report.md`・改行補正のみのファイルは含めない。`??` 行は名前でなく中身と `git log --all -- <path>` を見て判断する（`temp_check.tsx` が `ChatPanel.tsx` の完全な重複コピーだった例。v179）。`.gitignore` への追加は過去に `git add` 済みのファイルには効かない（`git ls-files -- <path>` で確認、必要なら `git rm --cached`。v180）。commit 前に `git diff --cached --stat` で行数が想定規模か確認し、全行変更なら改行を疑う。`git log -1 --stat` で実際に push されるコミットの中身を確認する。固定名の `commit_msg.txt` をセッションをまたいで再利用しない（古いコミットが別メッセージで push された事故。v190）。出典: 運用A・v194。【資料】
9. **CRLF**: Windows（`core.autocrlf=true`）では Codex 編集後に作業ツリーが CRLF になり Git 上の LF と食い違う。`git diff` が全行変更に見えても実体は小さいことがある（v191 のベースライン失敗1件は `auto-summary.ts` の CRLF が原因）。【資料】
10. **ブランチと force push**: `--force` は使わない（v137 で v133〜v136 が消えた。CC に既出）。force push 禁止を優先して、事後に判明した履歴の不整合は是正しない判断もある（v190）。【資料】
11. **シェルの注意**: cmd では bash 構文（brace expansion）が誤実行され、波括弧入りのディレクトリ（`{app`）が生成される（v180 で削除）。PowerShell の `%` を `%%` と書かない。`set X=false&& cmd` は `&&` の前にスペースを入れない（値が `false ` になる）。起動済みの `next dev` が残ると別ポートで起動するので `taskkill /PID`。cmd の `type` で UTF-8 日本語が文字化けしても、テストが通れば実害なし。コミットメッセージの `->` は避ける（mobile.md 地雷10）。出典: 運用A・v194。【資料】
12. **2台の PC**（ノート PC `C:\Users\<user>\kabehub-prototype`、デスクトップ PC は別パス）で作業する。作業開始時 `git pull origin main`、終了時に個別 add→commit→push（CC に既出）。引き継ぎ資料が同期されないと版番号が二重採番される（cross-history.md 判断2）。ノート PC の起動確認は `npm install`→`npx tsc --noEmit`→`npm run build`→`npm run dev`。出典: ノート PC 同期の引き継ぎ・AR171。【資料】

### 環境・デプロイ（environments）

13. **Vercel は Hobby プラン**: Cron は2本・日次のみ・指定時刻から約1時間の揺れ、本番デプロイでのみ動く（Cron Jobs 画面の Run で手動実行可）。**runtime logs の保持は1時間**で、過去の Cron 実行ログは残らない。Hobby は規約上は非商用向けで、課金を始める時点でプランの話が再燃する（BL3）。Function Region は東京（hnd1）。現行 Cron: `/api/cron/storage-cleanup`（`0 18 * * *`＝UTC、日本時間 03:00）と `/api/cron/thread-trash-purge`（`0 17 * * *`＝02:00 JST）で、ちょうど2本。**3本目の Cron は Hobby では足せない**。判断者: 不明。【資料】【コード】（`vercel.json`）
14. **環境変数（名前のみ）**: `.env.local.example` が正本。`NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY`・`SUPABASE_SERVICE_ROLE_KEY`（server-only）・`CRON_SECRET`（16文字以上のランダム。2本の Cron が共用）・`STORAGE_CLEANUP_DRY_RUN`・`THREAD_TRASH_PURGE_DRY_RUN`（いずれも `"false"` 完全一致のときだけ実削除）・`GITHUB_CLIENT_ID`／`GITHUB_CLIENT_SECRET`／`GITHUB_REDIRECT_URI`／`GITHUB_MOBILE_REDIRECT_URI`／`GITHUB_TOKEN_ENCRYPTION_KEY`・`UPSTASH_REDIS_REST_URL`／`UPSTASH_REDIS_REST_TOKEN`・`NEXT_PUBLIC_SITE_URL`・`CSP_REPORT_ONLY`（と任意の `CSP_REPORT_ENDPOINT`）。AI プロバイダーのキーはサーバー環境変数に置かない（BYOK。Supabase 移行時に Vercel からも削除済み）。【コード】【資料】
15. **ローカル確認は本番 Supabase へ接続**（Google OAuth のリダイレクトが本番 URL のため）。テスト DB で開発サーバーを動かすには、`.env.local` の URL・anon key・service role key をテスト値に差し替えたものを使い（元は `.env.local.before-*.bak` として退避）、作業後にテスト用ファイルを削除して `.env*` が未追跡として `git status` に出ていないか確認する。`.env.test.local` はテスト用スクリプトの設定で開発サーバー用の完全な環境ファイルではない。`scripts/verify-thread-trash.mjs` はテストユーザーを作成・削除するため本番で実行しない。【資料】【コード】（`.gitignore` に `.env.local`・`.env.test.local`・`.env.vercel-production.local`・`.env.local.*.bak`）
16. **ビルドとキャッシュ**: `rmdir /s /q .next && npm run dev`、それでも駄目なら `node_modules` を消して `npm install`（CC に既出）。エラー終了後の再ビルドは `.next` 不整合でルートが欠落することがあるため `.next` を削除してクリーンビルド（auth-and-security-1.md 地雷6）。`next dev` と `next build` で差分が出る `next-env.d.ts`・`tsconfig.tsbuildinfo` はコミットせず `git restore`。root の `dev`／`build` は `--webpack` 付き、`apps/mobile` は `--turbopack`。【資料】【コード】（`package.json`）
17. **Supabase 法人移行（2026-04-09）の4つの失敗と対処**（runbook 化の素材）: ①`Unsupported provider: provider is not enabled`＝新 project で Google OAuth プロバイダー未設定→Authentication→Providers で有効化しクライアント ID・シークレットを入力／②RLS 違反（`threads`）＝ブラウザ用クライアントを Route Handler 内で使い `auth.uid()` が NULL になった→各 Route で `createRouteHandlerSupabaseClient` を使う（後に `requireRouteUser` へ集約。B7）／③型エラー（引数不足）＝②の関数シグネチャ変更の呼び出し漏れ→旧ラッパー（`supabase-db.ts`）自体を廃止（現行には存在しない）／④API キーが未設定でも動く＝`|| process.env.ANTHROPIC_API_KEY` のフォールバックが残っていた→削除し Vercel の環境変数からも AI キー3つを削除（BYOK の徹底）。**移行チェックリスト**: Google OAuth プロバイダー有効化／Google Cloud の承認済みリダイレクト URI に新 project の callback を追加／Supabase の URL Configuration に4つの URL（kabehub.com・www それぞれの `/auth/callback` と `/**`）／Vercel の Supabase 関連の環境変数3つを更新して Redeploy。出典: 移行記録。【資料】【コード】

### 依存・セキュリティの運用

18. **`npm audit fix --force` は使わない**（`@tailwindcss/typography` を 0.5.4 へ下げる提案が含まれプロース表示が壊れるおそれ。`npm audit fix` の非 force は `68144bb` で実施済み）。`next` は固定バージョン（キャレットなし）。月次のセキュリティリリース確認（Next.js の公式ブログと `npm ls next`・`npm audit`）を運用に組み込む案（BL3 O1【提案】、Rui の決定は未受領）。判断者: 不明（`--force` 不使用は BL3 の判断）。【資料】【コード】
19. **GitHub OAuth の実機検証は OAuth App を分離してから**: `DELETE /applications/{client_id}/grant` は「そのユーザー×その App の全 token」を失効させる。テスト・本番で同じ OAuth App を共用すると本番側の連携も失効する。「テスト専用アカウント」と「テスト専用 OAuth App」は別の分離軸で、失効・権限のスコープが API 仕様上どの単位かを先に確認して決める。GitHub のステータス契約は推測せず `docs.github.com` で確認（`/grant` は 204／422、404 による token 無効判定は `POST /applications/{client_id}/token` の契約）。`callback` が失敗時に詳細をログに残さない件は未チケット。出典: v194・運用A。【資料】
20. **Next.js／アイコン等の規約ファイルは公式規約に先に合わせる**: `app/manifest.json`・`app/icon.png`・`app/apple-icon.png`（Metadata File Convention）。バイナリ素材は「新規に生成・加工せず確定素材をそのまま指定パスへ配置」と指示書に明記し、視覚素材はコード生成の SVG を `sharp` でラスタライズして複数案から Rui が選ぶ。maskable は赤破線オーバーレイでセーフゾーンを確認（v185）。出典: 運用A。【資料】【コード】（`app/manifest.json`・`app/icon.png`・`app/apple-icon.png` が存在）

CLAUDE.mdに既出: 8項目（起動コマンドとキャッシュ対処、2台の PC での作業規則と force push 禁止、`git add` 個別指定の原則、migration の再実行安全性、新 Route の `API_AUTH_CLASSIFICATIONS` 登録、`CRON_SECRET` 共用と dry-run の完全一致規則、Vercel の Function Region、ローカル Google ログインが本番へ飛ぶ件）。

## 地雷（CLAUDE.mdに載っていないもの）

1. **Hobby のログ保持は1時間なので、Cron の dry-run 観測は実行直後にしか見られない**。実削除への切替前に候補数を確認する手順が、観測の窓を逃すと成立しない。手動実行（`CRON_SECRET` 付き）は変数が `"false"` でないことを必ず確認してから行う（`"false"` だと本当に削除される）。【資料】
2. **Cron を足すときは4か所＋α**: `vercel.json`、`API_AUTH_CLASSIFICATIONS`、`proxy.ts` のセッション確認除外と `config.matcher` の両方、`.env.local.example`、CC。proxy への追加を忘れると Cron Secret 付きでも 401（trash.md 地雷6）。Hobby は Cron が2本までなので新規追加の前に既存2本の統合が要る。【資料】【コード】
3. **Next.js のセキュリティ修正は継続して出る**: 16.3.3 を目標にした後も、9月・10/14（臨時、Critical の RCE を含む）・11/3 と続き、目標が 16.4.6 に変わった。11/3 の修正先は 16.4.5（Active LTS）と 15.5.29 のみで 16.3 系は対象外。KabeHub は `use cache`・`cacheComponents`・`unstable_cache`・Edge ランタイム・Server Actions・`next/image` を使わないため大半は該当しない見込み。更新時は `npm test`・`tsc`・root の `next build --webpack`・`apps/mobile` の `next build --turbopack`（postbuild の CSP 位置検査は全 HTML 正常）・Vercel のビルドログの版数・本番のログイン／チャット／共有／CSP ヘッダーを確認する（BL3 S1 の検証手順）。`sharp` は 0.35.5 以上。【資料】【コード】（`package.json`）
4. **`temp_*`・`commit_msg.txt`・`test-result.txt` のような Codex の一時ファイルがルートに残る**: v180 で整理済み。現在も `artifacts/`・`apps/.idea/`・`docs/thread-trash-phase2a/2b-report.md` が未追跡で、`apps/mobile-shell-poc` は追跡されている（59ファイル、docs に説明なし）。【資料】【コード】
5. **Codex のテスト・golden 更新は変更前の baseline が前提**。ベースラインを取らずに実装すると既存失敗（CRLF 起因等）と変更起因を切り分けられない。件数の記録は時点つきで書く（cross-history.md 地雷5）。【資料】
6. **Vercel の旧プロジェクト `<old-project>`（旧リポジトリ接続）が PR のたびに ×（失敗）で表示される**。整理は未着手。PR の CI 表示を見るときは無視してよいが、整理前に本番ドメインの接続先でないことを確認する。【資料】【未確認】
7. **`.gitignore` に登録しても追跡済みファイルは消えない**: `.claude/` は `.gitignore` に入っているが `.claude/settings.local.json` が追跡されている（internal 参照）。新しい `.gitignore` 追加後は `git ls-files` で確認する。【コード】
8. **Supabase ダッシュボードの SQL Editor では `auth.uid()` が null で、ロックも保持できない**（B6 地雷2 と trash の並行テスト）。検証は実ログインのブラウザ、一時 test-login、Node `pg` の別セッションで行う。【資料】

## 未実装・宿題

1. **`docs/operations/dev-workflow.md`・`environments.md`・`testing.md`・`runbooks/` の作成**（方針書 §3）。runbook 候補: ①新ドメイン追加／ログインループ（`auth-and-security-3.md` 地雷1）②Supabase project 移行チェックリスト（判断17）③Cron の dry-run→実削除切替（`trash.md`・BL3 S3）④Next.js 更新と月次確認（地雷3）⑤schema cache 更新（CC に既出）⑥テスト DB での検証（判断15）⑦孤児 Storage 回収の観測（`auth-and-security-1.md`）。各 runbook の project ref・メール・パスは置換する。【資料】
2. **`apps/mobile/.env.local.example` の追加**（mobile.md 宿題9）。【資料】
3. **`STORAGE_CLEANUP_DRY_RUN`・`THREAD_TRASH_PURGE_DRY_RUN` の本番値の確認**: Vercel 環境変数で確認する（cross-history.md 矛盾1）。【未確認】
4. **Next.js 月次確認の運用化**（BL3 O1）: 採用するか Rui 判断待ち。【提案】
5. **S1b の `npm audit` の再実行**: `npm audit fix` 後の `npm audit` は未確認。想定の残りは Capacitor 2件、`@tailwindcss/typography` 経由の `postcss-selector-parser`、`@capacitor/cli`→`xcode`→`uuid`。【資料】【未確認】
6. **`apps/mobile` の Tailwind 警告**（`content` 未設定。root の `postcss.config.js` が効くため）: 低優先。【資料】
7. **`.claude/settings.local.json` の追跡解除**: internal 参照。【コード】
8. **ログ運用**: `app/api/auth/github/callback/route.ts` の失敗理由ログ、Hobby のログ保持が短い点の対策（外部ドレイン無し）は検討候補のまま。【資料】

## 矛盾・要照合

1. **`docs/mobile-env-setup.md` が `docs/task11` を参照**（存在しない）: mobile.md 矛盾4。runbook 化の際に直す。
2. **運用A と v194 の「git add の注意」の粒度違い**: v194 は `[id]` 入りパスの `--literal-pathspecs` を明記するが、運用A には無い（後から追加）。CC の `git add` の例外は「`[projectId]`・`[topicId]` を引用符で囲む」のみで `--literal-pathspecs` は未記載。【資料】【コード】
3. **CC の「テスト147本」は現行と一致**（`scripts/*.test.cjs` が147件）。件数の食い違いはなし。changelog／testing.md に書く数値は時点つきにする。【コード】
4. **「Vercel の Function Region」と「Cron の時刻」の相互関係**: CC は hnd1（東京）を確認済みとするが、資料に「本番でのみ Cron が動く」とある。Cron 実行リージョンは別（Vercel 側仕様）で、日本時間 02:00・03:00 の記述は UTC からの換算。【資料】【未確認】
5. **`apps/mobile-shell-poc`（追跡済み、README と `SMOKE_TEST_RESULTS.md` あり）は inventory にも抽出メモにも出てこない**: BL3 S4 が「実アプリは `apps/mobile` のみ」とするが、PoC の位置づけ（削除可か保持か）は資料なし。【コード】【未確認】
6. **inventory の分類（直さない）**: 運用知見アーカイブ（A）と v194 の運用節（A）は内容が重なる（v194 が横断版）。changelog 側の素材は v194 で足り、アーカイブは原文確認用。`Supabase法人移行 トラブルシューティング記録` は A だが 2.3KB の記録で、runbook 1本に収まる。

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| 運用知見アーカイブ v178-v191 | A | 全文 |
| 引き継ぎ資料 v194（運用上の知見・原則、地雷、環境） | A | 運用節・地雷・課題を読了。技術スタック等は cross-history で使用 |
| Supabase法人移行 トラブルシューティング記録 | A | 全文 |
| 引き継ぎ資料 ノートPC同期と依存パッケージ点検／npm audit対応完了（2026-07-13） | B | 前者は全文、後者は `auth-and-security-3.md` で既読 |
| 統合バックログ v3（S1・S1b・S3・S4・M4・O1・運用） | A | 該当節を読了 |
| `package.json`・`vercel.json`・`.env.local.example`・`.gitignore`・`next.config.js` | — | 全文／関連部分（環境変数は名前のみ参照） |
| `.claude/settings.local.json` | — | 内容の種類のみ確認 |
| 連携トラブルシューティング.txt（A） | A | 本メモでは未読（`github-integration.md` が読了済み） |
| README.md（旧・現行） | B | 現行は行数のみ。旧 README は未読 |

読めなかった A 資料はない（連携トラブルシューティングは github-integration 側で読了）。30KB に収めるため削った項目: v179〜v191 の個別セッションの細目（`recordUsageEvent` の二重 try/catch の経緯、PWA アイコン作成の往復）。
