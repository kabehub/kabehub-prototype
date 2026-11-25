# 抽出メモ: project-memory（①-2）

作成: 2026-11-25／対象: Project（旧フォルダ）・topic・revision・DL/UL・AI編集・整理・チャット注入・一括削除・Lore 昇格、`folder_name` 統一、Phase A〜E の移行。
タグ: 【資料】／【コード】（実ファイルを grep で確認）／【未確認】。CC＝CLAUDE.md。
略称: PMM v26＝Project Memory Manager 設計検討 v26（2026-09-16）、バックログ v7＝post-MVPバックログ優先順位 v7（2026-09-16）、FN設計＝folder_name統一 設計検討 v1（2026-09-14）、FN-P0〜P5C＝同 Phase 0〜5C 完了報告、PE方針＝Phase E 実装方針ドラフト v5（2026-09-11）、PE指示＝PhaseE Codex指示書 v1、v184指示＝codex_instruction_v184（2026-09-09）、v193指示＝codex-instruction-folder-settings-to-project-settings、参照元 v10＝チャット参照元整理 v10（2026-10-05）、昇格 v13＝Lore昇格ルール v13（2026-10-01。判断は lore-rag.md に記載）。
**注**: Lore 昇格の判断（削除フロー案A・削除時警告の現状維持・v175〜v203 表）は `lore-rag.md` に載せ、本ファイルでは参照のみ。チャット注入・queryText は `chat-core.md`。

## 確定した判断

1. **post-MVP バックログの優先度の軸は「後回しにするとリスクが増すもの優先」**（工数・UX 影響ではなく）。完了: 1位 `folder_settings`→`project_settings` rename（v193、2026-09-12）／2位 Project 削除機能（v194、2026-09-13、`f5ae9c0`）／3位 Background consolidation content-only v1（v22、2026-09-13、`bb5246e`）／5位 Project rename UI（v195、2026-09-13、`c563e7c`・後片付け `81fc049`）・検証用 project 作成 API（2026-09-14、`bdd7220`＋`af3d8e7`）／`folder_name` 統一（`lore_embeddings` 対象分、2026-09-16）。出典: バックログ v7、PMM v26 §1。【資料】
2. **Project 削除後も Project Memory は生存する（KabeHub 固有の設計判断）**。本家 Claude・ChatGPT は Project 削除で知識ベース・会話ごと消す設計と調査し、先行事例なしと確認。昇格の本質は「孤立後もアクセス経路を持つ Lore 側へ移す救済措置」。出典: PMM v26 §2-1。【資料】
3. **Lore 昇格の起点を削除モーダルから「Project Memory 一覧からいつでも昇格できるボタン」へ組み替え**（削除は低頻度・低優先のため）。派生機能として topic の md／txt DL/UL を追加し、**②丸ごと上書き（既存 full 編集契約を流用）を先に作り、①チャット指示ベースの部分更新は次ステップ**。出典: PMM v26 §2-1④、バックログ v7。判断者は資料から特定できない（検討中の指摘に基づく方針）。【資料】【コード】（DL/UL・AI 編集・昇格ボタンは実装済み）
4. **Background consolidation は content-only v1**。topic の分割・統合・rename・削除（structural consolidation）は DDL 変更・新規 RPC・複数 topic を跨ぐ atomic 適用が要るため、別の将来項目に切り離す。`current_state` topic は整理の対象外（新規作成ロジック自体は別トラック）。手動 PATCH との区別のため `project_memory_revisions.source_refs` に `{type:"consolidation_run", ...}` を記録。出典: バックログ v7、PMM v26 §2-1④・§3-D。【資料】【コード】（CC に既出：整理は `consolidation_run`）
5. **`folder_name` 統一の最終データモデル**: `projects(id, name)`、`threads.project_id`、`project_settings.project_id`（NOT NULL・unique(user, project)）、`lore_embeddings.project_id`（nullable。Project 外 Lore あり）、`novel_settings` は `thread_id → threads.project_id` から導出（**`novel_settings.project_id` 列は追加しない**。Thread 移動のたびに二重同期する責務が生まれ、分散二重管理の廃止に反するため撤回）。出典: FN設計 §3.1・§4.1。【資料】
6. **`folder_name` 統一は Expand → Switch → Contract の8ステップ**（Phase 0 棚卸し／1 Read model／2 内部書き込み契約／3 Web・mobile cleanup／4 MCP 互換／5A DB Expand／5B App Switch／5C DB Contract）。5A／5B／5C を分けるのは、DB とアプリのどちらを先にデプロイしても互換期間を保つため。スコープ: Sidebar（web・mobile）の `project_id` 中心化、MCP 後方互換（`folder_name` は legacy alias、内部保存は `project_id` のみ、GET は `projects.name AS folder_name` を合成）。`GET /api/projects/[projectId]`（単体取得）は具体的 consumer が出るまで追加しない。設計は Claude 単独案から ChatGPT レビュー3ラウンドを経て確定、各指摘は実リポジトリ（`af3d8e7`）の grep で裏取り。出典: FN設計 §3・§4・§7。【資料】
7. **Phase 0（2026-09-14）**: 対象は `git grep -n "folder_name"` の実数で **18ファイル**（FN設計の21・Sidebar 50箇所・mobile 40箇所は、`folder` の広いマッチや `folderName` 変数込みの集計で、誤り）。test／production 両方で preflight、schema.sql の記述食い違いを `c831c58` で修正。出典: FN-P0 §2〜§5。【資料】
8. **Phase 3（2026-09-15、基準コミット `56632fb`）: legacy の `folder_name`／`folderName` を指定した7つの HTTP ハンドラは 400 を返す**。query は `searchParams.has`、JSON body は `hasOwnProperty` でキーの存在を見る（値が空・null・数値でも）。canonical キーとの同時指定は所有 Project の照会より前に拒否。web／mobile Sidebar は Project 一覧の名前だけで表示・ソートし、`legacyFolderName`・`.folder_name` 参照・未使用の `rekeyFolderTypesAfterRename` を削除。出典: Phase 3 実装報告（docs）、FN-P2 §4.1。【資料】【コード】（2026-11-25 に7ファイルの 400 を grep で確認。エラー文言は3種類: ①`app/api/threads/[id]/route.ts:45`・`app/api/project-settings/route.ts:17`・`app/api/lore/chunks/route.ts:17` は「folder_name is no longer supported; use project_id」 ②`app/api/lore/embed/route.ts:22` は「folderName is no longer supported; use projectId」 ③`app/api/lore/consolidate/candidates/route.ts:21`・`app/api/lore/dreaming-batch/route.ts:22`・`app/api/lore/update-temporal-status/route.ts:35` は「folderName is no longer supported」。②③も含め7ハンドラとも `searchParams.has`（candidates・project-settings・chunks）または `hasOwnProperty`（threads/[id]・embed・dreaming-batch・update-temporal-status）でキーの存在を判定することを 2026-11-25 に grep で確認済み）
9. **Phase 5C（2026-09-16）**: v198（新3RPC `consolidate_dreaming_batch_by_project`／`_multi_by_project`／`merge_user_edited_lore_pair_by_project` を folder_name 非依存の最終形に。所有権ガード `perform 1 … raise 'project not found'` は維持。`rename_project` から Lore 同期を除去、`delete_project_preserving_contents` の Lore INSERT／UPDATE から `folder_name` を除去、threads 側は維持）と v199（旧3RPC・`idx_lore_embeddings_user_folder`・`lore_embeddings.folder_name` 列を DROP。完全シグネチャ指定・CASCADE なし・`to_regprocedure` の fail-closed preflight。`rollback_dreaming_batch_multi` は現役のため残す）。**`lore_embeddings.project_id` の NOT NULL 化はスコープ外**（無所属 Lore 823／930件は仕様）。旧「6 RPC 削除」の過去記述は誤りで実測は3本。コミット `2b590a2`→`facb34d`。出典: FN-P5C §2・§5。【資料】【コード】（`docs/applied/` に v198・v199）
10. **Phase 5C の DB 適用順序（確定）**: test に v198→新3RPC・ownership guard・旧3RPC／列／index の存続を確認→test に v199→`verify-project-memory-phase-5c.mjs`→production に v198→v199 連続→`--postflight-only`（production では fixture 検証を実行しない）。Management API の PAT が test・production とも失効していたため、適用は Supabase SQL Editor で実施。出典: FN-P5C §3、Phase 5C 実装ログ。【資料】
11. **`folder_name` 統一プロジェクトは `lore_embeddings` 分だけ完了**。`threads`／`project_settings`／`novel_settings` の `folder_name` 列の DROP は Phase 5C の対象外（FN設計 §4 の「4テーブル DROP」から縮小）。`rename_project` は `projects.name` と3テーブルの `folder_name` を同期し続ける。出典: FN-P5C §2.2、PMM v26 §3-D。【資料】【コード】（`docs/schema.sql` の `rename_project` が `project_settings`／`novel_settings`／`threads` の `folder_name` を更新）
12. **Phase E（2026-09-11、PE方針 v5＝ChatGPT 承認済み）は14コミット＋2つの運用ステップ**。E-1 legacy cleanup（v187：旧検索 RPC 3本 DROP）→E-2 `find_similar_lore_pairs` 系の `project_id` 化（v188 新 RPC 2本追加／v189 `merge_user_edited_lore_pair` の project guard／v190 旧 2本 DROP）→E-3 `/api/lore/embed` と `update_lore_temporal_status` の `project_id` 化（v191 新 RPC／v192 旧 DROP）。**デプロイバリア**: v188・v189 を本番に適用→Commit 6・7 をデプロイ→smoke test→Rui 承認→DROP（Codex は DROP 前で停止して Rui の指示を待つ）。出典: PE方針 §2.8・§4、PE指示。【資料】【コード】（v187〜v192 は CC の表と一致）
13. **Phase E のスコープ外と運用ルール**: `consolidate_dreaming_batch(_multi)` の `folder_name` 依存と `validateDreamingSources()` の一致チェックは Phase E では変更しない（のち 5A〜5C で撤去）／`verify-project-memory-phase-d.mjs` は無修正で凍結／`docs/schema.sql` の canonical 反映は各 DB migration コミットと同時（後日まとめない）／migration 規約は v186 を踏襲（全関数を `public.` で schema-qualified、`begin`／`commit` で囲み、末尾で `NOTIFY pgrst, 'reload schema'`）／`runDreamingBatch()` は project 不存在時に関数全体から return せず `candidates=[]` として扱い、後続の `cleanLikedAiRecords()` を継続する。出典: PE方針 §0・§2.6・§2.7、PE指示。【資料】
14. **v184 Codex 指示書（2026-09-09）の運用ルール**: DB 接続・SQL 適用は Rui が手動、Codex はファイル作成とリポジトリ後処理のみ／PREFLIGHT・POSTFLIGHT クエリはチャット内ではなくローカル migration ファイルから直接コピー（Phase A で WHERE 句欠落の事故）／`git add -A` 禁止／1チケット1コミット（Conventional Commits）／日本語メッセージは一時ファイル＋`git commit -F`／migration 本体（`begin;`〜`commit;`＋`notify`）は改変しない。RPC エラー→HTTP: `42501`→403（最優先判定）、`project not found`／`topic not found`→404、`revision conflict`／`old_text not found`／`old_text not unique`／`topic already exists`→409、パラメータ不備→400。`message` は完全一致（`===`）で判定し、`consolidate/merge` route の `includes()` 方式は使わない。出典: v184指示 Constraints・付記。【資料】【コード】（`lib/project-memory/map-rpc-error.ts` は CC に既出）
15. **`folder_settings`→`project_settings` rename（v193）の方針**: `folder_name` カラムの rename は対象外（共有命名で別スコープの巨大作業）、過去の適用済み migration・`docs/audit/*.md` は書き換えない、mobile は参照なしで対応不要、API 後方互換 alias 不要（個人利用）、1コミット。**本番切替**はテストで適用・デプロイ・動作確認後、本番 DB に migration→直後に新デプロイへ切り替え、その間（数十秒〜数分）`/api/chat` や旧 `/api/folder-settings` が一時的に失敗しうることを許容。出典: v193指示 Constraints・本番切替手順。【資料】
16. **topic のチャット注入・設定ドロワーのタブ化・queryText 等**は `chat-core.md` の判断（参照元 v10 §2〜§3）。ここでは、注入が **topic 単位のオプトイン**（`include_in_chat`、v204）で、昇格 Lore 検索とは別経路であること、バッジの正本が `summarizeChatInclusion` であることのみ参照。【資料】

## 地雷（CLAUDE.mdに載っていないもの）

1. **canonical schema と実 DB の乖離が疑われるときは `to_regprocedure()` で test／production の両方を確認する**。例: `select to_regprocedure('public.rename_project(uuid,uuid,text)')`、`select to_regprocedure('public.delete_project_preserving_contents(uuid,uuid,boolean,jsonb)')`。`docs/schema.sql` の「DB 未適用」記述はコード側の完了とずれていた（当時は「Code: complete / DB deployment: unverified」として扱った）。出典: FN設計 §2.5。【資料】
2. **件数の数え方は `git grep -n "folder_name"`（正確な文字列）で統一する**。`folder` の広いマッチや `folderName` 変数込みで数えると、実数（18ファイル）と大きく乖離する（FN設計の 21／50／40 はこれが原因）。出典: FN-P0 §2。【資料】
3. **`lib/lore/consolidation.ts`（root 版）と `packages/shared/src/lore/consolidation.ts`（shared 版）は同一契約を `scripts/lore.test.cjs` でミラーテストしている**。片方だけの変更はテスト不整合を招くので両方を同時に変更する。CC に記載なし。出典: FN-P5A §4.1。【資料】【コード】（両ファイルの存在を確認）
4. **v199 適用後、`verify-project-memory-phase-c.mjs`／`phase-d`／`phase-e`／`phase-5a` 等の過去 verify は再実行不可（historical-only）**。冒頭コメントに明記済み。`phase-d` の③は、旧検索 RPC が存在しないこと（3シグネチャで `PGRST202`）を必須 assert に変更。出典: FN-P3、Phase 5C 実装ログ。【資料】【コード】（`scripts/verify-project-memory-phase-c.mjs:1`・`phase-d.mjs:1`）
5. **旧 RPC の DROP は完全シグネチャ指定・CASCADE なし・`to_regprocedure` による fail-closed preflight**。「旧 N 本」の本数は実測で数える（過去資料の「6本」は誤りで実際は3本）。出典: FN-P5C §2・§5。【資料】
6. **DB を変える変更は「DB Expand → App Switch → DB Contract」の3段階に分ける**。一括 migration だとデプロイ順序次第で片方が壊れる。Dreaming／merge の `folder_name` 依存は、5A（新 RPC 追加）→5B（呼び出し切替＋実 DB 確認）→5C（旧 RPC・列 DROP）で外した。出典: FN設計 §4、FN-P5A・P5B。【資料】
7. **ブラウザ・MCP から叩く内部 API の bearer allowlist**: `/api/projects` は POST のみ、`/api/projects/[id]` は DELETE／PATCH のみ許可で GET が無かった。この `bearer` 分類は MCP 専用でなく `/api/album` 等の通常 Web 内部 API にも使われる。Sidebar が直接叩く用途でも追加が必須（過去に一度踏んだ事故と同型）。CC の「新Route追加時の登録」と同根（登録必須は既出）。出典: FN設計 §2.5。【資料】
8. **コミットメッセージ冒頭に UTF-8 BOM 由来の不可視文字が混入しうる**（PowerShell の `[System.IO.File]::WriteAllText` 既定エンコーディング）。`New-Object System.Text.UTF8Encoding $false` で BOM 無しを指定する。force push 禁止のため修正せず記録のみ（`4a00443`）。出典: FN-P1 §3.2。【資料】
9. **ローカル作業ファイルの常在**: `apps/.idea/`・`commit_msg.txt`・`full-test-log.txt` は untracked で push には影響しない（現在の `git status` では `apps/.idea/`・`artifacts/` が未追跡）。出典: FN-P2 §4.2。【資料】【コード】
10. **Phase 3 の受け入れ grep は文字通りには 0 にならない**: 実際の grep は15件残る（400 用キー存在判定7、エラーメッセージ7、指定された必須内部引数 `folderName: null` 1）。名前解決・受理分岐は 0 件。出典: Phase 3 実装報告。【資料】
11. **削除済みの旧 RPC を前提にした古いコードは再実行・再利用しない**: `match_lore_embeddings`（旧シグネチャ）は test・production の `pg_proc` に存在しない（v187 で正式削除、Phase 0 以前から無かったとみられる）。出典: FN-P2 §4.2、FN-P3 §4.2。【資料】
12. **移行資料の rename 手順の割り込み**: DB テーブル名とアプリコードを同時に変える非後方互換 rename では、migration 適用から新コードのデプロイ完了までの間に旧エンドポイントのリクエストが失敗する。個人利用のため許容した。出典: v193指示 本番切替手順。【資料】

CLAUDE.mdに既出: 14項目（Project API の認証・RPC・楽観排他／`proxy-paths` 登録／rename は `PATCH /api/projects` に一本化／昇格 stale・409・同 revision 復元／チャット注入 8,000字・skip-and-continue／refusal 時の誘導文／AI 編集の契約・previewの存在期間／操作の排他／一括削除・確認モーダル／サマリ・refresh 契約／`git add` のパスの引用符／設定ドロワーの保存方式／v182 番号の重複注記／v204〜v206 の説明）。

## 未実装・宿題

1. **Human edit 後の AI 再整理ルール（未決定）**: UL された内容をそのまま正とするか、AI が整形・レビューを挟むか。Background consolidation と Human edit が競合した場合の優先順位、楽観ロックとの関係。DL/UL の検討と直結。出典: PMM v26 §3-D。【資料】【未確認】（②丸ごと上書きは実装済み。①チャット指示ベースは「AIで編集」として実装済みだが、整理との競合ルールの確定は不明）
2. **昇格基準の一般化**（`LoreMemoryRow` の `memory_kind`／`importance_score`／`confidence_score` へのマッピングルール）、**Lore 側 UI との横断連携**（C-7 横断 UI との関係）。manual chat edit の revision 記録方式（`manual_chat_edit` 的な `source_type`）。出典: PMM v26 §3-D・§2-1④。【資料】【未確認】
3. **UI 移行トラック（C）**: `/projects/[projectId]` の Project Home、最近の threads 一覧と新規 Chat 導線、右 rail に「手順」「メモリー」「コンテキスト」、Sidebar の folder 中心から project 中心への移行、見た目を本家寄りに磨く、「ライブラリ」的な横断 UI（C-7、**`/library` として実装済み**）、「threads が 0 件の Project は Sidebar に現れない」制限の解消、Project 詳細ページ側（Sidebar 以外）の rename 導線、`POST /api/projects` を使った UI「＋ New Project」導線。出典: PMM v26 §3-C。【資料】【コード】（`/library` は実装済み。他の項目の実装状況は未確認）
4. **未決定の設計論点**: Project Knowledge と Project Memory の検索優先順位、Raw Chat RAG の chunk 単位設計（保留）、Memory Model の具体的なモデル選定、Background consolidation の structural consolidation、`current_state` topic の新規作成ロジック、孤立した threads／memory の UI 表現（project 未所属表示 or 専用アーカイブビュー）。出典: PMM v26 §3-D。【資料】【未確認】
5. **`threads.folder_name`／`project_settings.folder_name`／`novel_settings.folder_name` の3系統の完全な廃止**（`projects.name` への一本化）は未着手。出典: PMM v26 §3-D、FN-P5C §2.2。【資料】【コード】（列は現在も存在）
6. **`lib/lore/search.ts` の `f_folder_name` コメント負債**（RPC 引数名の記述）。出典: FN-P5C §4.2、FN-P5B。【資料】【コード】（`lib/lore/search.ts:64` に記述が残る）
7. **`kabehub-mcp@0.2.0` の npm publish**（`project_id` を指定する `create_thread`）。ノートPCは npm 未ログイン（パスキー認証が必要）で、デスクトップPCで再開する持ち越し。HTTP API 側は本番で `project_id` を受理できるためブロッカーではなく、外部 MCP クライアントから `project_id` を指定する新機能が使えないだけ。出典: FN-P4 §4.1。【資料】【未確認】（CC は npm の公開状態を断定しない方針）
8. **`verify-project-memory-phase-d.mjs` の旧 RPC 前提の記述更新**: `PGRST202` を期待する形に更新済み。ただし v199 後は historical-only として再実行しない（地雷4）。出典: PMM v26 §3-D、FN-P3。【資料】【コード】
9. **`next 16.0.0-16.3.2` の critical 脆弱性（未認証 RCE）の対応要否**（当時の未決）。現在は `next@16.4.6` で更新済み。出典: PMM v26 §3-D。【資料】【コード】（CC は Next.js 16.4.6）
10. **Lore 昇格関連の宿題**（削除時警告 Y／Z、一括昇格、`/library` の全 Project 並行取得ほか）は `lore-rag.md` 宿題7〜9。

## 矛盾・要照合

1. **FN設計 §4 の「5C で4テーブルの `folder_name` 列を DROP」と実際の 5C**: 実際に DROP したのは `lore_embeddings` のみで、他3テーブルは対象外に縮小された（判断11）。PMM v26 §3-D も「3系統が残っている」と書く。FN設計をそのまま読むと完了したように見える。【資料】
2. **「4テーブル」表記の古さ（CLAUDE.md 側）**: CC（`app/api/projects/[projectId]/route.ts` の行、「フォルダ（Project）名変更の整合性」、v195 の行）は `rename_project` が「関連4テーブルの `folder_name`」を同期すると書くが、v198 で Lore 側の同期を除去したため、現行の同期は `project_settings`／`novel_settings`／`threads` の3テーブル（`projects.name` の更新を除く）。v195 の行は当時の記述として正しい。CC 側の訂正対象（claude-md-corrections.md に追記）。【コード】
3. **PMM v26 が最新だが、昇格の判断は v13 が新しい**: PMM 系列は v26（2026-09-16）で止まり、「案A／案B 未決定」「削除モーダルの二択」は昇格 v13（2026-10-01）で案A に確定した。PMM v26 の §3-D・§5 は現状と合わない記述を含む。判断の出典は昇格 v13 を優先。【資料】
4. **Phase 5B の完了報告「`lore_embeddings.project_id` の NOT NULL 化」を含む 5C 計画**: 5B §4.2 は NOT NULL 化と旧 6 RPC 削除を 5C に挙げていたが、実際の 5C は NOT NULL 化をスコープ外とし、削除は旧3RPCだった（判断9）。5B 以前の資料の「6本」は誤り。【資料】
5. **Phase 3 実装報告（docs）と FN-P3 完了報告の差**: 実装報告は「本番 push・デプロイ前に Rui の実機確認が未実施」で終わり、FN-P5C §5 の表では Phase 3 は「本番確認済み」。docs 側（`docs/KabeHub_folder_name統一_Phase3_実装報告_v1.md`）は時点が古い。【資料】
6. **inventory.md の分類の確認事項**: `docs/KabeHub_folder_name統一_Phase3_実装報告_v1.md`・`Phase5C_実装ログ.md` は repo の docs 直下に残っており、方針書 §8 では archive 移動候補。内容は FN-P3／P5C の完了報告の要約で重複が多く、B のままでよい。【資料】
7. **inventory.md の分類の確認事項**: `KabeHub_PhaseE_実装方針ドラフト_v5_Claude案.md` と `KabeHub_PhaseE_Codex指示書_v1.md` は Phase E（v187〜v192）の実装指示で、実装済み。判断としては新規の情報が少なく、v5 の「確認済み事項」（`normalizeConsolidationCandidate()` が `project_id_a/b` に影響されない点）などを除けば C 相当の可能性。直していない。【資料】
8. **FN設計 §2.5 の `extract-settings` の `threadId` 未検証**: Phase 2 で直す予定だった。現行コードは `typeof threadId !== 'string' || threadId.length === 0` で 400 を返す。直ったと見られる。【コード】
9. **v193指示の「`folder_name` カラムの rename は対象外」と現行**: 列は残っているが、`threads`／`project_settings`／`novel_settings` の `folder_name` は legacy として扱われ、新規書き込みは `project_id` 併記。API からの受け付けは Phase 3 で 400（判断8）。【コード】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v26.md | A | 全文（15KB） |
| KabeHub_Project_Memory_Manager_post-MVPバックログ優先順位_v7.md | A | 全文（7KB） |
| KabeHub_Lore昇格ルール_設計検討_引き継ぎ資料_v13.md | A | 全文（`lore-rag.md` に判断を記載） |
| KabeHub_チャット参照元整理_課題B完了_引き継ぎ資料_v10.md | A | 前回（chat-core）で読了。project-memory は参照のみ |
| KabeHub_folder_name統一_設計検討_引き継ぎ資料_v1.md | A | §2.5・§3〜§7 |
| KabeHub_folder_name統一_Phase0_調査結果_v1.md | B | 冒頭〜§2（見出しで全体確認） |
| KabeHub_folder_name統一_Phase1〜5B_完了報告_v1.md | B | 各「未実施・軽微な記録事項」の節＋Phase 1 §3 |
| KabeHub_folder_name統一_Phase5C_完了報告_v1.md | B | §2・§4・§5 |
| KabeHub_PhaseE_実装方針ドラフト_v5_Claude案.md | B | 見出し＋§0・§2.6〜§2.9・§4〜§6 |
| KabeHub_PhaseE_Codex指示書_v1.md | B | 見出し＋デプロイバリア・横断制約・Out of scope |
| codex_instruction_v184_project_memory_topic_rpcs.md | B | 冒頭〜Constraints・付記 |
| codex-instruction-folder-settings-to-project-settings.md | B | Constraints・本番切替手順・Out of scope |
| docs/KabeHub_folder_name統一_Phase3_実装報告_v1.md | B | 全文 |
| docs/KabeHub_folder_name統一_Phase5C_実装ログ.md | B | 全文 |
| CLAUDE.md・docs/schema.sql・app／lib／scripts の該当ファイル | — | 既出判定・突合のための grep のみ |

読めなかった A 資料: なし（v10 は chat-core の抽出で読了済みの範囲。v13 は lore-rag.md に取り込み）。FN-P1〜P4・P5A・P5B は B のため、未実施の節だけを読んだ。
