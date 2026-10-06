-- v205: Project Memory topic の revision CAS つき一括削除。Loreは変更しない。
-- 適用順序: DB→アプリ。Ruiによる手動適用が前提。
-- 初回適用前確認（0行を期待。再適用時は適用後確認で確認）:
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'delete_project_memory_topics';
-- 適用後確認（3引数、integer、SECURITY DEFINER、search_path=''）:
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--        pg_get_function_result(p.oid) as result, p.prosecdef, p.proconfig
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'delete_project_memory_topics';
-- select has_function_privilege('authenticated',
--   'public.delete_project_memory_topics(uuid,uuid,jsonb)', 'EXECUTE') as authenticated_ok,
--   has_function_privilege('anon',
--   'public.delete_project_memory_topics(uuid,uuid,jsonb)', 'EXECUTE') as anon_ok;
-- 期待値: authenticated_ok=true、anon_ok=false。
-- ロールバック: 先に利用アプリを旧コードへ戻し、その後で以下を手動実行する。
-- drop function if exists public.delete_project_memory_topics(uuid, uuid, jsonb);
-- notify pgrst, 'reload schema';
-- 削除済みtopic・revisionはロールバックでも復元できない。
-- 再実行安全性: transaction内でdrop function if exists → create or replaceとACL再設定。
begin;

drop function if exists public.delete_project_memory_topics(uuid, uuid, jsonb);
create or replace function public.delete_project_memory_topics(
  p_user_id uuid,
  p_project_id uuid,
  p_topics jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- lib/project-memory/topic-delete-limits.ts: PROJECT_MEMORY_BULK_DELETE_MAX_TOPICS
  c_max constant integer := 50;
  v_element jsonb;
  v_revision text;
  v_ids uuid[];
  v_topic record;
  v_count integer := 0;
  v_conflict boolean := false;
  v_deleted integer;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_topics is null or jsonb_typeof(p_topics) is distinct from 'array' then
    raise exception 'topics must be a jsonb array' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_topics) = 0 or jsonb_array_length(p_topics) > c_max then
    raise exception 'topics must contain 1 to 50 items' using errcode = 'P0001';
  end if;

  for v_element in select value from jsonb_array_elements(p_topics)
  loop
    if jsonb_typeof(v_element) is distinct from 'object'
       or jsonb_typeof(v_element->'topic_id') is distinct from 'string'
       or (v_element->>'topic_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_element->'expected_revision') is distinct from 'number'
       or (v_element->>'expected_revision') !~ '^[1-9][0-9]*$'
    then
      raise exception 'invalid topic element' using errcode = 'P0001';
    end if;
    -- Bound using text, never numeric/int casts on unbounded input.
    v_revision := v_element->>'expected_revision';
    if length(v_revision) > 10 or
       (length(v_revision) = 10 and v_revision collate "C" > '2147483647' collate "C") then
      raise exception 'invalid topic element' using errcode = 'P0001';
    end if;
  end loop;

  select array_agg((value->>'topic_id')::uuid) into v_ids
  from jsonb_array_elements(p_topics);
  if cardinality(v_ids) <> (select count(distinct id) from unnest(v_ids) as ids(id)) then
    raise exception 'duplicate topic_id' using errcode = 'P0001';
  end if;

  perform 1 from public.projects p
  where p.id = p_project_id and p.user_id = p_user_id
  for update;
  if not found then
    raise exception 'project not found' using errcode = 'P0001';
  end if;

  for v_topic in
    select t.id, t.revision from public.project_memory_topics t
    where t.project_id = p_project_id and t.user_id = p_user_id and t.id = any(v_ids)
    order by t.id
    for update
  loop
    v_count := v_count + 1;
    if not exists (
      select 1 from jsonb_array_elements(p_topics) as elements(value)
      where (value->>'topic_id')::uuid = v_topic.id
        and (value->>'expected_revision')::int = v_topic.revision
    ) then
      v_conflict := true;
    end if;
  end loop;
  if v_count <> jsonb_array_length(p_topics) then
    raise exception 'topic not found' using errcode = 'P0001';
  end if;
  if v_conflict then
    raise exception 'revision conflict' using errcode = 'P0001';
  end if;

  -- project_memory_revisions.topic_id ON DELETE CASCADE removes history.
  delete from public.project_memory_topics
  where project_id = p_project_id and user_id = p_user_id and id = any(v_ids);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke execute on function public.delete_project_memory_topics(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.delete_project_memory_topics(uuid, uuid, jsonb)
  to authenticated;
commit;
notify pgrst, 'reload schema';
