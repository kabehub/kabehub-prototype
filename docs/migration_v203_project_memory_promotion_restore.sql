-- v203: 同revisionの手動アーカイブ済み昇格Loreを、本文・embeddingを保持して復元する。
-- 適用順序: DB→アプリ。v200/v201/v202の定義・index・削除経路は変更しない。
-- 初回適用前確認（0行を期待。再適用時は下記の適用後確認で既存の1定義を確認）:
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'restore_archived_project_memory_promotion';
-- 適用後確認（3引数の1定義、SECURITY DEFINER、search_path=''）:
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--        pg_get_function_result(p.oid) as result, p.prosecdef, p.proconfig
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'restore_archived_project_memory_promotion';
-- select
--   has_function_privilege('authenticated',
--     'public.restore_archived_project_memory_promotion(uuid,uuid,integer)', 'EXECUTE') as authenticated_ok,
--   has_function_privilege('anon',
--     'public.restore_archived_project_memory_promotion(uuid,uuid,integer)', 'EXECUTE') as anon_ok;
-- 期待値: authenticated_ok=true、anon_ok=false。
-- ロールバック: 先にアプリを旧コードへ戻し、その後で以下を手動実行する。
-- drop function if exists public.restore_archived_project_memory_promotion(uuid, uuid, integer);
-- notify pgrst, 'reload schema';
-- 関数の削除は既に復元されたLoreの状態を戻さない。データ移行は不要。
begin;

create or replace function public.restore_archived_project_memory_promotion(
  p_user_id uuid,
  p_topic_id uuid,
  p_expected_revision integer
)
returns table(lore_id uuid, restored boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_topic record;
  v_lore public.lore_embeddings%rowtype;
  v_target public.lore_embeddings%rowtype;
  v_active_count integer := 0;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'expected_revision must be a positive integer' using errcode = 'P0001';
  end if;

  -- locator: Project→topic→Loreのロック順序を既存の昇格・削除RPCと揃える。
  select t.project_id into v_project_id
  from public.project_memory_topics t
  where t.id = p_topic_id and t.user_id = p_user_id;

  if not found then
    raise exception 'topic not found' using errcode = 'P0001';
  end if;

  perform 1
  from public.projects p
  where p.id = v_project_id and p.user_id = p_user_id
  for update;

  if not found then
    raise exception 'topic not found' using errcode = 'P0001';
  end if;

  select t.id, t.revision into v_topic
  from public.project_memory_topics t
  where t.id = p_topic_id
    and t.user_id = p_user_id
    and t.project_id = v_project_id
  for update;

  if not found then
    raise exception 'topic not found' using errcode = 'P0001';
  end if;

  if v_topic.revision <> p_expected_revision then
    raise exception 'revision conflict' using errcode = 'P0001';
  end if;

  -- 対象と競合候補をまとめてID順でロックする。対象のarchive状態はロック後に判定。
  for v_lore in
    select le.*
    from public.lore_embeddings le
    where le.user_id = p_user_id
      and le.source_type = 'project_memory_promotion'
      and le.metadata->>'source_topic_id' = v_topic.id::text
      and (
        le.metadata->>'source_revision' = p_expected_revision::text
        or (le.is_archived = false and le.superseded_by is null)
      )
    order by le.id
    for update
  loop
    if v_lore.metadata->>'source_revision' = p_expected_revision::text then
      v_target := v_lore;
    end if;
    if v_lore.is_archived = false and v_lore.superseded_by is null then
      v_active_count := v_active_count + 1;
    end if;
  end loop;

  if v_target.id is null then
    raise exception 'promotion_not_found' using errcode = 'P0001';
  end if;

  if v_target.is_archived = false and v_target.superseded_by is null then
    return query select v_target.id, false;
    return;
  end if;

  if v_target.superseded_by is not null then
    raise exception 'restore_not_allowed_superseded' using errcode = 'P0001';
  end if;

  -- schemaではnullableのため、NULL状態をarchivedとみなして復元しない。
  if v_target.is_archived is not true then
    raise exception 'promotion_not_found' using errcode = 'P0001';
  end if;

  -- 対象はarchivedなので、この件数は対象以外のactive行の件数になる。
  if v_active_count > 0 then
    raise exception 'restore_conflict_active_exists' using errcode = 'P0001';
  end if;

  update public.lore_embeddings
  set is_archived = false
  where id = v_target.id
    and user_id = p_user_id;

  return query select v_target.id, true;
end;
$$;

revoke execute on function public.restore_archived_project_memory_promotion(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.restore_archived_project_memory_promotion(uuid, uuid, integer)
  to authenticated;

commit;

notify pgrst, 'reload schema';
