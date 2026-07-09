-- v126: find_similar_lore_pairs（無印版）にliked_ai/liked_ai_cleaned保護を追加
-- 背景: app/api/lore/consolidate/candidates/route.ts から現役で呼ばれているRPC。
--       find_similar_lore_pairs_v2・consolidate_dreaming_batch（両シグネチャ）・
--       consolidate_dreaming_batch_multi は全てliked_ai系を保護済みだが、
--       この関数だけ保護が漏れていた。
-- 影響: アプリコード（candidates/route.ts）は無改修で動作する
--       （シグネチャ・返却列は不変。WHERE句のみ変更）
-- 追加改善: dismiss照合をfind_similar_lore_pairs_v2と同じleast/greatest正規化に統一
--       （a.id < b.idのjoin条件により従来のa.id=lore_id_a/b.id=lore_id_bでも
--       結果は同じだが、将来の呼び出し元変更に対しても壊れにくい書き方にする）

begin;

create or replace function find_similar_lore_pairs(
  p_user_id uuid,
  p_folder_name text default null::text,
  p_threshold double precision default 0.88,
  p_limit integer default 20
)
returns table(
  id_a uuid, id_b uuid, chunk_text_a text, chunk_text_b text,
  memory_kind_a text, memory_kind_b text, temporal_status_a text, temporal_status_b text,
  created_at_a timestamptz, created_at_b timestamptz,
  last_confirmed_at_a timestamptz, last_confirmed_at_b timestamptz,
  similarity double precision
)
language sql
as $$
  select
    a.id, b.id, a.chunk_text, b.chunk_text,
    a.memory_kind, b.memory_kind, a.temporal_status, b.temporal_status,
    a.created_at, b.created_at, a.last_confirmed_at, b.last_confirmed_at,
    1 - (a.embedding <=> b.embedding) as similarity
  from lore_embeddings a
  join lore_embeddings b on a.id < b.id
  where a.user_id = p_user_id
    and b.user_id = p_user_id
    and (p_folder_name is null or a.folder_name = p_folder_name)
    and (p_folder_name is null or b.folder_name = p_folder_name)
    and a.is_archived = false
    and b.is_archived = false
    and a.superseded_by is null
    and b.superseded_by is null
    and a.is_pinned = false
    and b.is_pinned = false
    and a.embedding is not null
    and b.embedding is not null
    and coalesce(a.extraction_version, '') not in ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned')
    and coalesce(b.extraction_version, '') not in ('user_edited', 'user_created', 'liked_ai', 'liked_ai_cleaned')
    and a.memory_kind = b.memory_kind
    and 1 - (a.embedding <=> b.embedding) >= p_threshold
    and not exists (
      select 1 from lore_consolidation_dismissals d
      where d.user_id = p_user_id
        and d.lore_id_a = least(a.id, b.id)
        and d.lore_id_b = greatest(a.id, b.id)
    )
  order by similarity desc
  limit p_limit;
$$;

commit;

notify pgrst, 'reload schema';
