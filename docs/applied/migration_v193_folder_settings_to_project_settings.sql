begin;

alter table folder_settings rename to project_settings;

-- 制約4本（PK・FK×2・UNIQUE）— 実名確認済み
alter table project_settings
  rename constraint folder_settings_pkey
  to project_settings_pkey;

alter table project_settings
  rename constraint folder_settings_user_id_fkey
  to project_settings_user_id_fkey;

alter table project_settings
  rename constraint folder_settings_project_id_fkey
  to project_settings_project_id_fkey;

alter table project_settings
  rename constraint folder_settings_user_id_folder_name_key
  to project_settings_user_id_folder_name_key;

-- インデックス
alter index idx_folder_settings_project rename to idx_project_settings_project;

-- RLSポリシー4本
alter policy "folder_settings: select own" on project_settings rename to "project_settings: select own";
alter policy "folder_settings: insert own" on project_settings rename to "project_settings: insert own";
alter policy "folder_settings: update own" on project_settings rename to "project_settings: update own";
alter policy "folder_settings: delete own" on project_settings rename to "project_settings: delete own";

-- トリガー
alter trigger folder_settings_updated_at on project_settings rename to project_settings_updated_at;

commit;

notify pgrst, 'reload schema';
