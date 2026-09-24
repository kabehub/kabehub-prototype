begin;

-- ============================================================
-- Promotion Contract: idempotency制約（partial unique expression index）
-- ============================================================
create unique index if not exists idx_lore_embeddings_promotion_source_revision
  on public.lore_embeddings (
    user_id,
    (metadata->>'source_topic_id'),
    (metadata->>'source_revision')
  )
  where source_type = 'project_memory_promotion';

-- supersede処理用：source_topic_id単位でアクティブなPromotion Loreを1件引く
create index if not exists idx_lore_embeddings_promotion_active_by_topic
  on public.lore_embeddings (
    user_id,
    (metadata->>'source_topic_id')
  )
  where source_type = 'project_memory_promotion'
    and is_archived = false
    and superseded_by is null;

-- ============================================================
-- bug fix: Lore Book検索（match_lore_embeddings_by_project）が
-- archive/supersedeを無視していたのを修正する。
-- Promotionだけでなく、既存の通常archived/superseded Lore全般に効く。
-- ============================================================
create or replace function public.match_lore_embeddings_by_project(
  query_embedding vector,
  match_project_id uuid,
  match_user_id uuid,
  match_count integer
)
returns table(chunk_text text, similarity double precision)
language sql
stable
as $$
  select chunk_text, 1 - (embedding <-> query_embedding) as similarity
  from lore_embeddings
  where user_id = match_user_id
    and project_id = match_project_id
    and is_archived = false
    and superseded_by is null
  order by embedding <-> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_lore_embeddings_by_project(vector, uuid, uuid, integer)
  from public, anon;
grant execute on function public.match_lore_embeddings_by_project(vector, uuid, uuid, integer)
  to authenticated, service_role;

-- ============================================================
-- promote_project_memory_topic_to_lore
-- ============================================================
create or replace function public.promote_project_memory_topic_to_lore(
  p_user_id uuid,
  p_topic_id uuid,
  p_expected_revision int,
  p_embedding vector
)
returns table(lore_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_topic record;
  v_existing_id uuid;
  v_new_id uuid;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'expected_revision must be a positive integer' using errcode = 'P0001';
  end if;

  if p_embedding is null then
    raise exception 'embedding is required' using errcode = 'P0001';
  end if;

  -- locator：非ロックでproject_idだけ解決する
  select t.project_id into v_project_id
  from public.project_memory_topics t
  where t.id = p_topic_id and t.user_id = p_user_id;

  if not found then
    raise exception 'topic not found' using errcode = 'P0001';
  end if;

  -- 1. Project lock（Deleteと同じ順序）
  perform 1
  from public.projects p
  where p.id = v_project_id and p.user_id = p_user_id
  for update;

  if not found then
    raise exception 'topic not found' using errcode = 'P0001';
  end if;

  -- 2. authoritative topic snapshot（project_id条件込みでロック確定）
  select t.id, t.project_id, t.topic_key, t.content_md, t.revision
  into v_topic
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

  if btrim(v_topic.content_md) = '' then
    raise exception 'topic is empty' using errcode = 'P0001';
  end if;

  begin
    insert into public.lore_embeddings (
      user_id, chunk_text, embedding, memory_kind, temporal_status,
      extraction_version, source_type, project_id, metadata
    )
    values (
      p_user_id,
      v_topic.content_md,
      p_embedding,
      'project',
      'current',
      'user_created',
      'project_memory_promotion',
      v_topic.project_id,
      jsonb_build_object(
        'source_topic_id', v_topic.id,
        'source_topic_key', v_topic.topic_key,
        'source_project_id', v_topic.project_id,
        'source_revision', p_expected_revision
      )
    )
    returning id into v_new_id;
  exception when unique_violation then
    select id into v_existing_id
    from public.lore_embeddings
    where user_id = p_user_id
      and source_type = 'project_memory_promotion'
      and metadata->>'source_topic_id' = v_topic.id::text
      and metadata->>'source_revision' = p_expected_revision::text;

    if not found then
      raise;  -- 想定外のunique違反はもみ消さず再送出
    end if;

    return query select v_existing_id, false;
    return;
  end;

  update public.lore_embeddings
  set is_archived = true,
      superseded_by = v_new_id
  where user_id = p_user_id
    and source_type = 'project_memory_promotion'
    and metadata->>'source_topic_id' = v_topic.id::text
    and id <> v_new_id
    and is_archived = false
    and superseded_by is null;

  return query select v_new_id, true;
end;
$$;

revoke execute on function public.promote_project_memory_topic_to_lore(uuid, uuid, int, vector)
  from public, anon, authenticated;
grant execute on function public.promote_project_memory_topic_to_lore(uuid, uuid, int, vector)
  to authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- POSTFLIGHT（適用後に実行し、出力を確認する。migration本体には含めない）
-- ============================================================
--
-- 1. 新RPC・新関数の存在とシグネチャ確認
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--        p.prosecdef, p.proconfig
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('promote_project_memory_topic_to_lore', 'match_lore_embeddings_by_project')
-- order by p.proname;
-- -- 期待値：各1行のみ（オーバーロードなし）、promote_...はprosecdef=true。
--
-- 2. index定義の中身を確認（IF NOT EXISTSは既存同名indexがあれば
--    中身が違っても成功扱いになるため、存在確認だけでは不十分）
-- select indexrelid::regclass as index_name, pg_get_indexdef(indexrelid) as definition
-- from pg_index
-- where indexrelid in (
--   'public.idx_lore_embeddings_promotion_source_revision'::regclass,
--   'public.idx_lore_embeddings_promotion_active_by_topic'::regclass
-- );
-- -- 期待値：
-- --   idx_lore_embeddings_promotion_source_revision: UNIQUE、式が
-- --     (user_id, (metadata->>'source_topic_id'), (metadata->>'source_revision'))、
-- --     predicateが (source_type = 'project_memory_promotion')
-- --   idx_lore_embeddings_promotion_active_by_topic: 非UNIQUE、式が
-- --     (user_id, (metadata->>'source_topic_id'))、
-- --     predicateが (source_type = 'project_memory_promotion' AND is_archived = false
-- --     AND superseded_by IS NULL)
--
-- 3. EXECUTE権限の実効確認（has_function_privilege）
-- select
--   has_function_privilege('authenticated',
--     'public.promote_project_memory_topic_to_lore(uuid,uuid,int,vector)', 'EXECUTE') as authenticated_ok,
--   has_function_privilege('anon',
--     'public.promote_project_memory_topic_to_lore(uuid,uuid,int,vector)', 'EXECUTE') as anon_ok;
-- -- 期待値：authenticated_ok=true、anon_ok=false
