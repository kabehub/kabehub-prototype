-- migration_v191_project_memory_phase_e_update_temporal_status_by_project.sql
-- Project Memory Manager Phase E-3:
-- 既存folder_name版を維持したまま、project_id版のLore時系列ステータス更新RPCを追加する。

begin;

create or replace function public.update_lore_temporal_status_by_project(
  p_user_id uuid,
  p_project_id uuid default null::uuid
)
returns jsonb
language plpgsql
as $$
declare
  past_count  int := 0;
  expired_count int := 0;
begin
  update lore_embeddings
  set temporal_status = 'past'
  where user_id = p_user_id
    and (p_project_id is null or project_id = p_project_id)
    and is_archived = false
    and superseded_by is null
    and is_pinned = false
    and coalesce(extraction_version, '') not in ('user_edited', 'user_created')
    and event_time is not null
    and event_time < now()
    and temporal_status = 'future'
    and memory_kind in ('plan', 'todo');

  get diagnostics past_count = row_count;

  update lore_embeddings
  set temporal_status = 'expired'
  where user_id = p_user_id
    and (p_project_id is null or project_id = p_project_id)
    and is_archived = false
    and superseded_by is null
    and is_pinned = false
    and coalesce(extraction_version, '') not in ('user_edited', 'user_created')
    and valid_until is not null
    and valid_until < now()
    and temporal_status in ('current', 'future', 'uncertain');

  get diagnostics expired_count = row_count;

  return jsonb_build_object(
    'pastCount',    past_count,
    'expiredCount', expired_count,
    'total',        past_count + expired_count
  );
end;
$$;

revoke all on function public.update_lore_temporal_status_by_project(uuid, uuid) from public, anon;
grant execute on function public.update_lore_temporal_status_by_project(uuid, uuid) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

-- POSTFLIGHT
-- select
--   to_regprocedure('public.update_lore_temporal_status_by_project(uuid,uuid)')
--     as project_function,
--   to_regprocedure('public.update_lore_temporal_status(uuid,text)')
--     as legacy_function;
--
-- select
--   has_function_privilege('authenticated', 'public.update_lore_temporal_status_by_project(uuid,uuid)', 'EXECUTE') as authenticated_ok,
--   has_function_privilege('service_role', 'public.update_lore_temporal_status_by_project(uuid,uuid)', 'EXECUTE') as service_role_ok,
--   has_function_privilege('anon', 'public.update_lore_temporal_status_by_project(uuid,uuid)', 'EXECUTE') as anon_ok,
--   has_function_privilege('public', 'public.update_lore_temporal_status_by_project(uuid,uuid)', 'EXECUTE') as public_ok;
-- （project_function/legacy_functionはnon-null、authenticated_ok/service_role_ok = true、anon_ok/public_ok = falseであること）
