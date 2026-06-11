-- v120: GitHub連携フェーズ4用カラム追加
-- folder_settings に github_repo（対象リポジトリ）と github_ref（ブランチ/タグ/SHA）を追加

ALTER TABLE folder_settings
  ADD COLUMN IF NOT EXISTS pinned_github_files jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS github_repo text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS github_ref  text DEFAULT NULL;

COMMENT ON COLUMN folder_settings.pinned_github_files
  IS 'Pinned GitHub file URLs. Array of strings. Max 5 items.';
COMMENT ON COLUMN folder_settings.github_repo
  IS 'GitHub連携フェーズ4: "owner/repo" 形式。設定時にAIが自律探索する';
COMMENT ON COLUMN folder_settings.github_ref
  IS 'GitHub連携フェーズ4: ブランチ/タグ/SHA。未指定時はデフォルトブランチ';
