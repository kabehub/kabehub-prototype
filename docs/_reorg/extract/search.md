# 抽出メモ: search（①-2）

作成: 2026-11-25／対象: スレッド・メッセージの部分一致検索（サイドバー、`/explore` の公開スレッド検索、`/api/search`）と、その高速化（pg_trgm）。
タグ: 【資料】／【コード】（実ファイルを grep で確認）／【未確認】。CC＝CLAUDE.md。
略称: 仕様書＝検索改善_pg_trgm_仕様書（2026-05-30）。この機能の A／B 資料は仕様書1本のみ。

## 確定した判断

1. **検索の高速化は、Supabase 標準の `pg_trgm` 拡張と GIN インデックスで行い、アプリコードは変更しない**。既存の `.ilike('title', '%q%')` のクエリのまま、インデックスで高速化する（難易度 ★☆☆、SQL 2行）。対象は、サイドバーのスレッド検索（`threads.title`）、`/explore` の公開スレッド検索（`threads.title`）、`/explore` のタグ検索（`threads.folder_name` 等）。出典: 仕様書「概要」「対象の検索機能」。判断者: 資料に明記なし（Claude の仕様案）。【資料】
2. **DB 手順（Supabase SQL Editor）**: ①`CREATE EXTENSION IF NOT EXISTS pg_trgm;` ②`CREATE INDEX IF NOT EXISTS idx_threads_title_trgm ON threads USING GIN (title gin_trgm_ops);` と `idx_threads_folder_name_trgm`（`folder_name`）③`EXPLAIN ANALYZE SELECT * FROM threads WHERE title ILIKE '%壁打ち%'` で `Bitmap Index Scan`／`Index Scan` を確認（`Seq Scan` のままなら下記の注意点を確認）。出典: 仕様書「DB 対応手順」。【資料】
3. **実施タイミングの目安は「体感でスレッド検索が遅くなってから、またはスレッド数が 1,000 件を超えたあたり」**で足りる。出典: 仕様書「実施タイミングの目安」。【資料】
4. **メッセージ本文の検索（`messages.content` の GIN インデックス）は当時スコープ外**。要求が出てから追加する将来拡張で、`messages` は行数が多くインデックスサイズが大きくなるため、Supabase の無料プランでは注意。出典: 仕様書「将来の拡張候補」。【資料】

## 地雷（CLAUDE.mdに載っていないもの）

1. **3文字未満のキーワードではインデックスの恩恵が薄い**（pg_trgm はトライグラム＝3文字単位で分解するため、1〜2文字でも検索は動作するが遅い）。タイトル検索は比較的長いキーワードで使われるとして許容した。出典: 仕様書「注意点」。【資料】
2. **RLS との組み合わせでインデックスが効かないことがある**。`EXPLAIN ANALYZE` で `Seq Scan` なら RLS ポリシーを確認する。出典: 仕様書「注意点」。【資料】
3. **GIN インデックスは B-tree より大きい**。`title`（短文）は問題ないが、`messages.content` に足す場合はストレージ使用量に注意。出典: 仕様書「注意点」。【資料】
4. **現行の `/api/search` は `messages.content` に対しても `ilike('%…%')` を使う**（`target` が `message`／`both`、`threads!inner(deleted_at)` の結合つき）。仕様書は「メッセージ本文は将来対応・インデックスサイズ大」としていたが、本文検索はすでに実装されており、`docs/schema.sql` には `pg_trgm` 拡張・trgm の GIN インデックスが存在しない（拡張は `vector` のみ）。したがって本文検索は部分一致のシーケンシャルスキャンで動いている可能性がある（適用の有無は schema.sql に記録なし）。CC の「pg_bigm 検索ロードマップ」（H-24）は未作成。出典: 仕様書、`app/api/search/route.ts:31-32,45,51`。【コード】【未確認】

CLAUDE.mdに既出: 1項目（`/api/search` が所有スレッドのタイトル・メッセージ本文を部分一致で検索する、と API 表に記載。H-24 の pg_bigm ロードマップが未作成であることも記載）。

## 未実装・宿題

1. **`pg_trgm` の適用状況の確認**: 本番 DB に拡張・インデックス（`idx_threads_title_trgm`・`idx_threads_folder_name_trgm`）があるか。`docs/schema.sql` には記録がなく、`docs/applied/` にも trgm の migration はない。【資料】【コード】【未確認】
2. **メッセージ本文検索の高速化**: `messages.content` 向けのインデックス（`idx_messages_content_trgm`）と、CC が参照する pg_bigm（H-24）との関係の決定。日本語の部分一致検索に pg_trgm が適するかは資料に記載なし。【資料】【未確認】
3. **`/explore` 側の検索**: 現行の `app/api/explore/route.ts` はタイトルを `ilike`（`:97`）、タグは `thread_tags!inner(name)`＋`eq`（`:100-101`）で検索しており、仕様書が想定した「`folder_name` 等への `ilike`」とは異なる。仕様書の対象一覧を現状に合わせて更新する必要がある。【コード】

## 矛盾・要照合

1. **仕様書の「`/explore` のタグ検索は `threads.folder_name` 等の `.ilike`」と現行**: 現行は `thread_tags` の完全一致（`eq("thread_tags.name", tag)`）で、`folder_name` の `ilike` は使っていない。仕様書の `idx_threads_folder_name_trgm` は不要の可能性。【コード】
2. **仕様書の「メッセージ本文は将来」と現行実装**: 上記地雷4のとおり本文検索は実装済み。【コード】
3. **inventory.md の分類**: 仕様書は A（1本のみ）。内容は SQL 2行の仕様で、実施の有無も不明のため、B 相当でもよい。直していない。【資料】

## 参照した資料

| 資料 | 扱い | 読み方 |
|-|-|-|
| KabeHub_検索改善_pg_trgm_仕様書.md | A | 全文（4KB） |
| CLAUDE.md・`docs/schema.sql`・`docs/applied/`（ファイル名）・`app/api/search/route.ts`・`app/api/explore/route.ts` | — | 既出判定・突合のための grep／ls のみ |

読めなかった A 資料: なし。
