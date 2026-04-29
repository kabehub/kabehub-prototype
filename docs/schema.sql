-- KabeHub セルフホスト用DBスキーマ
-- 最終更新: 2026/04/29 (v69)
-- Supabase Dashboard > SQL Editor で実行してください

create extension if not exists "uuid-ossp";

-- ============================================================
-- profiles テーブル
-- ============================================================
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  handle        text unique,
  display_name  text,
  bio           text check (char_length(bio) <= 300),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "自分のプロフィールのみ更新可"
  on profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "プロフィールは全員閲覧可"
  on profiles for select
  using (true);

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
  roleplay_mode     boolean default false,         -- v63追加: なりきりモードフラグ
  rp_char_name      text,                          -- v63追加: AIキャラの表示名
  rp_char_icon_url  text                           -- v63追加: AIキャラのアイコン（base64 data URL・長辺200px・JPEG圧縮済み）
);

create index if not exists threads_user_id_idx      on threads(user_id);
create index if not exists threads_created_at_idx   on threads(created_at desc);
create index if not exists threads_share_token_idx  on threads(share_token);
create index if not exists threads_is_public_idx    on threads(is_public);

alter table threads enable row level security;

create policy "自分のスレッドのみ操作可"
  on threads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "公開スレッドは全員閲覧可"
  on threads for select
  using (is_public = true);

-- ============================================================
-- messages テーブル
-- ============================================================
create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references threads(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  provider    text not null default 'unknown',
  created_at  timestamptz not null default now(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  parent_id   uuid references messages(id) on delete set null, -- Branching Mode用（未実装）
  is_hidden   boolean default false                            -- v39追加: 共有ページで非公開表示
);

create index if not exists messages_thread_id_idx on messages(thread_id);

alter table messages enable row level security;

create policy "自分のメッセージのみ操作可"
  on messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "公開スレッドのメッセージは全員閲覧可"
  on messages for select
  using (
    exists (
      select 1 from threads
      where threads.id = messages.thread_id
        and threads.is_public = true
    )
  );

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

alter table thread_notes enable row level security;

create policy "自分のスレッドメモのみ操作可"
  on thread_notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

alter table message_notes enable row level security;

create policy "自分のメッセージメモのみ操作可"
  on message_notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- thread_tags テーブル
-- ============================================================
create table if not exists thread_tags (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references threads(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  user_id     uuid not null references auth.users(id) on delete cascade
);

create index if not exists thread_tags_thread_id_idx on thread_tags(thread_id);

alter table thread_tags enable row level security;

create policy "自分のタグのみ操作可"
  on thread_tags for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

alter table drafts enable row level security;

create policy "自分の下書きのみ操作可"
  on drafts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- likes テーブル（v34追加）
-- ============================================================
create table if not exists likes (
  thread_id   uuid not null references threads(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (thread_id, user_id)
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

create policy "通報は認証ユーザーのみ投稿可"
  on reports for insert
  to authenticated
  with check (true);

create policy "自分の通報のみ閲覧可"
  on reports for select
  using (auth.uid() = reporter_user_id);

-- ============================================================
-- folder_settings テーブル（v57追加）
-- ============================================================
create table if not exists folder_settings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  folder_name   text not null,
  system_prompt text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(user_id, folder_name)
);

alter table folder_settings enable row level security;

create policy "自分のフォルダ設定のみ操作可"
  on folder_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- updated_at 自動更新トリガー
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger folder_settings_updated_at
  before update on folder_settings
  for each row execute function update_updated_at_column();

-- ============================================================
-- いいね数・引継ぎ数の増減 RPC（非正規化カラム操作用）
-- ============================================================
create or replace function increment_likes_count(p_thread_id uuid)
returns void as $$
  update threads set likes_count = likes_count + 1 where id = p_thread_id;
$$ language sql;

create or replace function decrement_likes_count(p_thread_id uuid)
returns void as $$
  update threads set likes_count = greatest(likes_count - 1, 0) where id = p_thread_id;
$$ language sql;

create or replace function increment_fork_count(p_thread_id uuid)
returns void as $$
  update threads set fork_count = fork_count + 1 where id = p_thread_id;
$$ language sql;
