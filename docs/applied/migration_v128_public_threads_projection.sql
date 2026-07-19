-- B-01（threads案A）対応：threadsテーブルの列制限なし公開SELECT policyを削除し、
-- 公開データの読み取り経路をSECURITY DEFINER関数経由の投影に統一する。
-- 2026/07/19 テスト環境→本番環境の順で適用済み。

-- 【preflight】適用前のRLS状態確認（relforcerowsecurityが全てfalseであることを確認済み）
select
  c.relname,
  c.relowner::regrole,
  c.relrowsecurity,
  c.relforcerowsecurity
from pg_class c
where c.oid in ('public.threads'::regclass, 'public.messages'::regclass, 'public.thread_tags'::regclass);

-- 【preflight】適用前のpolicy一覧を保存
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('threads', 'messages', 'thread_tags')
order by tablename, policyname;

begin;

-- ============================================================
-- 関数1: 公開threads投影（許可列のみ・is_public=trueのみ）
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

-- ============================================================
-- 関数2: 公開メッセージ判定（is_public + shared_atカットオフ）
-- ============================================================
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

-- ============================================================
-- 関数3: 公開タグ判定（is_public + タグ所有者=スレッド所有者）
-- ============================================================
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
-- public_threads_view 再定義（関数経由・allow_prompt_fork/fork_count列追加）
-- ============================================================
create or replace view public.public_threads_view
with (security_invoker = true)
as
select
  t.id, t.title, t.is_public, t.created_at, t.updated_at, t.user_id, t.genre,
  coalesce(array_agg(tt.name order by tt.created_at) filter (where tt.name is not null), '{}'::text[]) as tags,
  t.share_token, t.allow_prompt_fork, t.fork_count
from public.get_public_threads_projection() t
left join public.thread_tags tt on tt.thread_id = t.id and tt.user_id = t.user_id
group by t.id, t.title, t.is_public, t.created_at, t.updated_at, t.user_id, t.genre,
         t.share_token, t.allow_prompt_fork, t.fork_count;

grant select on public.public_threads_view to anon, authenticated;

-- ============================================================
-- messages 公開SELECT policy 再定義（threads直接参照 → 関数経由）
-- ============================================================
drop policy if exists "公開スレッドのメッセージは全員閲覧可" on public.messages;

create policy "公開スレッドのメッセージは全員閲覧可"
  on public.messages for select
  using (
    coalesce(is_hidden, false) = false
    and provider <> 'memo'
    and public.is_visible_public_message(thread_id, created_at)
  );

-- ============================================================
-- thread_tags 公開SELECT policy 再定義（threads直接参照 → 関数経由）
-- ============================================================
drop policy if exists "公開スレッドのタグは全員閲覧可" on public.thread_tags;

create policy "公開スレッドのタグは全員閲覧可"
  on public.thread_tags for select
  using (
    public.is_visible_public_thread_tag(thread_id, user_id)
  );

-- ============================================================
-- threads 列制限なし公開SELECT policy 削除（本チケットの主目的）
-- ============================================================
drop policy if exists "Public threads are readable by anyone" on public.threads;

commit;

notify pgrst, 'reload schema';

-- 【postflight】関数のsearch_path・security definer確認
select proname, proconfig, prosecdef
from pg_proc
where proname in ('get_public_threads_projection', 'is_visible_public_message', 'is_visible_public_thread_tag');

-- 【postflight】関数ACL確認（anon, authenticatedにEXECUTEがあり、publicにはないこと）
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_name in ('get_public_threads_projection', 'is_visible_public_message', 'is_visible_public_thread_tag')
order by routine_name, grantee;

-- 【postflight】threadsのpolicyが所有者用の1本のみになっていること
select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'threads';

-- 【postflight】view定義とsecurity_invoker維持確認
select reloptions from pg_class where oid = 'public.public_threads_view'::regclass;

-- 【動作確認】anon視点：public_threads_viewから公開スレッドが見えるか
-- set role anon;
-- select id, title, is_public, share_token, allow_prompt_fork, fork_count from public_threads_view limit 5;
-- reset role;

-- 【動作確認】anon視点：threadsテーブル直接select（非公開列含む）が空になるか
-- set role anon;
-- select id, system_prompt, metadata from threads where is_public = true limit 5;
-- reset role;