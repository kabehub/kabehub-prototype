-- migration_v178_restore_message_branch.sql
-- MF-6a: 分岐復元の非active化とactive化を単一トランザクションRPCへ移す。
-- 適用: テスト環境・本番環境ともに適用済み（MH-1時点）。

begin;

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

commit;

notify pgrst, 'reload schema';
