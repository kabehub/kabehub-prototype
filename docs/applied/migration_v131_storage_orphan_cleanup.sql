-- migration_v131_storage_orphan_cleanup.sql
-- B-04b／H-29対応：孤児Storageオブジェクト回収バッチ用のRPC・履歴テーブルを新設。

-- ============================================================
-- 1. 孤児Storageオブジェクト候補検出RPC
-- storage.objectsのうち、24時間以上前に作成され、かつ
-- messages側から有効に参照されていないgenerated-imagesオブジェクトを
-- 候補として返す。削除は行わない（実削除はアプリケーション層）。
-- 「有効な参照」は、storagePathが一致し、かつimage_deleted=trueで
-- ないメッセージ行が存在すること。トゥームストーン済み
-- （storagePathが残ったままimage_deleted=trueになっている異常系）は
-- 有効参照として扱わず、孤児候補に含める。
-- search_path=''＋schema完全修飾で権限昇格を防止。
-- EXECUTE権限はservice_role限定。p_limitは1〜200にクランプする。
-- ============================================================
create or replace function public.find_orphan_storage_candidates(
  p_limit integer default 50
)
returns table (storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name as storage_path
  from storage.objects as o
  where o.bucket_id = 'generated-images'
    and o.created_at < now() - interval '24 hours'
    and not exists (
      select 1
      from public.messages as m
      where m.metadata ->> 'storagePath' = o.name
        and coalesce(m.metadata ->> 'image_deleted', 'false') <> 'true'
    )
  order by o.created_at asc, o.name asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke execute on function public.find_orphan_storage_candidates(integer)
  from public, anon, authenticated;
grant execute on function public.find_orphan_storage_candidates(integer)
  to service_role;

-- ============================================================
-- 2. messages.metadata->>'storagePath' の部分式インデックス
-- 孤児候補判定のnot exists検索を高速化する。
-- image_deleted=trueの行は検索対象から除外し、インデックスサイズを抑える。
-- ============================================================
create index if not exists idx_messages_active_storage_path
  on public.messages ((metadata ->> 'storagePath'))
  where metadata ->> 'storagePath' is not null
    and coalesce(metadata ->> 'image_deleted', 'false') <> 'true';

-- ============================================================
-- 3. storage_cleanup_runs（Cron実行履歴・管理者用状況確認ページの表示元）
-- 開始時にstatus='running'でINSERTし、終了時にUPDATEする2段階方式。
-- Function timeoutやクラッシュが起きても、running状態の行が
-- 実行痕跡として残る。
-- ============================================================
create table if not exists storage_cleanup_runs (
  id               uuid primary key default gen_random_uuid(),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  status           text not null default 'running'
                     check (status in ('running', 'succeeded', 'partial_failure', 'failed')),
  mode             text not null check (mode in ('dry_run', 'delete')),
  candidate_count  integer not null default 0,
  limit_reached    boolean not null default false,
  succeeded_count  integer not null default 0,
  failed_count     integer not null default 0,
  error_codes      text[] not null default '{}'
);

create index if not exists idx_storage_cleanup_runs_started_at
  on storage_cleanup_runs(started_at desc);

alter table storage_cleanup_runs enable row level security;

revoke all on table public.storage_cleanup_runs from public, anon, authenticated;
grant select on table public.storage_cleanup_runs to authenticated;
grant select, insert, update on table public.storage_cleanup_runs to service_role;

-- ⚠️ 適用前に必ず <ADMIN_USER_ID> をRui氏の実際のauth.users.idに置き換えること。
-- プレースホルダーのままテスト環境・本番環境へ適用しないこと。
-- UUIDはSupabase Dashboard → Authentication → Usersで確認する。
create policy "管理者のみ閲覧可"
  on storage_cleanup_runs for select
  to authenticated
  using (auth.uid() = '<ADMIN_USER_ID>'::uuid);

notify pgrst, 'reload schema';
