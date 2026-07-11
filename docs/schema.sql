-- ============================================================
-- KabeHub セルフホスト用DBスキーマ（統合版）
-- 最終更新: 2026/07/10（本番DBと全項目突き合わせ完了。緊急対応1件を含む）
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
-- 【2026/07/10 突き合わせ確認済み事項】
--   - lore_embeddings.embedding は vector(1536) で確定（pgvector 0.8.0稼働）
--   - lore_consolidation_dismissals に CHECK (lore_id_a < lore_id_b) が
--     DB制約として存在することを確認（本ファイルに追記済み）
--   - 全15テーブル・全アプリケーション関数・全トリガーが本ファイルと一致
--     （pgvector純正関数を除く）
-- ============================================================

create extension if not exists "uuid-ossp";  -- 現状 gen_random_uuid() 主体のため実質未使用の可能性あり（要確認）
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

create policy "Public threads are readable by anyone"
  on threads for select
  using (is_public = true);

-- Public thread reads should use public_threads_view to avoid exposing private columns.

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

create policy "公開スレッドのメッセージは全員閲覧可"
  on messages for select
  using (
    coalesce(is_hidden, false) = false
    and provider <> 'memo'
    and exists (
      select 1 from threads
      where threads.id = messages.thread_id
        and threads.is_public = true
        and (
          threads.shared_at is null
          or messages.created_at <= threads.shared_at
        )
    )
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

create policy "公開スレッドのタグは全員閲覧可"
  on thread_tags for select
  using (
    exists (
      select 1 from threads
      where threads.id = thread_tags.thread_id
        and threads.is_public = true
        and threads.user_id = thread_tags.user_id
    )
  );

-- ============================================================
-- public_threads_view（公開スレッド閲覧用ビュー）
-- ============================================================
-- 2026/07/06 v121：share_token列を追加。/api/explore がexploreの引継ぎ
-- （fork）ボタン用に参照する。旧版はshare_tokenを含まずnullを返していた
create or replace view public_threads_view as
select
  t.id,
  t.title,
  t.is_public,
  t.created_at,
  t.updated_at,
  t.user_id,
  t.genre,
  coalesce(
    array_agg(tt.name order by tt.created_at) filter (where tt.name is not null),
    '{}'::text[]
  ) as tags,
  t.share_token
from threads t
left join thread_tags tt
  on tt.thread_id = t.id
 and tt.user_id = t.user_id
where t.is_public = true
group by
  t.id, t.title, t.is_public, t.created_at, t.updated_at, t.user_id, t.genre, t.share_token;

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

-- 【旧関数・v124で削除予定】±1方式（本番で数日〜1週間の安定稼働確認後、
-- migration_v124_drop_legacy_counter_rpcs.sql で削除する。それまでは
-- app/api/threads/[id]/likes/route.ts からは呼ばれておらず未使用（呼び出し側は
-- recalc_likes_count に統合済み）。DB上の後方互換のためだけに残存
create or replace function increment_likes_count(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update threads
  set likes_count = likes_count + 1
  where id = p_thread_id
    and exists (
      select 1 from likes
      where likes.thread_id = p_thread_id
        and likes.user_id = auth.uid()
    );
end;
$$;

create or replace function decrement_likes_count(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update threads
  set likes_count = greatest(likes_count - 1, 0)
  where id = p_thread_id
    and exists (
      select 1 from likes
      where likes.thread_id = p_thread_id
        and likes.user_id = auth.uid()
    );
end;
$$;

revoke execute on function increment_likes_count(uuid) from public, anon;
grant execute on function increment_likes_count(uuid) to authenticated;
revoke execute on function decrement_likes_count(uuid) from public, anon;
grant execute on function decrement_likes_count(uuid) to authenticated;

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

create or replace function update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger novel_settings_updated_at
  before update on novel_settings
  for each row execute function update_updated_at();

-- ============================================================
-- アカウント削除RPC
-- ============================================================
create or replace function delete_current_user()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from auth.users where id = auth.uid();
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

-- Dreaming（記憶統合）: 2件統合・タグ明示指定版
-- 【注意】consolidate_dreaming_batch は上記と2つのシグネチャでオーバーロードされている
create or replace function consolidate_dreaming_batch(
  p_user_id uuid, p_lore_id_a uuid, p_lore_id_b uuid, p_merged_text text,
  p_embedding vector, p_memory_kind text, p_temporal_status text, p_folder_name text,
  p_tags text[], p_importance double precision, p_confidence double precision
)
returns uuid
language plpgsql
as $$
declare
  new_id        uuid;
  updated_count int;
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
    p_folder_name, p_tags, p_importance, p_confidence
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
create or replace function consolidate_dreaming_batch_multi(
  p_user_id uuid, p_source_ids uuid[], p_merged_text text, p_embedding vector,
  p_memory_kind text, p_temporal_status text, p_folder_name text,
  p_importance double precision, p_confidence double precision
)
returns uuid
language plpgsql
security definer
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
  v_source_count := array_length(p_source_ids, 1);
  if v_source_count is null or v_source_count < 2 then
    raise exception 'source_ids must contain at least 2 elements'
      using errcode = 'P0001';
  end if;
  for v_source in
    select id, is_pinned, extraction_version, is_archived, superseded_by, tags
    from lore_embeddings
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
  insert into lore_embeddings (
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
  update lore_embeddings
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

-- Dreaming統合の取り消し（2件統合分）
create or replace function rollback_dreaming_batch(
  p_user_id uuid, p_consolidated_id uuid
)
returns void
language plpgsql
as $$
declare
  restored_count int;
begin
  if not exists (
    select 1 from lore_embeddings
    where id = p_consolidated_id
      and user_id = p_user_id
      and extraction_version = 'dreaming_batch'
      and source_type = 'consolidation'
      and is_archived = false
      and is_pinned = false
      and superseded_by is null
  ) then
    raise exception 'consolidated record not found or protected' using errcode = 'P0001';
  end if;

  if (
    select count(*) from lore_embeddings
    where superseded_by = p_consolidated_id
      and user_id = p_user_id
      and is_archived = true
      and is_pinned = false
      and extraction_version not in ('user_edited', 'user_created')
  ) <> 2 then
    raise exception 'expected 2 source records to restore, got unexpected count'
      using errcode = 'P0001';
  end if;

  update lore_embeddings
  set is_archived = false, superseded_by = null
  where superseded_by = p_consolidated_id
    and user_id = p_user_id
    and is_archived = true
    and is_pinned = false
    and extraction_version not in ('user_edited', 'user_created');

  get diagnostics restored_count = row_count;
  if restored_count <> 2 then
    raise exception 'expected 2 source records to be restored, got %', restored_count
      using errcode = 'P0001';
  end if;

  update lore_embeddings
  set is_archived = true
  where id = p_consolidated_id
    and user_id = p_user_id;
end;
$$;

-- Dreaming統合の取り消し（マルチ統合分）
create or replace function rollback_dreaming_batch_multi(
  p_user_id uuid, p_consolidated_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_consolidated  record;
  v_source_count  integer;
  v_updated_count integer;
begin
  select id, extraction_version, source_type, is_archived, is_pinned
  into v_consolidated
  from lore_embeddings
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
  from lore_embeddings
  where superseded_by = p_consolidated_id
    and user_id = p_user_id;

  if v_source_count < 2 then
    raise exception 'expected at least 2 source records but found %', v_source_count
      using errcode = 'P0001';
  end if;

  update lore_embeddings
  set is_archived = false, superseded_by = null
  where superseded_by = p_consolidated_id
    and user_id = p_user_id;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_source_count then
    raise exception 'restore count mismatch: expected % but updated %', v_source_count, v_updated_count
      using errcode = 'P0001';
  end if;

  update lore_embeddings
  set is_archived = true
  where id = p_consolidated_id
    and user_id = p_user_id;
end;
$$;
