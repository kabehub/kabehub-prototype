-- migration_v188_project_memory_phase_e_find_similar_lore_pairs_by_project.sql
-- Project Memory Manager Phase E-2:
-- 既存folder_name版を維持したまま、project_id版の類似Loreペア検索RPCを追加する。
--
-- 旧関数比の意図的改善:
--   - 読み取り専用関数のため language sql / language plpgsql に stable を追加する。
--   - v2の返却列 folder_name_a / folder_name_b を project_id_a / project_id_b に置換する。
--     現行呼び出し元はこれらの列を参照していないことを確認済み。

begin;

create or replace function public.find_similar_lore_pairs_by_project(
  p_user_id uuid,
  p_project_id uuid default null::uuid,
  p_threshold double precision default 0.88,
  p_limit integer default 20
)
returns table(
  id_a uuid, id_b uuid, chunk_text_a text, chunk_text_b text,
  memory_kind_a text, memory_kind_b text, temporal_status_a text, temporal_status_b text,
  created_at_a timestamptz, created_at_b timestamptz,
  last_confirmed_at_a timestamptz, last_confirmed_at_b timestamptz,
  similarity double precision
)
language sql
stable
as $$
  select
    a.id, b.id, a.chunk_text, b.chunk_text,
    a.memory_kind, b.memory_kind, a.temporal_status, b.temporal_status,
    a.created_at, b.created_at, a.last_confirmed_at, b.last_confirmed_at,
    1 - (a.embedding <=> b.embedding) as similarity
  from lore_embeddings a
  join lore_embeddings b on a.id < b.id
  where a.user_id = p_user_id
    and b.user_id = p_user_id
    and a.project_id is not distinct from b.project_id
    and (p_project_id is null or a.project_id = p_project_id)
    and a.is_archived = false
    and b.is_archived = false
    and a.superseded_by is null
    and b.superseded_by is null
    and a.is_pinned = false
    and b.is_pinned = false
    and a.embedding is not null
    and b.embedding is not null
    and coalesce(a.extraction_version, '') not in ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned')
    and coalesce(b.extraction_version, '') not in ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned')
    and a.memory_kind = b.memory_kind
    and 1 - (a.embedding <=> b.embedding) >= p_threshold
    and not exists (
      select 1 from lore_consolidation_dismissals d
      where d.user_id = p_user_id
        and d.lore_id_a = least(a.id, b.id)
        and d.lore_id_b = greatest(a.id, b.id)
    )
  order by similarity desc
  limit p_limit;
$$;

revoke all on function public.find_similar_lore_pairs_by_project(uuid, uuid, double precision, integer) from public, anon;
grant execute on function public.find_similar_lore_pairs_by_project(uuid, uuid, double precision, integer) to authenticated, service_role;

create or replace function public.find_similar_lore_pairs_v2_by_project(
  p_user_id uuid,
  p_threshold double precision default 0.92,
  p_limit integer default 5,
  p_k integer default 3,
  p_project_id uuid default null::uuid
)
returns table(
  id_a uuid, id_b uuid, similarity double precision,
  chunk_text_a text, chunk_text_b text,
  memory_kind_a text, memory_kind_b text,
  temporal_status_a text, temporal_status_b text,
  project_id_a uuid, project_id_b uuid,
  created_at_a timestamptz, created_at_b timestamptz
)
language plpgsql
stable
as $$
begin
  return query
  select
    a.id, knn.id, knn.similarity,
    a.chunk_text, knn.chunk_text,
    a.memory_kind, knn.memory_kind,
    a.temporal_status, knn.temporal_status,
    a.project_id, knn.project_id,
    a.created_at, knn.created_at
  from lore_embeddings a
  cross join lateral (
    select
      b.id, b.chunk_text, b.memory_kind, b.temporal_status, b.project_id, b.created_at,
      1 - (a.embedding <=> b.embedding) as similarity
    from lore_embeddings b
    where b.user_id = p_user_id
      and b.id != a.id
      and b.is_archived = false
      and b.superseded_by is null
      and b.is_pinned = false
      and b.extraction_version not in ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned')
      and b.embedding is not null
      and (p_project_id is null or b.project_id = p_project_id)
      and b.memory_kind = a.memory_kind
      and b.project_id is not distinct from a.project_id
    order by a.embedding <=> b.embedding
    limit p_k
  ) knn
  where a.user_id = p_user_id
    and a.id < knn.id
    and a.is_archived = false
    and a.superseded_by is null
    and a.is_pinned = false
    and a.extraction_version not in ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned')
    and a.embedding is not null
    and (p_project_id is null or a.project_id = p_project_id)
    and knn.similarity >= p_threshold
    and not exists (
      select 1 from lore_consolidation_dismissals d
      where d.user_id = p_user_id
        and d.lore_id_a = least(a.id, knn.id)
        and d.lore_id_b = greatest(a.id, knn.id)
    )
  order by knn.similarity desc
  limit p_limit;
end;
$$;

revoke all on function public.find_similar_lore_pairs_v2_by_project(uuid, double precision, integer, integer, uuid) from public, anon;
grant execute on function public.find_similar_lore_pairs_v2_by_project(uuid, double precision, integer, integer, uuid) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

-- POSTFLIGHT
-- select
--   to_regprocedure('public.find_similar_lore_pairs_by_project(uuid,uuid,double precision,integer)'),
--   to_regprocedure('public.find_similar_lore_pairs_v2_by_project(uuid,double precision,integer,integer,uuid)');
--
-- select
--   has_function_privilege('authenticated', 'public.find_similar_lore_pairs_by_project(uuid,uuid,double precision,integer)', 'EXECUTE') as authenticated_ok,
--   has_function_privilege('service_role', 'public.find_similar_lore_pairs_by_project(uuid,uuid,double precision,integer)', 'EXECUTE') as service_role_ok,
--   has_function_privilege('anon', 'public.find_similar_lore_pairs_by_project(uuid,uuid,double precision,integer)', 'EXECUTE') as anon_ok,
--   has_function_privilege('public', 'public.find_similar_lore_pairs_by_project(uuid,uuid,double precision,integer)', 'EXECUTE') as public_ok;
--
-- select
--   has_function_privilege('authenticated', 'public.find_similar_lore_pairs_v2_by_project(uuid,double precision,integer,integer,uuid)', 'EXECUTE') as authenticated_ok,
--   has_function_privilege('service_role', 'public.find_similar_lore_pairs_v2_by_project(uuid,double precision,integer,integer,uuid)', 'EXECUTE') as service_role_ok,
--   has_function_privilege('anon', 'public.find_similar_lore_pairs_v2_by_project(uuid,double precision,integer,integer,uuid)', 'EXECUTE') as anon_ok,
--   has_function_privilege('public', 'public.find_similar_lore_pairs_v2_by_project(uuid,double precision,integer,integer,uuid)', 'EXECUTE') as public_ok;
-- （各selectでauthenticated_ok/service_role_ok = true、anon_ok/public_ok = falseであること）
