-- migration_v186_project_memory_phase_d_read_path.sql
-- Project Memory Manager Phase D（read path migration）:
-- folder_name版の既存RPCを維持したまま、project_id版の検索RPCを追加する。

begin;

-- Lore Book自動注入用（UUID版）
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
  where user_id = match_user_id and project_id = match_project_id
  order by embedding <-> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_lore_embeddings_by_project(vector, uuid, uuid, integer)
  from public, anon;
grant execute on function public.match_lore_embeddings_by_project(vector, uuid, uuid, integer)
  to authenticated, service_role;

-- 汎用RAG記憶検索（v2・UUID版）
create or replace function public.match_lore_embeddings_v2_by_project(
  query_embedding vector,
  f_user_id uuid,
  f_project_id uuid,
  match_count integer default 5,
  match_threshold double precision default 0.3
)
returns table(
  id uuid, chunk_text text, similarity double precision, final_score double precision,
  memory_kind text, temporal_status text, confidence_score double precision,
  source_thread_id uuid, source_message_id uuid
)
language sql
stable
as $$
  select
    le.id,
    le.chunk_text,
    1 - (le.embedding <=> query_embedding) as similarity,
    (
      (1 - (le.embedding <=> query_embedding)) * 0.75
      + coalesce(le.importance_score, 0.5) * 0.15
      + coalesce(le.confidence_score, 0.8) * 0.10
    ) * case le.memory_kind
        when 'decision'   then 1.2
        when 'constraint' then 1.2
        when 'preference' then 1.1
        when 'profile'    then 1.1
        when 'project'    then 1.0
        when 'plan'       then 1.0
        when 'fact'       then 1.0
        when 'idea'       then 0.8
        when 'todo'       then 0.7
        else                   1.0
      end as final_score,
    le.memory_kind,
    le.temporal_status,
    le.confidence_score,
    le.source_thread_id,
    le.source_message_id
  from lore_embeddings le
  where le.user_id = f_user_id
    and (le.project_id = f_project_id or le.project_id is null)
    and le.is_archived = false
    and le.superseded_by is null
    and le.temporal_status <> 'expired'
    and (1 - (le.embedding <=> query_embedding)) >= match_threshold
  order by final_score desc
  limit match_count;
$$;

revoke execute on function public.match_lore_embeddings_v2_by_project(vector, uuid, uuid, integer, double precision)
  from public, anon;
grant execute on function public.match_lore_embeddings_v2_by_project(vector, uuid, uuid, integer, double precision)
  to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

-- POSTFLIGHT（適用後に実行し、出力を確認する）
--
-- 新2関数の存在確認
-- select to_regprocedure('public.match_lore_embeddings_by_project(vector,uuid,uuid,integer)');
-- select to_regprocedure('public.match_lore_embeddings_v2_by_project(vector,uuid,uuid,integer,double precision)');
--
-- EXECUTE権限の実効確認（has_function_privilege、PUBLIC経由の漏れも確認）
-- select
--   has_function_privilege('authenticated', 'public.match_lore_embeddings_by_project(vector,uuid,uuid,integer)', 'EXECUTE') as authenticated_ok,
--   has_function_privilege('service_role', 'public.match_lore_embeddings_by_project(vector,uuid,uuid,integer)', 'EXECUTE') as service_role_ok,
--   has_function_privilege('anon', 'public.match_lore_embeddings_by_project(vector,uuid,uuid,integer)', 'EXECUTE') as anon_ok,
--   has_function_privilege('public', 'public.match_lore_embeddings_by_project(vector,uuid,uuid,integer)', 'EXECUTE') as public_ok;
-- （authenticated_ok/service_role_ok = true、anon_ok/public_ok = false であること。もう一方の関数も同様に確認）
