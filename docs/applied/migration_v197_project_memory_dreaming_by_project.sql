-- Phase 5Aで追加する3つの *_by_project RPCはExpand期間中のみ folder_name を projects.name から派生保存する移行版であり、Phase 5Cでは lore_embeddings.folder_name DROPより先に3RPCを folder_name 非依存の最終形へ CREATE OR REPLACE する。
-- DB Expandのみ。旧3RPCとrollback_dreaming_batch_multiは変更しない。
-- 新版はsourceのproject_idをidentityとし、p_folder_nameを受け取らない。
-- 適用順: test -> verify-project-memory-phase-5a.mjs -> production -> postflight。

begin;

-- Dreaming: 2件をUUID昇順で先にロックしてから検証する。
create or replace function public.consolidate_dreaming_batch_by_project(
  p_user_id uuid, p_lore_id_a uuid, p_lore_id_b uuid, p_merged_text text,
  p_embedding vector, p_memory_kind text, p_temporal_status text,
  p_importance double precision, p_confidence double precision
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lore_id_a     uuid;
  v_lore_id_b     uuid;
  v_source       public.lore_embeddings%rowtype;
  v_source_a     public.lore_embeddings%rowtype;
  v_source_b     public.lore_embeddings%rowtype;
  v_found_count  integer := 0;
  v_project_id   uuid;
  v_folder_name  text;
  v_tags         text[];
  v_new_id       uuid;
  v_updated_count integer;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if p_lore_id_a is not distinct from p_lore_id_b then
    raise exception 'source ids must differ' using errcode = 'P0001';
  end if;

  v_lore_id_a := least(p_lore_id_a, p_lore_id_b);
  v_lore_id_b := greatest(p_lore_id_a, p_lore_id_b);

  for v_source in
    select le.*
    from public.lore_embeddings as le
    where le.id in (v_lore_id_a, v_lore_id_b)
      and le.user_id = p_user_id
    order by le.id
    for update
  loop
    v_found_count := v_found_count + 1;
    if v_source.id = v_lore_id_a then
      v_source_a := v_source;
    else
      v_source_b := v_source;
    end if;
  end loop;

  if v_found_count <> 2
     or v_source_a.is_archived is not false
     or v_source_a.superseded_by is not null
     or v_source_a.is_pinned is not false
     or (v_source_a.extraction_version is not null
         and v_source_a.extraction_version in
             ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned'))
     or v_source_b.is_archived is not false
     or v_source_b.superseded_by is not null
     or v_source_b.is_pinned is not false
     or (v_source_b.extraction_version is not null
         and v_source_b.extraction_version in
             ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned'))
  then
    raise exception 'source records failed protection check' using errcode = 'P0001';
  end if;

  if v_source_a.project_id is distinct from v_source_b.project_id then
    raise exception 'source records belong to different projects' using errcode = 'P0001';
  end if;

  v_project_id := v_source_a.project_id;
  if v_project_id is not null then
    select name into v_folder_name
    from public.projects
    where id = v_project_id and user_id = p_user_id;
    if not found then
      raise exception 'project not found' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(array_agg(distinct tag), '{}'::text[])
  into v_tags
  from unnest(
    coalesce(v_source_a.tags, '{}'::text[])
    || coalesce(v_source_b.tags, '{}'::text[])
  ) as tag;

  insert into public.lore_embeddings (
    user_id, chunk_text, embedding, memory_kind,
    temporal_status, extraction_version, source_type,
    source_thread_id, source_message_id, source_message_number,
    folder_name, project_id, tags, importance_score, confidence_score
  ) values (
    p_user_id, p_merged_text, p_embedding, p_memory_kind,
    p_temporal_status, 'dreaming_batch', 'consolidation',
    null, null, null,
    v_folder_name, v_project_id, v_tags, p_importance, p_confidence
  ) returning id into v_new_id;

  update public.lore_embeddings
  set is_archived = true, superseded_by = v_new_id
  where id in (v_lore_id_a, v_lore_id_b)
    and user_id = p_user_id
    and is_archived = false
    and superseded_by is null;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 2 then
    raise exception 'expected 2 source records to be archived, got %', v_updated_count
      using errcode = 'P0001';
  end if;

  return v_new_id;
end;
$$;

revoke execute on function public.consolidate_dreaming_batch_by_project(
  uuid, uuid, uuid, text, vector, text, text, double precision, double precision
) from public, anon, authenticated;
grant execute on function public.consolidate_dreaming_batch_by_project(
  uuid, uuid, uuid, text, vector, text, text, double precision, double precision
) to authenticated;

-- Dreaming: source群をUUID昇順でロックしながら1件ずつ検証する。
create or replace function public.consolidate_dreaming_batch_multi_by_project(
  p_user_id uuid, p_source_ids uuid[], p_merged_text text, p_embedding vector,
  p_memory_kind text, p_temporal_status text,
  p_importance double precision, p_confidence double precision
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source        record;
  v_new_id        uuid;
  v_updated_count integer;
  v_tags          text[];
  v_all_tags      text[] := '{}';
  v_source_count  integer;
  v_found_count   integer := 0;
  v_project_id    uuid;
  v_folder_name   text;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  v_source_count := array_length(p_source_ids, 1);
  if v_source_count is null or v_source_count < 2 then
    raise exception 'source_ids must contain at least 2 elements'
      using errcode = 'P0001';
  end if;

  for v_source in
    select id, is_pinned, extraction_version, is_archived, superseded_by, tags,
           project_id
    from public.lore_embeddings
    where id = any(p_source_ids) and user_id = p_user_id
    order by id
    for update
  loop
    v_found_count := v_found_count + 1;
    if v_source.is_pinned is not false then
      raise exception 'source % is pinned', v_source.id using errcode = 'P0001';
    end if;
    if v_source.is_archived is not false then
      raise exception 'source % is already archived', v_source.id using errcode = 'P0001';
    end if;
    if v_source.superseded_by is not null then
      raise exception 'source % is already superseded', v_source.id using errcode = 'P0001';
    end if;
    if v_source.extraction_version is not null
       and v_source.extraction_version in
           ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned') then
      raise exception 'source % is protected (extraction_version=%)',
        v_source.id, v_source.extraction_version using errcode = 'P0001';
    end if;

    if v_found_count = 1 then
      v_project_id := v_source.project_id;
    elsif v_source.project_id is distinct from v_project_id then
      raise exception 'source records belong to different projects' using errcode = 'P0001';
    end if;
    v_all_tags := v_all_tags || coalesce(v_source.tags, '{}');
  end loop;

  if v_found_count <> v_source_count then
    raise exception 'expected % sources but found %', v_source_count, v_found_count
      using errcode = 'P0001';
  end if;

  if v_project_id is not null then
    select name into v_folder_name
    from public.projects
    where id = v_project_id and user_id = p_user_id;
    if not found then
      raise exception 'project not found' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(array_agg(distinct tag), '{}')
  into v_tags
  from unnest(v_all_tags) as tag;
  insert into public.lore_embeddings (
    user_id, chunk_text, embedding, memory_kind, temporal_status,
    folder_name, project_id, tags, importance_score, confidence_score,
    extraction_version, source_type, is_archived, is_pinned,
    source_thread_id, source_message_id, source_message_number
  ) values (
    p_user_id, p_merged_text, p_embedding, p_memory_kind, p_temporal_status,
    v_folder_name, v_project_id, v_tags, p_importance, p_confidence,
    'dreaming_batch', 'consolidation', false, false,
    null, null, null
  ) returning id into v_new_id;

  update public.lore_embeddings
  set superseded_by = v_new_id, is_archived = true
  where id = any(p_source_ids) and user_id = p_user_id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_source_count then
    raise exception 'expected to update % sources but updated %', v_source_count, v_updated_count
      using errcode = 'P0001';
  end if;

  return v_new_id;
end;
$$;

revoke execute on function public.consolidate_dreaming_batch_multi_by_project(
  uuid, uuid[], text, vector, text, text, double precision, double precision
) from public, anon, authenticated;
grant execute on function public.consolidate_dreaming_batch_multi_by_project(
  uuid, uuid[], text, vector, text, text, double precision, double precision
) to authenticated;

-- ユーザー編集マージ: lock-firstとタグの初出順を旧版と揃える。
-- liked_ai / liked_ai_cleanedは許容する。
create or replace function public.merge_user_edited_lore_pair_by_project(
  p_user_id uuid,
  p_lore_id_a uuid,
  p_lore_id_b uuid,
  p_merged_text text,
  p_embedding vector,
  p_memory_kind text default null,
  p_temporal_status text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lore_id_a     uuid;
  v_lore_id_b     uuid;
  v_source        public.lore_embeddings%rowtype;
  v_source_a      public.lore_embeddings%rowtype;
  v_source_b      public.lore_embeddings%rowtype;
  v_found_count   integer := 0;
  v_folder_name   text;
  v_project_id    uuid;
  v_tags          text[];
  v_new_id        uuid;
  v_updated_count integer;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if p_lore_id_a is not distinct from p_lore_id_b then
    raise exception 'source ids must differ' using errcode = 'P0001';
  end if;

  v_lore_id_a := least(p_lore_id_a, p_lore_id_b);
  v_lore_id_b := greatest(p_lore_id_a, p_lore_id_b);

  for v_source in
    select le.*
    from public.lore_embeddings as le
    where le.id in (v_lore_id_a, v_lore_id_b)
      and le.user_id = p_user_id
    order by le.id
    for update
  loop
    v_found_count := v_found_count + 1;
    if v_source.id = v_lore_id_a then
      v_source_a := v_source;
    else
      v_source_b := v_source;
    end if;
  end loop;

  if v_found_count <> 2
     or v_source_a.is_archived is not false
     or v_source_a.superseded_by is not null
     or v_source_a.is_pinned is not false
     or (v_source_a.extraction_version is not null
         and v_source_a.extraction_version in ('user_edited', 'user_created'))
     or v_source_b.is_archived is not false
     or v_source_b.superseded_by is not null
     or v_source_b.is_pinned is not false
     or (v_source_b.extraction_version is not null
         and v_source_b.extraction_version in ('user_edited', 'user_created'))
  then
    raise exception 'source records failed protection check' using errcode = 'P0001';
  end if;

  if v_source_a.project_id is distinct from v_source_b.project_id then
    raise exception 'source records belong to different projects' using errcode = 'P0001';
  end if;

  v_project_id := v_source_a.project_id;
  if v_project_id is not null then
    select name into v_folder_name
    from public.projects
    where id = v_project_id and user_id = p_user_id;
    if not found then
      raise exception 'project not found' using errcode = 'P0001';
    end if;
  end if;

  -- normalizeTagsと同じく、sourceA、sourceBの順で最初に現れたタグを残す。
  select coalesce(
    array_agg(v_unique_tags.tag order by v_unique_tags.first_ordinality),
    '{}'::text[]
  )
  into v_tags
  from (
    select v_tag.tag, min(v_tag.ordinality) as first_ordinality
    from unnest(
      coalesce(v_source_a.tags, '{}'::text[])
      || coalesce(v_source_b.tags, '{}'::text[])
    ) with ordinality as v_tag(tag, ordinality)
    where v_tag.tag is not null
    group by v_tag.tag
  ) as v_unique_tags;

  insert into public.lore_embeddings (
    user_id,
    folder_name,
    project_id,
    chunk_text,
    embedding,
    memory_kind,
    temporal_status,
    extraction_version,
    source_type,
    source_thread_id,
    source_message_id,
    source_message_number,
    tags,
    importance_score,
    confidence_score,
    last_confirmed_at
  ) values (
    p_user_id,
    v_folder_name,
    v_project_id,
    p_merged_text,
    p_embedding,
    coalesce(p_memory_kind, v_source_a.memory_kind),
    coalesce(p_temporal_status, v_source_a.temporal_status),
    'user_edited',
    'consolidation',
    null,
    null,
    null,
    v_tags,
    greatest(
      coalesce(v_source_a.importance_score, 0),
      coalesce(v_source_b.importance_score, 0)
    ),
    (
      coalesce(v_source_a.confidence_score, 0)
      + coalesce(v_source_b.confidence_score, 0)
    ) / 2,
    now()
  ) returning id into v_new_id;

  update public.lore_embeddings
  set is_archived = true,
      superseded_by = v_new_id
  where id in (v_lore_id_a, v_lore_id_b)
    and user_id = p_user_id
    and is_archived = false
    and superseded_by is null;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 2 then
    raise exception 'expected 2 source records to be archived, got %', v_updated_count
      using errcode = 'P0001';
  end if;

  return v_new_id;
end;
$$;

revoke execute on function public.merge_user_edited_lore_pair_by_project(
  uuid, uuid, uuid, text, vector, text, text
) from public, anon, authenticated;
grant execute on function public.merge_user_edited_lore_pair_by_project(
  uuid, uuid, uuid, text, vector, text, text
) to authenticated;

commit;

notify pgrst, 'reload schema';

-- POSTFLIGHT: 6行すべてregprocedureが非NULLであること。
-- select signature, to_regprocedure(signature)::text as regprocedure
-- from (values
--   ('public.consolidate_dreaming_batch_by_project(uuid,uuid,uuid,text,vector,text,text,double precision,double precision)'),
--   ('public.consolidate_dreaming_batch_multi_by_project(uuid,uuid[],text,vector,text,text,double precision,double precision)'),
--   ('public.merge_user_edited_lore_pair_by_project(uuid,uuid,uuid,text,vector,text,text)'),
--   ('public.consolidate_dreaming_batch(uuid,uuid,uuid,text,vector,text,text,text,double precision,double precision)'),
--   ('public.consolidate_dreaming_batch_multi(uuid,uuid[],text,vector,text,text,text,double precision,double precision)'),
--   ('public.merge_user_edited_lore_pair(uuid,uuid,uuid,text,vector,text,text)')
-- ) as rpc(signature);
--
-- POSTFLIGHT: 新3RPCでauthenticated=true、anon=false、public=false。
-- select signature,
--   has_function_privilege('authenticated', signature, 'EXECUTE') as authenticated,
--   has_function_privilege('anon', signature, 'EXECUTE') as anon,
--   has_function_privilege('public', signature, 'EXECUTE') as public
-- from (values
--   ('public.consolidate_dreaming_batch_by_project(uuid,uuid,uuid,text,vector,text,text,double precision,double precision)'),
--   ('public.consolidate_dreaming_batch_multi_by_project(uuid,uuid[],text,vector,text,text,double precision,double precision)'),
--   ('public.merge_user_edited_lore_pair_by_project(uuid,uuid,uuid,text,vector,text,text)')
-- ) as rpc(signature);
