-- migration_v192_project_memory_phase_e_drop_legacy_temporal_status.sql
-- Project Memory Manager Phase E-3:
-- project_id版への切り替え後に不要となった旧folder_name版のLore時系列ステータス更新RPCを削除する。

begin;

drop function if exists public.update_lore_temporal_status(uuid, text);

commit;

notify pgrst, 'reload schema';

-- POSTFLIGHT（trueであること）
-- select
--   to_regprocedure('public.update_lore_temporal_status(uuid,text)') is null
--     as update_lore_temporal_status_dropped;
