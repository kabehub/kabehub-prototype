-- v204: Project Memory topic のチャット包含 opt-in と ON 時点の文字数契約。
-- 適用順序: DB→アプリ。Phase A のみ。既存RPCは変更しない。
-- 初回適用前確認（関数・列とも0行を期待。再適用時は適用後確認で確認）:
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'set_project_memory_topic_chat_inclusion';
-- select c.data_type, c.column_default, c.is_nullable from information_schema.columns c
-- where c.table_schema = 'public' and c.table_name = 'project_memory_topics' and c.column_name = 'include_in_chat';
-- 適用後確認（列: boolean / false / NO。関数: 4引数、TABLE(is_included boolean, included_chars integer)、SECURITY DEFINER、search_path=''）:
-- select c.data_type, c.column_default, c.is_nullable from information_schema.columns c
-- where c.table_schema = 'public' and c.table_name = 'project_memory_topics' and c.column_name = 'include_in_chat';
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--        pg_get_function_result(p.oid) as result, p.prosecdef, p.proconfig
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'set_project_memory_topic_chat_inclusion';
-- select has_function_privilege('authenticated',
--   'public.set_project_memory_topic_chat_inclusion(uuid,uuid,uuid,boolean)', 'EXECUTE') as authenticated_ok,
--   has_function_privilege('anon',
--   'public.set_project_memory_topic_chat_inclusion(uuid,uuid,uuid,boolean)', 'EXECUTE') as anon_ok;
-- 期待値: authenticated_ok=true、anon_ok=false。
-- ロールバック: 先に利用アプリを旧コードへ戻し、その後で以下を手動実行する。
-- drop function if exists public.set_project_memory_topic_chat_inclusion(uuid, uuid, uuid, boolean);
-- alter table public.project_memory_topics drop column if exists include_in_chat;
-- notify pgrst, 'reload schema';
-- 列削除で opt-in 状態は失われる。本文・revision は変更しない。
begin;

alter table public.project_memory_topics
  add column if not exists include_in_chat boolean not null default false;

drop function if exists public.set_project_memory_topic_chat_inclusion(uuid, uuid, uuid, boolean);

create or replace function public.set_project_memory_topic_chat_inclusion(
  p_user_id uuid,
  p_project_id uuid,
  p_topic_id uuid,
  p_include boolean
)
returns table(is_included boolean, included_chars integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max constant integer := 8000;
  v_project_id uuid;
  v_topic record;
  v_others integer;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if p_include is null then
    raise exception 'include_in_chat is required' using errcode = 'P0001';
  end if;

  select t.project_id into v_project_id
  from public.project_memory_topics t
  where t.id = p_topic_id and t.user_id = p_user_id;

  if not found or v_project_id is distinct from p_project_id then
    raise exception 'topic not found' using errcode = 'P0001';
  end if;

  perform 1
  from public.projects p
  where p.id = v_project_id and p.user_id = p_user_id
  for update;

  if not found then
    raise exception 'topic not found' using errcode = 'P0001';
  end if;

  select t.include_in_chat, t.content_md into v_topic
  from public.project_memory_topics t
  where t.id = p_topic_id and t.user_id = p_user_id and t.project_id = v_project_id
  for update;

  if not found then
    raise exception 'topic not found' using errcode = 'P0001';
  end if;

  select coalesce(sum(char_length(t.content_md)), 0)::integer into v_others
  from public.project_memory_topics t
  where t.project_id = v_project_id and t.user_id = p_user_id
    and t.include_in_chat and t.id <> p_topic_id;

  if v_topic.include_in_chat = p_include then
    return query select v_topic.include_in_chat,
      v_others + (case when v_topic.include_in_chat then char_length(v_topic.content_md) else 0 end);
    return;
  end if;

  if p_include then
    if btrim(v_topic.content_md) = '' then
      raise exception 'topic is empty' using errcode = 'P0001';
    end if;
    if v_others + char_length(v_topic.content_md) > c_max then
      raise exception 'chat inclusion limit exceeded' using errcode = 'P0001';
    end if;
  end if;

  update public.project_memory_topics as t
  set include_in_chat = p_include
  where t.id = p_topic_id and t.user_id = p_user_id;

  return query select p_include,
    v_others + (case when p_include then char_length(v_topic.content_md) else 0 end);
end;
$$;

revoke execute on function public.set_project_memory_topic_chat_inclusion(uuid, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_project_memory_topic_chat_inclusion(uuid, uuid, uuid, boolean)
  to authenticated;

commit;

notify pgrst, 'reload schema';
