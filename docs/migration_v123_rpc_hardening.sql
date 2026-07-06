-- migration_v123_rpc_hardening.sql
-- T-08: カウンター系RPC（increment_fork_count / increment_likes_count / decrement_likes_count）の権限モデル強化
--
-- 概要:
--   - likes系（increment_likes_count / decrement_likes_count）は「±1」方式から、
--     likesテーブルからの再集計方式（recalc_likes_count）に統合。
--     旧2関数は本番安定稼働確認後、別マイグレーション（v124）で削除する。
--     呼び出し側（app/api/threads/[id]/likes/route.ts）は関数名変更に伴い改修済み。
--   - fork_countは、threads.forked_from_idから実子スレッド数を再集計する方式に変更
--     （recalc_fork_count新設）。self-fork（child.user_id = parent.user_id）は除外。
--     旧関数名increment_fork_countは、呼び出し側（app/api/share/[token]/fork/route.ts）が
--     無改修で済むよう、recalc_fork_countを呼ぶだけの互換ラッパーとして維持。
--   - 3関数とも SECURITY DEFINER・search_path固定・EXECUTE権限をauthenticatedのみに限定。
--
-- 適用: テスト環境Supabaseで適用・pg_get_functiondefで定義確認済み（2026-07-06）。
--       本番適用時もこの冪等版（create or replace function）をそのまま使用可。
--
-- 参考: 引き継ぎ資料_S7_カウンター系RPC強化_途中経過.md

-- ============================================================
-- 1. recalc_likes_count: likesテーブルから再集計
--    is_public = true のスレッドのみ対象
-- ============================================================
create or replace function public.recalc_likes_count(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  update threads
  set likes_count = (
    select count(*)::integer
    from likes
    where likes.thread_id = p_thread_id
  )
  where id = p_thread_id
    and is_public = true;
end;
$function$;

revoke execute on function public.recalc_likes_count(uuid) from public, anon;
grant execute on function public.recalc_likes_count(uuid) to authenticated;

-- ============================================================
-- 2. recalc_fork_count: forked_from_idで子スレッド数をカウント
--    self-fork除外（child.user_id <> parent.user_id）・
--    親スレッドがis_public = trueの場合のみ対象
-- ============================================================
create or replace function public.recalc_fork_count(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  update threads parent
  set fork_count = (
    select count(*)::integer
    from threads child
    where child.forked_from_id = p_thread_id
      and child.user_id <> parent.user_id
  )
  where parent.id = p_thread_id
    and parent.is_public = true;
end;
$function$;

revoke execute on function public.recalc_fork_count(uuid) from public, anon;
grant execute on function public.recalc_fork_count(uuid) to authenticated;

-- ============================================================
-- 3. increment_fork_count: 互換ラッパー
--    呼び出し側（fork route）を無改修で済ませるため、
--    関数名・シグネチャは維持しrecalc_fork_countに委譲する
-- ============================================================
create or replace function public.increment_fork_count(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.recalc_fork_count(p_thread_id);
end;
$function$;

revoke execute on function public.increment_fork_count(uuid) from public, anon;
grant execute on function public.increment_fork_count(uuid) to authenticated;

-- スキーマキャッシュのリロード（PostgREST）
notify pgrst, 'reload schema';

-- ============================================================
-- 注意：旧2関数（increment_likes_count / decrement_likes_count）は
-- このマイグレーションでは削除しない（2段階デプロイ方針）。
-- 本番で数日〜1週間の安定稼働を確認した後、
-- docs/migration_v124_drop_legacy_counter_rpcs.sql を別途適用すること。
-- ============================================================
