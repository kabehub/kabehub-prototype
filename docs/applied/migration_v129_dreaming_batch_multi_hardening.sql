-- migration_v129_dreaming_batch_multi_hardening.sql
-- consolidate_dreaming_batch_multi / rollback_dreaming_batch_multi が
-- SECURITY DEFINERでありながら呼出者とp_user_idの一致検証がなく、
-- EXECUTE権限もPUBLICに残ったままだったため、anon/authenticatedキーで
-- 直接RPCを叩けば任意ユーザーのlore_embeddingsを統合・ロールバックできる
-- 状態だった（監査A B-02）。B-01（migration_v128）で確立した
-- search_path = '' ＋ 完全修飾方式に合わせて修正する。
--
-- 適用: テスト環境Supabaseで適用・preflight/postflight確認後、本番へ適用する。

begin;

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
    select id, is_pinned, extraction_version, is_archived, superseded_by, tags
    from public.lore_embeddings
    where id = any(p_source_ids)
      and user_id = p_user_id
    order by id
    for update
  loop
    v_found_count := v_found_count + 1;
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
  select coalesce(array_agg(distinct tag), '{}')
  into v_tags
  from unnest(v_all_tags) as tag;
  insert into public.lore_embeddings (
    user_id, chunk_text, embedding, memory_kind, temporal_status,
    folder_name, tags, importance_score, confidence_score,
    extraction_version, source_type, is_archived, is_pinned,
    source_thread_id, source_message_id, source_message_number
  ) values (
    p_user_id, p_merged_text, p_embedding, p_memory_kind, p_temporal_status,
    p_folder_name, v_tags, p_importance, p_confidence,
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

create or replace function public.rollback_dreaming_batch_multi(
  p_user_id uuid, p_consolidated_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consolidated  record;
  v_source_count  integer;
  v_updated_count integer;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select id, extraction_version, source_type, is_archived, is_pinned
  into v_consolidated
  from public.lore_embeddings
  where id = p_consolidated_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'consolidated record not found' using errcode = 'P0001';
  end if;
  if v_consolidated.extraction_version <> 'dreaming_batch' then
    raise exception 'not a dreaming_batch record' using errcode = 'P0001';
  end if;
  if v_consolidated.source_type <> 'consolidation' then
    raise exception 'not a consolidation record' using errcode = 'P0001';
  end if;
  if v_consolidated.is_archived then
    raise exception 'already rolled back' using errcode = 'P0001';
  end if;
  if v_consolidated.is_pinned then
    raise exception 'consolidated record is pinned' using errcode = 'P0001';
  end if;

  select count(*) into v_source_count
  from public.lore_embeddings
  where superseded_by = p_consolidated_id
    and user_id = p_user_id;

  if v_source_count < 2 then
    raise exception 'expected at least 2 source records but found %', v_source_count
      using errcode = 'P0001';
  end if;

  update public.lore_embeddings
  set is_archived = false, superseded_by = null
  where superseded_by = p_consolidated_id
    and user_id = p_user_id;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_source_count then
    raise exception 'restore count mismatch: expected % but updated %', v_source_count, v_updated_count
      using errcode = 'P0001';
  end if;

  update public.lore_embeddings
  set is_archived = true
  where id = p_consolidated_id
    and user_id = p_user_id;
end;
$$;

revoke execute on function public.consolidate_dreaming_batch_multi(
  uuid, uuid[], text, vector, text, text, text, double precision, double precision
) from public, anon, authenticated;
grant execute on function public.consolidate_dreaming_batch_multi(
  uuid, uuid[], text, vector, text, text, text, double precision, double precision
) to authenticated;

revoke execute on function public.rollback_dreaming_batch_multi(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.rollback_dreaming_batch_multi(uuid, uuid)
  to authenticated;

commit;

notify pgrst, 'reload schema';
