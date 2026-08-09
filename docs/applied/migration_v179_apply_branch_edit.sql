-- migration_v179_apply_branch_edit.sql
-- MF-6b: chat/route.ts branch edit機能のarchive UPDATE・branch_index採番・
-- message_number採番・new user INSERTを単一トランザクションRPCへ移す。
-- 適用: テスト環境・本番環境ともに適用済み（MH-1時点）。
-- 契約変更: base message不存在は従来Routeの404からP0001経由の400へ変更する。
-- handleEditAndRegenerateはres.okのみを判定しており、git grepでもstatus依存はないため実害はない。

begin;

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

commit;
