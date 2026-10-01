-- API callers pass an array (including empty) to enable confirmation.
-- Existing four-argument callers, including v201 delete, default to null and retain their behavior.
begin;

drop function public.promote_project_memory_topic_to_lore(uuid, uuid, int, vector);

create or replace function public.promote_project_memory_topic_to_lore(
  p_user_id uuid,
  p_topic_id uuid,
  p_expected_revision int,
  p_embedding vector,
  p_acknowledged_edited_lore_ids uuid[] default null
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
  v_old_lore record;
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

  -- INSERT/unique_violation above resolves the no-replacement path first.
  -- Lock every supersede target in deterministic order before inspecting edit state.
  if p_acknowledged_edited_lore_ids is not null then
    for v_old_lore in
      select le.id, le.extraction_version
      from public.lore_embeddings le
      where le.user_id = p_user_id
        and le.source_type = 'project_memory_promotion'
        and le.metadata->>'source_topic_id' = v_topic.id::text
        and le.id <> v_new_id
        and le.is_archived = false
        and le.superseded_by is null
      order by le.id
      for update
    loop
      if v_old_lore.extraction_version = 'user_edited'
         and not exists (
           select 1 from unnest(p_acknowledged_edited_lore_ids) ack(id)
           where ack.id = v_old_lore.id
         ) then
        raise exception 'edited_lore_needs_confirmation' using errcode = 'P0001';
      end if;
    end loop;
  end if;

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

revoke execute on function public.promote_project_memory_topic_to_lore(uuid, uuid, int, vector, uuid[])
  from public, anon, authenticated;
grant execute on function public.promote_project_memory_topic_to_lore(uuid, uuid, int, vector, uuid[])
  to authenticated;

commit;

notify pgrst, 'reload schema';
