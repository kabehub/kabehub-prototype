-- migration_v177_merge_user_edited_lore_pair.sql
-- MF-3c-DB: 手動ユーザー編集マージのINSERT/UPDATEを、RLS適用の
-- トランザクションRPCへ移す。
-- consolidate_dreaming_batch系とは異なり、liked_ai / liked_ai_cleanedは
-- 保護対象に含めない。
-- 適用: 全文レビュー後、テスト環境Supabaseから適用する（現時点では未適用）。

begin;

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
  else
    v_folder_name := v_source_b.folder_name;
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

revoke execute on function public.merge_user_edited_lore_pair(
  uuid, uuid, uuid, text, vector, text, text
) from public, anon, authenticated;
grant execute on function public.merge_user_edited_lore_pair(
  uuid, uuid, uuid, text, vector, text, text
) to authenticated;

commit;

notify pgrst, 'reload schema';
