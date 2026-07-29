-- migration_v176_dreaming_rpc_and_trigger_cleanup.sql
-- 監査D対応 MD-2：
--   D-18: update_updated_at_column() / update_updated_at() の重複統合
--   D-19: consolidate_dreaming_batch の未使用オーバーロード（p_tags版）削除
--   D-20: 未使用の rollback_dreaming_batch（非multi）削除
-- いずれもアプリケーションコードから未参照（git grep確認済み）。
-- 適用: テスト環境Supabaseで適用・preflight/postflight確認後、本番へ適用する。

begin;

-- ---------- D-18 ----------
drop trigger if exists novel_settings_updated_at
  on public.novel_settings;

create trigger novel_settings_updated_at
  before update on public.novel_settings
  for each row
  execute function public.update_updated_at_column();

drop function if exists public.update_updated_at();

-- ---------- D-19 ----------
drop function if exists public.consolidate_dreaming_batch(
  uuid, uuid, uuid, text, vector, text, text, text, text[], double precision, double precision
);

-- ---------- D-20 ----------
drop function if exists public.rollback_dreaming_batch(uuid, uuid);

commit;

notify pgrst, 'reload schema';
