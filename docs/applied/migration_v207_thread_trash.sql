-- v207 / Phase 1: thread trash (DB only; Rui applies manually).
-- A案: API/RPC contracts enforce trash semantics; direct Supabase UPDATE/DELETE
-- remains available under existing RLS. No app, Storage or Cron changes here.
-- New columns have no default/backfill: all existing threads remain live on first apply.
--
-- 事前確認 (save results and the six existing pg_get_functiondef definitions):
-- select table_name, column_name, data_type, is_nullable, column_default
-- from information_schema.columns where table_schema = 'public'
-- and table_name in ('threads', 'lore_embeddings', 'messages', 'thread_tags',
--                    'thread_notes', 'message_notes', 'drafts')
-- and column_name in ('thread_id', 'deleted_at', 'archived_by_thread_delete_at');
-- select p.oid::regprocedure, pg_get_functiondef(p.oid)
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname in ('get_public_threads_projection',
-- 'is_visible_public_message', 'is_visible_public_thread_tag',
-- 'restore_message_branch', 'apply_branch_edit', 'recalc_fork_count');
-- select * from pg_policies where schemaname = 'public' and tablename = 'threads';
--
-- 適用後確認 / 適用済み判定 (also rerun the column query above):
-- select count(*) filter (where deleted_at is not null) as trashed from public.threads;
-- -- First apply: 0; reapply must preserve any trash created since first apply.
-- select indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_threads_deleted_at';
-- select public.thread_trash_retention();
-- select p.oid::regprocedure, pg_get_function_result(p.oid), p.prosecdef, p.proconfig,
-- has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
-- has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
-- has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname in ('soft_delete_thread', 'restore_thread',
-- 'list_trashed_threads', 'list_expired_trashed_threads', 'purge_expired_thread',
-- 'thread_trash_retention', 'guard_thread_not_trashed');
-- select c.relname, t.tgname, pg_get_triggerdef(t.oid)
-- from pg_trigger t join pg_class c on c.oid = t.tgrelid
-- where not t.tgisinternal and t.tgname in ('trg_00_guard_thread_not_trashed', 'trg_set_message_number');
-- -- Compare threads pg_policies with preflight: identical. Run the manual verifier on test DB only.
--
-- ロールバック方針: before COMMIT, ROLLBACK is sufficient. After COMMIT, stop trash
-- RPC callers, back up trash timestamps / Lore markers, and explicitly reconcile
-- trashed threads and marked Lore before removing those columns (do not discard state).
-- Restore the six saved preflight function definitions / ACLs (docs/schema.sql is
-- the unchanged v206 reference), then DROP TRIGGER IF EXISTS on all five tables,
-- drop the new RPCs and guard, drop idx_threads_deleted_at and the two columns,
-- and finally drop thread_trash_retention(). Do not use CASCADE for this rollback.
-- Notify pgrst to reload after committing the reviewed rollback.

begin;

alter table public.threads add column if not exists deleted_at timestamptz;
create index if not exists idx_threads_deleted_at
  on public.threads(deleted_at) where deleted_at is not null;
alter table public.lore_embeddings
  add column if not exists archived_by_thread_delete_at timestamptz;

create or replace function public.thread_trash_retention()
returns interval
language sql
immutable
security invoker
set search_path = ''
as $$
  select interval '7 days';
$$;
revoke execute on function public.thread_trash_retention() from public, anon, authenticated;
grant execute on function public.thread_trash_retention() to authenticated, service_role;

create or replace function public.soft_delete_thread(p_user_id uuid, p_thread_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_thread record;
  v_deleted_at timestamptz;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select t.deleted_at, t.forked_from_id into v_thread
  from public.threads as t
  where t.id = p_thread_id and t.user_id = p_user_id
  for update;
  if not found then
    raise exception 'thread not found' using errcode = 'P0001';
  end if;
  if v_thread.deleted_at is not null then
    return v_thread.deleted_at;
  end if;

  v_deleted_at := now();
  update public.threads set deleted_at = v_deleted_at
  where id = p_thread_id and user_id = p_user_id;

  update public.lore_embeddings
  set is_archived = true, archived_by_thread_delete_at = v_deleted_at
  where source_thread_id = p_thread_id and user_id = p_user_id
    and is_pinned = false and is_archived = false and superseded_by is null;

  if v_thread.forked_from_id is not null then
    perform public.recalc_fork_count(v_thread.forked_from_id);
  end if;
  return v_deleted_at;
end;
$$;
revoke execute on function public.soft_delete_thread(uuid, uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_thread(uuid, uuid) to authenticated;

create or replace function public.restore_thread(p_user_id uuid, p_thread_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_thread record;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select t.deleted_at, t.forked_from_id into v_thread
  from public.threads as t
  where t.id = p_thread_id and t.user_id = p_user_id
  for update;
  if not found then
    raise exception 'thread not found' using errcode = 'P0001';
  end if;
  if v_thread.deleted_at is null then
    return;
  end if;
  if now() >= v_thread.deleted_at + public.thread_trash_retention() then
    raise exception 'trash retention expired' using errcode = 'P0001';
  end if;

  -- Clear every marker for this deletion, including subsequently superseded Lore.
  update public.lore_embeddings as le
  set archived_by_thread_delete_at = null,
      is_archived = case when le.superseded_by is null then false else le.is_archived end
  where le.source_thread_id = p_thread_id and le.user_id = p_user_id
    and le.archived_by_thread_delete_at = v_thread.deleted_at;

  update public.threads set deleted_at = null
  where id = p_thread_id and user_id = p_user_id;
  if v_thread.forked_from_id is not null then
    perform public.recalc_fork_count(v_thread.forked_from_id);
  end if;
end;
$$;
revoke execute on function public.restore_thread(uuid, uuid) from public, anon, authenticated;
grant execute on function public.restore_thread(uuid, uuid) to authenticated;

create or replace function public.list_trashed_threads(p_user_id uuid)
returns table(id uuid, title text, deleted_at timestamptz, expires_at timestamptz, is_public boolean, project_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  return query
  select t.id, t.title, t.deleted_at, t.deleted_at + public.thread_trash_retention(), t.is_public, t.project_id
  from public.threads as t
  where t.user_id = p_user_id and t.deleted_at is not null
  order by t.deleted_at desc;
end;
$$;
revoke execute on function public.list_trashed_threads(uuid) from public, anon, authenticated;
grant execute on function public.list_trashed_threads(uuid) to authenticated;

create or replace function public.list_expired_trashed_threads(p_limit integer)
returns table(id uuid, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'limit must be between 1 and 200' using errcode = 'P0001';
  end if;
  return query
  select t.id, t.user_id from public.threads as t
  where t.deleted_at is not null
    and now() >= t.deleted_at + public.thread_trash_retention()
  order by t.deleted_at asc, t.id asc
  limit p_limit;
end;
$$;
revoke execute on function public.list_expired_trashed_threads(integer) from public, anon, authenticated;
grant execute on function public.list_expired_trashed_threads(integer) to service_role;

create or replace function public.purge_expired_thread(p_thread_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- One conditional DELETE rechecks expiry under the row lock, including restore races.
  delete from public.threads as t
  where t.id = p_thread_id and t.deleted_at is not null
    and t.deleted_at <= now() - public.thread_trash_retention()
  returning t.id into v_id;
  return found;
end;
$$;
revoke execute on function public.purge_expired_thread(uuid) from public, anon, authenticated;
grant execute on function public.purge_expired_thread(uuid) to service_role;

create or replace function public.guard_thread_not_trashed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_at timestamptz;
begin
  select t.deleted_at into v_deleted_at
  from public.threads as t where t.id = new.thread_id
  for share;
  if found and v_deleted_at is not null then
    raise exception 'thread is in trash' using errcode = 'P0001';
  end if;
  -- Missing parents are left to FK/RLS checks.
  return new;
end;
$$;
revoke execute on function public.guard_thread_not_trashed() from public, anon, authenticated;

-- All five tables verified in docs/schema.sql to carry thread_id.
-- PostgreSQL fires matching triggers in name order: trg_00_ precedes
-- messages.trg_set_message_number, so rejected INSERTs never reach numbering.
-- INSERT only: UPDATE/DELETE remain available for internal updates and FK cascades.
-- Exclusions: ai_usage_events (audit/usage log), likes and reports (public viewing /
-- moderation records) must retain their existing write semantics. Lore is managed
-- by the RPCs above; project_memory_auto_summary_cursors is checkpoint bookkeeping.
drop trigger if exists trg_00_guard_thread_not_trashed on public.messages;
create trigger trg_00_guard_thread_not_trashed
  before insert on public.messages
  for each row execute function public.guard_thread_not_trashed();
drop trigger if exists trg_00_guard_thread_not_trashed on public.thread_tags;
create trigger trg_00_guard_thread_not_trashed
  before insert on public.thread_tags
  for each row execute function public.guard_thread_not_trashed();
drop trigger if exists trg_00_guard_thread_not_trashed on public.thread_notes;
create trigger trg_00_guard_thread_not_trashed
  before insert on public.thread_notes
  for each row execute function public.guard_thread_not_trashed();
drop trigger if exists trg_00_guard_thread_not_trashed on public.message_notes;
create trigger trg_00_guard_thread_not_trashed
  before insert on public.message_notes
  for each row execute function public.guard_thread_not_trashed();
drop trigger if exists trg_00_guard_thread_not_trashed on public.drafts;
create trigger trg_00_guard_thread_not_trashed
  before insert on public.drafts
  for each row execute function public.guard_thread_not_trashed();

-- Copied verbatim from docs/schema.sql with one predicate added per function.
-- public_threads_view is intentionally unchanged.
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
  where t.is_public = true and t.deleted_at is null;
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
      and t.deleted_at is null
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
      and t.deleted_at is null
      and t.user_id = p_tag_user_id
  );
$$;

revoke all on function public.is_visible_public_thread_tag(uuid, uuid) from public;
grant execute on function public.is_visible_public_thread_tag(uuid, uuid) to anon, authenticated;

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
    and t.deleted_at is null
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
  where t.id = p_thread_id and t.user_id = p_user_id and t.deleted_at is null
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
      and child.deleted_at is null
  )
  where parent.id = p_thread_id
    and parent.is_public = true;
end;
$function$;

revoke execute on function public.recalc_fork_count(uuid) from public, anon;
grant execute on function public.recalc_fork_count(uuid) to authenticated;

commit;
NOTIFY pgrst, 'reload schema';
