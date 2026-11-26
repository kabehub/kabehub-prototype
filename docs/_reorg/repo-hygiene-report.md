# リポジトリ整理 調査レポート（C2）

作成日: 2026-11-26／読み取り調査＋軽微な整理。値（鍵・トークン・メール・個人パス）は書かない。commit・`git rm` は未実行。

## 1. `.claude/settings.local.json`

- **構造**: `permissions.allow`（文字列12件）のみ。`deny`・`env`・`hooks`・`mcpServers` 等のキーは無い。
- **値の種類**: 許可コマンドのパターン（node／python3／npm／git add・commit・push の各許可、Skill、kabehub MCP の2ツール）と、`Read(...)` のローカルパス1件。
  - **個人環境由来**: `Read(...)` のパスにWindowsのユーザー名ディレクトリが含まれる（1件）。
  - **秘密**: 鍵・トークン・メール・Bearer 形式は検出なし（パターン検査）。
- **`.gitignore` との不一致**: `.gitignore` に `.claude/` があるが、すでに追跡されているため無効。
- **履歴**（`git log --all -- .claude/`）: 3コミット（2026-04-30 MCP実装 v79、同日デバッグ、2026-05-05 OpenAI対応）。履歴に個人パスが残っている可能性はあるが、秘密は検出していない（履歴の旧版は未検査）。
- **追跡解除の判断**: 追跡解除してよい。ローカル専用設定で、共有する価値が無い。公開リポジトリにユーザー名ディレクトリが出ている点も解消できる。履歴の書き換えは不要（秘密なし）。必要ならユーザー名の露出だけを理由に判断する。

## 2. `apps/mobile-shell-poc`

- **追跡ファイル**: 59件（`git ls-files apps/mobile-shell-poc`）。`node_modules` は追跡されていない。
  - なお `docs/_reorg/inventory.md` §3 の新規行の「追跡160ファイル」は誤り。160は `apps/` 全体の件数。正しくは59（次回の更新で直す）。
- **追加経緯**: 1コミットのみ。`b488a5d`（2026-08-19、`feat(mobile): M0-A Android native shell smoke test (task 2a)`）。
- **README の要点**: 「M0-A のネイティブ shell 挙動だけを確認する**使い捨てPoC**」。正式な `apps/mobile/` とは別物で、移行前提ではなく、root の npm workspaces にも含めない。Capacitor 8.5.0 exact、`server.url` のリモートロードは smoke test 専用で本番に持ち込まない。
- **SMOKE_TEST_RESULTS.md の要点**（2026-08-19、Android のみ実施）: 基本レンダリング PASS／Safe area FAIL（`/terms` のヘッダーがステータスバーと重なる）／Back操作 FAIL（history があってもアプリが終了）。iOS は未実施（PENDING）。
- **リポジトリ内の参照（git grep 全件）**:
  - 実効的な参照は `tsconfig.json` の `exclude` の1行のみ。
  - root `package.json` の `workspaces` は `apps/mobile` と `packages/shared` で、PoC は含まない。
  - `vercel.json` は cron 定義のみ。`.github/workflows`・eslint 設定・`.vercelignore` は存在しない。
  - ほかは再編資料（`docs/_reorg/` 配下）の言及のみ。コード・scripts・CI からの参照なし。
- **削除の影響**: build・test・Vercel デプロイに影響しない。`tsconfig.json` の `exclude` に残る行は害が無く、削除と同時に消すかはお任せ（消さなくても動く）。
- **推奨: アーカイブ**（結論）。
  - 根拠: ① 参照ゼロで削除しても壊れない。② README 自体が使い捨てと明言している。③ 一方、Safe area・Back操作の FAIL という実測知見と、JDK 21 で回避した Gradle 互換メモは、正式 Mobile 側の判断材料として価値がある。
  - 具体策: 知見だけを `docs/archive/`（またはモバイル機能の資料）に要約して残し、ディレクトリ自体は削除する。git 履歴に `b488a5d` が残るため、必要になれば復元できる。知見の要約が不要なら「削除可」で問題ない。

## 3. 環境変数 `NEXT_PUBLIC_SITE_URL` と `NEXT_PUBLIC_APP_URL`

- **`NEXT_PUBLIC_APP_URL`**: 追跡ファイルに参照ゼロ（`git grep`。コード・`.env.local.example` ともに無い）。Vercel 側に残っている値は未使用とみられる。
- **`NEXT_PUBLIC_SITE_URL`**: コード参照は2か所。`.env.local.example` に空欄で記載（「自己fetch先を固定したい場合に設定」）。
  - `app/arena/[token]/page.tsx`（`fetchArenaData`）: SITE_URL → 無ければ `https://${VERCEL_URL}` → 無ければ `http://localhost:3000` の順で、`/api/share/<token>` の取得先ベースURLにする。
  - `lib/csp.ts`（`isFirstPartyReportOrigin`）: `kabehub.com`・`www.kabehub.com`・localhost 系は固定で自社扱い。SITE_URL はそれ以外の追加自社オリジンとして使う。未設定なら追加なし。
- **本番で SITE_URL が未設定の場合の影響**:
  - 闘技場の共有ページは `VERCEL_URL`（デプロイ固有のホスト）宛てに自己fetchする。通常は動くが、そのホストにデプロイ保護（Deployment Protection）があると 401 となり、取得失敗でページが 404（`notFound`）になる可能性がある。カスタムドメインを固定したいならSITE_URLを設定する。
  - CSP違反レポートのURL無害化では、`kabehub.com` 系以外のオリジンはオリジン部分のみに切り詰められる（パスが残らない）。レポートの精度が少し落ちるだけで、機能は止まらない。
- **確認事項（Rui）**: 本番に SITE_URL が設定済みか。APP_URL が参照されていない前提で、Vercel から削除してよいか（別用途で使っていないか）。

## 4. 実施した軽微な整理

- `.gitignore` に `artifacts/`・`apps/.idea/` を追加。`apps/mobile/.idea/` は既に記載済みなので追加していない。3パスとも `git ls-files` で追跡ゼロを確認済み。
- `docs/thread-trash-phase2a-report.md`・`phase2b-report.md`（未追跡）を `docs/archive/` へ移動。先頭の1行は足していない。

## 5. Rui が実行するコマンド案（未実行）

```powershell
# 1. settings.local.json を追跡から外す（ファイル自体は手元に残る。.gitignore の .claude/ が効くようになる）
git rm --cached .claude/settings.local.json

# 2. apps/mobile-shell-poc を削除する場合（アーカイブ後。履歴 b488a5d から復元可能）
git rm -r apps/mobile-shell-poc

# 3. 整理分のステージ（個別指定）
git add .gitignore docs/archive/thread-trash-phase2a-report.md docs/archive/thread-trash-phase2b-report.md docs/_reorg/repo-hygiene-report.md
```
