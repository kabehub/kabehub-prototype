# 抽出メモ: mobile（Capacitor／Android／apps/mobile）（①-2）

作成: 2026-11-26／担当: B9／対象: `apps/mobile`（`@kabehub/mobile`）、Capacitor 8、Android（署名・App Links・AGP9／Gradle9・Auto Backup）、モバイル CSP、BYOK の Secure Storage、モバイル環境変数、タスク10〜14 の移植履歴、サーバー側の Bearer／CORS 対応。Web のスマホ表示（レスポンシブ UI）は `chat-ui.md`、モバイル GitHub OAuth のサーバー側は `github-integration.md`、BYOK の方針は `auth-and-security-3.md` を参照し、ここでは繰り返さない。
タグ: 【資料】【コード】（実ファイルを grep／部分読み）【未確認】。タスク番号（タスク10・13-A 等）は Capacitor 化トラック内の番号で、監査 ID や migration 番号とは別。
略称: 方針v26＝`Capacitor化_実装方針_v26_自己完結版`、引継v23＝`Capacitor化_引き継ぎ資料_v23_自己完結版`、T13v5＝`タスク13_引き継ぎ資料_v5_自己完結版`、T14v8＝`タスク14実装方針引継ぎ資料_v8`、残タスクv2＝`Capacitor化_残タスク整理_v2_2026-09-05`、軽タスクv7＝`スマホアプリ化軽タスク引き継ぎ資料_v7`、v166＝`スマホレスポンシブ対応_引き継ぎ_20260624_v166`、CC＝CLAUDE.md。
**公開リポジトリ向けの注意**: 署名鍵の指紋・本番 Supabase の project ref・未修正の弱点の詳細は書かず、項目名と状態だけを書く。詳細は commit 対象外の `docs/internal/internal-notes-mobile-1.md`。
**全体の注意**: CC には `apps/mobile`・Capacitor・Android の説明がほぼ無い（`mobile` の語が出るのは csv／txt の DL・queryText フォールバック・H-21C・Novel Check のメモ保存の4か所）。本メモの内容の大半が CC に未記載。

## 確定した判断

判断者は、資料が「Rui 氏承認」と明記するものだけ「Rui」。それ以外は「ChatGPTレビューをClaudeが採用」または「不明」。

### 全体構成

1. **Capacitor を採用（PWA のみ・React Native は不採用）、Android を先行し iOS は保留**。理由: 既存 Next.js をほぼ流用でき、「ユーザーが API キーを自分で入力する」設計は iOS 審査で外部サービスへの有料アクセスの迂回と見なされるおそれがある。iOS 申請に備える案は「おまかせプラン」（サーバー側課金）の先行実装。判断者: Rui（Android 優先）。出典: v166 将来のスマホアプリ化・方針v26 §8。【資料】
2. **モノレポ（npm workspaces）**: `apps/mobile`（Capacitor 8.5.0＋Next.js の静的 export、`output: "export"`）、`packages/shared`（Web／Mobile 共有）。`packages/shared/src/platform/` に `ApiClient`・`AccessTokenProvider`・`ApiKeyStore`・`SecureStorageAdapter`・`ExternalBrowser` のインターフェースがあり、Web／Mobile の差を吸収する。【資料】【コード】（root `package.json` の `workspaces`、`packages/shared/src/platform/` の5ファイル）
3. **`apps/mobile` は独立ビルド**（`next build --turbopack`＋postbuild。root は `--webpack`）。Tailwind は無く、Web 由来のスタイルは `app/globals.css` のプレフィックス付きクラス（`.legal-*`・`.mobile-*`・`.novel-check-*`・`.memory-*`・`.arena-*`・`.chat-*`）へ変換し、inline style／CSSOM／`style jsx`／`dangerouslySetInnerHTML` は禁止（`git grep` で網羅確認）。理由は「CSP 適合」と「既存 mobile 規約」の2つ（`style-src` が塞ぐのは `<style>` と `style=""` で、React `style={{}}` と CSSOM は仕様上の対象外）。【資料】【コード】
4. **ページを段階移植し、機能スコープは「依存クロージャごと削除」**: UI を隠すだけでなく、props・state・fetch を末端まで追って dead code ごと外す。型だけのスタブは「Web 版完全一致」でなく「Phase1 縮小契約」で作る。出典: T14v8 §2.3・§6。【資料】
5. **ページごとの `authState`（loading／signedOut／signedIn）**: signedIn になるまで業務 API の `useEffect` を起動しない。マウント時に自動取得するページ（memory 型）は render guard に加えて effect の実行条件にも認証ガードが要る。ユーザー操作起点のページ（novel-check・arena 型）は render guard だけで足りる。出典: T13v5 §4.3・§7.4。【資料】【コード】（`apps/mobile/app/memory/page.tsx` ほか）
6. **API は絶対 URL（`https://www.kabehub.com`）で呼ぶ**。相対パスだと Capacitor のローカル静的サーバーに着地し、SPA フォールバックの HTML が 200 で返る。`kabehub.com`（www なし）は 307 で Authorization が落ちるため使わない（CC の MCP 節と同根）。【資料】【コード】（`lib/api-client.ts` の `BASE_URL`）
7. **モバイルの API 認証は Bearer**: 業務 Route を `lib/proxy-paths.ts` の `API_AUTH_CLASSIFICATIONS` で `bearer`／`public` に分類し、`proxy.ts` が該当 route×method にだけ CORS を付ける（許可 origin は `capacitor://localhost`・`https://localhost`、許可ヘッダーは `Authorization`・`Content-Type`・API キー5種、`Vary: Origin`）。Route 本体はタスク13 の3機能で変更不要だった。CC の認証境界表に CORS の記述は無い。【資料】【コード】
8. **iOS／Android とも「端末内の保護された保存領域」という実装非依存の表現で Legal 本文を統一**（`terms`・`privacy` の Web／Mobile は `git diff --no-index` で完全一致を維持する exact-copy 運用）。改訂は 2026-08-30（`f82dae1`）。Cookie はブラウザ版のみで、モバイルは認証セッションも APIキーも Secure Storage。「安全」の言い切りと「再登録が必要」の断定は避け「必要になる場合があります」に緩和。判断者: Rui（表現の抽象度）、ChatGPTレビューをClaudeが採用（技術訂正3点）。【資料】【コード】（`app/terms`・`app/privacy`・`app/legal` と mobile 版が `diff -q` で同一）

### Android：署名・App Links・ビルド（タスク10）

9. **App Links の認証は Digital Asset Links**: `public/.well-known/assetlinks.json`（`https://www.kabehub.com/.well-known/`）の指紋とアプリの署名鍵が一致しないと、リンクがアプリに渡らず通常のブラウザ遷移で 404 になる。デスクトップとノート PC の debug keystore が別だったことが「Google ログイン後 404」の原因だった。【資料】【コード】（Manifest に `autoVerify="true"` の intent-filter が2つ、`assetlinks.json` は1要素・指紋1件）
10. **共有 debug keystore 方式**: `apps/mobile/android/app/keystores/debug.keystore` をリポジトリにコミットし、`app/build.gradle` の `signingConfigs.debug` で明示参照する（`.gitignore` の `*.keystore` 除外は無効化）。両 PC で `gradlew signingReport` の SHA-256 一致を確認し、指紋を `assetlinks.json` に反映。これは開発用 debug 鍵であり本番リリース署名鍵とは別。リリース鍵（Play App Signing の利用可否）は未決。判断者: 不明（Codex が新規生成。デスクトップ側の既存鍵を取得できなかったため）。【資料】【コード】（`build.gradle` に `signingConfigs.debug`、release の署名設定なし）
11. **ネイティブ側でインターセプトする URL は2つ**（`/mobile/auth/callback`＝Google、`/mobile/auth/github/callback`＝GitHub）。対応する Next.js ページは意図的に作らない。両 intent-filter は `android:path` 完全一致。モバイル GitHub OAuth は本番アプリのみで実機検証（App Links は HTTPS 実ドメインに依存し localhost では不可）。方式は `github-integration.md` に既出。【資料】【コード】
12. **AGP9／Gradle9 を正式採用**（2026-08-26、`a00e6be`）: AGP `9.3.2`・Gradle `9.5.0`・`gradle.properties` に互換フラグ。AGP9 は `proguard-android.txt`（`-dontoptimize` を含む）を廃止したため、release を `proguard-android-optimize.txt` へ修正する（Capacitor 全体の既知の破壊的変更）。判断者: Rui。【資料】【コード】
13. **Android の SDK 構成**: `minSdkVersion=24`・`compileSdk`／`targetSdk`＝36、`applicationId`＝`com.kabehub.app`、`versionCode 1`、release は `minifyEnabled false`。【コード】

### モバイル CSP とログ（タスク11・11-FU1）

14. **CSP は静的 `<meta http-equiv="Content-Security-Policy">`**（`apps/mobile/app/layout.tsx`）。静的 export にサーバーも `headers()` も無く、Web の nonce 方式は流用不可。現行は `default-src 'self'`／`script-src 'self' 'unsafe-inline'`（hydration の inline script のため）／`style-src 'self'`／`img-src 'self' data:`／`font-src 'self'`／`connect-src` は `'self'`・`https://www.kabehub.com`・本番 Supabase origin／`object-src 'none'`／`base-uri 'none'`／`form-action 'self'`／`frame-src 'none'`。meta では `frame-ancestors`・`report-uri`・Report-Only が効かないため、実機検証をゲートに Enforce 一発適用。Google／GitHub を `connect-src` に含めないのは OAuth を外部ブラウザへ委譲するため。【資料】【コード】
15. **`style-src 'unsafe-inline'` は軽タスク1-7 で撤廃**（`3628607`、`layout.tsx` の1行）。当初の根拠（`app/page.tsx` の inline style）が消えたため。Web 版 CSP の `style-src 'unsafe-inline'` 維持とは別アーキテクチャ・別リスク評価で別タスク。`_not-found.html`・`404.html` の `style=` はフレームワーク生成で修正不能のため検証対象から除外し、CSP meta が exactly 1 件であることだけを両ファイルに適用。【資料】【コード】
16. **postbuild `scripts/fix-csp-position.mjs`**: Next.js（Turbopack＋static export）は CSP meta を最初の resource タグより前に置けないため、`out/**/*.html` を機械的に検証・正規化する。fail-closed（HTML 0 件、または `<head>`／charset meta／CSP meta が exactly 1 でなければ非0終了／全件検証後に一括書き込み／CSP タグは再生成せず移動のみ／書き込み後に再読込で assert）。原因は「構造的限界」と断定せず「この組み合わせの現行 build では記述位置だけでは置けなかった」と書く。【資料】【コード】
17. **Capacitor の `loggingBehavior` は `"none"` を明示**（11-FU1、`7adab30`）。既定の `debug` が Android Bridge のプラグイン呼び出し引数（`SecureStorage.setItem()` に渡す Supabase セッション等）を logcat に平文出力しうる。`"production"` は名称に反して常時出力する設定。【資料】【コード】（`capacitor.config.ts` に `loggingBehavior: "none"`）

### BYOK Secure Storage（タスク12）

18. **API キーは `@aparajita/capacitor-secure-storage`（Android Keystore 裏付けの AES-GCM）に保存**（`kabehub_apikey_{provider}`）。Supabase 認証セッションも同じ Secure Storage（`storageKey: kabehub-mobile-auth`、`persistSession: true`、PKCE）に入る。キー不存在は `null`、OS／Keystore の異常は握りつぶさず伝播（`getApiKeyHeaders()` に catch-all を置かない。Web 版の catch-all を移植しない）。【資料】【コード】（`lib/secureStorage.ts`・`lib/apiKeyStore.ts`・`lib/authConstants.ts`）
19. **誤削除防止の dirty tracking**: 設定画面は provider ごとに `status`／`initialValue`／`value`／`dirty` を持ち、`dirty === false` は `status` に関わらず操作を生成しない純関数 `buildApiKeySaveOperations`（`lib/apiKeySaveOperations.ts`）。読込は `Promise.allSettled`、保存は provider 独立で部分成功を許容。空白のみは `trim()` 後に「削除」として扱う（`062c480`）。【資料】【コード】
20. **Android Auto Backup から Secure Storage を除外**: `allowBackup="true"` のまま、`fullBackupContent`（Android 11 以前）と `dataExtractionRules`（12 以降の cloud-backup／device-transfer）で `WSSecureStorageSharedPreferences.xml` を除外（認証セッションの除外も兼ねる）。機種変更後は再登録が必要になる場合がある。2026-08-30 の Pixel 8（API 37）で7項目合格（保存・復元・削除、signed-in の Claude 疎通、logcat に canary 値なし、merged manifest と Backup XML の除外、`bmgr backupnow` 成功、除外後の Supabase 認証）。【資料】【コード】
21. **`apps/mobile/.env.local` は `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` の2つだけ**（同一プロジェクトの組み合わせ。root の `.env.local.example` はコピーしない）。`BASE_URL`・`CALLBACK_ORIGIN`・`redirectTo` はコードにハードコード。`NEXT_PUBLIC_*` は build 時に埋め込まれるため、変更後は `apps/mobile` で `npm run build`→`npx cap sync android`。API キーの送信ヘッダーは Web と共通の5種。【資料】【コード】

### 移植フェーズ（タスク13・14）

22. **タスク13（3機能）**: 13-A novel-check（`28b014f`・`1bd0ee4`）、13-B memory（`695629f`・`a31899b`。Lore 型を `packages/shared/src/lore/` へ mirror コピーし Web 側 import は無変更）、13-C arena（`e867139`。公開共有ページは対象外）。ナビはホームの signed-in ブロックの `<nav aria-label="機能">`。判断者: Rui（ナビは実装しながら決める）。【資料】【コード】
23. **タスク14＝チャット画面 Phase1 の移植（14-A〜14-D、2026-09-06）**: `app/chat/page.tsx`・`ChatPanel`・`Sidebar`・`ChatInput`／`ChatInputCentered`・`MessageBubble`・`RoleplayBubble`・`Toast`。コミット `3ae8b3d`／`eec53fe`／`d4da19d`／`ee8c242`＋`9165330`。実機確認済み。判断者: Rui（Phase1 に `onTrimFrom`＝メッセージ範囲削除を追加）。【資料】【コード】
24. **タスク14 の除外**: メモ全般・👍記憶に追加・🔒非公開／✏️部分マスク・⋮メニュー（削除以外）・編集して再生成／上書き再生成・分岐・公開設定・システムプロンプト設定 UI・API キードロワー・一時チャット・単体メッセージ削除・エクスポート。未移植 route（`/image`・`/album`・`/explore`・`/calendar`・`/stats`）のリンクは除外。【資料】
25. **`image_gen` メッセージは read-only プレースホルダーで degrade**（画像本体・署名 URL・`<img>` は実装しない）。`/api/threads/[id]/messages` の GET は provider で絞らず、Web で作った画像生成スレッドが流入するため。「型レベルで除外」の誤りは `Message.provider` と送信先 `ChatPanelProps.provider` が別物だったため。「`<img>` 0件」は `image_gen` 本体に限定し、RoleplayBubble のキャラアイコン（data URL）は対象外。CSP `img-src` への Supabase ホスト追加は不要と確定。【資料】【コード】
26. **再生成ボタンは全3プロバイダー表示**（Web の「現在 provider を除外するフィルタ」は上書き再生成 UI とセット）。MessageBubble・RoleplayBubble 両方に同方針。削除ボタンは `!isLoading` ガード必須。Toast は複数同時表示（`.chat-toast-stack`＋`.chat-toast`）。【資料】
27. **silent failure の修正**: タスク14 でタグ GET・タイトル PATCH・フォルダ PATCH の `res.ok` 確認を追加。タスク13-A では `/api/chat` へ `provider: "memo"` を送り常に 400 になる保存バグを Web 版とも修正（`1bd0ee4`）。【資料】【コード】
28. **ChatGPT／Codex の報告は実コード・生ログで裏取り**。push 用の `git add` はその場の `git status --short` と突き合わせる（14-D で `ChatPanel.tsx` のコミット漏れ→追いコミット）。【資料】

CLAUDE.mdに既出: 4項目（モバイルにも csv／txt の DL があり WebView 専用の代替保存処理は無い、queryText の mobile フォールバック、Capacitor 化前に H-21C を再評価する旨、Novel Check の保存が `isMemo` 経路を使う）。ほか、`github-integration.md` 判断10〜11（モバイル GitHub OAuth の案B）と `auth-and-security-3.md` 判断15（モバイルは A 案の延長）は参照。

## 地雷（CLAUDE.mdに載っていないもの）

1. **「Google ログイン後 404」は署名鍵の不一致を最初に疑う**。App Links は OS 側の検証でコードに原因が出ない。`gradlew signingReport` の SHA-256 と `assetlinks.json` を突き合わせる。マシンごとの `~/.android/debug.keystore` は共有されないため、共有 keystore（判断10）を使う。【資料】【コード】
2. **Android Studio がプロジェクトを開くと AGP／Gradle を自動でメジャーアップグレードする**（コマンドラインの `gradlew` だけでは起きない）。意図した変更と別コミットに分離し、`git status --short` を都度確認。実行構成が「Tests in 'android.app'」になっていると Run でなく `testDebugUnitTest` が走りインストールされない。【資料】
3. **「設定した」記録と実際の反映は別**: モバイル GitHub OAuth で Vercel の `GITHUB_MOBILE_REDIRECT_URI` と GitHub OAuth App の mobile-callback URI が、記録上「完了」でも未反映だった（値の先頭に `%09` が混入した事例もあり）。API レスポンスか実機で反映を確認する（`github-integration.md` 地雷1・2 と同根）。【資料】
4. **Android WebView は `blob:` の `<a download>` を受け止めない**（`DownloadListener` 未実装）。Arena の MD エクスポートは Blob 生成まで正常でも `/sdcard/Download/` にファイルができない。Markdown の csv／txt DL も同機構で、チャットから到達可能になった今は通常チャットでも露出する。修正は `@capacitor/filesystem` 等の設計変更。現行は `createObjectURL`＋`anchor.download` のまま、`@capacitor/filesystem` 未導入。【資料】【コード】
5. **chrome://inspect の Console 操作は正規の UI 経路と一致しない**: `location.href = "/legal"` は DOM が更新されなかったが `next/link` のタップでは再現しなかった。Console で見た事象は、タップ経路で独立に再現するか確認してから製品バグとして扱う。根本原因は未特定。【資料】
6. **`<select>` が実機タップに反応しなくなる**（直前に `alert()` が出た後）: アプリ完全再起動（`am force-stop`→`am start`）で解消。
7. **エミュレータ**: 同じ AVD を Device Manager と cmd から同時起動すると固まる。コールドブート後に Chrome（OAuth の Custom Tabs）がクラッシュループになったら `adb shell pm clear com.android.chrome`。「Google でサインイン」が反応しないときは Chrome の `pm clear`→エミュレータの Google アカウント→2〜3回連続タップ（1回目に `BrowserControllerActivity` が強制終了する既知の挙動）。新ビルドが反映されないときは `adb uninstall com.kabehub.app` 後に `npx cap run android`。【資料】
8. **静的 export の HTML に認証依存 UI は入らない**（`out/index.html` の `findstr` で nav を判断すると誤る）。未ログイン確認は `authState` ガードの網羅性＋UI 確認で代替してよい。【資料】
9. **`next build` 中の `localStorage is not defined` 警告**: 静的 prerender 時に module scope の Supabase クライアントが native storage を初期化するため。`isBrowserRuntime` で `storage`・`autoRefreshToken` を限定して解消（`9b4a866`）。【資料】【コード】
10. **新規ファイルへの `git grep` は未 `git add` だと 0 件**（untracked は対象外）。Rui の PowerShell に ripgrep は無いので確認コマンドは `Select-String` ベース。`git commit` メッセージの `->` は cmd でリダイレクトになり空ファイルを作る（`→` を使う）。`apps/mobile` のコマンドは `apps/mobile`、`installDebug` は `apps/mobile/android` で実行。【資料】
11. **`apps/mobile` の検証コマンドの対象範囲**: root の `npm test` は mobile を含まない（`scripts/*.test.cjs` のみ）。mobile のテスト（`apps/mobile/tests/*.test.cjs`、`test(` 記述は計32件）は `npm run test:all` か `apps/mobile` で実行する（CC の「差は32件」と一致）。【コード】
12. **`apps/.idea/`・`apps/mobile/.idea/` が毎回 untracked**（`.gitignore` 追記は任意対応のまま）。ノート PC の JDK 21 切り替えは資料時点で未実施【未確認】。【資料】【コード】

## 未実装・宿題

1. **iOS（タスク7・2b）**: 未着手・保留。Mac 環境、Associated Domains／`apple-app-site-association`、ネイティブのパスキー等が前提。App Store 審査で BYOK が問題になった場合の対策は「おまかせプラン」（Phase 4 の課金）。【資料】
2. **Android のリリース署名**: release 鍵・Play App Signing の方針が未決。リポジトリにあるのは debug keystore のみで、release の署名設定も `assetlinks.json` の release 指紋もない（debug 鍵の指紋を本番ドメインが信頼している点は internal）。Play 配信手順・ストア情報・アイコン／スプラッシュ整備の記載も資料にない。【コード】【資料】
3. **ダウンロード系機能の設計変更**（MD エクスポート・csv／txt DL）: 判断・地雷4 のとおり未実装。`@capacitor/filesystem` か `DownloadListener`。検証経路（チャット画面の nav 導線）は14-A で解消済みだが、再検証の記録は見当たらない。【資料】【コード】
4. **13-A（novel-check）の実機確認の残り**: signed-in でのファイルアップロード→Gemini チェック→逐次表示→保存→ホーム遷移、threads 1 行＋messages 2 行（`provider='memo'`）の確認は T13v5 では合格だが、`docs/task13a-handoff.md` は同じ項目を「未確認」としたまま。csv／txt DL と Markdown の外部リンク（Capacitor Browser 起動）は未確認。保存の3リクエストはトランザクションでなく途中失敗で先行レコードが残りうる（既知の制約）。【資料】【未確認】
5. **13-B（memory）の統合候補 UI の実データ検証**: 統合候補が実際に生成されるシナリオ（プレビュー編集・却下・履歴ロールバック）は未検証のまま。【資料】
6. **GitHub 連携 UI の配線**: `apps/mobile/lib/auth/github.ts`・`session.ts`（OAuth 関数・ログアウト）は存在するが、設定ページにその画面が無い（現行 `apps/mobile/app/settings/page.tsx` に GitHub の記述なし）。PKCE 対応・iOS 対応も別。【資料】【コード】
7. **残タスク整理v2 のフェーズ2〜4**（編集・メモ・添付／分岐・公開・共有・Explore／小説・画像・アルバム・エクスポート・カレンダー・統計・プロフィール・MCP トークン）と Arena の観戦 URL・`/arena/[token]`: 未移行・起票なし（対応ページなし）。【資料】【コード】
8. **Supabase トークンのリフレッシュを時間を空けて確認**（長時間運用でのアクセストークン期限切れ後の自動更新）: Task12 実機確認の7項目目で未検証と明記されたまま。AQUOS sense9（実機）での Supabase client 変更後の確認も未実施。【資料】
9. **`apps/mobile/.env.local.example` が無い**（`docs/mobile-env-setup.md` が別タスク化を推奨）。`BASE_URL`／`CALLBACK_ORIGIN` のハードコードは staging を作るときに env 化を検討（現状は本番一本）。staging の Supabase を導入するなら CSP の `connect-src` も同時に変更。【資料】【コード】（`apps/mobile/.env.local` のみ存在し gitignore）
10. **未決の細目**: SRI による `script-src` の `unsafe-inline` 撤廃、Realtime 利用時の `connect-src` 追加、status bar 色の設定・Legal ページでの確認、chrome://inspect 起動不可の正式な解消記録（資料時点で実は接続できていた）。【資料】【未確認】
13. **一時レポートの整理**: `docs/task12-handoff.md`・`docs/task13a-handoff.md` は archive 移動候補（内容は本メモに移した）。`docs/mobile-env-setup.md` は `docs/features/mobile.md` へ統合し、本番 project ref の扱いは internal。【コード】
14. **公開側に載せなかった項目 3件**: 本番ドメインの `assetlinks.json` が debug 鍵の指紋を信頼している件、`proxy.ts` の CORS 許可 origin の評価、debug 鍵・実機検証データに由来する運用リスク（ほか、本番 Supabase ref・署名指紋・個人環境の所在一覧）。→ `docs/internal/internal-notes-mobile-1.md`

## 矛盾・要照合

1. **「モバイル版 Novel Check は保留」の記述が資料に無い**: 資料・コードでは mobile Novel Check は実装済みでホームから到達可能（13-A、`apps/mobile/app/novel-check/page.tsx` 541行）。保留といえるのは csv／txt DL・Markdown 外部リンク・signed-in 通しの一部が未確認の点（宿題4）で、機能自体の保留ではない。保留と呼ぶ根拠があるなら出典を要確認。【資料】【コード】
2. **`docs/task13a-handoff.md` と T13v5 の食い違い**: 前者は signed-in の end-to-end・DB 行・Gemini キー警告を「未確認」、後者（新しい）は同項目を合格としている。T13v5 が正と読めるが、handoff 原本は更新されていない。【資料】
3. **方針v26 のバージョン記述が古い**: 「Next.js 16.3.0」は現行 `16.4.6`（`apps/mobile/package.json`・root とも）。CC の技術スタック表は 16.4.6。【コード】
4. **`docs/mobile-env-setup.md` が `docs/task11` を参照**（「`docs/task11`（Mobile CSP設計）の `connect-src`」）: `docs/` に task11 のファイルは無い。実体は `apps/mobile/app/layout.tsx` の CSP meta。【コード】
5. **資料以降に `apps/mobile` が進んでいる**: folder_name 統一で mobile の Sidebar／folder picker が project_id 基準に変更（`918efa5`・`2abdb58`・`76a9313`、2026-09-14〜15）、Arena のモデル選択式化（`c2f1580`、09-07）。T14v8 の「フォルダ」記述はそれ以前。【コード】
6. **mobile に Project Memory の UI があるか**: 現行 `apps/mobile/components/Sidebar.tsx` は `projects: {id, name}[]` を持つが Project Memory（topic・昇格・注入）の UI は mobile の設定ページ・Sidebar に見当たらない。CC の Project Memory 節は Web 前提で、mobile の対応範囲の記載はない。【コード】【未確認】
7. **assetlinks の指紋の件数**: 方針v26・引継v23 は共有 debug 鍵の指紋を `assetlinks.json` に反映したと記録。現行 `public/.well-known/assetlinks.json` は1要素・指紋1件（debug 鍵の1件のみとみられる）で、release 鍵は含まれない。照合は internal。【コード】
8. **inventory の分類（直さない）**: v166 は mobile／chat-ui 両方 A だが Capacitor 部は約60行。タスク13 v5・タスク14 v8・方針v26 は自己完結版で内容が重なる。タスク3指示書・Task6指示書・タスク11 v2／FU1・タスク12 v1（B）の判断は方針v26 に取り込み済み。`icon-maskable-192.png` は画像。PWA／Capacitor の個別ロードマップは未作成（auth-and-security-2.md 宿題3）。
9. **タスク1〜9 の方針本文は全版で復元不可**（方針v26 明記）。確認できるコミット: `d5cc7da`（workspaces）・`9a47381`（タスク4）・`3e1b274`（Android shell）・`a6cc846`（Google PKCE）・`7ed0904`（App Link）・`4ff7c83`（セッション管理）・`ca86b3c`（タスク8）・`ac3b166`（タスク9-B）。【資料】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| Capacitor化_実装方針_v26_自己完結版 | A | 全文（約43KB。§1 のタスク1〜9 は本文が復元不可） |
| Capacitor化_引き継ぎ資料_v23_自己完結版 | A | §1〜§2（タスク10 全部）・§8 を読了。§3〜§7 は方針v26 と重なるため見出しのみ |
| タスク14実装方針引継ぎ資料_v8 | A | §1・§5〜§7（14-D・学び・クローズ状況）を読了。§2〜§4（14-A〜14-C）は見出し・要約のみ |
| Capacitor化_残タスク整理_v2 | A | 全文 |
| スマホレスポンシブ対応_v166 | A | 「将来のスマホアプリ化」節のみ（前半は chat-ui で既出） |
| docs/mobile-env-setup.md／task12-handoff.md／task13a-handoff.md | A／B | 全文 |
| タスク13_引き継ぎ資料_v5_自己完結版 | B | §1〜§7 のほぼ全文（約70%）。§3.5 以降の一部ファイル構成は軽読 |
| スマホアプリ化軽タスク引き継ぎ資料_v7 | B | 全文 |
| Task6_Codex指示書_v4／タスク11 v2 | B | 冒頭・前提・記録事項のみ（約25%）。実装コードは方針v26 に取り込み済み |
| タスク3指示書_v3／タスク11-FU1／タスク12 v1 | B | 見出し一覧のみ |
| タスク10 系3本（B）／C 扱いの旧版（方針 v1〜v25・引き継ぎ v1〜v22・タスク13 v1〜v4・タスク14 v5〜v7・軽タスク v1〜v6・タスク11 v1） | B／C | タスク10 は **未読**（`github-integration.md`・引継v23 §2 で代替）。C は題名のみ |
| リポジトリ実ファイル | — | `apps/mobile/` の設定・`app/layout.tsx`・`app/page.tsx`・`lib/`・主要 `components/`・`tests/`、`android/` の Manifest・Gradle 設定・backup XML、`assetlinks.json`（件数のみ）、`proxy.ts` の CORS 部、`lib/proxy-paths.ts`、`git log -- apps/mobile` |

読めなかった A 資料はない。Android 実機（Pixel 8 エミュレータ）の動作は資料の記録に依存し、本セッションで再確認していない。30KB に収めるため削った項目: タスク14-A〜14-C の個別設計判断（CSS 変数、hover 依存除去、`field-sizing` 等）、13-B 統合系の検証経緯、Windows コマンド細目。
