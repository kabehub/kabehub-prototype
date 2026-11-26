# 抽出メモ: auth-and-security（3/3：テーマ別資料）（①-2）

作成: 2026-11-26／担当: B8／対象: 監査A〜I シリーズ以外のテーマ別資料（CSP nonce 指示書、BYOK 脅威モデル、H-29、Next.js 16 化、認証改善、Phase 4 匿名トライアル、ログインループ、初期のセキュリティ強化記録・外部レビュー、公開準備、npm audit 対応、静的監査の統合まとめ、監査B 再突合）。監査A〜E は `auth-and-security-1.md`、F〜I・総括・MH-5b・MH-6 は `-2.md`。既出は書かない。
タグ: 【資料】【コード】（実ファイルを grep で確認）【未確認】。ID は「強化記録 S-2」「監査A: B-05b」のように出典名を前に付ける。
略称: 脅威v7＝`B-05b_H-21_脅威モデルと選択肢整理_確定版_v7`、B05a-v2＝`B-05a_CSP強制化nonce導入_方針ドラフト (1)`、B05a指示書＝`B-05a_Codex指示書`、B05b指示書＝`B-05b_H-21_Codex指示書_v2`、H29＝`B-04b_H-29_*`、強化記録＝`セキュリティ強化記録_20260603`、認証メモ＝`認証改善メモ_20260629`、P4＝`Phase4_匿名トライアル論点整理`、再監査B＝`full-audit-b-2026-07-26_reaudit`、CC＝CLAUDE.md。
**公開リポジトリ向けの注意**: 未修正・未確定の弱点や実在値（本番 project ref・個人メール等）は項目名と状態だけを書き、詳細は commit 対象外の `docs/internal/internal-notes-security-3.md` に分けた（公開側に載せなかった項目: 7件）。

## 確定した判断

判断者は、資料が「Rui の決定／確定」と明記するものだけ「Rui」。それ以外は「ChatGPTレビューをClaudeが採用」または「不明」。

### CSP nonce（B-05a／H-01。骨格は B6 判断10 に既出。追加分のみ）

1. **`style-src` は `'unsafe-inline'` を意図的に据え置く**（既存合意・別チケット）。判断者: 不明。出典: B05a-v2 §2-5。【資料】【コード】（`lib/csp.ts`）
2. **nonce は request header と response header の両方に設定**（request 側は Next.js が framework script へ自動付与するために必須。`x-nonce` は `app/layout.tsx` の独自 inline script 用）。順序（外部由来ヘッダー除去→request へ設定→`NextResponse.next({request})` を1つだけ作る→唯一の Cookie 書き込み先にする→redirect 時のみ Cookie コピー→最後に response へ CSP）を崩さない。判断者: ChatGPTレビューをClaudeが採用。【資料】【コード】（`proxy.ts`）
3. **`headers()` で `RootLayout` 配下は全ページ動的化**。個別 `force-dynamic` は足さず、代表ページの HTML で「framework script と独自 script に同 nonce・CSP ヘッダーと一致・リクエストごとに異なる」を受け入れ条件にした。【資料】【コード】
4. **レポート先は `Reporting-Endpoints`（`Report-To` は非推奨）。URL は Host ヘッダーを信用せず環境変数 `CSP_REPORT_ENDPOINT`（本番のみ設定。未設定なら送出しない）**。`report-uri`（相対）と `report-to` を併記。【資料】【コード】
5. **`/api/csp-report` のログは無害化した値だけ**: query・fragment 除去、`document-uri` は origin＋pathname、`/share/[token]` 等のトークン部は `[redacted]`、`sample`・`originalPolicy`・`sourceFile`・`referrer` は出さない。旧形式と新形式（`reports+json` 配列）を区別、Content-Type はパラメーター除去の完全一致、本文 32KB 超・不正は常に 204。レート制限は Upstash 未設定・基盤例外は fail-open、正常判定の超過は記録せず破棄、キーは IP の SHA-256。判断者: ChatGPTレビューをClaudeが採用。【資料】【コード】（`MAX_REPORT_BODY_BYTES`、`runtime = "nodejs"`、`rateLimitAllowed` の初期値 true）
6. **`middleware.ts`→`proxy.ts` は B-05a で同時移行**（前提チケットでは「リネームしない」）。matcher は `unstable_doesProxyMatch` と path 分類関数の2層でテスト。`/api/mcp-tokens`・`/api/share/[token]/fork` の過剰除外は B-05a では直さずテストで固定（後に MB-b で是正、B6 判断15）。【資料】【コード】（`middleware.ts` なし、`scripts/proxy.test.cjs` が同モジュールを使用）
7. **`app/test-login/` は B-05a の対象外としてクローズ**: ChatGPT の「GitHub 上の main に無い」は根拠を裏取りできず、Rui のローカル確認（追跡ファイルに無い）で確定。判断者: Rui。【資料】【コード】（現存せず gitignore）

### Next.js 16 化（前提チケット 2026-07-23）

8. **14.2.35→16.2.11（React 19系）を B-05a の前提として単独実施**。理由は CVE-2026-44581 の影響範囲を脱するため。スコープは `next`／`react`／型定義と Async Request APIs（`cookies()`・`params`。codemod＋手動）のみ。CSP・BYOK・DB・他依存は触らず、スコープ外が必要になったら実行前に報告。判断者: Rui（B6 判断9 の分割に対応）。【資料】
9. **`dev`／`build` は `--webpack` 明示、Turbopack 移行・`cacheComponents` はスコープ外**。Preflight: `next/image` 実使用0、Parallel Routes なし、Node v24.14.1。Vercel 側 Node バージョンは Rui が確認（Codex の範囲外）。【資料】【コード】（`package.json` の `dev`／`build` に `--webpack`。`next` は `16.4.6`）
10. **`next` はキャレットなし固定**（`npm install next@x` が付ける `^` は手で外す）。2026-07-13 の `6047358` で確立。判断者: 不明。【資料】【コード】（`react`・`uuid` はキャレット付き）

### BYOK 脅威モデル（B-05b／H-21。クローズ結論は B6 判断11 に既出。根拠と将来条件）

11. **脅威 T1〜T5b**: T1 同一オリジン XSS（CSP Enforce で一般的な注入に耐性、自社 JS の DOM-based XSS は防げない）／T2 サプライチェーン／T3 端末物理アクセス／T4 ブラウザ拡張／T5a サーバー側 at-rest 漏洩（A案は強い）／T5b 運営・実行環境の侵害（A案でも防げない）。法的強制は技術脅威から切り離す。出典: 脅威v7 §2。【資料】
12. **案の呼称**: A Local BYOK（現行）／B Ephemeral（不採用）／C Synced BYOK／D Managed Plan（KabeHub 契約の AI 枠を再販。Phase 4）／E Self-hosted（対象外）。旧 D「完全プロキシ」は現行 A も KabeHub 経由のため改称。判断者: Rui が結論確定。【資料】
13. **C 案の再評価トリガー**: 「クロスデバイスでの BYOK キー再入力が実利用上の UX 課題として顕在化した時」。Capacitor β 着手自体は理由にしない。一次シグナルは Rui 自身の利用（例: 再入力が週に何度も発生）で、ユーザー数の定量基準は置かない。判断者: Rui。【資料】
14. **C 採用時の優先順位（未確定）**: C への全体移行を第一候補、次にユーザー単位の A/C 切替、最後に provider 単位。9 経路への分岐波及を避けるため `resolveProviderCredential()` 的な credential resolver（request キー→サーバー保存の暗号化キー→利用不可）に集約。移行は「保存目的の送信」で性質が違うため、ログ非残存の検証・localStorage の消去時期・未移行ユーザーは A のまま、を要件にする。【資料】
15. **モバイルは A 案の延長**: iOS は Keychain 等、Android は Keystore で保護した鍵による暗号化保存（Keystore は暗号鍵の保護機構で任意文字列の汎用ストアではない）。【資料】【コード】（`docs/api-key-flow-inventory.md` に Android Keystore 裏付けの Secure Storage と Auto Backup 除外）
16. **運用補完策（推奨・未実装）**: provider 側の課金制御（prepaid・auto-reload なし・spend limit・budget alert）をユーザーに呼びかける。窃取や不正操作は防げず、T2〜T5b で課金被害を限定する層としてのみ有効。provider ごとの機能名は陳腐化するため個別列挙しない。判断者: ChatGPTレビューをClaudeが採用（v6 の「T5b に効かない」を訂正）。【資料】
17. **D 案・E 案は B-05b の対象外、法的強制への対応は Phase 4 実装時に法務論点として別チケット化**。判断者: Rui。【資料】
18. **B-05b 指示書の合否基準**: 外部 API の未加工レスポンス本文をクライアントへ返さず、ログにも全文を出さない（ログは provider・status・固定エラーコード）。回帰テスト `scripts/api-key-handling.test.cjs` は5不変条件に絞る（誤文言の不在／Gemini の `?key=` なし／`image-gen` が未加工 `res.text()` を返さない／`extract-settings` が外部エラー本文を出さない／LocalStorage キー5種・ヘッダー5種が inventory に記載）。本番ログ確認は「静的確認（Codex）」と「デプロイ後の運用確認（Rui）」に分離。【資料】【コード】

### 孤児 Storage 回収（B-04b／H-29。方式選定は B6 判断8 に既出）

19. **決定表**: Cron は日本時間3:00固定＝UTC `0 18 * * *`／`p_limit` 暫定50（実装は 51 件取得で打ち切り判定）／dry-run→本削除は環境変数で再デプロイ不要／結果は管理者専用の簡易ページ（`/admin/storage-cleanup`）／**汎用管理者ロールは作らず（YAGNI）、管理者判定は RLS policy に管理者 UUID を直書きして DB 層で守り、アプリ層の追加チェックはしない**／`lib/mcp-auth.ts` の service role 重複是正は別チケット。判断者: Rui。【資料】【コード】（`CANDIDATE_LIMIT = 50`・`CANDIDATE_LIMIT + 1`、`vercel.json`）
20. **検証用 `app/test-login/` は一時ページ**: テスト環境接続時のみフォームを出し、本番 ref を含む接続では何も出さない fail-closed。パスワードはコードに書かない。検証後は削除し `.env.local` を bak から復元して SHA-256 一致を確認、本番接続に戻ったことを確認する完全復元を完了条件にした。通常ログイン・保護 matcher は変更しない。判断者: 不明（B-02・B-04a 検証の踏襲）。【資料】

### 認証（認証メモ 2026-06-29）

21. **認証は Google OAuth のみ維持**: パスワード保管・再発行が Google 委譲で動機を満たす。パスキー単独は初回登録の入口が成立せず（`registerPasskey` はセッションが必要）、全端末紛失時の復旧を自前で持つことになる。Supabase のパスキーは 2026-05-28 にベータ公開（外部仕様のため再確認が要る）。導入するなら Google OAuth の上に追加し、RP ID は `kabehub.com` で早期固定、Capacitor では assetlinks／apple-app-site-association とネイティブプラグインが要る。判断者: 不明。【資料】【コード】（パスキー関連コードなし）
22. **ランダムログアウトの原因は redirect 時の Cookie 破棄**: `NextResponse.redirect()` で新レスポンスを作ると、`getUser()` が `res` に書いた更新 Cookie が捨てられる。リフレッシュトークンは使用後ローテーションなので次回アクセスで使用済みトークンを送って強制ログアウト。`redirectWithCookies` で解決（2026-06-29）、のち MF-1 で全 Route に一般化（B7 判断3）。再デプロイ自体はログアウト要因ではなく、ローカル（本番 Supabase 接続）と本番の同時ログイン中のリフレッシュ、anon key／JWT シークレット再生成、Site URL・Redirect URL 変更が要因になる。【資料】【コード】

### Phase 4 匿名トライアル（論点整理 2026-08-12。実装なし）

23. **匿名 ID はユーザーごとに N 個、KabeHub 所有の Trial 用キーは共通で1〜少数**（「1匿名 ID＝1キー」ではない）。provider 側の上限は匿名ユーザー単位でなく Trial 専用 Workspace／Project 単位（Anthropic の Spend Limits API は組織メンバー単位）。【資料】
24. **Managed Trial の計量は既存 rate limit と契約を分ける**: 既存 `lib/rate-limit.ts` は Upstash 未設定で fail-open の回数制限。Trial は Redis 障害で課金が伸びるため fail-closed 必須・トークン量／金額で計量。匿名 ID は再発行できるので ID 単位の予算は突破される前提にし、メッセージ数少数・低コストモデル・`max_tokens`・IP 制限・Turnstile 等・Trial 全体の hard cap の多層防御にする。【資料】【コード】（limiter 未構成なら `allowed: true`）
25. **現行 `requireRouteUser()` は匿名か否かを区別せず `getUser()` がユーザーを返せば通す**。匿名認証を有効化するだけでは匿名ユーザーが既存データへ届きうるため、RLS（`is_anonymous`）と Route 分岐の新設が要る。Supabase 匿名認証と独自 guest session の選択は「guest のデータを後で正式アカウントへ引き継ぎたいか」が分岐点。【資料】【コード】（`is_anonymous`・`signInAnonymously`・Turnstile の使用箇所なし）

### 初期のセキュリティ強化（強化記録 2026-06-03＝v109。Claude 3.5 Sonnet の英語レビューを Gemini が翻訳）

26. **強化記録 S-1〜S-9・P-1〜P-3 は全て適用済み（資料の状態表）**: S-1 `thread_tags` の公開 SELECT policy 欠落／S-2 いいね数 RPC の認可（後に v180 で関数ごと削除、B7 判断15）／S-3 `explore` の `getSession()`→`getUser()`／S-4 メッセージ一括 DELETE の認証欠落／S-5 単一 DELETE の所有権／S-6 fork の重複 return と `fork_count` 未加算／S-7 `reports` INSERT の通報者 ID 偽装／S-8 `profiles` の未完了ユーザー公開／S-9 notes DELETE のアプリ層防衛。P-1 explore 並列化／P-2 search 並列化／P-3 popular をキーセット方式へ。**RLS が保護していてもアプリ層に `.eq("user_id", user.id)` を重ねる二重防衛を維持**。判断者: 不明。【資料】【コード】（`getSession()` 使用0、`reports_insert` は `reporter_user_id = auth.uid()`。S-8 は矛盾3）

### 公開準備・npm audit・統合まとめ・再監査B

27. **リポジトリ公開・ライセンス・規約は 2026-04-09 に完了**（公開準備 v6）: GitHub Organization へ移譲・Public 化、LICENSE は MIT、`/terms`・`/privacy`・`/legal` 実装と `[handle]` 予約語、`/login` に同意文言・アルファ版警告、Supabase を法人アカウントへ移行、OGP・Search Console・商標出願。未完は「`/explore` のデモデータ準備」。共有 URL は `/`（ログインへ redirect）でなく `/explore`。判断者: 不明。【資料】【コード】（`LICENSE`・`app/sitemap.ts` あり）
28. **全体監査 A〜I は 231 件（高32／中110／低89）**。内訳 A17・B5・C37・D21・E34・F35・G7・H73・I2。推奨処理順 A→G→D→F→B→E→H→C・I。追加提案: Storage 正本文書（→`docs/storage.sql`）、SECURITY DEFINER RPC 全体の棚卸し、Supabase の `{error}` は必ず確認し意図的に無視するなら隣接コメントで明記する方針の明文化、`gpt-5.5-pro` の Arena 対応の先決。【資料】【コード】
29. **再監査B が「実質解消」としたのは `/api/explore`**（matcher 除外でなく、セッション確認を実行したまま redirect だけ免除する方式が Cookie 更新を維持できる）。残る4件は MB-a〜e で処理（B6 判断14〜19）。【資料】【コード】
30. **外部レビューは裏取りしてからチケット化**。Fable その1 の High（他ユーザーの threadId で service role フォールバックが RLS を素通りしうる）は、現行 chat が thread 取得に `.eq("user_id", userId)` を付け、作成後も再確認する構造で解消済み。Fable その2 の Critical（IME 確定 Enter の誤送信）は `isComposing` ガード実装済み。その2 の `Retry-After` 指摘は v111 で否定済み（chat-core.md 判断13）。【資料】【コード】

CLAUDE.mdに既出: 7項目（CSP の本番 Enforce と `CSP_REPORT_ONLY` 完全一致、BYOK のリスク受容・H-21C 候補順序・生キーをブラウザへ返さない方針、`docs/api-key-flow-inventory.md` が経路の正本、Gemini の `x-goog-api-key`、`proxy.ts` 認証境界表、`STORAGE_CLEANUP_DRY_RUN`・Cron の Bearer、ローカル Google ログインが本番へ飛ぶ件）。

## 地雷（CLAUDE.mdに載っていないもの）

1. **Google ログインが `/login`→Google→`/login` を繰り返す**（2026-04-08 の記録）。原因は設定の片側更新。①Supabase の URL Configuration の Redirect URLs に kabehub.com・www それぞれの `/auth/callback` と `/**`、②Google Cloud の OAuth クライアントの承認済み JavaScript 生成元（localhost・kabehub.com・www）と承認済みリダイレクト URI（localhost・Supabase の auth callback・kabehub.com／www の callback）、③callback を認証 matcher に入れない。**新ドメイン追加時は①②を必ず両方更新**。③は middleware 時代の記述で、現行は `shouldRunSupabaseSessionCheck("/auth/callback")` が false（B6 地雷3）。【資料】【コード】
2. **「エラーなしで常に空配列」の切り分けの型**（H-29。B6 地雷1 の原因側）: SQL Editor・`set role service_role`・curl・素の node が正常でアプリ経由だけ異常なら fetch キャッシュを疑う。決め手は「`cache: "no-store"` の生 fetch を1回挟むと直後の同一 URL・body の `supabase.rpc()` まで直る」現象。env 再読込・余分な `.env*`・接続先違いは棄却済み。`export const dynamic = "force-dynamic"` はルートの描画方式であり、ライブラリ内部 fetch の no-store は保証しない。デバッグ用の `dotenv`・一時スクリプトは削除し恒久修正のみコミット。【資料】【コード】（`lib/supabase/admin.ts` の `global.fetch`）
3. **検証でテスト用 `.env.local` に切り替えたら、本番用 bak から SHA-256 で復元確認する**（`Get-FileHash`）。接続先 ref の見分け方は internal（ローカルのみ）。【資料】
4. **作業ディレクトリ直下の原因不明の 0 バイトファイル（`cd`・`git`・`npm`）**（2026-07-13）: `dir` でサイズを確認してから削除。原因は未特定。【資料】
5. **監査系の読み取り専用指示書には「開始時 `git status` が非クリーンなら作業せず報告して停止」を明記**（2026-07-13 に未コミットの依存更新で Codex が自主停止）。`npx tsc --noEmit` の副産物 `tsconfig.tsbuildinfo`・`next-env.d.ts` は `git restore` で戻してからコミット。【資料】
6. **CSP は `style-src 'unsafe-inline'` が残る**。`script-src` は `'self'`＋nonce＋`'strict-dynamic'`、dev のみ `'unsafe-eval'`。【コード】
7. **`proxy.ts` の CSP 付与と認証判定は独立変数**（`shouldApplyCsp`＝prefetch には付けない／`shouldRunSupabaseSessionCheck`）。matcher は OR 評価で、`/settings` 等は prefetch でも proxy が呼ばれるよう `missing` を付けない個別エントリを残す。CSP 用エントリを広げても認証判定は広がらない。【資料】【コード】
8. **Supabase のパスキーは 2026-05 時点でベータ**。導入再検討時は公式の最新状態を先に確認。【資料】【未確認】
9. **外部レビューの具体的主張は実コードで裏取りしてから採用**。検証できない根拠は、結論が正しくても別途確認し、確認できなければ「却下」でなく「保留」（B7 判断18 と同趣旨）。【資料】
10. **`docs/api-key-flow-inventory.md` は件数を固定せず横断 grep を起点に**、行番号でなくパスと関数名で記録。静的確認であり、本番ログにキーが無いことの証明ではない（Vercel ログのキー断片検索は Rui の運用確認）。【資料】【コード】
11. **Managed Trial を作るなら rate limit の fail-open を流用しない**。ID 単位の予算管理は突破される。【資料】
12. **`SA_oss_m1_audit_v1.md` は KabeHub の資料ではない**（会計系の別プロジェクトの OSS 公開監査）。KabeHub の仕様・地雷として読まない（矛盾5）。【資料】

## 未実装・宿題

1. **BYOK 運用補完策（provider 側の課金上限の呼びかけ）**: 軽量チケットで別起票とされたが起票の形跡なし。現行の設定画面に案内があるかは未確認。【資料】【未確認】
2. **README の旧呼称「C案→D案（完全プロキシ）」の同期**: 脅威v7 は A/B/C/D（Managed Plan）／参考 E への同期を要請。現行 `README.md` は旧呼称のまま。【コード】
3. **C 案・H-21C**: 未着手。再評価トリガーは判断13。「H-21C ロードマップ」は未作成（B6 宿題1 と同じ）。【資料】
4. **Phase 4 匿名トライアル**: 未実装。未決5項目（①「保存不可」の意味／②Supabase 匿名認証か独自 guest session か／③無料枠の単位を月額か往復数か（往復数寄りを推奨）／④Trial Workspace の spend cap 額／⑤匿名→正式アカウントの引き継ぎ UX の有無）。D 案の一形態で B-05b の対象外。【資料】【コード】
5. **法的強制・開示命令への対応の別チケット**: Phase 4 実装時に起票する決定。未起票。【資料】
6. **CSP 運用ロードマップ（H-01）は未作成**（CC は「移管済み」と書くが実体なし。B7 宿題3 と同じ）。CSP の `style-src` 強化・レポートの永続化・`Cache-Control`／CDN への影響検証は B05a指示書で「別チケット」のまま。【資料】【コード】
7. **`/api/fetch-github` の GitHub 匿名呼び出しが共有レート枠を使う件**（再監査B）: 現行も `fetchGithubFile(url)` に token を渡さない。要否は未検討。詳細は internal。【コード】
8. **ご神託_01 のチケット群の消化突合**: 本メモは見出し・先頭・実装順序の節しか読んでいない。コードで確認できたのは chat の thread 所有確認（T-04）・`isOwnedStoragePath`（T-09）・GitHub OAuth state の consume（チケット2）・GitHub トークン復号失敗のログと throw（チケット3）・マスク記法のサーバー側統一（T-06）。**未実装とみられる**: CSP 以外の定番セキュリティヘッダー（`next.config.js`・`proxy.ts`・`vercel.json` に設定なし。T7）、画像入力の受け入れ条件を集約する `lib/image-policy.ts`（存在しない。T4）、Markdown のリンク・画像の表示ポリシー（`MarkdownRenderer` に `a`／`img` の override なし。T2）。BYOK 入力欄のマスク表示（チケット5）は入力が `type="text"` に見えるが特定は未確認。【資料】【コード】【未確認】
9. **`rehype-raw` を導入しない不変条件の明文化（ご神託 T1）**: 現行 `package.json` に `rehype-raw` は無く成立しているが CLAUDE.md に規則がない。【資料】【コード】
10. **`docs/api-key-flow-inventory.md` の更新**: §6 の「現在 CSP は Report-Only 運用中」が古い。`/api/arena`・`/api/image-gen` の Gemini 実 API 疎通は 2026-07-25 時点で未実施とあり、実施記録は見当たらない。【コード】【資料】
11. **`/explore` のデモデータ準備（公開準備 v6 タスク19）**: 未完。現状は未確認。【資料】【未確認】
12. **公開側に載せなかった項目 7件**（S-8 の影響・GitHub 匿名枠の詳細・匿名認証設定の確認・`/api/csp-report` の公開性・CSP 以外のセキュリティヘッダー・検証用 `.env` と test-login の運用・別プロジェクト監査の内容）と、旧資料にある実在値の所在一覧（本番 ref・個人メール・鍵断片）→ `docs/internal/internal-notes-security-3.md`。

## 矛盾・要照合

1. **CSP Enforce の切替日**: 脅威v7 は「2026-08-10 完了」、総括・HI は「v178（2026-08-13）で Vercel 環境変数を確認してクローズ」（B7 矛盾6）。切替日と確認日の違いか不明。【資料】
2. **`docs/api-key-flow-inventory.md` §6 と CC**: inventory は Report-Only 運用中、CC は本番 Enforce。corrections #48。【コード】
3. **強化記録 S-8 と `docs/schema.sql`**: 強化記録は `profiles` の SELECT を `using (handle is not null)` に変えて適用済みとする。現行 `docs/schema.sql` は `using (true)`（policy 名 `Public profiles are readable by anyone`）のまま。canonical と食い違う（B7 矛盾7 と同型）。本番の実際は【未確認】。影響の評価は internal。
4. **強化記録 S-2 の SQL と現行**: 資料の `increment_likes_count`／`decrement_likes_count` は v180 で削除済み。資料の SQL を現行仕様として読まない。【資料】【コード】
5. **`SA_oss_m1_audit_v1.md` の分類（inventory）**: inventory は auth-and-security・A とするが、内容は別プロジェクト（会計アプリ）。inventory §5 の「`SA_oss_roadmap_v2.md` が無い」も同じ別プロジェクトの欠落で KabeHub の欠落資料ではない。**分類を KabeHub 対象外へ訂正することを推奨**（直していない）。KabeHub の公開は 2026-04-09 に完了済み（判断27）。資料内の「M1」「P0」「U1〜U6」は別プロジェクトの用語。
6. **inventory の分類（直さない）**: 公開準備 v6 は法人・ドメイン・規約が中心で `overview`／`operations` の性格が強い。`★ご神託_01_セキュリティ強化`（B）は実装チケット集で監査A〜I に属さず、本メモでは見出し級しか読んでいない。MD-2・MF-3完了・MF-5a v3・MG v3・MF-2a着手前・MF-2実装方針確定は監査D・F・G の個別資料で、B6・B7 の最終版が内容を含むため本メモでは読まなかった（B8 の対象か分類が曖昧）。
7. **npm audit の記録のずれ**: 引き継ぎ「npm_audit対応完了」は `uuid` v9→v14 を予定としたが、最終判断は `uuid ^11.1.1`（B7 判断20）。資料の「v14」は実装されていない。【資料】【コード】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| B-05b_H-21_脅威モデル…確定版_v7 | A | 全文（30KB） |
| B-05a 方針ドラフト (1)／B-05a_Codex指示書 | B | 前者は全文。後者は冒頭・matcher・csp-report・テスト・Acceptance・Out of Scope（約45%）、Step 1・2-3・3・4 の実装コードは軽読 |
| B-05b_H-21_Codex指示書_v2 | B | Goal・Constraints・§4〜§8（約55%）。§0〜§3 は inventory で代替 |
| B-04b_H-29 方針ドラフト／test-login指示書／解決ログ | B | 方針ドラフトは §1 決定表のみ、test-login は約70%、解決ログは全文 |
| B-04b_H-29 Codex指示書／削除モード0件問題 引き継ぎ資料 | B | **未読**（B6 判断8 と解決ログで代替） |
| Next16 前提チケット／Phase4 論点整理／セキュリティ強化記録／認証改善メモ／ログインループ備忘録 | A | 全文 |
| 公開準備 v6／npm audit 引き継ぎ／静的監査 統合まとめ／再監査B | B | 全文 |
| SA_oss_m1_audit_v1 | A（inventory） | 全文を読み、KabeHub と無関係と判断（矛盾5）。内容は転記しない |
| ★ご神託_01_セキュリティ強化.txt（160KB） | B | 先頭3KB・見出し・実装順序の節のみ。**本文の大半は未読** |
| コードレビュー／その2／過去Fable回答その1・その2／実装方針資料.txt | B | 各ファイルの冒頭のみ（約1.5KB）。その2 の Retry-After は chat-core で既出、実装方針資料は MF-1 Commit 5（B7 で既出） |
| MD-2／MF-3完了／MF-5a v3／MG v3／MF-2a着手前／MF-2実装方針確定 | B | **未読**（矛盾6） |
| docs/api-key-flow-inventory.md | A | 全文 |
| リポジトリ実ファイル | — | `proxy.ts`・`lib/csp.ts`・`app/api/csp-report/route.ts`・`app/layout.tsx`・`next.config.js`・`package.json`・`vercel.json`・`lib/supabase/admin.ts`・`lib/rate-limit.ts`・`app/api/fetch-github/route.ts`・`app/api/chat/route.ts`（thread 取得部）・`components/MarkdownRenderer.tsx`・`docs/schema.sql`（profiles・reports の policy 節）・`README.md`（BYOK 節）を grep／部分読み |

読まなかった A 資料はない。30KB に収めるため削った項目: 強化記録 S-1〜S-9 の SQL 本文、脅威v7 §2.4（E 案）・§3.2 のプラットフォーム別保存の細目、B05a指示書の path 分類関数の仕様、P4 §2.2 の比較表の細目、旧判断の一部（約6件を圧縮・統合）。
