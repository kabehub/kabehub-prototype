-- ============================================================
-- KabeHub セルフホスト用DBスキーマ（統合版）
-- 最終更新: 2026/08/09（migration_v180_drop_legacy_counter_rpcs.sql反映・テスト環境/本番DB適用済み）
--
-- 【このファイルについて】
-- 2026/07/10、本番Supabaseの pg_policies / pg_proc / information_schema.tables /
-- information_schema.triggers / pg_attribute / pg_extension / pg_constraint を
-- 直接照会し、本ファイルとの完全突き合わせを実施。差分はすべて反映済み。
--
-- 2026/07/06、以下4本のマイグレーションを本番適用し、本ファイルに反映：
--   - migration_rls_cleanup_p0.sql（messages / thread_notes /
--     message_notes / thread_tags / drafts のRLS整理。英日重複ポリシー
--     を廃止し、コマンド別4本＋テーブルごとの公開SELECTに統一）
--   - migration_v121_expose_share_token.sql（public_threads_view に
--     share_token 列を追加）
--   - migration_v122_create_likes.sql（likes テーブル新設）
--   - migration_v123_rpc_hardening.sql（likes/fork_countのカウント方式を
--     ±1方式から実テーブル再集計方式 recalc_likes_count /
--     recalc_fork_count に移行）
--
-- 2026/07/09、以下2本のマイグレーションを本番適用し、本ファイルに反映：
--   - migration_v125_reports_thread_fk_set_null.sql（reports.thread_id の
--     ON DELETE を CASCADE から SET NULL に修正）
--   - migration_v126_find_similar_lore_pairs_liked_ai_protection.sql
--     （find_similar_lore_pairs に liked_ai / liked_ai_cleaned 保護を追加）
--
-- 2026/07/19、以下1本のマイグレーションを本番適用し、本ファイルに反映：
--   - migration_v128_public_threads_projection.sql（B-01対応：threadsの
--     列制限なし公開SELECT policyを削除し、公開データの読み取りを
--     SECURITY DEFINER関数（get_public_threads_projection ／
--     is_visible_public_message ／ is_visible_public_thread_tag）経由に
--     統一。public_threads_viewにallow_prompt_fork・fork_count列を追加）
--
-- 2026/07/20、以下1本のマイグレーションを本番適用し、本ファイルに反映：
--   - migration_v129_dreaming_batch_multi_hardening.sql（B-02対応：
--     consolidate_dreaming_batch_multi / rollback_dreaming_batch_multi に
--     auth.uid()検証・search_path = ''固定・EXECUTE権限のauthenticated
--     限定を追加）
--
-- 2026/07/21、以下1本のマイグレーションを統合：
--   - migration_v131_storage_orphan_cleanup.sql（B-04b／H-29対応：
--     孤児Storageオブジェクト候補検出RPC・検索用部分式インデックス・
--     Cron実行履歴テーブルを新設）
--
-- 2026/07/28、以下1本のマイグレーションを本番適用し、本ファイルに反映：
--   - migration_v176_dreaming_rpc_and_trigger_cleanup.sql（監査D対応：
--     updated_atトリガー関数をupdate_updated_at_columnへ統一し、
--     未使用のDreaming RPCオーバーロード2件を削除）
-- 2026/08/06、migration_v177_merge_user_edited_lore_pair.sqlをスキーマ正本へ反映（DB適用済み、MF-3c-DB対応）。
-- 2026/08/08、migration_v178_restore_message_branch.sqlをスキーマ正本へ反映（DB適用済み、MF-6a対応）。
-- 2026/08/08、migration_v179_apply_branch_edit.sqlをスキーマ正本へ反映（DB適用済み、MF-6b対応）。
-- 2026/08/09、H-08対応：uuid-ossp依存なし（schema内・本番DB列デフォルト・public関数本体いずれも0件）を確認しcanonical schemaから削除（本番extension自体は未変更）。
-- 2026/08/09、migration_v180_drop_legacy_counter_rpcs.sqlをスキーマ正本へ反映・テスト環境/本番DB適用済み（H-09対応）。
--
-- 2026/07/10、緊急対応として以下を本番適用（ファイル化せず直接実行。
-- 詳細はCLAUDE.md地雷表参照）：
--   - messages テーブルに残存していた STEP5適用前の旧英語名ポリシー2本
--     （"Users can manage own messages" ALL / "Messages of public threads
--     are readable by anyone" SELECT）を drop policy if exists で削除。
--     この2本はSTEP5移行後も生き残っており、is_hidden・memo・shared_at
--     以降メッセージがREST API直叩きで閲覧可能な状態になっていた
--     （OR結合されるRLS SELECTポリシーの性質上、緩い方が有効になっていたため）。
--     混入経路は未特定（v121〜v126のいずれにも当該ポリシー名は含まれず、
--     バックアップ/復元系操作の副作用の可能性が高い）。
--
-- 【MH-5b再確認・2026-08-09（production）】
--   pg_policiesを照会し、messagesテーブルの現行ポリシーが
--   「公開スレッドのメッセージは全員閲覧可」（SELECT）・
--   「自分のメッセージのみ操作可」（ALL）の計2本であることを確認した。
--   2026-07-10に削除した旧ポリシー2本、および同等の緩いポリシーの
--   再混入は認められなかった。なお、この構成（単一ALL）はこのファイルが
--   定義するコマンド別4本＋公開SELECT1本のcanonical形とは異なるが、
--   B-01のpreflight時（2026-07-19）に既に発見・記録済みの環境差異であり、
--   H-10の懸念事項（緩い公開ポリシーの再混入）とは無関係のため、
--   本チケットでは追加対応しない。混入経路は当時のログが残っておらず
--   特定不能と判断し、追加調査は行わない。再発検知機構はMH-5bでは
--   導入しない（必要性は将来のDB変更管理改善の文脈で再評価する）。
--   実行SQL・全件生データは docs/audit/mh-5b-db-verification-2026-08-09.md 参照。
--
-- 【2026/07/10 突き合わせ確認済み事項】
--   - lore_embeddings.embedding は vector(1536) で確定（pgvector 0.8.0稼働）
--   - lore_consolidation_dismissals に CHECK (lore_id_a < lore_id_b) が
--     DB制約として存在することを確認（本ファイルに追記済み）
--   - 全15テーブル・全アプリケーション関数・全トリガーが本ファイルと一致
--     （pgvector純正関数を除く）
-- ============================================================

create extension if not exists vector;        -- lore_embeddings.embedding 用（pgvector）

-- ============================================================
-- profiles テーブル
-- ============================================================
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  handle        text unique,
  display_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  bio           text check (char_length(bio) <= 300),
  constraint handle_lowercase check (handle = lower(handle))
);

alter table profiles enable row level security;

create policy "Users can manage own profile"
  on profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Public profiles are readable by anyone"
  on profiles for select
  using (true);

create index if not exists profiles_handle_key on profiles(handle);

-- auth.users 作成時に profiles を自動作成するトリガー用関数
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- threads テーブル
-- ============================================================
create table if not exists threads (
  id                uuid primary key default gen_random_uuid(),
  title             text default '無題',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  system_prompt     text,
  share_token       text unique,
  is_public         boolean not null default false,
  hide_memos        boolean not null default false,
  folder_name       text,
  forked_from_id    uuid references threads(id) on delete set null,
  allow_prompt_fork boolean not null default true,
  metadata          jsonb,
  genre             text,
  likes_count       integer default 0,
  fork_count        integer default 0,
  roleplay_mode     boolean default false,
  rp_char_name      text,
  rp_char_icon_url  text,
  shared_at         timestamptz
);

create index if not exists idx_threads_user_id on threads(user_id);
create index if not exists idx_threads_is_public on threads(is_public) where is_public = true;
create index if not exists idx_threads_share_token on threads(share_token) where share_token is not null;
create index if not exists threads_likes_id_idx on threads(likes_count desc, id desc);

alter table threads enable row level security;

create policy "Users can manage own threads"
  on threads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2026/07/19 B-01対応：列制限なしの公開SELECT policyを削除。
-- 公開スレッドの読み取りは public_threads_view（get_public_threads_projection()経由）に一本化した。
-- migration_v128_public_threads_projection.sql 参照。

-- ============================================================
-- messages テーブル
-- ============================================================
create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  thread_id        uuid not null references threads(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  provider         text not null default 'unknown',
  created_at       timestamptz not null default now(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  parent_id        uuid references messages(id) on delete set null,
  is_hidden        boolean default false,            -- v39: 共有ページで非公開表示
  model_id         text,                              -- v89: 使用モデルID
  input_tokens     integer,
  output_tokens    integer,
  branch_id        uuid,                              -- Branching Mode
  is_active        boolean default true,              -- Branching Mode: 現在アクティブな分岐か
  metadata         jsonb default '{}'::jsonb,
  is_learned       boolean default false,              -- AI記憶: 学習済みフラグ
  skip_learning    boolean default false,              -- AI記憶: 学習対象から除外
  message_number   integer,                            -- スレッド内の連番（トリガーで自動採番）
  branch_root_id   uuid references messages(id) on delete set null,
  branch_index     integer default 0
);

create index if not exists idx_messages_thread_id on messages(thread_id);
create index if not exists idx_messages_branch_id on messages(branch_id);
create index if not exists idx_messages_thread_branch_root on messages(thread_id, branch_root_id);
create index if not exists idx_messages_thread_branch_root_index on messages(thread_id, branch_root_id, branch_index);
create index if not exists idx_messages_thread_message_number on messages(thread_id, message_number);
create index if not exists idx_messages_user_created on messages(user_id, created_at);
create index if not exists idx_messages_learning_flags on messages(user_id, is_learned, skip_learning);

alter table messages enable row level security;

-- 2026/07/06 p0整理（STEP5）：英日重複のALLポリシー2本＋緩い公開SELECT1本を廃止し、
-- コマンド別4本＋厳格な公開SELECT1本に統一
create policy "自分のメッセージのみ閲覧可"
  on messages for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = messages.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のメッセージのみ追加可"
  on messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = messages.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のメッセージのみ更新可"
  on messages for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = messages.thread_id
        and threads.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = messages.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のメッセージのみ削除可"
  on messages for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = messages.thread_id
        and threads.user_id = auth.uid()
    )
  );

-- 2026/07/19 B-01対応：threads直接参照から is_visible_public_message() 関数経由に変更。
-- migration_v128_public_threads_projection.sql 参照。
create policy "公開スレッドのメッセージは全員閲覧可"
  on messages for select
  using (
    coalesce(is_hidden, false) = false
    and provider <> 'memo'
    and is_visible_public_message(thread_id, created_at)
  );

-- スレッド内でのメッセージ連番を自動採番するトリガー
create or replace function set_message_number()
returns trigger
language plpgsql
as $$
begin
  if new.message_number is null then
    select coalesce(max(message_number), 0) + 1
    into new.message_number
    from messages
    where thread_id = new.thread_id;
  end if;
  return new;
end;
$$;

create trigger trg_set_message_number
  before insert on messages
  for each row execute function set_message_number();

-- ============================================================
-- thread_notes テーブル
-- ============================================================
create table if not exists thread_notes (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references threads(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  user_id     uuid not null references auth.users(id) on delete cascade
);

create index if not exists idx_thread_notes_thread_id on thread_notes(thread_id);

alter table thread_notes enable row level security;

-- 2026/07/06 p0整理（STEP2）：英日重複のALLポリシー2本を廃止し、コマンド別4本に統一
create policy "自分のスレッドメモのみ閲覧可"
  on thread_notes for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_notes.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のスレッドメモのみ追加可"
  on thread_notes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_notes.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のスレッドメモのみ更新可"
  on thread_notes for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_notes.thread_id
        and threads.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_notes.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のスレッドメモのみ削除可"
  on thread_notes for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_notes.thread_id
        and threads.user_id = auth.uid()
    )
  );

-- ============================================================
-- message_notes テーブル
-- ============================================================
create table if not exists message_notes (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references messages(id) on delete cascade,
  thread_id   uuid not null references threads(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  user_id     uuid not null references auth.users(id) on delete cascade
);

create index if not exists idx_message_notes_message_id on message_notes(message_id);

alter table message_notes enable row level security;

-- 2026/07/06 p0整理（STEP3）：英日重複のALLポリシー2本を廃止し、コマンド別4本に統一
create policy "自分のメッセージメモのみ閲覧可"
  on message_notes for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = message_notes.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のメッセージメモのみ追加可"
  on message_notes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = message_notes.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のメッセージメモのみ更新可"
  on message_notes for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = message_notes.thread_id
        and threads.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = message_notes.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のメッセージメモのみ削除可"
  on message_notes for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = message_notes.thread_id
        and threads.user_id = auth.uid()
    )
  );

-- ============================================================
-- thread_tags テーブル
-- ============================================================
create table if not exists thread_tags (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references threads(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  unique (thread_id, name)
);

create index if not exists idx_thread_tags_thread_id on thread_tags(thread_id);

alter table thread_tags enable row level security;

-- 2026/07/06 p0整理（STEP4）：英日重複のALLポリシー2本＋所有者一致条件なしの
-- 公開SELECTを廃止し、コマンド別4本＋public_threads_viewの思想
-- （tt.user_id = t.user_id）に合わせた公開SELECT1本に統一
create policy "自分のタグのみ閲覧可"
  on thread_tags for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_tags.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のタグのみ追加可"
  on thread_tags for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_tags.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のタグのみ更新可"
  on thread_tags for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_tags.thread_id
        and threads.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_tags.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分のタグのみ削除可"
  on thread_tags for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = thread_tags.thread_id
        and threads.user_id = auth.uid()
    )
  );

-- 2026/07/19 B-01対応：threads直接参照から is_visible_public_thread_tag() 関数経由に変更。
-- migration_v128_public_threads_projection.sql 参照。
create policy "公開スレッドのタグは全員閲覧可"
  on thread_tags for select
  using (
    is_visible_public_thread_tag(thread_id, user_id)
  );

-- ============================================================
-- 公開データ投影用 SECURITY DEFINER 関数群（B-01対応・2026/07/19）
-- threadsの列制限なし公開SELECT policyを削除した代わりに、公開行・許可列
-- だけを安全に返す関数を新設。search_path=''＋schema修飾で権限昇格を防止。
-- REVOKE/GRANTは作成と同一トランザクションで実施（migration_v128参照）。
-- ============================================================
create or replace function public.get_public_threads_projection()
returns table (
  id                uuid,
  title             text,
  is_public         boolean,
  created_at        timestamptz,
  updated_at        timestamptz,
  user_id           uuid,
  genre             text,
  share_token       text,
  allow_prompt_fork boolean,
  fork_count        integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id, t.title, t.is_public, t.created_at, t.updated_at,
    t.user_id, t.genre, t.share_token, t.allow_prompt_fork, t.fork_count
  from public.threads as t
  where t.is_public = true;
$$;

revoke all on function public.get_public_threads_projection() from public;
grant execute on function public.get_public_threads_projection() to anon, authenticated;

create or replace function public.is_visible_public_message(
  p_thread_id uuid, p_created_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.threads as t
    where t.id = p_thread_id
      and t.is_public = true
      and (t.shared_at is null or p_created_at <= t.shared_at)
  );
$$;

revoke all on function public.is_visible_public_message(uuid, timestamptz) from public;
grant execute on function public.is_visible_public_message(uuid, timestamptz) to anon, authenticated;

create or replace function public.is_visible_public_thread_tag(
  p_thread_id uuid, p_tag_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.threads as t
    where t.id = p_thread_id
      and t.is_public = true
      and t.user_id = p_tag_user_id
  );
$$;

revoke all on function public.is_visible_public_thread_tag(uuid, uuid) from public;
grant execute on function public.is_visible_public_thread_tag(uuid, uuid) to anon, authenticated;

-- ============================================================
-- 孤児Storageオブジェクト回収バッチ（B-04b／H-29対応・2026/07/21）
-- 24時間以上前に作成され、messagesから有効に参照されていない
-- generated-imagesオブジェクトを候補として返す。削除はアプリ層で行う。
-- search_path=''＋schema完全修飾、EXECUTE権限はservice_role限定。
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

create index if not exists idx_messages_active_storage_path
  on public.messages ((metadata ->> 'storagePath'))
  where metadata ->> 'storagePath' is not null
    and coalesce(metadata ->> 'image_deleted', 'false') <> 'true';

-- storage_cleanup_runs（Cron実行履歴・管理者用状況確認ページの表示元）
-- 開始時にrunningでINSERTし、終了時にUPDATEする。timeoutやクラッシュ時は
-- runningの行が実行痕跡として残る。
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
create policy "管理者のみ閲覧可"
  on storage_cleanup_runs for select
  to authenticated
  using (auth.uid() = '<ADMIN_USER_ID>'::uuid);

-- ============================================================
-- public_threads_view（公開スレッド閲覧用ビュー）
-- ============================================================
-- 2026/07/11 S22.5：Supabase Security Advisorのsecurity_definer_view
-- （ERROR）指摘を解消するため、security_invoker=trueを明示。
-- threads/thread_tagsの既存RLS（is_public=true、tt.user_id=t.user_id）が
-- view側のJOIN条件と一致しているため、invoker切り替えによる行の可視性の
-- 変化はなし（本番・テスト両環境で動作確認済み）
-- 2026/07/19 B-01対応：FROM句をthreadsテーブル直接から
-- get_public_threads_projection()関数経由に変更し、allow_prompt_fork・
-- fork_count列を追加。migration_v128_public_threads_projection.sql参照。
create or replace view public_threads_view
with (security_invoker = true)
as
select
  t.id, t.title, t.is_public, t.created_at, t.updated_at, t.user_id, t.genre,
  coalesce(array_agg(tt.name order by tt.created_at) filter (where tt.name is not null), '{}'::text[]) as tags,
  t.share_token, t.allow_prompt_fork, t.fork_count
from get_public_threads_projection() t
left join thread_tags tt on tt.thread_id = t.id and tt.user_id = t.user_id
group by t.id, t.title, t.is_public, t.created_at, t.updated_at, t.user_id, t.genre,
         t.share_token, t.allow_prompt_fork, t.fork_count;

grant select on public_threads_view to anon, authenticated;

-- ============================================================
-- drafts テーブル
-- ============================================================
create table if not exists drafts (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references threads(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now(),
  user_id     uuid not null references auth.users(id) on delete cascade
);

create index if not exists idx_drafts_thread_id on drafts(thread_id);

alter table drafts enable row level security;

-- 2026/07/06 p0整理（STEP1）：英日重複のALLポリシー2本を廃止し、コマンド別4本に統一
create policy "自分の下書きのみ閲覧可"
  on drafts for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = drafts.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分の下書きのみ追加可"
  on drafts for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = drafts.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分の下書きのみ更新可"
  on drafts for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = drafts.thread_id
        and threads.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = drafts.thread_id
        and threads.user_id = auth.uid()
    )
  );

create policy "自分の下書きのみ削除可"
  on drafts for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from threads
      where threads.id = drafts.thread_id
        and threads.user_id = auth.uid()
    )
  );

-- ============================================================
-- likes テーブル（v122・2026/07/06本番適用）
-- ============================================================
create table if not exists likes (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references threads(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (thread_id, user_id)
);

create index if not exists likes_thread_id_idx on likes(thread_id);
create index if not exists likes_user_id_idx   on likes(user_id);

alter table likes enable row level security;

create policy "いいねは認証ユーザーのみ操作可"
  on likes for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "いいねは全員閲覧可"
  on likes for select
  using (true);

-- ============================================================
-- カウンター系RPC（v123・T-08・2026/07/06本番適用）
-- likes/fork_countとも「±1」方式から、実テーブル再集計方式に統合。
-- 呼び出し側は app/api/threads/[id]/likes/route.ts（likes）、
-- app/api/share/[token]/fork/route.ts・app/api/threads/[id]/route.ts
-- （fork_count）。3関数ともSECURITY DEFINER・search_path固定・
-- EXECUTE権限はauthenticatedのみに限定。
-- ============================================================
create or replace function public.recalc_likes_count(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  update threads
  set likes_count = (
    select count(*)::integer
    from likes
    where likes.thread_id = p_thread_id
  )
  where id = p_thread_id
    and is_public = true;
end;
$function$;

revoke execute on function public.recalc_likes_count(uuid) from public, anon;
grant execute on function public.recalc_likes_count(uuid) to authenticated;

-- fork_countはforked_from_idで実子スレッド数を再集計する方式。
-- self-fork（child.user_id = parent.user_id）は集計対象から除外
-- （フォーク操作自体は成功するが、カウントには含まれない＝自作自演での
-- 水増し防止）。fork先スレッド削除時にも自動的に減る
create or replace function public.recalc_fork_count(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  update threads parent
  set fork_count = (
    select count(*)::integer
    from threads child
    where child.forked_from_id = p_thread_id
      and child.user_id <> parent.user_id
  )
  where parent.id = p_thread_id
    and parent.is_public = true;
end;
$function$;

revoke execute on function public.recalc_fork_count(uuid) from public, anon;
grant execute on function public.recalc_fork_count(uuid) to authenticated;

-- increment_fork_countは互換ラッパー。関数名・シグネチャを維持し、
-- 呼び出し側（fork route）を無改修で済ませるため recalc_fork_count に委譲する
create or replace function public.increment_fork_count(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.recalc_fork_count(p_thread_id);
end;
$function$;

revoke execute on function public.increment_fork_count(uuid) from public, anon;
grant execute on function public.increment_fork_count(uuid) to authenticated;

-- ============================================================
-- reports テーブル
-- ============================================================
create table if not exists reports (
  id                uuid primary key default gen_random_uuid(),
  thread_id         uuid references threads(id) on delete set null,
  reason            text not null,
  reporter_user_id  uuid references auth.users(id) on delete set null,
  reporter_ip       text,
  created_at        timestamptz default now()
);

alter table reports enable row level security;

create policy "reports_insert"
  on reports for insert
  to authenticated
  with check (reporter_user_id = auth.uid());

create policy "reports_select"
  on reports for select
  using (auth.uid() = reporter_user_id);

-- 通報submit用RPC。未ログインユーザーからの通報も許可するためSECURITY DEFINER。
-- 同一reporter・同一threadで24時間以内の重複通報はエラーで弾く。
-- EXECUTE権限はservice_roleのみ（v125b新設・v125cで権限をservice_role専用に変更）。
create or replace function public.submit_report(
  p_thread_id uuid,
  p_reason text,
  p_reporter_user_id uuid,
  p_reporter_ip text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_thread_id is null then
    raise exception 'invalid_thread_id';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'invalid_reason';
  end if;

  if not exists (select 1 from threads where id = p_thread_id) then
    raise exception 'thread_not_found';
  end if;

  if p_reporter_user_id is not null then
    if exists (
      select 1 from reports
      where thread_id = p_thread_id
        and reporter_user_id = p_reporter_user_id
        and created_at > now() - interval '24 hours'
    ) then
      raise exception 'duplicate_report';
    end if;
  else
    if exists (
      select 1 from reports
      where thread_id = p_thread_id
        and reporter_user_id is null
        and reporter_ip = p_reporter_ip
        and created_at > now() - interval '24 hours'
    ) then
      raise exception 'duplicate_report';
    end if;
  end if;

  insert into reports (thread_id, reason, reporter_user_id, reporter_ip)
  values (p_thread_id, p_reason, p_reporter_user_id, p_reporter_ip);
end;
$function$;

revoke execute on function public.submit_report(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.submit_report(uuid, text, uuid, text)
  to service_role;

-- ============================================================
-- folder_settings テーブル
-- ============================================================
create table if not exists folder_settings (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users(id) on delete cascade,
  folder_name           text not null,
  system_prompt         text,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  folder_type           text,
  pinned_github_files   jsonb default '[]'::jsonb,      -- GitHub連携フェーズ4
  github_repo           text default null,               -- "owner/repo" 形式
  github_ref            text default null,               -- ブランチ/タグ/SHA
  unique (user_id, folder_name)
);

alter table folder_settings enable row level security;

create policy "自分のフォルダ設定のみ操作可"
  on folder_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on column folder_settings.pinned_github_files
  is 'Pinned GitHub file URLs. Array of strings. Max 5 items.';
comment on column folder_settings.github_repo
  is 'GitHub連携フェーズ4: "owner/repo" 形式。設定時にAIが自律探索する';
comment on column folder_settings.github_ref
  is 'GitHub連携フェーズ4: ブランチ/タグ/SHA。未指定時はデフォルトブランチ';

create or replace function update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger folder_settings_updated_at
  before update on folder_settings
  for each row execute function update_updated_at_column();

-- ============================================================
-- mcp_tokens テーブル
-- ============================================================
create table if not exists mcp_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  token_hash   text not null unique,
  name         text,
  created_at   timestamptz default now(),
  last_used_at timestamptz
);

alter table mcp_tokens enable row level security;

create policy "自分のトークンのみ操作可"
  on mcp_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- user_github_tokens テーブル（GitHub OAuth）
-- ============================================================
create table if not exists user_github_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  access_token text not null,
  token_type   text not null default 'bearer',
  scope        text,
  github_login text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (user_id)
);

alter table user_github_tokens enable row level security;
-- ポリシーは設けない（serviceRole経由のみ許可・クライアントからの全操作を拒否）

-- ============================================================
-- github_oauth_states テーブル（OAuth CSRF対策用state）
-- ============================================================
create table if not exists github_oauth_states (
  id         uuid primary key default gen_random_uuid(),
  state      text not null unique,
  user_id    uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz default now()
);

alter table github_oauth_states enable row level security;
-- ポリシーなし（serviceRole経由のみ許可）

create index if not exists idx_github_oauth_states_expires_at
  on github_oauth_states(expires_at);

-- ============================================================
-- lore_embeddings テーブル（AI記憶・RAG本体）
-- ============================================================
create table if not exists lore_embeddings (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid references auth.users(id) on delete cascade,
  folder_name            text,
  chunk_text             text,
  embedding              vector(1536),                    -- pgvector 0.8.0・2026/07/10本番確認済み
  created_at             timestamptz default now(),
  source_message_id      uuid references messages(id) on delete set null,
  source_thread_id       uuid references threads(id) on delete set null,
  source_type            text default 'chat',
  tags                   text[] default '{}'::text[],
  memory_kind            text default 'fact',
  temporal_status        text default 'current',
  valid_from             timestamptz,
  valid_until            timestamptz,
  event_time             timestamptz,
  last_confirmed_at      timestamptz default now(),
  importance_score       double precision default 0.5,
  confidence_score       double precision default 0.8,
  decay_rate             double precision default 0.01,
  superseded_by          uuid references lore_embeddings(id) on delete set null,
  source_message_number  integer,
  is_pinned              boolean default false,
  is_archived            boolean default false,
  extraction_version     text default 'temporal_v1',
  metadata               jsonb default '{}'::jsonb,
  is_manually_corrected  boolean not null default false,
  updated_at             timestamptz
);

create index if not exists idx_lore_embeddings_memory_kind on lore_embeddings(memory_kind);
create index if not exists idx_lore_embeddings_source_message_id on lore_embeddings(source_message_id);
create index if not exists idx_lore_embeddings_source_thread_id on lore_embeddings(source_thread_id);
create index if not exists idx_lore_embeddings_tags on lore_embeddings using gin(tags);
create index if not exists idx_lore_embeddings_temporal_status on lore_embeddings(temporal_status);
create index if not exists idx_lore_embeddings_user_folder on lore_embeddings(user_id, folder_name);

alter table lore_embeddings enable row level security;

create policy "lore_embeddings: select own"
  on lore_embeddings for select
  using (auth.uid() = user_id);

create policy "lore_embeddings: insert own"
  on lore_embeddings for insert
  with check (auth.uid() = user_id);

create policy "lore_embeddings: update own"
  on lore_embeddings for update
  using (auth.uid() = user_id);

create policy "lore_embeddings: delete own"
  on lore_embeddings for delete
  using (auth.uid() = user_id);

-- ============================================================
-- lore_consolidation_dismissals テーブル（Dreaming統合の却下履歴）
-- ============================================================
create table if not exists lore_consolidation_dismissals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  lore_id_a  uuid not null references lore_embeddings(id) on delete cascade,
  lore_id_b  uuid not null references lore_embeddings(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, lore_id_a, lore_id_b),
  constraint lore_consolidation_dismissals_check check (lore_id_a < lore_id_b)
);

create index if not exists idx_lore_dismissals_user on lore_consolidation_dismissals(user_id, lore_id_a, lore_id_b);

alter table lore_consolidation_dismissals enable row level security;

create policy "Users can manage own dismissals"
  on lore_consolidation_dismissals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- novel_settings テーブル（小説プロジェクト設定・Lore Book等）
-- ============================================================
create table if not exists novel_settings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  thread_id   uuid references threads(id) on delete cascade,
  folder_name text,
  type        text,
  data        jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (user_id, thread_id, type)
);

create index if not exists idx_novel_settings_thread on novel_settings(user_id, thread_id);

alter table novel_settings enable row level security;

create policy "novel_settings: select own"
  on novel_settings for select
  using (auth.uid() = user_id);

create policy "novel_settings: insert own"
  on novel_settings for insert
  with check (auth.uid() = user_id);

create policy "novel_settings: update own"
  on novel_settings for update
  using (auth.uid() = user_id);

create policy "novel_settings: delete own"
  on novel_settings for delete
  using (auth.uid() = user_id);

create trigger novel_settings_updated_at
  before update on novel_settings
  for each row execute function update_updated_at_column();

-- ============================================================
-- アカウント削除RPC
-- ============================================================
create or replace function public.delete_current_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  delete from auth.users
  where id = v_user_id;
end;
$$;

-- ============================================================
-- AI記憶（RAG）検索・統合まわりのRPC群
-- ============================================================

-- Lore Book自動注入用（旧・単純版）
create or replace function match_lore_embeddings(
  query_embedding vector,
  match_folder_name text,
  match_user_id uuid,
  match_count integer
)
returns table(chunk_text text, similarity double precision)
language sql
stable
as $$
  select chunk_text, 1 - (embedding <-> query_embedding) as similarity
  from lore_embeddings
  where user_id = match_user_id and folder_name = match_folder_name
  order by embedding <-> query_embedding
  limit match_count;
$$;

-- 汎用RAG記憶検索（v2・スコアリング版／importance・confidence・kind重み付け）
create or replace function match_lore_embeddings_v2(
  query_embedding vector,
  f_user_id uuid,
  f_folder_name text,
  match_count integer default 5,
  match_threshold double precision default 0.3
)
returns table(
  id uuid, chunk_text text, similarity double precision, final_score double precision,
  memory_kind text, temporal_status text, confidence_score double precision,
  source_thread_id uuid, source_message_id uuid
)
language sql
stable
as $$
  select
    le.id,
    le.chunk_text,
    1 - (le.embedding <=> query_embedding) as similarity,
    (
      (1 - (le.embedding <=> query_embedding)) * 0.75
      + coalesce(le.importance_score, 0.5) * 0.15
      + coalesce(le.confidence_score, 0.8) * 0.10
    ) * case le.memory_kind
        when 'decision'   then 1.2
        when 'constraint' then 1.2
        when 'preference' then 1.1
        when 'profile'    then 1.1
        when 'project'    then 1.0
        when 'plan'       then 1.0
        when 'fact'       then 1.0
        when 'idea'       then 0.8
        when 'todo'       then 0.7
        else                   1.0
      end as final_score,
    le.memory_kind,
    le.temporal_status,
    le.confidence_score,
    le.source_thread_id,
    le.source_message_id
  from lore_embeddings le
  where le.user_id = f_user_id
    and (le.folder_name = f_folder_name or le.folder_name is null)
    and le.is_archived = false
    and le.superseded_by is null
    and le.temporal_status <> 'expired'
    and (1 - (le.embedding <=> query_embedding)) >= match_threshold
  order by final_score desc
  limit match_count;
$$;

-- 汎用RAG記憶検索（v2・フィルタ版／memory_kind・temporal_statusで絞り込み）
-- 【注意】match_lore_embeddings_v2 は上記2つのシグネチャでオーバーロードされている
create or replace function match_lore_embeddings_v2(
  query_embedding vector,
  match_folder_name text,
  match_user_id uuid,
  match_count integer,
  match_threshold double precision default 0.0,
  filter_memory_kinds text[] default null::text[],
  filter_temporal_status text[] default null::text[]
)
returns table(
  id uuid, chunk_text text, similarity double precision, memory_kind text,
  temporal_status text, importance_score double precision, confidence_score double precision,
  source_message_id uuid, source_thread_id uuid, source_type text, tags text[]
)
language sql
stable
as $$
  select
    le.id, le.chunk_text,
    1 - (le.embedding <=> query_embedding) as similarity,
    le.memory_kind, le.temporal_status, le.importance_score, le.confidence_score,
    le.source_message_id, le.source_thread_id, le.source_type, le.tags
  from lore_embeddings le
  where
    le.user_id = match_user_id
    and (match_folder_name is null or le.folder_name = match_folder_name)
    and 1 - (le.embedding <=> query_embedding) >= match_threshold
    and (filter_memory_kinds is null or le.memory_kind = any(filter_memory_kinds))
    and (filter_temporal_status is null or le.temporal_status = any(filter_temporal_status))
    and le.superseded_by is null
  order by le.embedding <=> query_embedding
  limit match_count;
$$;

-- 記憶の時系列ステータス更新（future→past、期限切れ→expired）
create or replace function update_lore_temporal_status(
  p_user_id uuid,
  p_folder_name text default null::text
)
returns jsonb
language plpgsql
as $$
declare
  past_count  int := 0;
  expired_count int := 0;
begin
  -- Step 1: future な plan/todo で event_time を過ぎたものを past へ
  update lore_embeddings
  set temporal_status = 'past'
  where user_id = p_user_id
    and (p_folder_name is null or folder_name = p_folder_name)
    and is_archived = false
    and superseded_by is null
    and is_pinned = false
    and coalesce(extraction_version, '') not in ('user_edited', 'user_created')
    and event_time is not null
    and event_time < now()
    and temporal_status = 'future'
    and memory_kind in ('plan', 'todo');

  get diagnostics past_count = row_count;

  -- Step 2: valid_until を過ぎた記憶を expired へ
  update lore_embeddings
  set temporal_status = 'expired'
  where user_id = p_user_id
    and (p_folder_name is null or folder_name = p_folder_name)
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

-- 類似記憶ペア検出
create or replace function find_similar_lore_pairs(
  p_user_id uuid,
  p_folder_name text default null::text,
  p_threshold double precision default 0.88,
  p_limit integer default 20
)
returns table(
  id_a uuid, id_b uuid, chunk_text_a text, chunk_text_b text,
  memory_kind_a text, memory_kind_b text, temporal_status_a text, temporal_status_b text,
  created_at_a timestamptz, created_at_b timestamptz,
  last_confirmed_at_a timestamptz, last_confirmed_at_b timestamptz,
  similarity double precision
)
language sql
as $$
  select
    a.id, b.id, a.chunk_text, b.chunk_text,
    a.memory_kind, b.memory_kind, a.temporal_status, b.temporal_status,
    a.created_at, b.created_at, a.last_confirmed_at, b.last_confirmed_at,
    1 - (a.embedding <=> b.embedding) as similarity
  from lore_embeddings a
  join lore_embeddings b on a.id < b.id
  where a.user_id = p_user_id
    and b.user_id = p_user_id
    and (p_folder_name is null or a.folder_name = p_folder_name)
    and (p_folder_name is null or b.folder_name = p_folder_name)
    and a.is_archived = false
    and b.is_archived = false
    and a.superseded_by is null
    and b.superseded_by is null
    and a.is_pinned = false
    and b.is_pinned = false
    and a.embedding is not null
    and b.embedding is not null
    and coalesce(a.extraction_version, '') not in ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned')
    and coalesce(b.extraction_version, '') not in ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned')
    and a.memory_kind = b.memory_kind
    and 1 - (a.embedding <=> b.embedding) >= p_threshold
    and not exists (
      select 1 from lore_consolidation_dismissals d
      where d.user_id = p_user_id
        and d.lore_id_a = least(a.id, b.id)
        and d.lore_id_b = greatest(a.id, b.id)
    )
  order by similarity desc
  limit p_limit;
$$;

-- 類似記憶ペア検出（v2・kNN方式）
create or replace function find_similar_lore_pairs_v2(
  p_user_id uuid,
  p_threshold double precision default 0.92,
  p_limit integer default 5,
  p_k integer default 3,
  p_folder_name text default null::text
)
returns table(
  id_a uuid, id_b uuid, similarity double precision,
  chunk_text_a text, chunk_text_b text,
  memory_kind_a text, memory_kind_b text,
  temporal_status_a text, temporal_status_b text,
  folder_name_a text, folder_name_b text,
  created_at_a timestamptz, created_at_b timestamptz
)
language plpgsql
as $$
begin
  return query
  select
    a.id, knn.id, knn.similarity,
    a.chunk_text, knn.chunk_text,
    a.memory_kind, knn.memory_kind,
    a.temporal_status, knn.temporal_status,
    a.folder_name, knn.folder_name,
    a.created_at, knn.created_at
  from lore_embeddings a
  cross join lateral (
    select
      b.id, b.chunk_text, b.memory_kind, b.temporal_status, b.folder_name, b.created_at,
      1 - (a.embedding <=> b.embedding) as similarity
    from lore_embeddings b
    where b.user_id = p_user_id
      and b.id != a.id
      and b.is_archived = false
      and b.superseded_by is null
      and b.is_pinned = false
      and b.extraction_version not in ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned')
      and b.embedding is not null
      and (p_folder_name is null or b.folder_name = p_folder_name)
      and b.memory_kind = a.memory_kind
      and b.folder_name = a.folder_name
    order by a.embedding <=> b.embedding
    limit p_k
  ) knn
  where a.user_id = p_user_id
    and a.id < knn.id
    and a.is_archived = false
    and a.superseded_by is null
    and a.is_pinned = false
    and a.extraction_version not in ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned')
    and a.embedding is not null
    and (p_folder_name is null or a.folder_name = p_folder_name)
    and knn.similarity >= p_threshold
    and not exists (
      select 1 from lore_consolidation_dismissals d
      where d.user_id = p_user_id
        and d.lore_id_a = least(a.id, knn.id)
        and d.lore_id_b = greatest(a.id, knn.id)
    )
  order by knn.similarity desc
  limit p_limit;
end;
$$;

-- ユーザー編集マージ: 2件を原子的に統合（liked_ai / liked_ai_cleanedは許容）
create or replace function public.merge_user_edited_lore_pair(
  p_user_id uuid,
  p_lore_id_a uuid,
  p_lore_id_b uuid,
  p_merged_text text,
  p_embedding vector,
  p_memory_kind text default null,
  p_temporal_status text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lore_id_a     uuid;
  v_lore_id_b     uuid;
  v_source        public.lore_embeddings%rowtype;
  v_source_a      public.lore_embeddings%rowtype;
  v_source_b      public.lore_embeddings%rowtype;
  v_found_count   integer := 0;
  v_folder_name   text;
  v_tags          text[];
  v_new_id        uuid;
  v_updated_count integer;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if p_lore_id_a is not distinct from p_lore_id_b then
    raise exception 'source ids must differ' using errcode = 'P0001';
  end if;

  -- UUIDの標準表現では、uuid型の大小順はnormalizePairの文字列昇順と一致する。
  v_lore_id_a := least(p_lore_id_a, p_lore_id_b);
  v_lore_id_b := greatest(p_lore_id_a, p_lore_id_b);

  -- 2件を同じ順序で先にロックし、並行マージとの競合を直列化する。
  for v_source in
    select le.*
    from public.lore_embeddings as le
    where le.id in (v_lore_id_a, v_lore_id_b)
      and le.user_id = p_user_id
    order by le.id
    for update
  loop
    v_found_count := v_found_count + 1;
    if v_source.id = v_lore_id_a then
      v_source_a := v_source;
    else
      v_source_b := v_source;
    end if;
  end loop;

  if v_found_count <> 2
    or not (
      v_source_a.user_id is not distinct from p_user_id
      and v_source_a.is_archived is false
      and v_source_a.superseded_by is null
      and v_source_a.is_pinned is false
      and (
        v_source_a.extraction_version is null
        or v_source_a.extraction_version not in ('user_edited', 'user_created')
      )
    )
    or not (
      v_source_b.user_id is not distinct from p_user_id
      and v_source_b.is_archived is false
      and v_source_b.superseded_by is null
      and v_source_b.is_pinned is false
      and (
        v_source_b.extraction_version is null
        or v_source_b.extraction_version not in ('user_edited', 'user_created')
      )
    )
  then
    raise exception 'source records failed protection check' using errcode = 'P0001';
  end if;

  if coalesce(v_source_a.created_at, '-infinity'::timestamptz)
      >= coalesce(v_source_b.created_at, '-infinity'::timestamptz) then
    v_folder_name := v_source_a.folder_name;
  else
    v_folder_name := v_source_b.folder_name;
  end if;

  -- normalizeTagsと同じく、sourceA、sourceBの順で最初に現れたタグを残す。
  select coalesce(
    array_agg(v_unique_tags.tag order by v_unique_tags.first_ordinality),
    '{}'::text[]
  )
  into v_tags
  from (
    select v_tag.tag, min(v_tag.ordinality) as first_ordinality
    from unnest(
      coalesce(v_source_a.tags, '{}'::text[])
      || coalesce(v_source_b.tags, '{}'::text[])
    ) with ordinality as v_tag(tag, ordinality)
    where v_tag.tag is not null
    group by v_tag.tag
  ) as v_unique_tags;

  insert into public.lore_embeddings (
    user_id,
    folder_name,
    chunk_text,
    embedding,
    memory_kind,
    temporal_status,
    extraction_version,
    source_type,
    source_thread_id,
    source_message_id,
    source_message_number,
    tags,
    importance_score,
    confidence_score,
    last_confirmed_at
  ) values (
    p_user_id,
    v_folder_name,
    p_merged_text,
    p_embedding,
    coalesce(p_memory_kind, v_source_a.memory_kind),
    coalesce(p_temporal_status, v_source_a.temporal_status),
    'user_edited',
    'consolidation',
    null,
    null,
    null,
    v_tags,
    greatest(
      coalesce(v_source_a.importance_score, 0),
      coalesce(v_source_b.importance_score, 0)
    ),
    (
      coalesce(v_source_a.confidence_score, 0)
      + coalesce(v_source_b.confidence_score, 0)
    ) / 2,
    now()
  )
  returning id into v_new_id;

  update public.lore_embeddings
  set is_archived = true,
      superseded_by = v_new_id
  where id in (v_lore_id_a, v_lore_id_b)
    and user_id = p_user_id
    and is_archived = false
    and superseded_by is null;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 2 then
    raise exception 'expected 2 source records to be archived, got %', v_updated_count
      using errcode = 'P0001';
  end if;

  return v_new_id;
end;
$$;

revoke execute on function public.merge_user_edited_lore_pair(
  uuid, uuid, uuid, text, vector, text, text
) from public, anon, authenticated;
grant execute on function public.merge_user_edited_lore_pair(
  uuid, uuid, uuid, text, vector, text, text
) to authenticated;

-- 分岐復元: 非active化と対象分岐のactive化を単一トランザクションで実行
create or replace function public.restore_message_branch(
  p_user_id uuid,
  p_thread_id uuid,
  p_branch_root_id uuid,
  p_branch_index int
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_root record;
  v_target_count integer;
  v_activated_count integer;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  -- 1. thread行を先にロック（同一thread内restoreの直列化。MF-6bでも同規約を採用予定）
  perform t.id
  from public.threads as t
  where t.id = p_thread_id
    and t.user_id = p_user_id
  for update;

  if not found then
    raise exception 'thread not found' using errcode = 'P0001';
  end if;

  -- 2. root取得・検証
  select id, message_number
  into v_root
  from public.messages
  where id = p_branch_root_id
    and thread_id = p_thread_id
    and user_id = p_user_id;

  if not found or v_root.message_number is null then
    raise exception 'branch root message not found or missing message_number'
      using errcode = 'P0001';
  end if;

  -- 3. 対象行を決定的順序でロック（非active化対象＋active化対象）
  perform m.id
  from public.messages as m
  where m.thread_id = p_thread_id
    and m.user_id = p_user_id
    and (
      (m.is_active = true and m.message_number >= v_root.message_number)
      or (m.branch_root_id = p_branch_root_id and m.branch_index = p_branch_index)
    )
  order by m.id
  for update;

  -- 4. target branchの存在を事前確認（0件なら着手前に弾く。ユーザー入力エラー扱い）
  select count(*) into v_target_count
  from public.messages
  where thread_id = p_thread_id
    and user_id = p_user_id
    and branch_root_id = p_branch_root_id
    and branch_index = p_branch_index;

  if v_target_count = 0 then
    raise exception 'target branch not found for given branchRootId/branchIndex'
      using errcode = 'P0001';
  end if;

  -- 5. 非active化（件数は使用しないため取得しない）
  update public.messages
  set is_active = false
  where thread_id = p_thread_id
    and user_id = p_user_id
    and is_active = true
    and message_number >= v_root.message_number;

  -- 6. active化
  update public.messages
  set is_active = true
  where thread_id = p_thread_id
    and user_id = p_user_id
    and branch_root_id = p_branch_root_id
    and branch_index = p_branch_index;

  get diagnostics v_activated_count = row_count;

  -- 7. 事後assert：直前にtarget存在確認済み・ロック済みでの0件はDB側のinvariant違反であり
  --    ユーザー入力エラーではないため、P0001ではなくXX000（内部異常）として500へ分類する
  if v_activated_count = 0 then
    raise exception 'invariant violation: expected to activate at least 1 message but activated 0'
      using errcode = 'XX000';
  end if;
end;
$$;

revoke execute on function public.restore_message_branch(uuid, uuid, uuid, int)
  from public, anon, authenticated;
grant execute on function public.restore_message_branch(uuid, uuid, uuid, int)
  to authenticated;

create or replace function public.apply_branch_edit(
  p_user_id uuid,
  p_thread_id uuid,
  p_base_user_message_id uuid,
  p_new_message_id uuid,
  p_content text
)
returns table(new_branch_root_id uuid, new_branch_index int, new_message_number int)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_base record;
  v_max_branch_index int;
  v_max_message_number int;
  v_next_branch_index int;
  v_next_message_number int;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  -- 1. thread行を先にロック（MF-6a規約踏襲。restore_message_branchとの直列化も兼ねる。
  --    通常のmessage INSERT経路（trigger基準のset_message_number）とは直列化されない既知の制約）
  perform t.id from public.threads as t
  where t.id = p_thread_id and t.user_id = p_user_id
  for update;
  if not found then
    raise exception 'thread not found' using errcode = 'P0001';
  end if;

  -- 2. baseUser取得・ロック（role='user'を明示チェック。現行Routeは未チェックだがRPC化にあたり明文化）
  select mb.id, mb.message_number
  into v_base
  from public.messages as mb
  where mb.id = p_base_user_message_id
    and mb.thread_id = p_thread_id
    and mb.user_id = p_user_id
    and mb.role = 'user'
  for update;

  if not found then
    raise exception 'base user message not found' using errcode = 'P0001';
  end if;
  if v_base.message_number is null then
    raise exception 'base user message_number is missing' using errcode = 'P0001';
  end if;

  -- 3. 関係行を決定的順序で一括ロック（MF-6a同様、非active化対象＋既存branch_root_id配下をOR条件1本で）
  perform m.id from public.messages as m
  where m.thread_id = p_thread_id
    and m.user_id = p_user_id
    and (
      (m.is_active = true and m.message_number >= v_base.message_number)
      or m.branch_root_id = v_base.id
    )
  order by m.id
  for update;

  -- 4. archive UPDATE（現行route.tsと同じ順序：採番より先に実行する）
  update public.messages as m
  set is_active = false, branch_root_id = v_base.id, branch_index = 0
  where m.thread_id = p_thread_id
    and m.user_id = p_user_id
    and m.is_active = true
    and m.message_number >= v_base.message_number;

  -- 5. 採番（archive後に実行。現行route.tsの順序を維持し、採番仕様の変更を避ける）
  select coalesce(max(m.branch_index), 0) into v_max_branch_index
  from public.messages as m
  where m.thread_id = p_thread_id and m.user_id = p_user_id and m.branch_root_id = v_base.id;
  v_next_branch_index := v_max_branch_index + 1;

  select coalesce(max(m.message_number), 0) into v_max_message_number
  from public.messages as m
  where m.thread_id = p_thread_id and m.user_id = p_user_id;
  v_next_message_number := v_max_message_number + 1;

  -- 6. 新規userメッセージinsert
  insert into public.messages (
    id, thread_id, role, content, provider, user_id,
    parent_id, branch_root_id, branch_index, message_number, is_active
  ) values (
    p_new_message_id, p_thread_id, 'user', p_content, 'user', p_user_id,
    v_base.id, v_base.id, v_next_branch_index, v_next_message_number, true
  );

  return query select v_base.id, v_next_branch_index, v_next_message_number;
end;
$$;

revoke execute on function public.apply_branch_edit(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_branch_edit(uuid, uuid, uuid, uuid, text)
  to authenticated;

-- Dreaming（記憶統合）: 2件統合・タグ自動マージ版
create or replace function consolidate_dreaming_batch(
  p_user_id uuid, p_lore_id_a uuid, p_lore_id_b uuid, p_merged_text text,
  p_embedding vector, p_memory_kind text, p_temporal_status text, p_folder_name text,
  p_importance double precision, p_confidence double precision
)
returns uuid
language plpgsql
as $$
declare
  new_id        uuid;
  updated_count int;
  v_tags        text[];
begin
  if exists (
    select 1 from lore_embeddings
    where id in (p_lore_id_a, p_lore_id_b)
      and (
        user_id != p_user_id
        or is_archived = true
        or superseded_by is not null
        or is_pinned = true
        or extraction_version in ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned')
      )
  ) then
    raise exception 'source records failed protection check';
  end if;
  select coalesce(array_agg(distinct tag), '{}')
  into v_tags
  from unnest(
    coalesce((select tags from lore_embeddings where id = p_lore_id_a), '{}') ||
    coalesce((select tags from lore_embeddings where id = p_lore_id_b), '{}')
  ) as tag;
  perform id from lore_embeddings
  where id in (p_lore_id_a, p_lore_id_b)
  order by id
  for update;
  insert into lore_embeddings (
    user_id, chunk_text, embedding, memory_kind,
    temporal_status, extraction_version, source_type,
    source_thread_id, source_message_id, source_message_number,
    folder_name, tags, importance_score, confidence_score
  ) values (
    p_user_id, p_merged_text, p_embedding, p_memory_kind,
    p_temporal_status, 'dreaming_batch', 'consolidation',
    null, null, null,
    p_folder_name, v_tags, p_importance, p_confidence
  ) returning id into new_id;
  update lore_embeddings
  set is_archived = true, superseded_by = new_id
  where id in (p_lore_id_a, p_lore_id_b)
    and user_id = p_user_id
    and is_archived = false
    and superseded_by is null;
  get diagnostics updated_count = row_count;
  if updated_count <> 2 then
    raise exception 'expected 2 source records to be archived, got %', updated_count;
  end if;
  return new_id;
end;
$$;

-- Dreaming（記憶統合）: 3件以上のマルチ統合版
-- extraction_version の保護対象に liked_ai / liked_ai_cleaned を含む
create or replace function public.consolidate_dreaming_batch_multi(
  p_user_id uuid, p_source_ids uuid[], p_merged_text text, p_embedding vector,
  p_memory_kind text, p_temporal_status text, p_folder_name text,
  p_importance double precision, p_confidence double precision
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source        record;
  v_new_id        uuid;
  v_updated_count integer;
  v_tags          text[];
  v_all_tags      text[] := '{}';
  v_source_count  integer;
  v_found_count   integer := 0;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  v_source_count := array_length(p_source_ids, 1);
  if v_source_count is null or v_source_count < 2 then
    raise exception 'source_ids must contain at least 2 elements'
      using errcode = 'P0001';
  end if;
  for v_source in
    select id, is_pinned, extraction_version, is_archived, superseded_by, tags
    from public.lore_embeddings
    where id = any(p_source_ids)
      and user_id = p_user_id
    order by id
    for update
  loop
    v_found_count := v_found_count + 1;
    if v_source.is_pinned then
      raise exception 'source % is pinned', v_source.id using errcode = 'P0001';
    end if;
    if v_source.extraction_version in ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned') then
      raise exception 'source % is protected (extraction_version=%)', v_source.id, v_source.extraction_version
        using errcode = 'P0001';
    end if;
    if v_source.is_archived then
      raise exception 'source % is already archived', v_source.id using errcode = 'P0001';
    end if;
    if v_source.superseded_by is not null then
      raise exception 'source % is already superseded', v_source.id using errcode = 'P0001';
    end if;
    v_all_tags := v_all_tags || coalesce(v_source.tags, '{}');
  end loop;
  if v_found_count <> v_source_count then
    raise exception 'expected % sources but found %', v_source_count, v_found_count
      using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct tag), '{}')
  into v_tags
  from unnest(v_all_tags) as tag;
  insert into public.lore_embeddings (
    user_id, chunk_text, embedding, memory_kind, temporal_status,
    folder_name, tags, importance_score, confidence_score,
    extraction_version, source_type, is_archived, is_pinned,
    source_thread_id, source_message_id, source_message_number
  ) values (
    p_user_id, p_merged_text, p_embedding, p_memory_kind, p_temporal_status,
    p_folder_name, v_tags, p_importance, p_confidence,
    'dreaming_batch', 'consolidation', false, false,
    null, null, null
  )
  returning id into v_new_id;
  update public.lore_embeddings
  set superseded_by = v_new_id, is_archived = true
  where id = any(p_source_ids)
    and user_id = p_user_id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_source_count then
    raise exception 'expected to update % sources but updated %', v_source_count, v_updated_count
      using errcode = 'P0001';
  end if;
  return v_new_id;
end;
$$;

revoke execute on function public.consolidate_dreaming_batch_multi(
  uuid, uuid[], text, vector, text, text, text, double precision, double precision
) from public, anon, authenticated;
grant execute on function public.consolidate_dreaming_batch_multi(
  uuid, uuid[], text, vector, text, text, text, double precision, double precision
) to authenticated;

-- Dreaming統合の取り消し（マルチ統合分）
create or replace function public.rollback_dreaming_batch_multi(
  p_user_id uuid, p_consolidated_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consolidated  record;
  v_source_count  integer;
  v_updated_count integer;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select id, extraction_version, source_type, is_archived, is_pinned
  into v_consolidated
  from public.lore_embeddings
  where id = p_consolidated_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'consolidated record not found' using errcode = 'P0001';
  end if;
  if v_consolidated.extraction_version <> 'dreaming_batch' then
    raise exception 'not a dreaming_batch record' using errcode = 'P0001';
  end if;
  if v_consolidated.source_type <> 'consolidation' then
    raise exception 'not a consolidation record' using errcode = 'P0001';
  end if;
  if v_consolidated.is_archived then
    raise exception 'already rolled back' using errcode = 'P0001';
  end if;
  if v_consolidated.is_pinned then
    raise exception 'consolidated record is pinned' using errcode = 'P0001';
  end if;

  select count(*) into v_source_count
  from public.lore_embeddings
  where superseded_by = p_consolidated_id
    and user_id = p_user_id;

  if v_source_count < 2 then
    raise exception 'expected at least 2 source records but found %', v_source_count
      using errcode = 'P0001';
  end if;

  update public.lore_embeddings
  set is_archived = false, superseded_by = null
  where superseded_by = p_consolidated_id
    and user_id = p_user_id;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_source_count then
    raise exception 'restore count mismatch: expected % but updated %', v_source_count, v_updated_count
      using errcode = 'P0001';
  end if;

  update public.lore_embeddings
  set is_archived = true
  where id = p_consolidated_id
    and user_id = p_user_id;
end;
$$;

revoke execute on function public.rollback_dreaming_batch_multi(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.rollback_dreaming_batch_multi(uuid, uuid)
  to authenticated;
