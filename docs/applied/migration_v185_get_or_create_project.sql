-- migration_v185_get_or_create_project.sql
-- Project Memory Manager Phase C（dual compatibility）:
-- folder_nameを書き込む各経路でproject_idを同時設定するためのproject解決RPCを
-- 追加し、Lore統合RPCではsource由来のproject_idを安全に伝播する。

begin;

create or replace function public.get_or_create_project(
  p_user_id uuid,
  p_name text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_id uuid;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = 'P0001';
  end if;

  -- SupabaseはJWTのroleに応じてPostgres roleを切り替える。
  -- service_role（MCP経由）はサーバー側で認証済みのp_user_idを信頼し、
  -- authenticated（通常Web/mobile）はauth.uid()との一致を必須にする。
  if current_user <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'name is required' using errcode = 'P0001';
  end if;

  insert into public.projects (user_id, name)
  values (p_user_id, p_name)
  on conflict (user_id, name) do nothing;

  select id into v_project_id
  from public.projects
  where user_id = p_user_id and name = p_name;

  return v_project_id;
end;
$$;

revoke execute on function public.get_or_create_project(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_or_create_project(uuid, text)
  to authenticated, service_role;

grant select, insert on table public.projects to service_role;

-- Dreaming（記憶統合）: 2件統合・タグ自動マージ版
-- 引数シグネチャは変更せず、source由来のfolder/projectを伝播する。
create or replace function public.consolidate_dreaming_batch(
  p_user_id uuid, p_lore_id_a uuid, p_lore_id_b uuid, p_merged_text text,
  p_embedding vector, p_memory_kind text, p_temporal_status text, p_folder_name text,
  p_importance double precision, p_confidence double precision
)
returns uuid
language plpgsql
as $$
declare
  new_id             uuid;
  updated_count      int;
  v_tags             text[];
  v_project_id_a     uuid;
  v_project_id_b     uuid;
  v_folder_name_a    text;
  v_folder_name_b    text;
begin
  if exists (
    select 1 from lore_embeddings
    where id in (p_lore_id_a, p_lore_id_b)
      and (
        user_id != p_user_id
        or is_archived = true
        or superseded_by is not null
        or is_pinned = true
        or extraction_version in ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned')
      )
  ) then
    raise exception 'source records failed protection check';
  end if;
  select coalesce(array_agg(distinct tag), '{}')
  into v_tags
  from unnest(
    coalesce((select tags from lore_embeddings where id = p_lore_id_a), '{}') ||
    coalesce((select tags from lore_embeddings where id = p_lore_id_b), '{}')
  ) as tag;
  perform id from lore_embeddings
  where id in (p_lore_id_a, p_lore_id_b)
  order by id
  for update;

  select project_id, folder_name
  into v_project_id_a, v_folder_name_a
  from lore_embeddings
  where id = p_lore_id_a;

  select project_id, folder_name
  into v_project_id_b, v_folder_name_b
  from lore_embeddings
  where id = p_lore_id_b;

  if v_project_id_a is distinct from v_project_id_b
     or v_folder_name_a is distinct from v_folder_name_b then
    raise exception 'source records belong to different projects' using errcode = 'P0001';
  end if;

  if p_folder_name is distinct from v_folder_name_a then
    raise exception 'p_folder_name does not match source records' using errcode = 'P0001';
  end if;

  insert into lore_embeddings (
    user_id, chunk_text, embedding, memory_kind,
    temporal_status, extraction_version, source_type,
    source_thread_id, source_message_id, source_message_number,
    folder_name, project_id, tags, importance_score, confidence_score
  ) values (
    p_user_id, p_merged_text, p_embedding, p_memory_kind,
    p_temporal_status, 'dreaming_batch', 'consolidation',
    null, null, null,
    v_folder_name_a, v_project_id_a, v_tags, p_importance, p_confidence
  ) returning id into new_id;
  update lore_embeddings
  set is_archived = true, superseded_by = new_id
  where id in (p_lore_id_a, p_lore_id_b)
    and user_id = p_user_id
    and is_archived = false
    and superseded_by is null;
  get diagnostics updated_count = row_count;
  if updated_count <> 2 then
    raise exception 'expected 2 source records to be archived, got %', updated_count;
  end if;
  return new_id;
end;
$$;

-- Dreaming（記憶統合）: 3件以上のマルチ統合版
-- 引数シグネチャは変更せず、source由来のfolder/projectを伝播する。
create or replace function public.consolidate_dreaming_batch_multi(
  p_user_id uuid, p_source_ids uuid[], p_merged_text text, p_embedding vector,
  p_memory_kind text, p_temporal_status text, p_folder_name text,
  p_importance double precision, p_confidence double precision
)
returns uuid
language plpgsql
security definer
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
           project_id, folder_name
    from public.lore_embeddings
    where id = any(p_source_ids)
      and user_id = p_user_id
    order by id
    for update
  loop
    v_found_count := v_found_count + 1;
    if v_found_count = 1 then
      v_project_id := v_source.project_id;
      v_folder_name := v_source.folder_name;
    elsif v_source.project_id is distinct from v_project_id
       or v_source.folder_name is distinct from v_folder_name then
      raise exception 'source records belong to different projects' using errcode = 'P0001';
    end if;
    if v_source.is_pinned then
      raise exception 'source % is pinned', v_source.id using errcode = 'P0001';
    end if;
    if v_source.extraction_version in ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned') then
      raise exception 'source % is protected (extraction_version=%)', v_source.id, v_source.extraction_version
        using errcode = 'P0001';
    end if;
    if v_source.is_archived then
      raise exception 'source % is already archived', v_source.id using errcode = 'P0001';
    end if;
    if v_source.superseded_by is not null then
      raise exception 'source % is already superseded', v_source.id using errcode = 'P0001';
    end if;
    v_all_tags := v_all_tags || coalesce(v_source.tags, '{}');
  end loop;
  if v_found_count <> v_source_count then
    raise exception 'expected % sources but found %', v_source_count, v_found_count
      using errcode = 'P0001';
  end if;
  if p_folder_name is distinct from v_folder_name then
    raise exception 'p_folder_name does not match source records' using errcode = 'P0001';
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
  )
  returning id into v_new_id;
  update public.lore_embeddings
  set superseded_by = v_new_id, is_archived = true
  where id = any(p_source_ids)
    and user_id = p_user_id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_source_count then
    raise exception 'expected to update % sources but updated %', v_source_count, v_updated_count
      using errcode = 'P0001';
  end if;
  return v_new_id;
end;
$$;

-- ユーザー編集マージ: 2件を原子的に統合（liked_ai / liked_ai_cleanedは許容）
-- 引数シグネチャは変更せず、新しい方のsourceからfolder/projectを同時に伝播する。
create or replace function public.merge_user_edited_lore_pair(
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

  -- UUIDの標準表現では、uuid型の大小順はnormalizePairの文字列昇順と一致する。
  v_lore_id_a := least(p_lore_id_a, p_lore_id_b);
  v_lore_id_b := greatest(p_lore_id_a, p_lore_id_b);

  -- 2件を同じ順序で先にロックし、並行マージとの競合を直列化する。
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
    or not (
      v_source_a.user_id is not distinct from p_user_id
      and v_source_a.is_archived is false
      and v_source_a.superseded_by is null
      and v_source_a.is_pinned is false
      and (
        v_source_a.extraction_version is null
        or v_source_a.extraction_version not in ('user_edited', 'user_created')
      )
    )
    or not (
      v_source_b.user_id is not distinct from p_user_id
      and v_source_b.is_archived is false
      and v_source_b.superseded_by is null
      and v_source_b.is_pinned is false
      and (
        v_source_b.extraction_version is null
        or v_source_b.extraction_version not in ('user_edited', 'user_created')
      )
    )
  then
    raise exception 'source records failed protection check' using errcode = 'P0001';
  end if;

  if coalesce(v_source_a.created_at, '-infinity'::timestamptz)
      >= coalesce(v_source_b.created_at, '-infinity'::timestamptz) then
    v_folder_name := v_source_a.folder_name;
    v_project_id := v_source_a.project_id;
  else
    v_folder_name := v_source_b.folder_name;
    v_project_id := v_source_b.project_id;
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
  )
  returning id into v_new_id;

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

commit;

notify pgrst, 'reload schema';
