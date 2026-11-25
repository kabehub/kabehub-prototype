# 抽出メモ: mcp（①-2）

作成: 2026-11-25／対象: KabeHub MCP（prototype 側の `/api/mcp/*`・`mcp_tokens`・`lib/mcp-auth.ts`）と、Claude Code／Codex から会話を KabeHub に保存する連携（Hook・`/kabehub` コマンド・`kabehub-mcp`）。
タグ: 【資料】／【コード】（この作業ツリーの実ファイルを grep で確認）／【未確認】。CC＝CLAUDE.md。
**別リポジトリ `kabehub-mcp` は作業ツリーにないため、その現状は【コード】にせず【資料】のみ**で書く。npm の公開状態は断定しない（CC の方針）。CLAUDE.md が参照する「MCP 拡張ロードマップ」は作られていない（inventory §5）ので、推測で書かない。
略称: v78＝v79更新内容.txt（ファイル名は v79 だが、内容は「KabeHub v78 作業まとめ（2026/04/30）」の Claude Code の作業ログ。冒頭の要約のみ読んだ）、認証調査＝MCP認証エラー調査メモ_解決済み（2026-04-30）、振り返り＝振り返り_Hook実装_20260516、Codex引継ぎ＝codex_mcp_handover（Codex 連携の引継ぎメモ、日付なし）、Codexログ＝CodexHook修正ログ_20260607、Hook修正＝Hook修正.txt（日付なし。Codexログの後続の修正と読める）、連携TS＝連携トラブルシューティング.txt（github-integration に紐づく A だが、中身は `/kabehub` コマンド。github-integration.md 矛盾3）。

## 確定した判断

1. **MCP 認証・保存の方式（v78、2026-04-30）**: `/settings` でトークンを発行・削除する UI、**生トークンは発行時の一度だけ表示し、DB には SHA-256 のハッシュのみ保存**。MCP 用データ API は Bearer トークンをハッシュ照合でユーザー特定し、`last_used_at` は非同期（ベストエフォート）で更新。**RLS は使わず、サービスロールキー＋`user_id` フィルタで所有者チェック**。出典: v78 冒頭の要約。【資料】【コード】（`app/api/mcp-tokens/route.ts` が `hashMcpToken` で `token_hash` を保存し、生トークンは作成時にだけ返す（201）、`lib/mcp-auth.ts` が `serviceRoleClient`・`last_used_at` ベストエフォート更新、`docs/schema.sql` の `mcp_tokens(token_hash unique, last_used_at)`）
2. **MCP サーバーは別リポジトリ（`kabehub-mcp`）で管理**（Rui の指示「別リポジトリで管理したい」）。stdio 方式の Node.js パッケージで、`create_thread`／`add_message`／`list_threads` の3ツール。v78 の作業ログには「npm に `kabehub-mcp@0.1.0` として公開済み」とある（2026-04-30 時点の記述）。出典: v78。【資料】
3. **API クライアントは常に `https://www.kabehub.com` を使う**（`kabehub.com` は `www.` へ 307 リダイレクトされ、Authorization ヘッダーが消えて 401 になる）。MCP の `/api/mcp` は Bearer 認証のため、Supabase Cookie 認証の保護から除外する（当時は `middleware.ts` の `matcher` の `/api/((?!mcp).*)`、現行は `proxy.ts`・`lib/proxy-paths.ts` の `mcp` 分類）。出典: 認証調査「結論」「原因②③」。【資料】【コード】（`lib/proxy-paths.ts:72-73` の分類。CC にも既出）
4. **認証調査の原因は3層**: ①v79 のコードが Vercel にデプロイされていなかった（git push 忘れ）②`/api/mcp` が middleware を通って Supabase 認証に弾かれていた③`kabehub-mcp` の `BASE_URL` 既定値が `https://kabehub.com`（www なし）で 307 時に Authorization が落ちた。「コードは正しかった。インフラ・設定レベルの問題が3層重なっていた」。デバッグは、コードレビュー→`git log`→Vercel ログ→デバッグログ追加→`curl -v` の順。出典: 認証調査「調査の流れ」。【資料】
5. **Claude Code の自動保存 Hook（2026-05-16）**: セッション終了（`SessionEnd`）時に会話ログを KabeHub の「ClaudeCode」フォルダ（スクリプト内で固定）へ保存。Next.js 側・DB スキーマは変更なし（MCP API をそのまま流用）。`settings.json` の SessionEnd に `powershell -ExecutionPolicy Bypass -File "<絶対パス>\save_to_kabehub.ps1"` を `async: true` で登録。要約保存モード（`$KABEHUB_SAVE_MODE="summary"`）は将来の拡張メモ。出典: 振り返り。【資料】【未確認】（Hook は `C:\Users\Admin\.claude\` などリポジトリ外で、この作業ツリーでは確認できない）
6. **`/kabehub N` スラッシュコマンド（Claude Code）**: `~\.claude\commands\kabehub.md`（コマンド定義）＋`~\.claude\hooks\send_to_kabehub.ps1`（実処理）。`GET /api/mcp/threads` で最新スレッドを取得し、JSONL から直前の1往復（user＋assistant）を1件のメモに結合して `provider: "memo"` で `POST /api/mcp/threads/{id}/messages` に送る。**サーバー側（`app/` 以下）の変更はゼロ**。出典: 連携TS、Codex引継ぎ。【資料】【コード】（`app/api/mcp/threads/[id]/messages/route.ts` の存在）
7. **Codex 連携（2026-06）**: ①Stop Hook 自動保存（Codex セッション終了時に KabeHub の「Codex」フォルダへ。`~\.codex\hooks.json`・`hooks\save_to_kabehub.ps1`（キック用）・`hooks\upload_worker.ps1`（保存ワーカー））②`/kabehub N` 相当③自然言語での保存（MCP 経由）。Codex にはカスタムスラッシュコマンド機能がないため、②は **AGENTS.md に「`/kabehub N` と言ったら MCP で最新スレッドへ保存する」指示を英語で書く方式（案A）を推奨**（Plugin 方式は実装コストが高い）。③は `config.toml` に `kabehub-mcp` を追加すれば理論上すでに動作する。出典: Codex引継ぎ。判断者: Claude の推奨（採否は資料にない）。【資料】【未確認】
8. **Codex Hook の保存失敗の修正（2026-06-07）**: ①ユーザーメッセージの `input_text` が複数ブロックで、2番目に `<environment_context>` が入っていたのに、全ブロックを結合してから `^<` フィルタをかけていたため全体が除外されていた→**各 `input_text` ブロック単位でフィルタ**（除外タグ: `permissions`・`collaboration_mode`・`skills_instructions`・`environment_context`・`apps_instructions`）②`/exit` 直後は JSONL が書き込み中→まず固定3秒待機（Codexログ）。出典: Codexログ「修正内容」。【資料】
9. **Codex Hook の追加修正（日付なし、Codexログの後続）**: 固定3秒待ちをやめ、JSONL が空・未確定なら待って再読込するリトライ方式、`file in use`／`IOException`／`UnauthorizedAccessException` は待機して再試行、`FileShare.ReadWrite` による共有読み取り、同時起動は lock file で抑止、`upload_worker.ps1` を `C:\Users\Admin\.codex\hooks\` に反映（PowerShell 構文チェック OK・SHA256 一致）。連続2セッションで保存成功を確認。出典: Hook修正。【資料】【未確認】
10. **prototype 側の現行（コードで確認）**: `GET /api/mcp/threads`（`project_id` を返し、`folder_name` は自分の Project の名前を合成）、`POST /api/mcp/threads`（`project_id`／`folder_name` を受け、型検査。`folder_name` は legacy alias）、`/api/mcp/threads/[id]/messages`（GET／POST）、`/api/mcp-tokens`（GET／POST／DELETE）。`lib/proxy-paths.ts` の分類は `mcp-tokens`＝bearer、`/api/mcp/*`＝mcp。出典: コード。【コード】（`app/api/mcp/threads/route.ts:30,46-47,74-83`、`lib/proxy-paths.ts:71-73`）

## 地雷（CLAUDE.mdに載っていないもの）

1. **【機密】`codex_mcp_handover.md`（旧フォルダ）に、実在とみられる MCP トークン値と Windows のユーザーパスがそのまま書かれている**（`config.toml` の `KABEHUB_TOKEN`）。この資料を公開リポジトリの `docs/` に置いてはならない。再編時は値を伏せるか、`docs/internal/`（gitignore）へ移し、**念のため当該トークンを `/settings` で失効（DELETE）して再発行する**ことを推奨。値は本抽出メモにも転記していない。出典: Codex引継ぎ「現状」「注意事項」。CC に記載なし（方針書 §5-12 の機密方針に関わる）。【資料】
2. **Claude Code の Hook にはセッション ID が環境変数で渡らない**。渡されるのは stdin の JSON（`session_id`・`transcript_path`）。存在する環境変数は `CLAUDECODE`・`CLAUDE_CODE_ENTRYPOINT`・`CLAUDE_CODE_EXECPATH` のみ。`[Console]::In.ReadToEnd()`＋`try/catch` で読む（`$input | ConvertFrom-Json` は stdin が空だとハングする）。出典: 振り返り「詰まり②④」。【資料】
3. **`settings.json` のコマンド内のパスはダブルクォートで囲む**（バックスラッシュが剥がれて `C:UsersAdmin…` になった）。`claude hooks list` で登録状況とエラーを確認するのが最重要のデバッグ手段。Hook は `"async": true` にする（Claude Code が SessionEnd 後に完了を待たず強制終了するため）。`bash` は Windows にない（WSL 未導入）ので `.sh` でなく `.ps1`。出典: 振り返り「詰まり①③⑤」。【資料】
4. **PowerShell のバージョン・エンコーディング**: Windows 標準の `powershell.exe`（5.1）では BOM なし UTF-8 の `.ps1` が日本語コメントで構文エラーになる（BOM 付き UTF-8 に変換する）。一方 Codex の `hooks.json` は BOM なし UTF-8（BOM 付きだと不可）。このPCに `pwsh`（PowerShell 7）が無い場合は `powershell.exe` を使い、`$env:USERPROFILE` ではなく絶対パスにする。出典: 連携TS「①②」、Codex引継ぎ。【資料】
5. **`Invoke-RestMethod` が IPv6 経由で接続して30秒待ってタイムアウトすることがある**（`Test-NetConnection` の RemoteAddress が `64:ff9b::…`）。対処は `System.Net.WebClient`（IPv4）への変更。出典: 連携TS「③」。【資料】
6. **Codex の JSONL（transcript）は `/exit` 直後も書き込み中**で、読み取りに行くと 0 件扱い（「会話なし」）やファイルロックになる。待機・リトライ・共有読み取り・lock file が必要（判断8・9）。ユーザーメッセージには `<environment_context>` 等のシステムタグのブロックが混在するので、ブロック単位で除外する。出典: Codexログ、Hook修正。【資料】
7. **Codex の運用**: `codex -s danger-full-access` で起動しないと PowerShell コマンドがブロックされる。`AGENTS.md` は英語で書く（日本語は文字化けする場合がある）。Codex 側の MCP 接続確認は `/mcp`。重複排除ステートは `last_save_state.json`、ログは `kabehub_hook.log`。出典: Codex引継ぎ「注意事項」。【資料】
8. **v78 の「別リポジトリ」と本リポジトリ側の変更は別々にデプロイ・公開が必要**。認証調査の原因①のように、prototype 側の push 漏れと `kabehub-mcp` 側の npm publish 漏れ（`dist/index.js` をローカルから暫定参照していた時期あり）は別問題。出典: 認証調査「修正済みファイル一覧」「残作業」。【資料】
9. **Hook は端末ごとの設定**（ノートPC `C:\Users\ruima\` とデスクトップPC `C:\Users\Admin\` で個別に配置が必要）。`$env:USERPROFILE` を使えばファイル内容の修正なしでコピーできる。出典: 振り返り、連携TS。【資料】

CLAUDE.mdに既出: 3項目（MCP の Bearer 認証・`matcher` から `/api/mcp` を除外・API クライアントは `https://www.kabehub.com`、現行ツール3つ（`create_thread`・`add_message`・`list_threads`）、npm の公開状態を断定しない）。

## 未実装・宿題

1. **`kabehub-mcp` の npm 再 publish（認証調査の「残作業・優先度高」）**: `BASE_URL` を `www.` 付きへ直した後の publish は、当時「ローカルの `dist/index.js` を直接参照中」。その後の公開状況は資料に記録なし。`kabehub-mcp@0.2.0`（`project_id` を指定する `create_thread`）の publish が持ち越しだったことは project-memory.md 宿題7。npm の公開状態は断定しない。【資料】【未確認】
2. **`@types/node` エラー修正**（`kabehub-mcp`、優先度低）。出典: 認証調査「残作業」。【資料】【未確認】
3. **Codex の ② `/kabehub N`（AGENTS.md 方式）と ③ 自然言語での保存**の動作確認。Codex引継ぎは「未完了タスク」として動作確認手順（`/mcp`、「今日やったことを要約して KabeHub に保存して」）を記載。結果は資料にない。【資料】【未確認】
4. **Hook の要約保存モード**（`KABEHUB_SAVE_MODE="summary"`）、`role` の連続（ツール呼び出し混入）の改善、ノートPCへの Hook 展開。出典: 振り返り「今後の拡張メモ」、連携TS「デスクトップPCへの展開」。【資料】【未確認】
5. **MCP 拡張ツール（`publish_thread` 等）**: CC は「MCP 拡張ロードマップ」を別トラックとするが未作成。資料にも内容の記述はなく、推測では書かない。出典: CC。【コード】
6. **コミット漏れの検証手順**: `git log --oneline -5` で最新バージョンのコミットが push 済みか確認する（認証調査の原因①）。出典: 認証調査。【資料】

## 矛盾・要照合

1. **inventory.md の分類の確認事項**: `連携トラブルシューティング.txt`（A、github-integration／operations）は mcp の資料（上記判断6、地雷3〜5・9）。github-integration でなく mcp／operations（Claude Code 連携の runbook）。直していない。【資料】
2. **inventory.md の分類の確認事項**: `v79更新内容.txt`（B、70KB）は、ファイル名は v79 だが中身は「KabeHub v78 作業まとめ」を含む Claude Code の端末ログの貼り付け（要約部分は冒頭約85行）。残りは実装作業の生ログで、②では読まなくてよい。`振り返り_Hook実装_20260516.md` の日付は 2026-05-16（ファイル名）。【資料】
3. **Hook修正.txt の位置づけ**: CodexHook修正ログ（2026-06-07）は「固定3秒待機」で解決としていたが、Hook修正.txt は「固定3秒待ちをやめてリトライ・共有読み取り・lock file」へ変更したと述べる。後続の修正で、前者を上書きする。日付がないため、現行の `upload_worker.ps1` の状態は未確認。【資料】【未確認】
4. **認証調査の `middleware.ts`**: 現行は `proxy.ts`（Next.js 16、CC）。資料側が古いので参照しない。【資料】
5. **Codex引継ぎの `config.toml` 記法**（`[mcp]` と `[[mcp.servers]]`）は、現行の Codex の設定記法と一致するか未確認（Codex のバージョンは v0.137.0 の例あり）。【資料】【未確認】
6. **v78 の「npm に `kabehub-mcp@0.1.0` として公開済み」**は 2026-04-30 時点の記述。以降のバージョンは 0.2.0 の publish 持ち越し（project-memory.md）まで記録があるが、現在の公開バージョンは不明。【資料】【未確認】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| KabeHub_MCP認証エラー調査メモ_解決済み.md | A | 全文（7KB） |
| codex_mcp_handover.md | A | 全文（5KB。トークン値は転記しない） |
| 連携トラブルシューティング.txt | A（github-integration に紐づく） | 全文（3KB） |
| Hook修正.txt | B | 全文（4KB） |
| KabeHub_CodexHook修正ログ_20260607.md | B | 全文（5KB） |
| 振り返り_Hook実装_20260516.md | B | 全文（5.5KB） |
| v79更新内容.txt | B | 冒頭の要約約85行と、作業ステップの見出し行（生ログは未読） |
| CLAUDE.md・`app/api/mcp/threads/route.ts`・`app/api/mcp-tokens/route.ts`・`lib/mcp-auth.ts`・`lib/proxy-paths.ts`・`docs/schema.sql` | — | 既出判定・突合のための grep のみ |

読めなかった A 資料: なし。
