begin;

-- KabeHub folder_name統一 Phase 5C Contract。
-- v198適用・検証完了後にのみ適用する。

-- PRE-FLIGHT: 旧RPCの実測シグネチャが3本とも存在することをfail-closedで確認する。
do $$
begin
  if to_regprocedure(
    'public.consolidate_dreaming_batch(uuid,uuid,uuid,text,vector,text,text,text,double precision,double precision)'
  ) is null then
    raise exception 'legacy function consolidate_dreaming_batch is missing';
  end if;

  if to_regprocedure(
    'public.consolidate_dreaming_batch_multi(uuid,uuid[],text,vector,text,text,text,double precision,double precision)'
  ) is null then
    raise exception 'legacy function consolidate_dreaming_batch_multi is missing';
  end if;

  if to_regprocedure(
    'public.merge_user_edited_lore_pair(uuid,uuid,uuid,text,vector,text,text)'
  ) is null then
    raise exception 'legacy function merge_user_edited_lore_pair is missing';
  end if;
end;
$$;

drop function public.consolidate_dreaming_batch(
  uuid, uuid, uuid, text, vector, text, text, text,
  double precision, double precision
);
drop function public.consolidate_dreaming_batch_multi(
  uuid, uuid[], text, vector, text, text, text,
  double precision, double precision
);
drop function public.merge_user_edited_lore_pair(
  uuid, uuid, uuid, text, vector, text, text
);

drop index if exists public.idx_lore_embeddings_user_folder;

alter table public.lore_embeddings drop column folder_name;

commit;

notify pgrst, 'reload schema';
