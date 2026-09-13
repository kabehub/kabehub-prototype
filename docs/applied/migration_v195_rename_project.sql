begin;

create or replace function public.rename_project(
  p_user_id uuid,
  p_project_id uuid,
  p_new_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_name text;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  v_new_name := btrim(coalesce(p_new_name, ''));
  if v_new_name = '' then
    raise exception 'name is required' using errcode = 'P0001';
  end if;

  -- Project行をロックしつつ所有権確認する（delete RPCと同じ規約）
  perform 1 from public.projects p
  where p.id = p_project_id and p.user_id = p_user_id
  for update;
  if not found then
    raise exception 'project not found' using errcode = 'P0001';
  end if;

  update public.projects
  set name = v_new_name
  where id = p_project_id and user_id = p_user_id;

  update public.project_settings
  set folder_name = v_new_name
  where project_id = p_project_id and user_id = p_user_id;

  -- novel_settingsはthreads経由でJOINし、project_id一致の行だけ更新
  update public.novel_settings ns
  set folder_name = v_new_name
  from public.threads t
  where ns.thread_id = t.id
    and ns.user_id = p_user_id
    and t.user_id = p_user_id
    and t.project_id = p_project_id;

  -- 双方向不変条件（project_id非NULLの間はfolder_nameが現在名と一致）を維持
  update public.threads
  set folder_name = v_new_name
  where project_id = p_project_id and user_id = p_user_id;

  update public.lore_embeddings
  set folder_name = v_new_name
  where project_id = p_project_id and user_id = p_user_id;

  return v_new_name;
end;
$$;

revoke execute on function public.rename_project(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.rename_project(uuid, uuid, text)
  to authenticated;

commit;

notify pgrst, 'reload schema';
