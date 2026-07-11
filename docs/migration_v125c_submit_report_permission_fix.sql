-- migration_v125c_submit_report_permission_fix.sql
-- submit_report RPCがanon/authenticatedに直接公開されており、
-- reporter_user_id・reporter_ipをクライアントが任意指定できたため、
-- 通報者なりすまし・24時間重複制限の回避が可能な状態だった。
-- service_role専用に変更し、Next.js側（reports/route.ts）を
-- service roleクライアント経由の呼び出しに変更する。

revoke execute on function public.submit_report(uuid, text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.submit_report(uuid, text, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
