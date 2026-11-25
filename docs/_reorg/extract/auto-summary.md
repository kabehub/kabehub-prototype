# 抽出メモ: auto-summary（①-2）

作成: 2026-11-25／対象: Project Memory の自動要約（初回生成＝bootstrap、差分更新＝「会話からMemoryを更新」、cursor／checkpoint）。
タグ: 【資料】／【コード】（実ファイルを grep で確認）／【未確認】。CC＝CLAUDE.md。
**読んだ資料は1本のみ**: `KabeHub_自動要約_現状整理_引き継ぎ資料_v15.md`（A、2026-10-15）。inventory.md で auto-summary に紐づく A/B はこれだけで、v1〜v14 は C（旧版）のため読んでいない。v15 が引用する「v14 §5」「v12 §7」「v14 §7」「v14 §8」の本文は未確認。初回生成（bootstrap）の設計判断・プロンプト v8 までの経緯は、CC の地雷表が事実上の正本になっている。

## 確定した判断

1. **差分要約（#6）の Phase 1〜3 はここで一区切り**。残りは任意のフォローアップのみ。次の候補は自動要約の外（iPhone 実機確認、Phase 4 マネタイズ、CC「次に実装予定」の各ロードマップ）。出典: v15 §1・§6。【資料】
2. **Phase 3 実装の範囲（コミット `674f926`）**: Memory タブの4ボタン構成、反映案モーダル `ProjectMemoryAutoUpdateModal.tsx`（z-index 1100/1101）、Sidebar 配線、テスト。続いて CC の現行化（`e9f3156`）、docs の v206 適用済み表記の統一（`d283065`）。2台の PC とも `d283065` で同期。出典: v15 §1・§2。【資料】【コード】（モーダル・`memory/update/preview`・`checkpoint` route の存在を確認）
3. **主ボタン（紫塗り）は同時に最大1つ**。標準未作成かつ生成可能なら初回生成、標準 4/4 作成済みかつ更新可能なら更新、それ以外はサマリ取得済み／エラー時に一覧。出典: v15 §3-1。【資料】（CC の `ProjectMemoryTab` の記述と一致）
4. **タブ説明文に「あなたの発言のみが対象」「更新不要と判定された発言は確認済みとして自動記録される」を明記**（v14 §4-2 の宿題を解消）。モーダルにも「AIの返答は含みません」を表示。出典: v15 §3-1。【資料】
5. **UI の generate は checkpoint_only 応答時に自動記録するため、ボタン操作を「読み取り専用」と扱わない**。preview route 自体は読み取り専用。手動確認は常にテスト用 Project のみ。出典: v15 §5。【資料】（CC に既出）
6. **警告はすべて「警告のみ」でブロックしない**: 標準注入 ON 本文が 7,000 字超、8,000字選抜で新たに注入されなくなる topic、選択 topic の Lore 状態。警告用 topic GET が失敗しても適用は許可（「警告を確認できませんでした」を表示）。`computeUpdateWarning` を UI 側で再実装せず再利用。Lore: current →「適用するとLore側は『更新あり』になります」、stale →「すでに『更新あり』。適用後は再昇格が必要」。出典: v15 §3-2・§5。【資料】
7. **結果表示は `preview.proposals` でなく results 全体（unchanged の topic を含む）**。`updateResultLabel` が到達可能な status×checkpoint を分類する。結果表示後の同 run 再実行は禁止。出典: v15 §3-2・§5。【資料】
8. **`failed`（ネットワーク例外）は「未適用」と断定しない**。サーバー成功の可能性があるため「更新結果を確認できませんでした。Project Memory一覧で現在の内容を確認してください」と表示する。checkpoint 失敗は「次回、同じ発言が再度対象になる場合がある」。出典: v15 §3-2・§5。【資料】
9. **「すべて見送る」は2段階（確認→「見送りを確定」）**。確認中は他操作不可（確認の取り消しのみ可）。0件選択では apply を呼ばず見送りを使う。「閉じる（何も消費しません）」は、閉じる・Escape・背景クリックのどの経路でも checkpoint しない。適用中は閉じる・Escape・背景クリックを無効化。出典: v15 §3-2。【資料】
10. **Sidebar の排他**: 更新 busy（generating／isApplying／preview）中は既存3操作（初回生成・整理・一覧）を disabled＋handler 先頭で禁止。逆に初回生成・整理・一覧・保存・名前変更・削除・削除確認の最中は更新開始を禁止。`useAutoSummaryUpdate` は設定ドロワー表示中のみ enabled。出典: v15 §3-3。【資料】
11. **ドロワー保護は `closeProjectSettings` のガードに加えドロワー全体に `inert`**（条件 `autoSummary.preview !== null || updateBusy`）。保存・名前変更・削除は `closeProjectSettings` を通らず `setProjectSettingsModal(null)` を直接呼ぶため。`inert` は開始済みの非同期処理を止めないので、Project 操作中の更新開始ガードも別に必要。モーダルは inert 領域の外に描画。出典: v15 §3-3・§5。【資料】
12. **refresh は `onApplied` 経由のみ（④）**。apply／skipAll の結果取得後に1回加算。checkpoint_only／not_applicable では呼ばれない。bootstrap のように別 `finally` で加算しない。出典: v15 §3-3・§5。【資料】（CC に既出）
13. **Vercel Region はダッシュボードで Tokyo（hnd1）。`vercel.json` に regions は書かない**（書くとダッシュボード設定より優先される）。2026-10-08 に本番ヘッダーで確認。出典: v15 §1・§5。【資料】【コード】（`vercel.json` に `regions` が無いことを確認）
14. **ドキュメントのみの変更はコード変更と別コミット**。コミットメッセージ末尾に `Co-Authored-By` と `Claude-Session` を付ける。出典: v15 §7。【資料】
15. **実機確認（2026-10-15 前後、Rui 報告、全て問題なし）**: テスト用 Project「小説モードのテスト」で6シナリオ（新規 user 発言→モーダル／閉じる系→再実行で再び対象／適用→再実行は「新しい発言がありません」／すべて見送る→再実行で出ない／更新不要のみ→トースト自動記録／別タブ編集後の適用は「別の操作で更新されたため未適用」で確認位置は進まない）＋警告（7,000／8,000字・Lore）・適用中ロック。個別所見の詳細は Rui から共有されていない。出典: v15 §4。【資料】【未確認】
16. **v14 §5（確定した設計判断）の前提**: 「v13 §3 の D1（差分要約の方式）、対象メッセージ、対象 topic、履歴のない topic、字数（6,000／7,000／8,000）、本文の扱い、出自の分類、注入の優先順位、cursor の置き場、重複と取りこぼし（重複は可・取りこぼしは不可）」をそのまま継続。これらの中身は v13 §3 にあり、本抽出では未読（v13 は C）。出典: v14 §5。【資料】【未確認】
17. **provenance の起点メッセージ role は `user` または `assistant`**（旧 bootstrap の履歴との互換）。差分の**対象**メッセージは従来どおり role=user のみ。コミット `aacb57d`（Phase 2c-1）。出典: v14 §5。【資料】【コード】（CC に既出）
18. **7,000字警告の対象は「standard 4 キー ∩ チャット注入 ON ∩ 非空の topic」の合計**。出典: v14 §5。【資料】
19. **`checkpoint_only` はプレビュー受信直後に自動で cursor を記録する**。出典: v14 §5。【資料】
20. **「見送る」ボタンは、提案をすべて採用しない場合の出口として別に置く（`skipAll`）**。v15 でこれが「すべて見送る」の2段階確認になった。出典: v14 §5、v15 §3-2。【資料】
21. **checkpoint のリトライはネットワーク／5xx のときだけ1回。409 と 4xx は再試行しない**。出典: v14 §5。【資料】【コード】（CC に既出）
22. **起点メッセージの検証は fail-closed**: provenance の矛盾は、その topic を `provenance_mismatch` で除外し、他の topic は処理を続ける。出典: v14 §5。【資料】【コード】（CC に既出）

## 地雷（CLAUDE.mdに載っていないもの）

1. **Codex に停止条件を課すときは「追跡対象ファイルの未コミット変更（M／A／D）」に限定する**。未追跡の `apps/.idea/`・`artifacts/` はノートPCに常在しており、条件に含めると作業が止まる（実際に一度止まった）。`git add` は変更ファイルの個別指定のみ。出典: v15 §7。CC に「未追跡」の記載なし。【資料】【コード】（現在の `git status` でも `apps/.idea/`・`artifacts/` は未追跡）
2. **Windows の `git stash drop` や `git fetch` が権限エラーになることがある**（Codex 側で承認すれば通る）。出典: v15 §7。【資料】
3. **ノートPCは autocrlf によりワーキングコピーが CRLF、コミット済みは LF**。`git diff --stat` が全行書き換えに見える場合は `git diff --ignore-cr-at-eol` で実質差分を確認する。出典: v15 §7。CC に記載なし。【資料】
4. **checkpoint route の非破壊な本番確認の手順**（未実施のまま）: 不正 `topic_id`→400、存在しない topic→404、`expected_revision`=2147483647→409、認証なし→401。**有効な revision での実行は cursor を進めるので実 Project では行わない**。出典: v15 §6-a。【資料】
5. **差分更新の既知の限界**: 入力は user 発言のみなので、決定事項が assistant 側にしかない会話は反映材料が少ない。UI 文言で説明済みで、仕様として継続。出典: v15 §6-i。【資料】
6. **CLAUDE.md の Scripts 表に「差分preview Phase 1b の検証記録（2026-10-08）」という履歴行が混在**。現行の件数ではない。表から外す余地あり。出典: v15 §6-c。【資料】【コード】（CC に当該行が残っている）
7. **v206 migration 本体の先頭コメントには「Ruiが手動適用する」「初回適用前確認」が残っている**（適用前の手順としての履歴で、意図的に未変更）。触らなくてよい。出典: v15 §6-d。【資料】【コード】（ファイル先頭で確認）
8. **テスト件数は時点の値**: Codex 実測で `npm test` 638件・`npm run test:all` 670件・テスト115ファイル、fail 0（Phase 3 前は 621／653）。現行 CC の件数（`npm test` 1827件）とは別時点。出典: v15 §1。【資料】【コード】（CC と照合）

CLAUDE.mdに既出: 12項目（cursor 契約・FIFO 予算と stats・origin と provenance・警告 GET・見送りの2段階・結果ラベル・開始排他とドロワー保護・refresh の④・手動確認はテスト用 Project のみ・baseline と除外理由・input の user のみと旧 provenance 互換・Phase 1b〜3 の実装記録）。

## 未実装・宿題

v15 §6 の a〜j（すべて任意・低優先）。
1. a: checkpoint route の非破壊な本番確認（未実施。v14 §7-a から継続）。【資料】
2. b: モーダルの出自ラベルが raw の `origin` 値のまま（日本語化の余地、軽微）。【資料】【コード】（`ProjectMemoryAutoUpdateModal.tsx:109` が `出自: {topic.origin}` をそのまま出力）
3. c: CC の Scripts 表の履歴行の整理。【資料】【コード】
4. d: v206 migration 先頭コメント（触らなくてよい）。【資料】
5. e: v206 の適用日の記録（記録なし。分かれば docs に追記）。【資料】【未確認】
6. f: `messages(thread_id, created_at, id)` index、クエリのバッチ化（2c-2）は見送り。thread 数が増えて遅くなったら再検討。【資料】【コード】（`docs/schema.sql` の `messages` index は `thread_id`、`thread_id+message_number` など。`(thread_id, created_at, id)` の index は無い）
7. g: `.gitattributes`（`scripts/fixtures/*.txt text eol=lf`）、`vercel.json` regions（任意）。【資料】【コード】（`.gitattributes` は存在しない）
8. h: 古い未使用 user 発言の遡り処理、custom topic の自動更新（範囲外・別チケット）。【資料】
9. i: 既知の限界（上記 地雷5）。【資料】
10. j: v12 §7 の継続項目（5'、7 大規模 Project、12 マスク対象の拡張）は変更なし。内容は v12 に書かれており本資料では読めない。【資料】【未確認】
11. 次の会話の最初の一手（v15 §8）: `git pull` → HEAD が `d283065` 以降か確認。この項目は更新が必要（現在の HEAD は別）。【資料】

## 矛盾・要照合

1. **CC と schema.sql の食い違い**: CC の v206 説明（「`docs/schema.sql` には定義が統合されているが、冒頭・v206見出しの適用状態コメントは旧記述のまま」）は、現行の `docs/schema.sql` と合わない。schema.sql は冒頭8行目に「v206はテスト・本番とも適用済み」、723行目に「applied: test and production」とあり、`d283065`（docs: v206適用済み表記の統一）で修正済み。CC の該当記述が古い。【コード】
2. **v206 の適用日**: CC は「適用日は確認できないため記載しない」、v15 は「記録なし」。schema.sql 冒頭の「2026/10/07」は適用日でなく schema への統合日。適用日の記録を作るなら、Rui の記憶か Supabase の履歴が必要。【資料】【コード】
3. **v15 の「CLAUDE.md の Scripts 表に履歴行が混在」と現行 CC**: 当該行（「差分preview Phase 1bの検証記録（2026-10-08）」）は CC に現存し、v15 時点から未整理。【コード】
4. **v15 §8 の「HEAD が `d283065` 以降」**: 2026-10-15 時点の指示で、現在の HEAD（`68144bb`）は大きく進んでいる。そのまま再編の出典にしない。【資料】【コード】
5. **範囲の欠落（資料不足）**: 初回生成（bootstrap）の設計判断、プロンプト v1〜v8 の変遷、`empty_topic_keys` の経緯、「自動要約v15」以前の確定判断（v14 §5 の表）は、C（旧版）のため今回読んでいない。`auto-summary.md` に初回生成を含めるなら、v14 §5・v12 §7 の追加読みが必要。方針書 §4-1 は auto-summary の出典を「自動要約 v15」だけとしており、その範囲に初回生成が十分入るかは要検討。【未確認】
6. **inventory.md の分類（一部解消）**: v14 を C→B に変更済み（Rui 承認、v15 が参照する §5 のみ読む）。v1〜v13 は C のまま。【資料】
7. **inventory.md の機能の紐づけ**: v15 は「差分更新（#6）」の資料で、Memory サマリ・ドロワー保護など project-memory 側の判断（Sidebar 排他・inert）を含む。`project-memory.md` と記述が重なるため、②で境界を決めること。【資料】
8. **v14 §5 が引用する v13 §3 の決定内容は未読**。v14 §5 の追加分（上記6件）は確認したが、D1（差分要約の方式）・対象 topic・字数の根拠は CC の地雷表が事実上の正本。v13 を B にするかは別判断。【未確認】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| KabeHub_自動要約_現状整理_引き継ぎ資料_v15.md | A | 全文（12KB） |
| CLAUDE.md | — | 既出判定のための grep のみ（自動要約の節は大半が既出） |
| docs/schema.sql・docs/applied/README.md・vercel.json・components/ProjectMemoryAutoUpdateModal.tsx | — | 矛盾確認のための grep のみ |
| KabeHub_自動要約_現状整理_引き継ぎ資料_v14.md | B（C→B、Rui承認） | §5 のみ（指示どおり。§1〜§4・§6〜§9 は未読） |
