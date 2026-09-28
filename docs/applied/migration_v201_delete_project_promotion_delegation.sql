-- Phase 3: delete_project_preserving_contentsのLore昇格処理を
-- promote_project_memory_topic_to_lore（v200 Promotion Contract）へ委譲する。
--
-- 変更点：
-- 1. Lore昇格のINSERT本体・metadata構築・idempotency・supersede処理を
--    promote_project_memory_topic_to_lore呼び出しに一本化する
--    （source_revisionが常にmetadataへ入るようになる）。
-- 2. 事前検証（Project/topicロック順序、v_nonempty_topic_idsとの個数・
--    revision突合＝TOCTOU対策）は削除RPC側に残す。
-- 3. Project削除に伴うproject_id null化（threads/lore_embeddings/
--    project_memory_topics）は無変更。
--
-- 前提：v200（promote_project_memory_topic_to_lore）が適用済みであること。
-- 環境差異でv200が未適用の場合に実削除時まで壊れないよう、
-- fail-closedなexact signature preflightを本体定義の前に置く。

begin;

do $$
begin
  if to_regprocedure(
    'public.promote_project_memory_topic_to_lore(uuid,uuid,integer,vector)'
  ) is null then
    raise exception
      'required function promote_project_memory_topic_to_lore(uuid,uuid,integer,vector) is missing; apply migration_v200 first';
  end if;
end
$$;

create or replace function public.delete_project_preserving_contents(
  p_user_id uuid,
  p_project_id uuid,
  p_promote_to_lore boolean,
  p_lore_promotions jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_promo jsonb;
  v_topic record;
  v_promo_topic_ids uuid[];
  v_nonempty_topic_ids uuid[] := '{}'::uuid[];
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if p_promote_to_lore is null then
    raise exception 'promote_to_lore is required' using errcode = 'P0001';
  end if;

  if p_lore_promotions is null
     or jsonb_typeof(p_lore_promotions) is distinct from 'array'
  then
    raise exception 'lore_promotions must be a jsonb array' using errcode = 'P0001';
  end if;

  if p_promote_to_lore is false and jsonb_array_length(p_lore_promotions) <> 0 then
    raise exception 'lore_promotions must be empty when promote_to_lore is false'
      using errcode = 'P0001';
  end if;

  for v_promo in select * from jsonb_array_elements(p_lore_promotions)
  loop
    if jsonb_typeof(v_promo) is distinct from 'object'
       or v_promo->>'topic_id' is null
       or v_promo->>'expected_revision' is null
       or v_promo->'embedding' is null
       or jsonb_typeof(v_promo->'embedding') is distinct from 'array'
    then
      raise exception 'invalid lore promotion element' using errcode = 'P0001';
    end if;

    if jsonb_typeof(v_promo->'topic_id') is distinct from 'string'
       or (v_promo->>'topic_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_promo->'expected_revision') is distinct from 'number'
       or (v_promo->>'expected_revision') !~ '^[1-9][0-9]*$'
       or jsonb_array_length(v_promo->'embedding') = 0
       or exists (
         select 1
         from jsonb_array_elements(v_promo->'embedding')
           as embedding_element(value)
         where jsonb_typeof(embedding_element.value) is distinct from 'number'
       )
    then
      raise exception 'invalid lore promotion element' using errcode = 'P0001';
    end if;
  end loop;

  select array_agg((elem->>'topic_id')::uuid)
  into v_promo_topic_ids
  from jsonb_array_elements(p_lore_promotions) elem;

  if v_promo_topic_ids is not null
     and array_length(v_promo_topic_ids, 1) <>
       (select count(distinct x) from unnest(v_promo_topic_ids) x)
  then
    raise exception 'duplicate topic_id in lore_promotions' using errcode = 'P0001';
  end if;

  perform 1
  from public.projects p
  where p.id = p_project_id and p.user_id = p_user_id
  for update;
  if not found then
    raise exception 'project not found' using errcode = 'P0001';
  end if;

  for v_topic in
    select t.id, t.content_md, t.revision
    from public.project_memory_topics t
    where t.project_id = p_project_id
      and t.user_id = p_user_id
    order by t.id
    for update
  loop
    if btrim(v_topic.content_md) <> '' then
      v_nonempty_topic_ids := array_append(v_nonempty_topic_ids, v_topic.id);
    end if;
  end loop;

  if p_promote_to_lore then
    if coalesce(array_length(v_nonempty_topic_ids, 1), 0) <>
       coalesce(array_length(v_promo_topic_ids, 1), 0)
    then
      raise exception 'topic changed during promotion' using errcode = 'P0001';
    end if;

    for v_promo in select * from jsonb_array_elements(p_lore_promotions)
    loop
      select id, content_md, topic_key, revision
      into v_topic
      from public.project_memory_topics
      where id = (v_promo->>'topic_id')::uuid
        and project_id = p_project_id
        and user_id = p_user_id;

      if not found
         or v_topic.revision is distinct from (v_promo->>'expected_revision')::int
         or not (v_topic.id = any(v_nonempty_topic_ids))
      then
        raise exception 'topic changed during promotion' using errcode = 'P0001';
      end if;

      -- Phase 3: Lore昇格の実体はPromotion Contract（v200）へ委譲する。
      -- source_revisionを含むmetadata構築・idempotency（unique_violation）・
      -- supersede処理はすべてpromote_project_memory_topic_to_lore側の責務。
      perform 1
      from public.promote_project_memory_topic_to_lore(
        p_user_id,
        v_topic.id,
        (v_promo->>'expected_revision')::int,
        (v_promo->>'embedding')::public.vector
      );
    end loop;
  end if;

  update public.threads
  set project_id = null,
      folder_name = null
  where project_id = p_project_id and user_id = p_user_id;

  update public.lore_embeddings
  set project_id = null
  where project_id = p_project_id and user_id = p_user_id;

  update public.project_memory_topics
  set project_id = null
  where project_id = p_project_id and user_id = p_user_id;

  delete from public.projects
  where id = p_project_id and user_id = p_user_id;
end;
$$;

revoke execute on function public.delete_project_preserving_contents(uuid, uuid, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.delete_project_preserving_contents(uuid, uuid, boolean, jsonb)
  to authenticated;

commit;

notify pgrst, 'reload schema';

-- POSTFLIGHT（適用後確認、migration本体には含めない）
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'delete_project_preserving_contents';
