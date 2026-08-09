-- migration_v180_drop_legacy_counter_rpcs.sql
-- H-09: 旧likesカウンターRPC（±1方式）の削除
--
-- 背景:
--   migration_v123_rpc_hardening.sql（2026/07/06本番適用）で、likesのカウント方式は
--   ±1方式（increment_likes_count / decrement_likes_count）から実テーブル再集計方式
--   （recalc_likes_count）に移行済み。呼び出し側（app/api/threads/[id]/likes/route.ts）
--   も改修済みで、旧2関数への参照はコード内（app/・lib/・scripts/）に0件（2026/08/09 grep確認）。
--   本番安定稼働期間を経たため、本マイグレーションで旧2関数を削除する。
--
-- 適用前確認: 本番Postgres Logsで直近呼び出し実績が無いことを確認してから適用すること。

begin;

drop function if exists public.increment_likes_count(uuid);
drop function if exists public.decrement_likes_count(uuid);

notify pgrst, 'reload schema';

commit;
