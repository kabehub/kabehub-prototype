-- migration_v196_project_settings_project_id_contract.sql
-- KabeHub folder_name統一 Phase 2: project_settingsのcanonical write keyを
-- (user_id, project_id)へ移行するための制約変更。
--
-- 適用順: test -> production
-- 各環境で、適用前後に次のクエリを実行して結果が一致することを確認する。
--
-- select
--   count(*) as row_count,
--   md5(coalesce(jsonb_agg(to_jsonb(ps) order by ps.id)::text, '[]')) as content_hash
-- from public.project_settings ps;

begin;

alter table public.project_settings
  add constraint project_settings_user_id_project_id_key unique (user_id, project_id);

alter table public.project_settings
  alter column folder_name drop not null;

commit;

notify pgrst, 'reload schema';
