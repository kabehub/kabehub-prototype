-- migration_v125b_submit_report_function.sql
-- app/api/reports/route.ts が前提とするsubmit_report RPCが
-- テスト環境・本番ともに未作成だったため新規作成。
-- 未ログインユーザーからの通報も許可するためSECURITY DEFINER。
-- 同一reporter・同一threadで24時間以内の重複通報はエラーで弾く。
--
-- 適用: テスト環境Supabaseで適用・動作確認済み（2026-07-10）。

create or replace function public.submit_report(
  p_thread_id uuid,
  p_reason text,
  p_reporter_user_id uuid,
  p_reporter_ip text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_thread_id is null then
    raise exception 'invalid_thread_id';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'invalid_reason';
  end if;

  if not exists (select 1 from threads where id = p_thread_id) then
    raise exception 'thread_not_found';
  end if;

  if p_reporter_user_id is not null then
    if exists (
      select 1 from reports
      where thread_id = p_thread_id
        and reporter_user_id = p_reporter_user_id
        and created_at > now() - interval '24 hours'
    ) then
      raise exception 'duplicate_report';
    end if;
  else
    if exists (
      select 1 from reports
      where thread_id = p_thread_id
        and reporter_user_id is null
        and reporter_ip = p_reporter_ip
        and created_at > now() - interval '24 hours'
    ) then
      raise exception 'duplicate_report';
    end if;
  end if;

  insert into reports (thread_id, reason, reporter_user_id, reporter_ip)
  values (p_thread_id, p_reason, p_reporter_user_id, p_reporter_ip);
end;
$function$;

revoke execute on function public.submit_report(uuid, text, uuid, text) from public;
grant execute on function public.submit_report(uuid, text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
