# 抽出メモ: trash（①-2）

作成: 2026-11-25／対象: スレッド削除のゴミ箱化（soft delete）。migration v207、読み取り・書き込みガード、API、`/trash` ページ、Undo、期限切れ purge Cron。
タグ: 【資料】／【コード】（実ファイルを grep／ls で確認）／【未確認】。CC＝CLAUDE.md。
略称: v3＝スレッド削除ゴミ箱化 引き継ぎ資料 v3（2026-10-25。v1・v2 は C）、2a＝`docs/thread-trash-phase2a-report.md`（読み取りガード）、2b＝`docs/thread-trash-phase2b-report.md`（書き込みガード・補償 DELETE・purge ヘルパー）、3B-2＝`docs/thread-trash-phase3b2-report.md`。2a・2b は未追跡（方針書 §8 の archive 移動候補）、3B-2 は追跡済み。
**注**: ゴミ箱化は CLAUDE.md にほとんど載っていない（v207 の1行と Cron のみ。trash 系 RPC・API・`/trash`・`lib/threads/*`・テスト群は0件）。そのため、本ファイルの「地雷」は大半が CC 未掲載で、`claude-md-corrections.md` に集約して追記した。

## 確定した判断

1. **方式は「A+B ハイブリッド」**: スレッドの×削除を即・完全削除から「ゴミ箱（soft delete）＋Undo トースト、7日後に Cron で自動物理削除」へ。画像はノータッチ（物理削除時に既存の Storage 削除ロジックを再利用）。対象はスレッド単位のみで、アカウント削除・Project 削除・生成済み Project Memory（巻き戻さない）・メッセージ単体／分岐の削除は対象外（ただしゴミ箱スレッドに対する書き込みは拒否する）。保持期間は7日で `thread_trash_retention()` が単一情報源、UI 文言は「7日後に完全削除予定」。判断者: Rui（v3 §3「決定事項（Rui 確定）」）。出典: v3 §1・§3。【資料】【コード】（`docs/schema.sql` に `soft_delete_thread`）
2. **A 案**: 保持期間・復元の保証は API／RPC の契約であり、authenticated による `threads` への直接 UPDATE／DELETE は禁止しない。**RLS は変更しない**。エクスポートとアリーナはゴミ箱のスレッドと子データを除外。Likes は Codex 案（`lore/like` はゴミ箱スレッドに 409）。出典: v3 §3、2a §7。【資料】
3. **Undo トースト 8 秒**。Undo は確認なしで復元。**公開スレッドの復元は事前に確認ダイアログ**（復元後に再公開される旨）。409 のとき入力欄に復元するのは**手入力テキストのみ**（`queryText ?? content`、入力欄が空のときだけ）、添付ファイルの UI 復元・画面遷移後の保持は対象外（Rui 了承）。出典: v3 §3、3B-2「エラーと入力の扱い」「入力保持の保証範囲」。【資料】
4. **生成中に削除した場合**: チャットのストリーミングは abort（理由 `"thread-trashed"`）。**画像生成（`/api/image-gen`）は abort しない**（signal 未接続のため。遅延レスポンスの UI 反映だけ防ぐ）。出典: v3 §3。【資料】
5. **Cron は dry-run 既定**: 環境変数 `THREAD_TRASH_PURGE_DRY_RUN` が文字列 `"false"` と完全一致したときだけ実削除。実行履歴の専用テーブルは作らない（構造化ログのみ）。出典: v3 §3・§4-4。【資料】【コード】（`app/api/cron/thread-trash-purge/route.ts:51`、`.env.local.example:43` は `true`）
6. **役割分担**: Claude が設計・レビュー、ChatGPT がセカンドオピニオン（Claude が実コードで裏取り）、Codex が実装。出典: v3 §3。【資料】
7. **フェーズ一覧**: Phase 1 DB（v207）`781a838`／2a 読み取りガード `28e90b6`／2b 書き込みガード・補償 DELETE 保護・purge ヘルパー `f847b2a`／3A API 切り替え・ゴミ箱ルート新設 `f5400f3`／3B-1 Web の削除・Undo・`/trash`・非同期ガード `de58a43`／3B-2 409 ハンドリング・入力保持・HTTP 失敗の確認漏れ `0b131d6`（レポート `7a203c6`）／4 期限切れ purge Cron `971161d`／マージ PR #1 `a883349`（Vercel Production Ready）。テスト件数の推移: 798（2b）→863（3A）→893（3B-1）→978（3B-2）→1008（Phase 4）。出典: v3 §2。【資料】【コード】（`781a838` は git log、v207 は schema 反映済み）
8. **DB（v207）の設計**: `threads.deleted_at`、`lore_embeddings.archived_by_thread_delete_at`、`idx_threads_deleted_at`。RPC は `soft_delete_thread`（`FOR UPDATE`、既にゴミ箱なら既存の `deleted_at` を返す＝延長しない）、`restore_thread`（ゴミ箱でなければ no-op、期限超過は `trash retention expired`）、`list_trashed_threads`、`list_expired_trashed_threads`（`p_limit` 1〜200、service_role のみ、`deleted_at`・`id` 昇順）、`purge_expired_thread`（service_role のみ、条件付き DELETE）、ガード関数。**期限境界**: 復元可は `now() < deleted_at + 7日`、Cron 削除可は `now() >= deleted_at + 7日`。ガード対象テーブルは messages／thread_tags／thread_notes／message_notes／drafts（BEFORE INSERT で `thread is in trash`）。出典: v3 §4-1。【資料】【コード】（`docs/schema.sql` に `soft_delete_thread` が3件）
9. **RPC エラーマッピング**: `thread not found`→404、`trash retention expired`／`thread is in trash`→409、42501→403。マッパーは message だけでなく `error.code`（P0001／42501）も見る（`mapThreadTrashRpcMessage`）。出典: v3 §4-1、2b §4。【資料】
10. **API（Phase 3A）**: `DELETE /api/threads/[id]`→`soft_delete_thread`（応答 `{success, deleted_at, expires_at}`、物理 DELETE は除去。補償 DELETE とアカウント削除経路は維持）／`GET /api/trash/threads`／`POST /api/trash/threads/[id]/restore`（所有者条件つき pre-SELECT→RPC→`{success, is_public}`）／`DELETE /api/trash/threads/[id]`（`purgeThread` の user モード。ゴミ箱に無ければ 404）。`lib/proxy-paths.ts` に bearer で登録。Lore の手動 archive（`lore/[id]`・`bulk-archive`）は目印 `archived_by_thread_delete_at` を null にする。出典: v3 §4-2。【資料】【コード】（`lib/proxy-paths.ts:108-110`、`app/api/threads/[id]/route.ts:14` が `soft_delete_thread` を呼ぶ）
11. **冪等性（テスト DB の API 確認）**: ゴミ箱内の再 DELETE は 200（最初の `deleted_at` のまま）、ゴミ箱に無いスレッドの restore も 200、ゴミ箱内スレッドの `GET /messages` は 200＋`[]`（Phase 2a の契約）。出典: v3 §4-2。【資料】
12. **読み取りガード（Phase 2a）の方針**: 通常の読み取り経路と、既存本文を二次利用する入力取得（auto-summary、batchTrain、album、export、検索、calendar、explore、profile、share 等）を保護する。**album／batchTrain は messages→threads の FK を根拠に PostgREST inner join を採用**（DB 接続・HTTP での schema cache 確認は未実施）。export は live threads を先に500行ずつ全ページ取得し、子クエリは ID を100件ずつに分けて各 batch を500行ずつ取得（DB 既定1000件上限でゴミ箱が先の1000件を占めて live が欠落するのを防ぐ）。likes は本人 likes を全ページ取得し、所有 live IDs と `public_threads_view` の公開 live IDs の和集合で出力（単純な inner join は他人の公開 live スレッドへのいいねまで失うため）。公開タグは公開 projection の fallback を追加。出典: 2a §5。【資料】【コード】（`lib/project-memory/auto-summary.ts` に `deleted_at` 条件が入っていることは資料記載。今回 grep せず）
13. **アリーナの入口**: `/arena/[token]`・OGP は保護済み `/api/share/[token]` GET に依存（ゴミ箱は 404、画面は `notFound()`）。`ensureArenaThread` は live 条件だけを足すとゴミ箱を未存在と誤認して同じ ID の INSERT に進むため、Phase 2b で `deleted_at` を明示的に検査して拒否（初回 lookup と一意制約競合後の recheck の両方）。`timeTravel` の DELETE は arena API と通常 messages 範囲 DELETE の双方を 2b で扱う。出典: 2a §3・§5、2b。【資料】
14. **書き込みガード（Phase 2b）**: 事前確認で本人のゴミ箱と分かれば、AI・Storage・Lore・子 DB 変更の前に 409。`PATCH /api/threads/[id]` は条件付き UPDATE（`deleted_at is null`）→0行ならゴミ箱確認→行なしのときだけ INSERT（`.upsert()` から変更）。保存失敗時の P0001 `thread is in trash` の扱い: tags／notes／message-notes／drafts／MCP message／arena の user・介入 INSERT／chat の user INSERT・`apply_branch_edit` の INSERT トリガーエラーは 409（共通ボディ）、**image-gen の DB INSERT は status だけ 409 で既存の `DB保存失敗: thread is in trash` ボディと Storage 処理を保持**、arena の assistant INSERT は 200 `{"message":…,"saved":false}`（生成済み応答の契約）、chat の `saveAssistantMessage`／SSE 保存と `waitUntil` の service role REST fallback は既存の挙動を維持（Phase 3 設計）。出典: 2b §3・§4。【資料】【コード】（`app/api/threads/[id]/route.ts:84-98` の `deleted_at` 条件）
15. **purge の設計**: user モード＝owner＋`deleted_at is not null` の DELETE RETURNING、cron モード＝`purge_expired_thread(p_thread_id uuid) returns boolean` による期限付き条件 DELETE（EXECUTE は service_role のみ）。入力は `mode:user + client + authenticatedUserId` と `mode:cron + serviceClient` の判別共用体（user 側に service client 生成はなく、cron の owner は service client で DB から取得）。Storage 失敗でも削除済み DB 行は復元せず outcome `deleted` を維持し、`attemptedCount`／`failedCount`／`errorCodes` を返してログにも件数を出す。`recalc_fork_count` は呼ばない（Cron からは `auth.uid()` が null）。出典: 2b §6、v3 §9。【資料】
16. **Phase 3B の Web 実装**: `components/Toast.tsx` は `showToast(message, type?, { action, duration })`（既存2引数呼び出しは無変更）。非同期ガードは `activeThreadIdRef`・`viewEpochRef`・`commitActiveThread`・`captureView()`・`isCurrentView(view)`（**epoch と threadId の両方が一致したときだけ有効**。削除→Undo→再選択で同じ ID に戻っても古い処理を有効にしない）、`createLatestRequest()` で一覧取得・検索は latest-wins、`abortReasonRef: "user" | "thread-trashed" | null`。`lib/threads/trash-client.ts` の型付き `ThreadWriteError`、`fetchWithStreaming` は非 2xx で throw。**ゴミ箱扱いは HTTP 409 かつ `error === "thread is in trash"` だけ**（404・他の 409・500 は同一扱いにしない）、トースト「このスレッドはゴミ箱にあります」＋「ゴミ箱を開く」（`/trash` へ遷移）。`persistAbortedMessages` は全 PATCH の完了を `Promise.allSettled` で待ち、失敗時は再 GET で正の状態に戻す。HTTP 失敗の確認漏れ修正: タイトル更新・中断メモ化 PATCH・画像生成の事前ステップ・novel-check・arena（409 のときはフォールバックしない）。出典: v3 §4-3、3B-2。【資料】【コード】（`lib/threads/trash-client.ts`・`view-guard.ts`・`app/trash/page.tsx` の存在を確認）
17. **`/trash` ページ**: 一覧・残り日数（切り上げ）・公開バッジ・復元（公開は事前確認）・完全削除（確認必須）。`PROTECTED_STATIC_PAGES` と `proxy.ts` の matcher に登録し、Sidebar の確認文言は「ゴミ箱に移動しますか？」。出典: v3 §4-3。【資料】【コード】（`lib/proxy-paths.ts:150` に `"/trash"`）
18. **Cron（Phase 4）**: `GET /api/cron/thread-trash-purge`、runtime nodejs、`maxDuration = 60`。認可は storage-cleanup と同じ（`CRON_SECRET` 未設定→500、不一致→401、管理クライアント生成の例外も 500）。1 回最大50件（RPC は `p_limit: 51`、51件目で `limitReached`）、古い順に逐次処理、1件ごとに try/catch、**時間予算40秒**（新しい候補の開始前に判定。進行中の purge は中断しない）。集計 `attemptedCount／deletedCount／notFoundCount／errorCount／storageFailedCount／limitReached／timeBudgetReached／errorCodes`、`errorCount>0` のときだけ HTTP 500、Storage 失敗のみなら 200＋warn、`not_found`（競合で既に無い）は正常扱い。ログ接頭辞 `[thread-trash-purge-cron]`（thread id と errorCode のみ）。スケジュール `0 17 * * *`（UTC＝日本時間02:00頃、孤児回収 `0 18 * * *` と1時間ずらす）。Storage の取り残しは v131 の孤児回収（作成から24時間超・有効参照なし）が拾う。出典: v3 §4-4。【資料】【コード】（CC にも Cron 行と環境変数の記述あり）
19. **検証結果（記録）**: 自動テスト1008件 pass、並行実行テスト（Node `pg` の別セッション。SQL Editor では検証にならない）PASS×3、Phase 2b 本番確認（テストアカウント、2026-10-23）で書き込み経路はすべて 409 かつ副作用なし、テスト DB の API 確認スクリプト 19/19・Cron 実削除 7/7 PASS、同一 Storage パス共有の SQL は本番・テストとも 0 行、本番デプロイ後の Cron 手動実行は `mode:'dry_run'`・`candidateCount:0`、本番 UI 実機確認は Rui 確認済み。出典: v3 §5。【資料】

## 地雷（CLAUDE.mdに載っていないもの）

1. **ゴミ箱スレッドへの messages INSERT はガードで拒否される**。テストデータは「通常のスレッド作成→メッセージ追加→`deleted_at` を設定」の順で作る。本番確認ではゴミ箱状態を維持したまま操作し、前後で `deleted_at` を確認する（途中で null に戻ると誤検知）。出典: v3 §4-1・§9。【資料】
2. **`purge.ts` のページングは、実取得件数で offset を進め、空ページまで続ける**（PostgREST max-rows < 500 での取りこぼしを避ける）。出典: v3 §4-2・§9。【資料】
3. **補償 DELETE にも `deleted_at is null` が必要**（4箇所の thread 補償 DELETE、MCP の `updated_at`）。restore-branch の HTTP メソッドは PATCH。出典: v3 §9、2b §6。【資料】
4. **経路の洗い出しは `.from("threads")` と `.from('threads')`、messages 経由、ヘルパー経由も対象にする**。公開側の除外は view ではなく、view が読む関数の本体を直す。出典: v3 §9。【資料】
5. **非同期ガードはスレッド ID の一致だけで判定しない（epoch と組み合わせる）**。生成が新規スレッドを作る場面では、epoch は commit の後に捕捉する。出典: v3 §9。【資料】
6. **Cron の配線は3か所＋認証**: `vercel.json`、`API_AUTH_CLASSIFICATIONS`（GET／internal）、**`proxy.ts` のセッション確認除外と `config.matcher` の両方**（入れ忘れると Cron Secret 付きでも proxy で 401）。Vercel の Cron は本番デプロイでのみ動く（プレビューでは動かない）、Hobby は2本・日次・1時間の揺れ。出典: v3 §4-4・§6。CC に Cron の一部は既出（`CRON_SECRET`・DRY_RUN）。【資料】【コード】（`lib/proxy-paths.ts:43`）
7. **ゴミ箱起因の 409 を検知したら入力欄の復元は「入力が空のときだけ」、現在の view でのみ**。新しい入力・別 view には復元しない。タグも同様。再生成の 409 は共通通知後に既存の再 GET 同期を使う。出典: 3B-2。【資料】
8. **`persistAbortedMessages` の失敗時の再 GET も失敗した場合は、未保存の memo を新規に作って表示しない**（元の表示を残し、次の読み込みで再同期）。混在失敗に trash 409 があればその通知を優先し、通知は1回。`abortReasonRef === "thread-trashed"` では通知を出さない。出典: 3B-2。【資料】
9. **`handleSwitchTemporary` は未修正の別課題**: 一覧に対象が無いと `POST /api/threads`（実装は GET のみ＝405 想定）を送って `res.ok` を確認せず、続く `POST /api/chat` も `res.ok` を確認しないため、HTTP 失敗が通信例外にならなければ失敗を保存成功として扱いうる。一時保存の `isTemporarySave`／`savedMessage` は chat route に存在しない。出典: 3B-2「handleSwitchTemporary の調査」。【資料】【コード】（`app/api/threads/route.ts` は GET のみ）
10. **古いタブからの PATCH が purge 済みスレッドを再作成する可能性**（既存の挙動）。別タブで開いていたゴミ箱スレッドの URL は空の画面になる（`GET messages` が 200＋`[]`）。出典: v3 §8。【資料】
11. **UPDATE／DELETE／`novel_settings` upsert 等で、親確認後にゴミ箱化される競合は残る**。アプリの SELECT と DML を同一トランザクションにしておらず、DB 側に UPDATE／DELETE ガードは無い（INSERT のみ）。`likes`／`reports`／`ai_usage_events`／独立 Lore は意図的に保証外。範囲 DELETE の補助情報取得（Lore archive・Storage path 収集）は既定1000行上限で取りこぼしが残る。出典: 2b §6。【資料】
12. **image-gen は事前確認後にゴミ箱化されると、Storage upload が済んでから DB INSERT が拒否されうる**。upload 済みファイルの削除は新設しておらず、残留は v131 の孤児回収（24時間超）に委ねる。孤児 Cron の `STORAGE_CLEANUP_DRY_RUN` は文字列 `"false"` 完全一致のときだけ delete モード（本番は delete モード）。出典: 2b §6・§7、v3 §5。【資料】【コード】（`app/api/cron/storage-cleanup/route.ts` は CC に既出）
13. **同一 Storage パスを複数メッセージで共有する機能（import 等）を将来作る場合は、`purgeThread` に参照除外（削除後・Storage 削除前に他メッセージの有効参照を確認）を足す**。現状は共有パスなし（SQL で本番・テストとも0行）。出典: v3 §8-13。【資料】
14. **`verify-thread-trash.mjs` はテストユーザーを作成・削除するため本番で実行しない**。テスト DB で開発サーバーを動かすには `.env.test.local`（テスト用スクリプト設定）ではなく、本番用 `.env.local` の URL・anon key・service role key をテストの値に差し替える。出典: v3 §8-14・§9。【資料】【未確認】（スクリプト名は CC に無い）
15. **Windows CMD の注意**: `set X=false&& cmd` は `&&` の前にスペースを入れない（値が `false ` になる）。PowerShell の `%` 演算子を `%%` と書かない。起動済みの `next dev` が残っていると別ポートで起動するので `taskkill /PID` で止める。出典: v3 §9。【資料】
16. **Codex 共通ルールブロック（冒頭に付ける）**: ブランチ運用、本番 DB に接続しない、`git add` の個別指定、CRLF/LF と BOM の維持、`apps/mobile` 不可侵、推測で埋めない、`npm test` と `tsc` の検証、レポート作成。事前調査（読み取り専用）→実装の順で投げる。Claude の VM ではフルのテスト・tsc は信頼できない（Rui の環境で検証）。出典: v3 §9。【資料】
17. **レポート・テストログはコミットしない**: `docs/thread-trash-phase*-report.md`（※3b2 は追跡済み）、`test-result.txt`、`tsc-result.txt`、`apps/.idea/`、`artifacts/`。出典: v3 §9。【資料】【コード】（2a・2b は未追跡、3b2 は追跡済み）

CLAUDE.mdに既出: 4項目（`CRON_SECRET` 共用・`THREAD_TRASH_PURGE_DRY_RUN` の完全一致とdry-run既定・`vercel.json` の schedule `0 17 * * *`・`thread-trash-purge-cron` の仕様と上限50件・40秒）。

## 未実装・宿題

1. **dry-run の観測→実削除への切り替え**: 実際にゴミ箱のスレッドが7日を超えてから、Vercel Logs の `[thread-trash-purge-cron]` で候補数・thread id を確認し、候補が意図したものだけなら `THREAD_TRASH_PURGE_DRY_RUN=false` を Production に設定して再デプロイ。切り替え後は deleted／notFound／error／storageFailed／timeBudgetReached と処理時間を観測する。出典: v3 §7。【資料】【未確認】（本番の現在値は不明）
2. **プライバシーポリシーの更新（7日間のゴミ箱保持）**、`thread_tags_name_check` の schema 反映（別タスク）。出典: v3 §7。【資料】【コード】（`app/privacy/page.tsx` に「ゴミ箱」「7日」の記述なし）
3. **モバイル（Capacitor）版の対応（Phase 3C）**: Undo トースト・ゴミ箱ページは未対応。モバイルの×削除も API が soft delete になるため、一覧から消えて7日後に完全削除される挙動になる（復元手段は Web のみ）。出典: v3 §7・§8-5。【資料】
4. **古い Vercel プロジェクト `kabehub-prototype-6lud`**（旧リポジトリ `RuiMatsumoto95/kabehub-prototype` に接続）の整理。PR のたびに「GitHub アカウント未接続」で × になる。出典: v3 §6・§7。【資料】【未確認】
5. **既知のギャップ（受け入れ済み）**: ①失敗する古い候補による後続の滞留（毎回古い順に最大50件。DB エラーが続くと遅れる。予約・カーソルは未実装）②巨大スレッド1件の処理時間（60秒超の可能性、実測なし）③DB 削除後のタイムアウト・Storage 失敗の残骸は v131 孤児回収に委ねる④重複起動・孤児 Cron との競合（排他なし）⑤409 以外の失敗では入力を復元しない（添付も復元しない）⑥Sidebar の「ゴミ箱を開く」リンクはフルリロード（一時チャットのメッセージが消える）⑦novel-check の途中保存分が残ることがある⑧一覧取得と検索が同じ `threadRequests` カウンタを共有（`expires_at` の形式が API 間で異なる）⑨ストリーミング中にゴミ箱へ移した場合、中断された生成は戻らない。出典: v3 §8。【資料】【未確認】
6. **chat の POST は 409 以外の失敗を確認していない箇所が残る**。軽微な指摘（chat ルートの 409 のインデント、batchTrain のスキップログが `securityGuardRejected` を使っている）は未対応。出典: v3 §8-6・§8-14。【資料】
7. **任意**: 一覧取得と検索の共有カウンタの分離、ゴミ箱起因の中断の追加改善。出典: v3 §7-6。【資料】
8. **2b が「Phase 3 設計」として先送りした生成・SSE 中のゴミ箱化**（既に開始した SSE の HTTP status を 409 に変えない）は、v3 では「中断された生成は戻らない」として受け入れ。`image-gen` の upload 済みファイル削除は新設しなかった。出典: 2b §6。【資料】

## 矛盾・要照合

1. **CLAUDE.md の v207 行（A: 古い）**: 「アプリ・API・UI・Cron は Phase 2 以降」（v207 の行末）は、v3 によれば Phase 1〜4 すべて実装・main マージ・本番デプロイ済み。さらに CC に `/trash` ページ・`app/api/trash/threads/*`・`lib/threads/*`・trash 系テスト群・非同期ガード・trash 系 RPC の記述が0件。claude-md-corrections.md に追記。【コード】
2. **CLAUDE.md の DB 操作「`threads/[id]/route.ts` の PATCH は `.upsert()` 方式」「upsert の title 必須」**: 現行 `app/api/threads/[id]/route.ts` の PATCH は `deleted_at is null` 条件つき UPDATE→ゴミ箱確認→行なしのとき INSERT に変わり、DELETE は soft delete（`soft_delete_thread`）。CC の `threads/[id]` の行（「スレッドのCRUD。PATCHはupsert方式」）も同様に古い。【コード】
3. **v3 §1 の「Phase 3B-1 のレポート」**: `docs/thread-trash-phase3b1-report.md` は存在せず、3B-1 の詳細は v3 §4-3 のみ。2a・2b・3B-2 の3本だけがレポートとして残る。【資料】
4. **2a・2b の「検証の区別」と v3 の最終検証**: 2a は `node --check` のみ実行して「`npm test`・`tsc` は未実行」、2b も同様。最終的には v3 §5 の1008件 pass・`tsc` クリーン（Phase 4 時点）で担保されている。2a／2b の「未実行」は当時の記述で、現在の状態としては読まない。【資料】
5. **2a §3 の `/arena` の `timeTravel`・共有開始が Phase 2b 対象**: 2b の経路表で対応済みと記載。2a の記述はこの時点の引き継ぎ。【資料】
6. **2b §7 の「RUI が Vercel 本番で確認する事項: `STORAGE_CLEANUP_DRY_RUN` の値」**: v3 §5 で `delete` モード（30日で候補0件）と確認済み。【資料】
7. **inventory.md の分類の確認事項**: `docs/thread-trash-phase3b2-report.md` は追跡済みで B（archive 移動候補）。2a・2b・3b2 は方針書 §8 で archive へ移す予定で、v3 が判断を要約済みのため、②では「地雷」と「確定した判断」の出典として使い、本体は archive でよい。直していない。【資料】
8. **v3 の「Phase 3B-1 のテスト 893件」「Phase 4 の 1008件」と現行 CC の件数（1827）**: 別時点の値（`npm test` 全体の件数）。参照しない。【資料】【コード】
9. **v3 §6「Hobby プラン」**: Vercel のプランは Cron の本数（2本）・日次制約の前提。現在もこの前提かは未確認。【資料】【未確認】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| KabeHub_スレッド削除ゴミ箱化_引き継ぎ資料_v3.md | A | 全文（19KB） |
| docs/thread-trash-phase2a-report.md | B | 見出し＋§3〜§7（§1 変更ファイル一覧・§2 経路表は未読） |
| docs/thread-trash-phase2b-report.md | B | 見出し＋§3・§4・§5〜§7（§1・§2 の表は未読） |
| docs/thread-trash-phase3b2-report.md | B | §「エラーと入力の扱い」〜「検証」（変更ファイル一覧は未読） |
| CLAUDE.md・`docs/schema.sql`・`lib/proxy-paths.ts`・`app/api/threads/[id]/route.ts`・`app/api/cron/thread-trash-purge/route.ts`・`app/privacy/page.tsx`・`lib/threads/`・`app/trash/` | — | 既出判定・突合のための grep／ls のみ |

読めなかった A 資料: なし。
