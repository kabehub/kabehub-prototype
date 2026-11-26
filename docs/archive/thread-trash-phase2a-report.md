# Phase 2a 読み取りガード 実装報告

## 1. 変更ファイル一覧

1ファイル1行。DB・migration・RLS・公開 DB 関数・package.json は変更していない。

- `app/api/album/route.ts`
- `app/api/calendar/route.ts`
- `app/api/chat/route.ts`
- `app/api/explore/route.ts`
- `app/api/extract-settings/route.ts`
- `app/api/image-gen/route.ts`
- `app/api/lore/like/route.ts`
- `app/api/mcp/threads/[id]/messages/route.ts`
- `app/api/mcp/threads/route.ts`
- `app/api/search/route.ts`
- `app/api/share/[token]/fork/route.ts`
- `app/api/share/[token]/route.ts`
- `app/api/threads/[id]/branch-to/route.ts`
- `app/api/threads/[id]/copy/route.ts`
- `app/api/threads/[id]/messages/route.ts`
- `app/api/threads/[id]/tags/route.ts`
- `app/api/threads/route.ts`
- `app/settings/page.tsx`
- `lib/lore/batchTrain.ts`
- `lib/project-memory/auto-summary-update.ts`
- `lib/project-memory/auto-summary.ts`
- `lib/threadResourceCrud.ts`
- `scripts/apply-branch-edit-route.test.cjs`
- `scripts/auto-summary-test-helpers.cjs`
- `scripts/calendar-route.test.cjs`
- `scripts/lore.test.cjs`
- `scripts/mcp-threads-project-id-routes.test.cjs`
- `scripts/project-memory-auto-summary-update.test.cjs`
- `scripts/threadResourceCrud.test.cjs`
- `scripts/thread-trash-reads.test.cjs`（新規）
- `docs/thread-trash-phase2a-report.md`（本報告、新規）

既存テスト7ファイルは、追加された `.is()` や親確認に対応する mock と既存のクエリ期待値だけを更新した。新しい静的テストは既存の `scripts/*.test.cjs` 登録に含まれるため、テスト登録の変更は不要。

## 2. 経路の洗い出し表

`app/`・`lib/`・components・mobile 側の DB 呼び出しを調査した。直接の `threads` SELECT は引用符の両方を確認し、子テーブル、共有 view、helper、service role の取得も追跡した。表の応答はコード上で確認した契約であり、HTTP 実測ではない。認証・入力検証に先に失敗する場合は従来どおり。

| 経路 | HTTPメソッド | 対象テーブル | 親スレッドの確認方法 | ゴミ箱時の応答 | 結果 |
|---|---|---|---|---|---|
| `/api/threads` | GET | threads | 対象 SELECT に `deleted_at is null` | 200、一覧から除外 | 対応した |
| `/api/calendar` | GET | threads | 月範囲の SELECT に live 条件 | 200、一覧から除外 | 対応した |
| `/api/search` 空検索 | GET | threads | 一覧 SELECT に live 条件 | 200、結果から除外 | 対応した |
| `/api/search?target=both` | GET | threads / messages | タイトル候補と最終取得を live 条件、メッセージ候補は live 親 inner join | 200、結果・matchedMessageIds に含めない | 対応した |
| `/api/search?target=title` | GET | threads | タイトル候補と最終取得を live 条件 | 200、結果から除外 | 対応した |
| `/api/search?target=message` | GET | messages / threads | メッセージ候補を live 親 inner join、最終スレッド取得も live 条件 | 200、結果から除外 | 対応した |
| `/api/projects/[projectId]/memory/bootstrap/preview` → `selectAutoSummaryInput` | POST | threads / messages | ページ分割する候補 threads SELECT に live 条件、その ID から入力取得 | 候補から除外。他の候補もなければ既存の 200 `not_applicable / no_eligible_threads` | 対応した |
| `/api/projects/[projectId]/memory/update/preview` → `selectAutoSummaryUpdateInput` | POST | threads / messages | `pages("threads", ...)` の候補 SELECT のみに live 条件 | 新規入力から除外。入力がなければ既存の 200 `not_applicable / no_new_messages` | 対応した |
| 同 update の `loadAutoSummaryUpdateTopics` provenance 検証 | POST | messages / threads / revisions / cursors | 従来の project_id / user_id 整合チェックを維持 | trash だけを理由に provenance_mismatch にしない | 対応不要（過去の provenance 契約を保持） |
| `/api/explore` popular / trending | GET | threads / tags / messages / likes | service role の threads SELECT に live 条件、既存 limit より前。enrichment はその ID のみ | 200、items・cursor 対象から除外 | 対応した |
| `/api/explore` newest | GET | public_threads_view / 子テーブル | Phase 1 済みの公開 projection から得た ID のみ | 200、一覧から除外 | 対応不要（既存 view 経由） |
| `/api/share/[token]` | GET | threads / messages | service role の token SELECT に live 条件、既存の未存在判定から return | 404 `{"error":"Not Found"}` | 対応した |
| `/api/share/[token]/fork` | POST | threads / messages | service role のコピー元 SELECT に live 条件。本文・非表示件数の両方を読む前に既存判定から return | 404 `{"error":"Not Found"}` | 対応した（INSERT・カウンター処理は変更なし） |
| `/api/threads/[id]/copy` | POST | threads / messages | コピー元 SELECT に live 条件、本文取得前に既存判定から return | 404 `{"error":"Thread not found"}` | 対応した（複製先の書き込みは変更なし） |
| `/api/threads/[id]/branch-to` | POST | threads / messages | 分岐元 SELECT に live 条件、本文取得前に既存判定から return | 404 `{"error":"Thread not found"}` | 対応した（複製先の書き込みは変更なし） |
| `/api/threads/[id]/messages` | GET | threads / messages | live 親確認後だけ既存の user_id・thread_id 条件で取得 | 200 `[]` | 対応した |
| `/api/threads/[id]/tags` | GET | threads / public_threads_view / thread_tags | 所有 live 親、または live 公開 projection を確認してからタグ取得 | 200 `[]` | 対応した。他人の公開 live タグ取得も維持 |
| `/api/mcp/threads` | GET | threads / projects | service role の一覧 SELECT に live 条件、既存 limit より前 | 200 `{"threads": [...]}` から除外 | 対応した |
| `/api/mcp/threads/[id]/messages` | GET | threads / messages | service role の既存所有者確認 SELECT に live 条件 | 404 `{"error":"Not found"}` | 対応した |
| `/api/threads/[id]/notes` → threadResourceCrud.GET | GET | threads / thread_notes | helper 内で live 親確認を完了してから config.table を取得 | 200 `[]` | 対応した |
| `/api/threads/[id]/message-notes` → threadResourceCrud.GET | GET | threads / message_notes | 同 helper の live 親確認 | 200 `[]` | 対応した |
| `/api/threads/[id]/drafts` → threadResourceCrud.GET | GET | threads / drafts | 同 helper の live 親確認 | 200 `[]` | 対応した。helper caller はこの3つ全部を確認 |
| `/settings` handleBulkExport（本人の本文・子データ） | GET の DB 読み取り（ブラウザ） | threads / messages / thread_tags / thread_notes / message_notes / drafts | live 所有 threads を全ページ取得して ID 集合を確定し、子クエリの `.in("thread_id", ids)` で絞る | ZIP の対象から除外。live が空なら子データも空 | 対応した |
| 同 export profiles | GET の DB 読み取り | profiles | 親スレッドとは独立、従来の本人 ID 条件 | 従来どおり | 対応不要（プロフィール） |
| 同 export likes | GET の DB 読み取り | likes / public_threads_view | 本人 likes 全ページ取得後、所有 live IDs と公開 live IDs の和集合で絞る | ゴミ箱への likes を出力しない | 対応した。他人の公開 live スレッドへの likes を保持。非公開化済みの他人への likes は除外（下記判断参照） |
| `/api/album` | GET | messages / threads / Storage | `threads!inner(deleted_at)` と `threads.deleted_at is null` を同一 SELECT に適用し、range 前に絞る | 200、items・total・hasMore は live のみ | 対応した。join 列は返却前に除去、署名も取得済み live 行のパスだけ |
| `/api/extract-settings` | GET | threads / novel_settings | 本人の live 親を確認してから取得 | 200 `{"characters":[],"factions":[],"glossary":[]}` | 対応した（未存在時と同じ形式） |
| `/api/lore/batch-train` → fetchTargetMessages | POST | messages / threads | live 親 inner join、未学習・provider 等の既存条件と併せて limit 前に適用 | 入力から除外、既存の件数応答を維持 | 対応した（保存処理は変更なし） |
| `/api/stats` | GET | messages / ai_usage_events | 従来の期間・user_id 条件をそのまま保持 | 利用・課金実績に含め続ける | 調査して対応不要と判断。events 正本と messages の legacy fallback・時間帯集計を片側だけ除外すると不整合になる |
| `/api/chat` light 再生成の assistant / user 本文取得 | POST | messages / threads | 各 SELECT を live 親 inner join | 既存の 404 `target assistant message not found` / `target user message not found` | 追加調査で対応した（入力に再利用する本文） |
| `/api/chat` branch edit 後の AI 用 activeMessages | POST | messages / threads | 本文 SELECT を live 親 inner join | 未存在時と同様に DB 本文は空。既存の入力本文だけで後続処理 | 追加調査で対応した。RPC・保存処理は変更なし |
| `/api/chat` imageContextId | POST | messages / threads / Storage | 参照 SELECT を live 親 inner join | 未存在時と同様に画像文脈を追加しない | 追加調査で対応した。Storage download 前に除外 |
| `/api/image-gen` imageRefId | POST | messages / threads / Storage | 参照メッセージの SELECT を live 親 inner join | 404 `{"error":"参照画像が見つかりません"}` | 追加調査で対応した。生成・保存処理は変更なし |
| `/api/lore/like` | POST | messages / threads / lore_embeddings | メッセージ取得後、service role の live 親確認を既存重複確認・embedding 生成より前へ移動 | 404 `{"error":"Message not found"}` | 追加調査で対応した。live メッセージの所有者・role の既存判定を維持 |
| `/[handle]` 公開プロフィール、`/share/[token]`、スレッド tree 等 | GET（画面） | public_threads_view / 上記 API / likes | 公開 view または保護済み API で親データ取得後に表示・件数補完 | 公開一覧から除外、共有は既存エラー表示、tree の履歴は空 | 対応不要（入口の保護で対応） |
| `/api/arena` ensureArenaThread（初回 lookup・競合後 recheck） | POST | threads | 既存処理を変更していない | 2a では変更なし | Phase 2b 以降（trash は新規作成せず明示的に拒否する必要あり） |
| `/api/arena` timeTravel / 補償削除 | POST | messages / threads | 書き込み処理 | 2a では変更なし | Phase 2b 以降（DELETE の拒否・補償の扱い） |
| `/api/threads/[id]` | PATCH / DELETE | threads / messages / lore_embeddings | 所有権・削除対象・共有 token の確認 SELECT | 2a では変更なし | Phase 2b 以降（upsert・削除・Storage cleanup の前提確認） |
| `/api/threads/[id]/messages` の範囲削除、`messages/[messageId]` | DELETE / PATCH | threads / messages / lore_embeddings | 変更・削除の前提確認、deleteOwnedMessage helper | 2a では変更なし | Phase 2b 以降（書き込み） |
| `/api/messages/[id]`（別系統のルート） | PATCH / DELETE | messages / lore_embeddings / Storage | GET は存在せず、metadata SELECT は画像削除の前提。削除 helper も確認 | 2a では変更なし | Phase 2b 以降（更新・削除専用） |
| notes / message-notes / drafts の変更系、tags の重複確認 | POST / PATCH / DELETE | 子テーブル | helper と各ルートの書き込み・その前提確認 | 2a では変更なし | Phase 2b 以降（書き込み） |
| `/api/mcp/threads/[id]/messages` の所有権確認・時刻更新 | POST | threads / messages | 書き込みの前提確認 | 2a では変更なし | Phase 2b 以降。GET のガードと分けた |
| `/api/chat` thread lookup / upsert / recheck、lastActiveMsg | POST | threads / messages | スレッド確保・INSERT 用 branch 番号の前提確認 | 2a では変更なし | Phase 2b 以降。本文・画像の入力取得 SELECT だけを今回保護 |
| `/api/image-gen` 本文保存先の所有権確認 | POST | threads | 書き込み先の前提確認 | 2a では変更なし | Phase 2b 以降。imageRefId は今回保護 |
| `/api/extract-settings` 保存先の所有権確認 | POST | threads / novel_settings | リクエスト本文から抽出した設定を保存する前提確認 | 2a では変更なし | Phase 2b 以降（DB 本文の取得ではない） |
| `/api/threads/[id]/likes`、reports・project/account 削除等 | POST / DELETE / PATCH | threads / likes 等 | 書き込みの前提確認や RPC | 2a では変更なし | Phase 2b 以降（書き込み）。公開参照 view は既存対応済み |
| 生成済み Project Memory・Lore の一覧・検索・統合 | GET / POST | project_memory_* / lore_embeddings 等 | 通常スレッドの本文 SELECT とは独立 | 従来どおり | 対応不要（生成済み内容の巻き戻し・再計算は対象外。Lore は既存の archive / pinned 方針を維持） |
| storage-cleanup Cron | GET / POST | storage_cleanup_runs / RPC / Storage | 今回は対象外 | 従来どおり | Phase 4 以降（Cron） |

## 3. アリーナの入口の一覧と対応

| 入口 | 対応 |
|---|---|
| `/arena/[token]` の画面本文（fetchArenaData） | 保護済み `/api/share/[token]` GET に依存。trash では API が 404、画面は既存の `notFound()` |
| 同 `generateMetadata` / OGP | 同じ fetchArenaData を利用。trash の本文・件数を metadata に使わず、既存の汎用タイトルへ |
| `ArenaViewPage` の timeline | 上記ページから渡されるデータのみを表示。独立した DB 取得なし |
| 通常のチャット画面・tree からアリーナスレッドの履歴参照 | `/api/threads` と `/api/threads/[id]/messages` GET のガードで除外 |
| calendar / search / explore / profile / bulk export からの参照 | 上表の共通経路で除外 |
| `/arena` の実行中画面・テキスト出力 | ローカル state の既存メッセージを使用。DB の履歴 SELECT は存在しない。取得済みクライアント state の失効は今回の読み取りガード外 |
| `/api/arena` 通常生成・saveHumanMessage | クライアントからの history を受け取り生成・保存。DB 既存本文を返す読み取りではない。ensureArenaThread 等は Phase 2b |
| `/arena` の共有開始 | `PATCH /api/threads/[id]` で公開設定。書き込みとして Phase 2b |
| `/arena` timeTravel | まず `DELETE /api/threads/[id]/messages`、fallback は `POST /api/arena` mode=timeTravel。両方 Phase 2b |

`app/api/arena/route.ts` はファイル全体を変更していない。

## 4. 検証の区別

実行して成功したもの：`node --check`（構文確認のみ）。

- `scripts/thread-trash-reads.test.cjs`
- `scripts/apply-branch-edit-route.test.cjs`
- `scripts/auto-summary-test-helpers.cjs`
- `scripts/calendar-route.test.cjs`
- `scripts/lore.test.cjs`
- `scripts/mcp-threads-project-id-routes.test.cjs`
- `scripts/project-memory-auto-summary-update.test.cjs`
- `scripts/threadResourceCrud.test.cjs`

未実行：新規静的テストを含むテスト本体、`npm test`、`npx tsc --noEmit`、HTTP 確認、DB 接続、verify スクリプト。変更した `.ts` / `.tsx` 22ファイルは `node --check` の対象外として差分を目視確認した。実行時の PostgREST 応答や型チェックに合格したとの主張はしていない。

静的テストには、SELECT chain ごとの条件、両引用符、検索4分岐と最終取得、親確認と返却順、helper 全 caller、album の range 前ガードと返却列、batch limit 前ガード、export の ID 伝播とページ取得、追加の本文再利用経路を含めた。ネガティブ fixture はガード削除・別 SELECT のガードによる見せかけ・range 後への移動・親未存在 return の削除・join 列漏れを検出するためのもの。これらのアサーション自体は未実行。

## 5. 判断した点と Phase 2b への引き継ぎ

- **album / batchTrain の join**：`docs/schema.sql` の messages 定義に `thread_id uuid not null references threads(id) on delete cascade` がある。messages から threads への FK を根拠として PostgREST inner join を採用した。DB 接続・HTTP での schema cache 確認は指定に従い未実行。album の `.select(..., { count: "exact" })`・live 親条件・既存 order・range は一つのクエリであり、count 実行時にも条件が適用される構造。取得後フィルタは使っていない。
- **join 列**：album は `threads` を取り除いた message だけを展開する。他の join 取得も、検索では ID の抽出、chat / image-gen では必要列の取り出し、batchTrain では既存の入力 JSON 作成にだけ使い、親列を API に追加していない。
- **export の上限**：live threads を先に500行ずつ全ページ取得。子クエリは ID を100件ずつに分け、各 batch を500行ずつ取得する。DB の既定1000件上限を前提に、ゴミ箱が先の1000件を占めることによる live データの欠落を防ぐ。子テーブルは取得後フィルタを使っていない。ID が空なら子 SELECT 自体を行わない。子のページ取得は created_at と id で安定させ、スレッド内メッセージの時系列を保つ。元の export SELECT には明示的な order がなかったため、元の未指定順序との完全一致は保証できない。通常一覧・検索・album 等の既存 order / limit はそのまま。
- **likes**：raw threads の SELECT RLS は所有者限定のため、単純な inner join は他人の公開 live スレッドへのいいねまで失う。本人 likes を全ページ取得し、所有 live IDs と `public_threads_view` で確認できる公開 live IDs の和集合で出力を絞った。public ID 確認も100 IDずつ、500行ページ取得。取得後フィルタは likes だけで、元データを全ページ取得してから適用するため1000件上限による live の取りこぼしはない。現在非公開になっている他人のスレッドへの likes は、live と trash を通常権限では区別できないため今回の出力から除外する判断を採用した。`profiles` は従来どおり。
- **公開タグ**：raw threads の owner RLS だけで判定すると live 公開タグの既存応答が変わる。そのため公開 projection の fallback を追加。タグ自身の RLS・並び・返却形式は変えていない。
- **ensureArenaThread**：live 条件だけを足すと trash を未存在と誤認し、同じ ID の INSERT に進む。Phase 2b で deleted_at を明示的に検査して拒否すること。初回 lookup と一意制約競合後の recheck の両方が対象。
- **timeTravel DELETE**：arena API と通常 messages 範囲 DELETE の双方を Phase 2b で扱う。保存・共有設定・補償 DELETE・upsert の可否も同 phase で整理する。
- **競合**：batchTrain の入力取得後から保存までに親が trash になる競合は今回対象外。Phase 2b または DB 側のロック・再確認等で別途扱う。親確認後に子を読む複数クエリもトランザクション snapshot を新設してはいない。
- **既存要約**：過去の provenance、生成済み Project Memory の巻き戻し・再計算は行わない。

## 6. auto-summary.ts の既存の未コミット変更

作業前から `lib/project-memory/auto-summary.ts` が変更状態だったため、作業開始時のファイル内容を基準に、候補 threads SELECT の `.select("id, title")` 直後へ `.is("deleted_at", null)` を1箇所だけ文字列置換で追加した。全文の再生成・改行変換・checkout / restore は行っていない。元の LF を維持し、本文・プロンプト等の既存内容は保持した。最終差分も当該1行への述語追加だけである。

`auto-summary-update.ts` の差分も入力候補の1行だけであり、provenance 検証部分には差分がない。`apps/.idea/` と `artifacts/` は変更していない。commit / push は行っていない。

## 7. 適用範囲の注記

今回の変更は、アプリの通常読み取り経路と、既存本文を二次利用する入力取得の保護である。`threads` の RLS を変更するものではなく、DB 直接アクセスを RLS で制限する対応ではない（A 案）。ゴミ箱 API / UI、書き込み拒否全般、Cron、クライアントへ取得済みのデータの失効は別 phase の対応となる。
