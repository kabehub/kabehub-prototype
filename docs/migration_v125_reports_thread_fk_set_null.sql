-- v125: reports.thread_id のON DELETE挙動をCASCADEからSET NULLへ修正
-- 背景: 本番の実測値（information_schema、2026/07/09確認）でCASCADEと確認済み。
--       thread_idはnullable（is_nullable: YES）のため、NOT NULL解除は不要。
--       設計意図（通報記録をモデレーション証跡として残す）に合わせてSET NULLへ統一する。
-- 影響: アプリコード側の変更は不要（DELETE処理は無改修で動作する）

begin;

alter table reports
  drop constraint if exists reports_thread_id_fkey;

alter table reports
  add constraint reports_thread_id_fkey
  foreign key (thread_id) references threads(id) on delete set null;

commit;
