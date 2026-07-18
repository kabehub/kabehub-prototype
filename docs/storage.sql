-- 正本・再現用。適用時はテスト環境で確認してから手動適用する。
-- 環境によってはバケットが存在しないまま同名policyだけが残存している場合があるため、
-- 適用前に必ずpreflightの結果を保存すること。
-- コード変更を伴わない文書化タスクとして作成したSQLである。

-- 【preflight】適用前のバケット設定を確認し、結果を保存する
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'generated-images';

-- 【preflight】適用前の関連policyを確認し、結果を保存する
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (qual ilike '%generated-images%' or with_check ilike '%generated-images%')
order by cmd;

begin;

-- STEP 1: 既存policyを先に除去（バケット作成前に行うことで、
--         ゴーストpolicyが一時的に有効化される時間帯を作らない）
drop policy if exists "Users can read their own images" on storage.objects;
drop policy if exists "Users can upload their own images" on storage.objects;
drop policy if exists "Users can delete their own images" on storage.objects;

-- STEP 2: バケットを正本値へupsert
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'generated-images',
  'generated-images',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- STEP 3: policyを再作成（3件すべて to authenticated を明記）
create policy "Users can read their own images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'generated-images'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

create policy "Users can upload their own images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'generated-images'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

create policy "Users can delete their own images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'generated-images'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

commit;

notify pgrst, 'reload schema';

-- 【postflight】バケット設定（期待値：1行、public=false、
--  file_size_limit=10485760、allowed_mime_typesは3件）
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'generated-images';

-- 【postflight】policy（期待値：3件、roles={authenticated}、
--  SELECT/DELETEはqualあり、INSERTはwith_checkあり）
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname in (
    'Users can read their own images',
    'Users can upload their own images',
    'Users can delete their own images'
  )
order by policyname;

-- 【policyのみ無効化する場合】
-- begin;
-- drop policy if exists "Users can read their own images" on storage.objects;
-- drop policy if exists "Users can upload their own images" on storage.objects;
-- drop policy if exists "Users can delete their own images" on storage.objects;
-- commit;
-- notify pgrst, 'reload schema';

-- 【破壊的teardownについて】
-- generated-imagesバケット自体を削除する場合、このSQLから
-- storage.buckets / storage.objectsを直接DELETEしないこと。
-- Storage APIまたはSupabase Dashboardでバケットを空にした後、
-- Storage APIまたはDashboardから削除する。
-- バケット削除は通常のロールバックではなく、保存済み画像を失う
-- 破壊的操作として別手順で扱う。
