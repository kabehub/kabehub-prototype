-- migration_v183_project_memory_phase_b_backfill.sql
-- Project Memory Manager（仮）Phase B:
-- 既存のfolder_nameをprojectsへ移行し、既存3テーブルのproject_idをbackfillする。
--
-- 【適用状況】2026-09-09、test環境・本番環境へ適用済み。
--   - projects: 23件
--   - threads.project_id: 795件（folder_name未設定61件は対象外）
--   - folder_settings.project_id: 10件（全件）
--   - lore_embeddings.project_id: 107件（folder_name未設定688件は対象外）
--   - 表記ゆれ: 0件
--   - novel_settings.thread_id IS NULL: 0件
--   - test環境で2回適用し、再実行安全性を確認済み
--
-- novel_settingsはproject_id列を持たないため、projects作成元としてのみ使用する。
-- thread_id経由でのproject_id導出はPhase D/Eの論点として保留する。
-- 本migrationはデータ移行のみでDDL変更を含まないため、docs/schema.sqlへの統合は不要。


-- ============================================================
-- PREFLIGHT（適用前に実行し、出力を確認する。migration本体には含めない）
-- ============================================================
--
-- -- 対象4テーブルの総件数・folder_name設定件数
-- select 'threads' as table_name,
--        count(*) as total_rows,
--        count(*) filter (where folder_name is not null) as folder_rows
-- from threads
-- union all
-- select 'folder_settings', count(*),
--        count(*) filter (where folder_name is not null)
-- from folder_settings
-- union all
-- select 'lore_embeddings', count(*),
--        count(*) filter (where folder_name is not null)
-- from lore_embeddings
-- union all
-- select 'novel_settings', count(*),
--        count(*) filter (where folder_name is not null)
-- from novel_settings;
--
-- -- projectsへ作成するdistinct (user_id, folder_name)件数
-- with source_folders as (
--   select user_id, folder_name from threads
--   union all
--   select user_id, folder_name from folder_settings
--   union all
--   select user_id, folder_name from lore_embeddings
--   union all
--   select user_id, folder_name from novel_settings
-- )
-- select count(*) as distinct_project_count
-- from (
--   select distinct user_id, folder_name
--   from source_folders
--   where user_id is not null
--     and folder_name is not null
-- ) candidates;
--
-- -- 前後空白・空文字の確認（本番1,676行では該当0件）
-- with source_folders as (
--   select folder_name from threads
--   union all
--   select folder_name from folder_settings
--   union all
--   select folder_name from lore_embeddings
--   union all
--   select folder_name from novel_settings
-- )
-- select count(*) as noncanonical_folder_name_count
-- from source_folders
-- where folder_name is not null
--   and (folder_name = '' or folder_name <> btrim(folder_name));
--
-- -- novel_settingsのthread_id未設定件数（本番では0件）
-- select count(*) as novel_settings_without_thread
-- from novel_settings
-- where thread_id is null;


begin;

-- 4テーブルに存在するfolder_nameを、ユーザー単位のprojectとして作成する。
-- UNIQUE(user_id, name)とON CONFLICTにより再実行しても重複しない。
with source_folders as (
  select user_id, folder_name from threads
  union all
  select user_id, folder_name from folder_settings
  union all
  select user_id, folder_name from lore_embeddings
  union all
  select user_id, folder_name from novel_settings
)
insert into projects (user_id, name)
select distinct user_id, folder_name
from source_folders
where user_id is not null
  and folder_name is not null
on conflict (user_id, name) do nothing;

-- 既存値を上書きしない。folder_nameが設定済みで、同一ユーザー・同名の
-- projectが存在する行だけをbackfillする。
update threads t
set project_id = p.id
from projects p
where t.project_id is null
  and t.folder_name is not null
  and p.user_id = t.user_id
  and p.name = t.folder_name;

update folder_settings fs
set project_id = p.id
from projects p
where fs.project_id is null
  and fs.folder_name is not null
  and p.user_id = fs.user_id
  and p.name = fs.folder_name;

update lore_embeddings le
set project_id = p.id
from projects p
where le.project_id is null
  and le.folder_name is not null
  and p.user_id = le.user_id
  and p.name = le.folder_name;

commit;


-- ============================================================
-- POSTFLIGHT（適用後に実行し、出力を確認する。migration本体には含めない）
-- ============================================================
--
-- -- projects総件数と、3テーブルのproject_id付与・未付与件数
-- select 'projects' as table_name,
--        count(*) as total_rows,
--        null::bigint as linked_rows,
--        null::bigint as unlinked_rows
-- from projects
-- union all
-- select 'threads', count(*),
--        count(*) filter (where project_id is not null),
--        count(*) filter (where project_id is null)
-- from threads
-- union all
-- select 'folder_settings', count(*),
--        count(*) filter (where project_id is not null),
--        count(*) filter (where project_id is null)
-- from folder_settings
-- union all
-- select 'lore_embeddings', count(*),
--        count(*) filter (where project_id is not null),
--        count(*) filter (where project_id is null)
-- from lore_embeddings;
--
-- -- folder_name設定済みなのにproject_idが付与されていない行がないこと
-- select 'threads' as table_name, count(*) as missing_project_id
-- from threads
-- where folder_name is not null and project_id is null
-- union all
-- select 'folder_settings', count(*)
-- from folder_settings
-- where folder_name is not null and project_id is null
-- union all
-- select 'lore_embeddings', count(*)
-- from lore_embeddings
-- where folder_name is not null and project_id is null;
--
-- -- project_idが同一ユーザー・同一folder_nameのprojectを指していること
-- select 'threads' as table_name, count(*) as mismatched_project_id
-- from threads t
-- join projects p on p.id = t.project_id
-- where p.user_id is distinct from t.user_id
--    or p.name is distinct from t.folder_name
-- union all
-- select 'folder_settings', count(*)
-- from folder_settings fs
-- join projects p on p.id = fs.project_id
-- where p.user_id is distinct from fs.user_id
--    or p.name is distinct from fs.folder_name
-- union all
-- select 'lore_embeddings', count(*)
-- from lore_embeddings le
-- join projects p on p.id = le.project_id
-- where p.user_id is distinct from le.user_id
--    or p.name is distinct from le.folder_name;
--
-- -- sourceにある(user_id, folder_name)がすべてprojectsに存在すること
-- with source_folders as (
--   select user_id, folder_name from threads
--   union all
--   select user_id, folder_name from folder_settings
--   union all
--   select user_id, folder_name from lore_embeddings
--   union all
--   select user_id, folder_name from novel_settings
-- )
-- select count(*) as missing_projects
-- from (
--   select distinct sf.user_id, sf.folder_name
--   from source_folders sf
--   left join projects p
--     on p.user_id = sf.user_id
--    and p.name = sf.folder_name
--   where sf.user_id is not null
--     and sf.folder_name is not null
--     and p.id is null
-- ) missing;
