-- Phase 2: Supabase に切り替える際に実行するスキーマ
-- Supabase Dashboard > SQL Editor で実行してください

create extension if not exists "uuid-ossp";

-- スレッドテーブル
create table if not exists threads (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null default '無題',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- メッセージテーブル
create table if not exists messages (
  id          uuid primary key default uuid_generate_v4(),
  thread_id   uuid not null references threads(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

-- インデックス
create index if not exists messages_thread_id_idx on messages(thread_id);
create index if not exists threads_created_at_idx on threads(created_at desc);

-- Row Level Security（個人用のため全許可で可）
alter table threads enable row level security;
alter table messages enable row level security;

create policy "allow all" on threads for all using (true) with check (true);
create policy "allow all" on messages for all using (true) with check (true);
