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

create or replace function increment_fork_count(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  update threads set fork_count = fork_count + 1 where id = p_thread_id and is_public = true;
end;
$$;

revoke execute on function increment_likes_count(uuid) from public, anon;
grant execute on function increment_likes_count(uuid) to authenticated;
revoke execute on function decrement_likes_count(uuid) from public, anon;
grant execute on function decrement_likes_count(uuid) to authenticated;
revoke execute on function increment_fork_count(uuid) from public, anon;
grant execute on function increment_fork_count(uuid) to authenticated;

notify pgrst, 'reload schema';
