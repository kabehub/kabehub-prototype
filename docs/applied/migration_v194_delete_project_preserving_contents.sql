-- Project物理削除 + Project Memoryの任意Lore昇格
--
-- PREFLIGHT（適用前に実DBで確認する）
-- vector_namespace は public であること。異なる場合は、このmigration内の
-- public.vector キャストを実際のnamespaceへ置き換えてから適用する。
select n.nspname as vector_namespace
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where t.typname = 'vector';

begin;

-- 1. Project削除時もthread本体を残す。
alter table public.threads
  drop constraint threads_project_id_fkey;
alter table public.threads
  add constraint threads_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete set null;

-- 2. Project削除時も既存Loreを残す。
alter table public.lore_embeddings
  drop constraint lore_embeddings_project_id_fkey;
alter table public.lore_embeddings
  add constraint lore_embeddings_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete set null;

-- 3. Project設定だけはProjectと同時に削除する。
alter table public.project_settings
  drop constraint project_settings_project_id_fkey;
alter table public.project_settings
  add constraint project_settings_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;

-- 4. Project Memory topicとrevisionはProject削除後も残す。
alter table public.project_memory_topics
  alter column project_id drop not null;
alter table public.project_memory_topics
  drop constraint project_memory_topics_project_id_fkey;
alter table public.project_memory_topics
  add constraint project_memory_topics_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete set null;

-- 5. topic単独で所有権を保持できるようuser_idを追加・backfillする。
alter table public.project_memory_topics
  add column user_id uuid;

update public.project_memory_topics t
set user_id = p.user_id
from public.projects p
where p.id = t.project_id;

-- BACKFILL PREFLIGHT: 0であることを確認する。0以外なら後続のSET NOT NULLが
-- fail-closedでmigration全体をrollbackする。
select count(*) as project_memory_topics_missing_user_id
from public.project_memory_topics
where user_id is null;

alter table public.project_memory_topics
  alter column user_id set not null;
alter table public.project_memory_topics
  add constraint project_memory_topics_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
create index idx_project_memory_topics_user
  on public.project_memory_topics(user_id);

-- 6. orphan化後もtopic所有者がSELECTできるよう直接判定する。
drop policy "project_memory_topics: select own"
  on public.project_memory_topics;
create policy "project_memory_topics: select own"
  on public.project_memory_topics for select
  using (auth.uid() = user_id);

-- 7. topic作成時に所有者を記録する。
create or replace function public.create_project_memory_topic(
  p_user_id uuid,
  p_project_id uuid,
  p_topic_key text,
  p_content_md text default '',
  p_source_refs jsonb default '[]'::jsonb
)
returns table(topic_id uuid, revision int, content_md text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topic_key text;
  v_topic_id uuid;
  v_created_at timestamptz;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  v_topic_key := btrim(coalesce(p_topic_key, ''));
  if v_topic_key = '' then
    raise exception 'topic_key is required' using errcode = 'P0001';
  end if;

  if p_source_refs is null or jsonb_typeof(p_source_refs) is distinct from 'array' then
    raise exception 'source_refs must be a jsonb array' using errcode = 'P0001';
  end if;

  perform 1 from public.projects p
  where p.id = p_project_id and p.user_id = p_user_id;
  if not found then
    raise exception 'project not found' using errcode = 'P0001';
  end if;

  insert into public.project_memory_topics as t (
    project_id, user_id, topic_key, content_md, revision
  )
  values (
    p_project_id, p_user_id, v_topic_key, coalesce(p_content_md, ''), 1
  )
  on conflict (project_id, topic_key) do nothing
  returning t.id, t.created_at into v_topic_id, v_created_at;

  if not found then
    raise exception 'topic already exists' using errcode = 'P0001';
  end if;

  insert into public.project_memory_revisions (
    topic_id, revision, content_md, edit_kind, source_refs
  )
  values (v_topic_id, 1, coalesce(p_content_md, ''), 'full', p_source_refs);

  return query select v_topic_id, 1, coalesce(p_content_md, ''), v_created_at;
end;
$$;

revoke execute on function public.create_project_memory_topic(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_project_memory_topic(uuid, uuid, text, text, jsonb)
  to authenticated;

-- 8. orphan化後もtopic自身のuser_idで所有権を検証する。
create or replace function public.update_project_memory_topic(
  p_user_id uuid,
  p_topic_id uuid,
  p_expected_revision int,
  p_edit_kind text,
  p_new_content_md text default null,
  p_old_text text default null,
  p_new_text text default null,
  p_source_refs jsonb default '[]'::jsonb
)
returns table(revision int, content_md text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topic record;
  v_new_content text;
  v_next_revision int;
  v_updated_at timestamptz;
  v_first_pos int;
  v_second_pos int;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'expected_revision must be a positive integer' using errcode = 'P0001';
  end if;

  if p_edit_kind is null or p_edit_kind not in ('full', 'partial') then
    raise exception 'edit_kind must be full or partial' using errcode = 'P0001';
  end if;

  if p_source_refs is null or jsonb_typeof(p_source_refs) is distinct from 'array' then
    raise exception 'source_refs must be a jsonb array' using errcode = 'P0001';
  end if;

  select t.content_md, t.revision
  into v_topic
  from public.project_memory_topics t
  where t.id = p_topic_id and t.user_id = p_user_id
  for update;

  if not found then
    raise exception 'topic not found' using errcode = 'P0001';
  end if;

  if v_topic.revision <> p_expected_revision then
    raise exception 'revision conflict' using errcode = 'P0001';
  end if;

  if p_edit_kind = 'full' then
    if p_new_content_md is null then
      raise exception 'new_content_md is required for full edit' using errcode = 'P0001';
    end if;
    v_new_content := p_new_content_md;
  else
    if p_old_text is null or p_old_text = '' or p_new_text is null then
      raise exception 'old_text and new_text are required for partial edit' using errcode = 'P0001';
    end if;

    v_first_pos := strpos(v_topic.content_md, p_old_text);
    if v_first_pos = 0 then
      raise exception 'old_text not found' using errcode = 'P0001';
    end if;

    v_second_pos := strpos(
      substring(v_topic.content_md from v_first_pos + 1),
      p_old_text
    );
    if v_second_pos > 0 then
      raise exception 'old_text not unique' using errcode = 'P0001';
    end if;

    v_new_content := replace(v_topic.content_md, p_old_text, p_new_text);
  end if;

  v_next_revision := v_topic.revision + 1;

  update public.project_memory_topics as t
  set content_md = v_new_content,
      revision = v_next_revision
  where t.id = p_topic_id
  returning t.updated_at into v_updated_at;

  insert into public.project_memory_revisions (
    topic_id, revision, content_md, edit_kind, source_refs
  )
  values (p_topic_id, v_next_revision, v_new_content, p_edit_kind, p_source_refs);

  return query select v_next_revision, v_new_content, v_updated_at;
end;
$$;

revoke execute on function public.update_project_memory_topic(uuid, uuid, int, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_project_memory_topic(uuid, uuid, int, text, text, text, text, jsonb)
  to authenticated;

-- 9. revisionの所有権判定もtopic.user_idで完結させる。
drop policy "project_memory_revisions: select own"
  on public.project_memory_revisions;
create policy "project_memory_revisions: select own"
  on public.project_memory_revisions for select
  using (
    exists (
      select 1
      from public.project_memory_topics t
      where t.id = project_memory_revisions.topic_id
        and t.user_id = auth.uid()
    )
  );

-- 10. Project本体だけを物理削除し、関連コンテンツをorphanとして保持する。
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

  -- Project行をロックしつつ所有権確認する。
  perform 1
  from public.projects p
  where p.id = p_project_id and p.user_id = p_user_id
  for update;
  if not found then
    raise exception 'project not found' using errcode = 'P0001';
  end if;

  -- 全topicを同一順序でlockし、そのsnapshotから非空集合を作る。
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

      insert into public.lore_embeddings (
        user_id, chunk_text, embedding, memory_kind, temporal_status,
        extraction_version, source_type, project_id, folder_name, metadata
      )
      values (
        p_user_id,
        v_topic.content_md,
        (v_promo->>'embedding')::public.vector,
        'project',
        'current',
        'user_created',
        'project_memory_promotion',
        null,
        null,
        jsonb_build_object(
          'source_topic_id', v_topic.id,
          'source_topic_key', v_topic.topic_key,
          'source_project_id', p_project_id
        )
      );
    end loop;
  end if;

  -- folder_name/project_idの双方向不変条件を保つため必ず同時にNULL化する。
  update public.threads
  set project_id = null,
      folder_name = null
  where project_id = p_project_id and user_id = p_user_id;

  update public.lore_embeddings
  set project_id = null,
      folder_name = null
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

-- POSTFLIGHT（適用後確認）
-- project_settings_project_id_fkey の delete action は c (CASCADE) であること。
-- select conname, confdeltype
-- from pg_constraint
-- where conname = 'project_settings_project_id_fkey';
--
-- topic user_idが全件埋まり、Projectが残る行では所有者が一致すること。
-- select count(*) as null_user_ids
-- from public.project_memory_topics
-- where user_id is null;
--
-- select count(*) as mismatched_user_ids
-- from public.project_memory_topics t
-- join public.projects p on p.id = t.project_id
-- where t.user_id is distinct from p.user_id;
