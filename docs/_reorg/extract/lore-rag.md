# 抽出メモ: lore-rag（①-2）

作成: 2026-11-25／対象: Lore（記憶）の抽出・検索・Dreaming・Memory Summary UI・Lore 昇格。
タグ: 【資料】／【コード】（実ファイルを grep で確認）／【未確認】。CC＝CLAUDE.md。
略称: Temporal v2＝RAG機能実装メモ_Temporal版_v2（2026-06-07）、改善メモ＝RAG改善設計メモ_v142以降 `_04`（2026-06-09。`_01`〜`_03` と無番号版は同メモの途中版で、`_04` が最新）、昇格 v13＝Lore昇格ルール v13（2026-10-01）、スケジュール＝BranchingMode_RAG 実装スケジュール案 v2（2026-06-07）、Codexログ＝codexBranchingMode実装メモ（v133 Memory Summary UI のCodex実行ログ）、v138＝v138_デバッグまとめ（2026-06-08）、追加＝記憶まわり追加（v141時点のブレスト）。

## 確定した判断

1. **RAG は「Tool-Centric」「Temporal」「非同期 Dreaming 風バッチ」「Citation／Source 保持」「ユーザー制御」の5本柱**。会話ログのベクトル化はメインのチャットの寿命から切り離し、バッチ（`/api/lore/batch-train`）で実行する。出典: Temporal v2 §0・§7。【資料】
2. **実装順は RAG MVP → Branching → Temporal／Dreaming**。Branching の DB 地ならし（`is_active`／`branch_id`／`parent_id` の確認）だけ先に入れる。理由: RAG は全ユーザーに体感価値が出やすくマネタイズ前の訴求力が高い。出典: スケジュール §1・§15。【資料】
3. **RAG 先行時の7ルール**: ①`source_message_id` を必ず保存（`message_no` は表示用で後回し可）②既存 RPC を壊さず `match_lore_embeddings_v2` を別名で追加 ③自動化しすぎない（最初は手動 `batch-train`）④RAG 検索は失敗してもチャットを止めない ⑤Branching に深入りしない ⑥batch-train の除外は `provider != 'memo'`（`is_memo` カラムは存在しない）⑦既存カラムの重複追加を避ける（`\d messages` で確認）。出典: スケジュール §14。【資料】【コード】（batch-train の対象条件は CC に既出）
4. **記憶スキーマ**: `memory_kind` は preference／project／decision／plan／todo／fact／idea／constraint／profile／temporary（＋other）、`temporal_status` は current／past／future／expired／uncertain。時間情報の抽出ミスに備え `confidence_score` を持つ。出典: Temporal v2 §3.2・§14。【資料】【コード】（Codexログで `MemoryKind` に idea／constraint／profile／temporary を追加）
5. **検索の自動発火は MVP ではルールベース（案B）で、最終的に LLM Tool Loop（案A）へ移行**。順序は Pinned → GitHub Tool Loop → RAG → system 生成 → `trimContextToWindow`。出典: Temporal v2 §9。【資料】【コード】（現行は19語のルールベース。案A は未実装）
6. **記憶まわり改善4テーマ（2026-06-09）の結論**。出典: 改善メモ。
   - ①`liked_ai` は Dreaming に「クリーニングフェーズ」を追加。`liked_ai`（`is_archived=false`・`superseded_by IS NULL`）を古い順に最大10件、`gpt-4o-mini` で三人称・常体の知識文へ書き換え、`liked_ai_cleaned` を新規 insert、元は `is_archived=true`／`superseded_by=cleaned.id`、元文は `metadata.source_content` に退避。`find_similar_lore_pairs_v2`・`consolidate_dreaming_batch`（2本）・`consolidate_dreaming_batch_multi` の保護条件と `validateSources()`（`isEditableExtraction`→`isProtectedExtraction`）に `liked_ai_cleaned` を追加。`lore_embeddings.metadata jsonb` を追加。【資料】【コード】（`lib/lore/dreaming.ts:141`・`consolidation.ts:116`）
   - ②暴発対策 解決策1: `folder_name` プレフィルタ（別フォルダを除外、`NULL` は汎用）と `is_archived=false`／`superseded_by IS NULL`／`temporal_status <> 'expired'`。`final_score`＝similarity 75%＋importance 15%＋confidence 10%。【資料】【コード】（現行 RPC は `project_id` 基準に移行済み。`temporal_status <> 'expired'` と配点は `docs/schema.sql` で確認）
   - ②解決策2: `final_score` に `memory_kind` 倍率を乗算。decision／constraint＝1.2、preference／profile＝1.1、project／plan／fact／other＝1.0、idea＝0.8、todo＝0.7。`preference`／`profile` は実データに存在したため追加。`idea` の `avg_importance` が 0.98 と高いので、様子を見て 0.7 へ下げる余地。CASE 式ハードコード。【資料】【コード】（`docs/schema.sql:2735-2745` で値が一致）
   - ③分類フィードバックループ Step 1・2: AI の初期分類を `metadata.ai_proposed_kind` に保存し、人が `memory_kind` を変えたら `is_manually_corrected=true`（kind が実際に変わった場合のみ）。batch-train のプロンプトに直近の修正例 3〜5 件を動的に注入（`buildMemoryExtractionPrompt(examples)`）。`lore_embeddings` に `is_manually_corrected`・`updated_at` を追加。【資料】【コード】（`lib/lore/batchTrain.ts:56,103`、`app/api/lore/[id]/route.ts:61`）
   - ④ゾンビ記憶 レベル1: メッセージ・スレッド削除時に `lore_embeddings` を `is_archived=true`（`is_pinned=false`・`user_id` 条件必須、失敗は `console.warn` で削除続行、物理削除はしない）。対象4ファイル。【資料】【コード】（`lib/messages/delete.ts` で `source_message_id`／`user_id`／`is_pinned=false` を確認）
7. **`liked_ai` の学習方針は「いいね直後はそのまま保存、後で Dreaming が整形」（案A）**。案B（いいね時に `gpt-4o-mini` で即時要約）は、ノイズが実際に問題になったとき。出典: 追加 §①。【資料】【コード】（その後「記憶に追加」ボタンと `/api/lore/like` は撤去済み。既存の `liked_ai` 行は Dreaming で変換される）
8. **v133 Memory Summary UI の仕様（Codex 指示書の抜粋）**。出典: Codexログ。【資料】
   - `GET /api/lore`: クエリ `folder`／`kind`／`status`／`pinned=true`／`include_archived=true`（既定は除外）、固定条件 `user_id`・`is_archived=false`・`superseded_by IS NULL`、`created_at DESC`、`embedding` は返さない。種類フィルタの「予定・TODO」「事実・その他」は API の `kind` 単一指定で表現できないため全件取得してフロントで絞る。【コード】（`app/memory/page.tsx` にラベルあり、API に `include_archived`／`status`）
   - `PATCH /api/lore/[id]` の5アクション: `update_text`（`x-openai-api-key` 必須、Embedding 再生成、`extraction_version='user_edited'`、`last_confirmed_at` 更新）／`update_meta`（Embedding 不要、`user_edited`）／`pin`／`confirm_current`（`temporal_status='current'`・`last_confirmed_at`・`valid_until=null`、`extraction_version` は変えない）／`archive`（`is_pinned=true` なら 409「固定済みの記憶はアーカイブできません。先に固定を解除してください。」）。更新クエリは常に `id` と `user_id` の両条件。【コード】（409 メッセージ・`update_text`／`confirm_current` を確認）
   - 型: `MemoryKind` に4種追加、`LoreSearchResult.sourceMessageNumber`、`LoreMemoryCard`／`LorePatchRequest`（`types/index.ts`）。`/memory` ページと設定ページからのリンクを追加。【資料】
9. **Dreaming の閾値は本番 0.92、clamp 下限は 0.80**。v138 の切り分けで clamp 下限が 0.88 だったため 0.80 のテスト送信が切り上がり、0 件統合が続いた。現行の下限は 0.80、既定は `DREAMING_DEFAULTS.threshold = 0.92`。出典: v138 問題1。【資料】【コード】（`lib/lore/types.ts:23`、`dreaming-batch/route.ts:29`）
10. **Lore 昇格 — 削除フローは案A（専用昇格ボタン維持）で確定**（2026-10-01、Rui）。案B（エクスポート誘導）は不採用で、Phase 4C（Lore import 契約）は不要となりロードマップから外れた。再検討条件は「Lore の外部 import を、削除時の昇格とは別にプロダクト機能として欲しい」と判断したとき。出典: 昇格 v13 §3-1。【資料】
11. **削除時の警告は「いったん現状維持」**（2026-10-01、Rui。Claude の推奨は Y＝①だけ警告追加）。削除経路（v201）は昇格 RPC の第5引数が NULL のため v202 の確認ガードが効かず、ケース①旧 active 昇格 Lore が `user_edited` でも警告なしで archived／superseded になる、ケース②同 revision の昇格 Lore が手動 archive 済みでも復元されず既存 ID が返るだけ（Lore は archived のまま、`project_id` だけ NULL になる）。再検討の目安はケース①が実際に起きた、または起きる見込みが高まったとき。出典: 昇格 v13 §3-2・§5。【資料】
12. **CLAUDE.md の実装済み機能表は「v175 以降は migration 番号基準」**。v175〜v203 の29番号・29行を 1 対 1 で整備（`488e809`＋`483a2c4`）。v174 以前は機能の変更履歴番号で体系が違う。v182 は番号重複（Arena 利用量記録 `89d9363` の旧称とmigration v182 の Project Memory Phase A）。出典: 昇格 v13 §3-3・§4。【資料】
13. **コード参照の検索の現行2経路（2026-10-04）**: Lore Book（novel Project・topK 3・閾値引数なし）と Memory（19語・topK 5・閾値0.3）、共通 timeout 3,000ms。旧 Memory の11語は旧 RAG の19語に包含されていたため、19語を `CHAT_MEMORY_TRIGGER_KEYWORDS` に移し末尾 RAG・`rag_memory` を廃止。出典: `docs/lore-refactoring-notes.md`。【資料】【コード】（CC・chat-core.md と一致）

## 地雷（CLAUDE.mdに載っていないもの）

1. **RPC を JS から呼ぶときは引数をすべて渡す**。PostgREST は引数の組み合わせ（シグネチャ）で関数を特定するため、引数不足は「そのシグネチャの関数は存在しない」`schema cache` エラーになる（`NOTIFY pgrst, 'reload schema'` では直らない）。DEFAULT があっても JS SDK からは省略できない場合がある。Codex が生成した RPC 呼び出しは、必ず定義の引数と突き合わせる（v138 では11引数のうち6つが欠けていた）。出典: v138 問題3。CC の「Supabase スキーマキャッシュ」はリロード手順のみ。【資料】
2. **RPC を複数追加する場合は、全件が追加済みか確認する**: `SELECT routine_name FROM information_schema.routines WHERE routine_name IN (...)`。出典: v138 問題2。【資料】
3. **0 件統合の切り分け手順**: Vercel Runtime Logs の External APIs で OpenAI 呼び出しの有無を見る→`console.log` で `RPC params`／`RPC raw data`／`RPC error`／`matched count` を出す→Supabase SQL Editor で RPC を直接実行して API 側か RPC 側かを分離。テスト時の threshold は clamp 下限と合わせる。出典: v138。【資料】
4. **recency だけで並べると古い重要決定が弱くなる**。`decision`／`preference`／`constraint` は decay を遅くする設計。出典: Temporal v2 §14-2。【資料】【未確認】（現行の `final_score` に recency は入っておらず、decay の実装は未確認）
5. **`message_no` は DB 永続化されていないとブランチ・削除でずれる**。Citation の安定性のため `source_message_id`（UUID）を必ず保存する。出典: Temporal v2 §14-4、スケジュール §14。【資料】
6. **RAG 検索結果は「命令ではなく参考資料」として扱わせる**（プロンプトインジェクション対策）。注入文に「現在の発言を優先」を明記。さらに `Do not include memory IDs or source information in your response.` を付けて Citation 検証での混入を防ぐ設計だった。出典: Temporal v2 §14-5、スケジュール付録。【資料】【未確認】（現行の preamble 文面との対応は未確認）
7. **ゾンビ記憶レベル1は「直接紐づく記憶」のみ**。Dreaming で統合済みの派生記憶（統合先の `source_message_id` が null になるケース）は残りうる。出典: 改善メモ テーマ④。【資料】【コード】（`lib/messages/delete.ts` は `source_message_id` 直接一致のみ）
8. **ゾンビ記憶アーカイブの書き方**: `is_pinned=false` と `user_id` 条件は必須、アーカイブ失敗は警告のみで削除を継続。固定済みの記憶は意図的に保持。出典: 改善メモ テーマ④共通ルール。【資料】【コード】
9. **batch-train の対象を `is_active=true` に寄せるのは Branching 基盤整備（v131）以降**。初期は `provider != 'memo'` と `skip_learning` のみ。現行の対象条件は CC に既出。出典: スケジュール §14。【資料】
10. **Lore 昇格の既知の制約（v12 §7 から継続）**: UI は OpenAI キー無しでは復元できない（route の契約としてはキー不要）／superseded 同 revision のループは対象外／復元が 409（`promotion_restore_unavailable`）になると現行 hook は terminal 扱いで専用導線なし／`lore_embeddings.is_archived` は nullable で復元 RPC は NULL を `promotion_not_found` で拒否／同 revision の既存行が active のとき route は Embedding を生成してから捨てる（UI は `current` でボタン無効のため到達しにくい）。出典: 昇格 v13 §5。【資料】【未確認】（CC の「復元とOpenAIキー」と重なる分あり）
11. **移動済み migration の追加コミットは移動前パスで照合する**（`git log --diff-filter=A`）。コミット件名の番号は信用しない（v182 の例）。現パス（`docs/applied/`）の追加履歴は移動コミットを返す。該当: v175・v181・v184・v185・v196・v198・v199・v202・v203。出典: 昇格 v13 §7。【資料】
12. **Codex への2段階指示の分け方**: 段階1＝読み取り専用調査（編集せず追記案と根拠の強さ A／B／C をレポート）、段階2＝変更ファイルを限定した編集（ハッシュの存在確認と migration 追加コミットとの照合を機械的に再検証）。「根拠が付いている」をレポート用か表本文かで書き分けないと、表の行に migration ファイル名まで入る。出典: 昇格 v13 §7。【資料】
13. **`CLAUDE.md` は CRLF と LF が混在**。既存部分のバイト列を保持し、挿入行は前後の行の改行に合わせる。ビルド時の `next-env.d.ts` 自動更新は毎回元に戻す。ドキュメントのみの変更でも `git push` で Vercel が再デプロイされる。出典: 昇格 v13 §6・§7。【資料】

CLAUDE.mdに既出: 13項目（Embedding 用の OpenAI キー必須・extraction_version 保護・`is_pinned` 保護・`embedding` 非公開・Lore レスポンス列・dismissals のペア正規化・dreaming threshold 0.92・RPC 自己結合性能・batch-train 対象・liked_ai 保護・`v_found_count`・チャット記憶検索の発火条件・スキーマキャッシュ）。

## 未実装・宿題

1. **解決策3（LLM Reranking）**: ベクトル検索の上位 5〜10 件を軽量 LLM（`gpt-4o-mini`／`gemini-flash` 等）で「会話に無関係なもの」を除外させる。コスト・レイテンシが増えるため、解決策1・2で足りない場合の奥の手。出典: 改善メモ テーマ② 解決策3、追加。【資料】
2. **分類フィードバック Step 3**: Dreaming が `memory_kind != metadata->>'ai_proposed_kind'` のレコードを LLM に渡し、「ユーザーの分類傾向」を分析して分類ルールを自動更新し、システムプロンプトに動的に埋め込む。出典: 改善メモ テーマ③ Step 3（v143〜v145 で検討）。【資料】
3. **ゾンビ記憶レベル2**: 削除対象の記憶が `superseded_by` を持つ場合に、統合先に `needs_review=true` を立てる。Memory Summary UI の `isNeedsReview` の orange border が自動で警告する想定。出典: 改善メモ テーマ④。【資料】【コード】（`needs_review` 列は schema・app・lib に無く、UI の `memoryNeedsReview` は `lib/lore/mappers.ts:118` の派生関数）
4. **`weight` のユーザー設定化**: 現状は CASE 式ハードコード。`idea` を 0.7 へ下げる検討。出典: 改善メモ テーマ②解決策2。【資料】
5. **Tool-Centric RAG（`search_past_thoughts` Tool）への移行**。案B（ルールベース）は MVP で、KabeHub の差別化として最終的に案A（AI が検索の要否と `filterTags` を決める）へ。出典: Temporal v2 §6・§9-2、実装メモその1。【資料】【コード】（`search_past_thoughts` はコードに無い）
6. **`skip_learning` の拡張**: メッセージ単位に加え、スレッド単位（「このスレッドは記憶しない」）とフォルダ単位（`folder_settings` に `rag_learning_enabled`／`rag_search_enabled`）の案。出典: Temporal v2 §11.2。【資料】【未確認】（フォルダ単位は未実装と見られる）
7. **削除時警告（Y／Z）の再検討**（判断11の目安に該当したとき）。一括昇格（Embedding N 回のため保留）、`/library` の全 Project 並行取得、モバイル対応、DL/UL v1 の軽微事項、孤立した threads／memory の UI 表現。出典: 昇格 v13 §6。【資料】
8. **4B（AIで編集）の残課題**: conflict 後の「もう一度指示する」導線、upstream OpenAI 処理の cancel、`chatCompleteMini` が `finish_reason` を返さない件、`parsePreview` との同期（CC に一部既出）。出典: 昇格 v13 §6。【資料】
9. **任意の実機確認の残り**: stale 再昇格の「編集なし stale の1クリック再昇格」、archived 復元の詳細（編集済み Lore の復元、Lore ID・本文・`embedding_hash` の不変性）、検証用データの削除結果、DB ロック待機競合の検証。出典: 昇格 v13 §6。【資料】
10. **Memory Summary UI のカード・フォームの仕様と現行の突合**: Codex ログは `MemoryCard` の表示／編集モードと手動追加フォームの指示を含むが、細部（バッジ色・並び）は現行 `app/memory/page.tsx` との突合が必要。出典: Codexログ。【資料】【未確認】

## 矛盾・要照合

1. **改善メモ テーマ④ の `needs_review`（レベル2）と現行実装の差**: 資料は `needs_review` を立てる設計だが、現行は列を持たず `memoryNeedsReview()` が `last_confirmed_at`／`valid_until`／`temporal_status` から派生判定する。レベル2 が実装されたなら派生判定の拡張になるはずで、列追加は不要。【コード】
2. **Temporal v2 の `<kabehub_memory_context>`／`search_past_thoughts` と現行**: 注入は `reference_data` 封筒（`buildReferenceBlock`）で、Tool は無い。Temporal v2 の §6・§9 は現行実装と一致しない設計案（出典としては使わない）。【コード】
3. **Temporal v2 §11.1 の RLS 方針**: 資料は `auth.uid() = user_id` の SELECT／UPDATE／DELETE ポリシー。CC の `lore_embeddings` と現行 schema のポリシーとの対応は未突合。【未確認】
4. **昇格 v13 §3-3 の表の行番号（664〜699行目）**: CLAUDE.md は大幅に更新されており現行と合わない。参照しない。【資料】【未確認】
5. **v138「現在 `0.80` のまま残っている」**: v139 で 0.92 に復旧済み（CC の記述、`DREAMING_DEFAULTS` で確認）。ただし clamp 下限は 0.80 のまま。CC の「dreaming threshold 本番では 0.92」と整合。【コード】
6. **昇格 v13 §5「UI は OpenAI キー無しでは復元できない」**: CC も同旨だが、現行コードでの hook／一覧の挙動は今回未確認。【未確認】
7. **inventory.md の分類の確認事項**: `RAG改善設計メモ_v142以降.md`（無番号版）と `_01`〜`_03` は `_04` の途中版（`_01`〜`_03` が A、無番号版が B）。実質は `_04` が最新版で、`_01`〜`_03` を A にしているのは系列の扱いが「最新版のみ A」と不整合。無番号版は「検討中（未実装）」の初期ドラフトで、`_04` で実装済みになった項目が多い。直していない。【資料】
8. **inventory.md の分類の確認事項**: `RAG機能初期壁打ち.txt` と `RAG機能実装メモその1.txt` は Gemini／ChatGPT との初期ブレスト（設計案のみ、確定事項なし）で、Temporal v2 が後継。`記憶まわり追加.txt` は v141 時点のブレスト（改善メモの元）で、結論は改善メモに取り込まれている。B のままで、判断としては新規の確定事項は無い。【資料】
9. **Codex ログのファイル名（`codexBranchingMode実装メモ.txt`）が内容と合わない**: 先頭プロンプトは v133 Memory Summary UI。ログ冒頭の Codex ディレクトリは `~\Desktop\20260328`。§6-2 の付け替えと整合。【資料】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| KabeHub_Lore昇格ルール_設計検討_引き継ぎ資料_v13.md | A | 全文（16KB） |
| KabeHub_RAG機能実装メモ_Temporal版_v2.md | A | 見出し＋§0・§3.2・§9・§11〜§14 |
| KabeHub_RAG改善設計メモ_v142以降_04.md | A | 全文（`_01`〜`_03` は `_04` の途中版のため未読） |
| KabeHub_RAG改善設計メモ_v142以降_01.md／_02.md／_03.md | A | 未読（`_04` と無番号版の差分で内容を確認） |
| KabeHub_RAG改善設計メモ_v142以降.md（無番号） | B | `_04` との差分行のみ |
| docs/lore-refactoring-notes.md | A | 全文 |
| KabeHub_BranchingMode_RAG_実装スケジュール案_v2.md | B | §1・§10・§14・§15・付録（前回読了の範囲） |
| KabeHub_v138_デバッグまとめ_20260608.md | B | 全文 |
| 記憶まわり追加.txt | B | 先頭120行（ブレスト、結論は改善メモに反映済み） |
| RAG機能初期壁打ち.txt | B | 先頭60行 |
| RAG機能実装メモその1.txt | B | 先頭90行 |
| codexBranchingMode実装メモ.txt | B | 見出し＋仕様部（Codex の生出力は読まない） |
| CLAUDE.md・docs/schema.sql・app／lib の該当ファイル | — | 既出判定・突合のための grep のみ |

読めなかった A 資料: `RAG改善設計メモ_v142以降_01.md`・`_02.md`・`_03.md`（`_04` と差分確認で代替。途中版のため内容は `_04` に包含と判断）。
