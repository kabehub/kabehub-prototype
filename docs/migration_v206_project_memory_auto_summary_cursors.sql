-- v206: 自動要約の消費位置をtopic本文・revision履歴から独立して保持する。
-- Ruiが手動適用する。CodexはDB適用・実環境検証を実行しない。
-- 初回適用前確認（table/functionともNULLを期待。再適用時は適用後確認）:
-- select to_regclass('public.project_memory_auto_summary_cursors') as cursor_table,
--   to_regprocedure('public.advance_project_memory_auto_summary_cursors(uuid,uuid,integer,jsonb)') as cursor_rpc;
-- 適用後確認:
-- select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname = 'project_memory_auto_summary_cursors';
-- 期待値: 1行、relrowsecurity=true。
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
-- where table_schema = 'public' and table_name = 'project_memory_auto_summary_cursors' order by ordinal_position;
-- 期待値: topic_id/thread_id/message_id uuid、message_created_at/updated_at timestamptz、全列NOT NULL、updated_at default now()。user_idなし。
-- select conname, pg_get_constraintdef(oid) from pg_constraint
-- where conrelid = 'public.project_memory_auto_summary_cursors'::regclass;
-- 期待値: PK(topic_id,thread_id)、topic/threadのFK ON DELETE CASCADE、message_idのFKなし。
-- select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'project_memory_auto_summary_cursors';
-- 期待値: PK indexとidx_project_memory_auto_summary_cursors_thread(thread_id)。
-- select policyname, cmd, qual from pg_policies where schemaname = 'public' and tablename = 'project_memory_auto_summary_cursors';
-- 期待値: SELECT policy 1本、topic経由でt.user_id=auth.uid()。
-- select has_table_privilege('authenticated', 'public.project_memory_auto_summary_cursors', 'SELECT') as select_ok,
--   has_table_privilege('authenticated', 'public.project_memory_auto_summary_cursors', 'INSERT,UPDATE,DELETE') as write_ok,
--   has_table_privilege('anon', 'public.project_memory_auto_summary_cursors', 'SELECT') as anon_ok;
-- 期待値: select_ok=true、write_ok=false、anon_ok=false。
-- select pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as result, p.prosecdef, p.proconfig,
--   has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_ok,
--   has_function_privilege('anon', p.oid, 'EXECUTE') as anon_ok
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'advance_project_memory_auto_summary_cursors';
-- 期待値: p_user_id uuid, p_topic_id uuid, p_expected_revision integer, p_cursors jsonb;
-- result=integer、prosecdef=true、proconfigにsearch_path=""、authenticated_ok=true、anon_ok=false。
-- ロールバック（カーソル状態は失われる。本文・revision履歴は変わらない）:
-- drop function if exists public.advance_project_memory_auto_summary_cursors(uuid, uuid, integer, jsonb);
-- drop table if exists public.project_memory_auto_summary_cursors;
-- notify pgrst, 'reload schema';
begin;

create table if not exists public.project_memory_auto_summary_cursors (
  topic_id uuid not null references public.project_memory_topics(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  message_id uuid not null,
  message_created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (topic_id, thread_id)
);
create index if not exists idx_project_memory_auto_summary_cursors_thread
  on public.project_memory_auto_summary_cursors(thread_id);
alter table public.project_memory_auto_summary_cursors enable row level security;
drop policy if exists "project_memory_auto_summary_cursors: select own" on public.project_memory_auto_summary_cursors;
create policy "project_memory_auto_summary_cursors: select own"
  on public.project_memory_auto_summary_cursors for select
  using (exists (
    select 1 from public.project_memory_topics t
    where t.id = project_memory_auto_summary_cursors.topic_id and t.user_id = auth.uid()
  ));
revoke all on table public.project_memory_auto_summary_cursors from anon, authenticated;
grant select on table public.project_memory_auto_summary_cursors to authenticated;

drop function if exists public.advance_project_memory_auto_summary_cursors(uuid, uuid, integer, jsonb);
create or replace function public.advance_project_memory_auto_summary_cursors(
  p_user_id uuid,
  p_topic_id uuid,
  p_expected_revision integer,
  p_cursors jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- lib/project-memory/auto-summary-limits.ts: MAX_AUTO_SUMMARY_THREADS
  c_max constant integer := 100;
  v_element jsonb;
  v_thread_ids uuid[];
  v_topic record;
  v_candidate record;
  v_advanced integer := 0;
  v_changed integer;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'expected_revision must be a positive integer' using errcode = 'P0001';
  end if;
  if p_cursors is null or jsonb_typeof(p_cursors) is distinct from 'array' then
    raise exception 'cursors must be a jsonb array' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_cursors) = 0 or jsonb_array_length(p_cursors) > c_max then
    raise exception 'cursors must contain 1 to 100 items' using errcode = 'P0001';
  end if;
  for v_element in select value from jsonb_array_elements(p_cursors)
  loop
    if jsonb_typeof(v_element) is distinct from 'object'
       or jsonb_typeof(v_element->'thread_id') is distinct from 'string'
       or (v_element->>'thread_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_element->'message_id') is distinct from 'string'
       or (v_element->>'message_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then
      raise exception 'invalid cursor element' using errcode = 'P0001';
    end if;
  end loop;
  select array_agg((value->>'thread_id')::uuid) into v_thread_ids
  from jsonb_array_elements(p_cursors);
  if cardinality(v_thread_ids) <> (select count(distinct id) from unnest(v_thread_ids) as ids(id)) then
    raise exception 'duplicate thread_id' using errcode = 'P0001';
  end if;

  -- このtopic行ロックはtransaction終了まで保持する。本文・履歴は書き換えない。
  select t.project_id, t.revision into v_topic
  from public.project_memory_topics t
  where t.id = p_topic_id and t.user_id = p_user_id
  for update;
  if not found or v_topic.project_id is null then
    raise exception 'topic not found' using errcode = 'P0001';
  end if;
  if v_topic.revision <> p_expected_revision then
    raise exception 'revision conflict' using errcode = 'P0001';
  end if;

  -- 不適格候補はJOINで除外。is_activeはpreview時の条件であり再検証しない。
  for v_candidate in
    select th.id as thread_id, m.id as message_id, m.created_at as message_created_at
    from jsonb_array_elements(p_cursors) as elements(value)
    join public.threads th on th.id = (value->>'thread_id')::uuid
      and th.user_id = p_user_id and th.project_id = v_topic.project_id
    join public.messages m on m.id = (value->>'message_id')::uuid
      and m.thread_id = th.id and m.user_id = p_user_id and m.role = 'user'
      and m.provider not in ('memo', 'image_gen')
    order by th.id
  loop
    insert into public.project_memory_auto_summary_cursors as current_cursor
      (topic_id, thread_id, message_id, message_created_at)
    values (p_topic_id, v_candidate.thread_id, v_candidate.message_id, v_candidate.message_created_at)
    on conflict (topic_id, thread_id) do update
      set message_id = excluded.message_id,
          message_created_at = excluded.message_created_at,
          updated_at = now()
      where (excluded.message_created_at, excluded.message_id)
        > (current_cursor.message_created_at, current_cursor.message_id);
    get diagnostics v_changed = row_count;
    v_advanced := v_advanced + v_changed;
  end loop;
  -- 戻り値は診断用。呼び出し側は正否判定に使わず、RPCのエラー有無で判断する。
  return v_advanced;
end;
$$;
revoke execute on function public.advance_project_memory_auto_summary_cursors(uuid, uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.advance_project_memory_auto_summary_cursors(uuid, uuid, integer, jsonb)
  to authenticated;
commit;
notify pgrst, 'reload schema';
