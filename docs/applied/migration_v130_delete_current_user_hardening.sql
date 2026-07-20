-- migration_v130_delete_current_user_hardening.sql
-- delete_current_user() のEXECUTE権限をauthenticatedに限定し、
-- 未認証状態での呼び出しを関数内部でも明示的に拒否する。

begin;

create or replace function public.delete_current_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  delete from auth.users
  where id = v_user_id;
end;
$$;

revoke execute on function public.delete_current_user()
  from public, anon, authenticated;

grant execute on function public.delete_current_user()
  to authenticated;

commit;

notify pgrst, 'reload schema';
