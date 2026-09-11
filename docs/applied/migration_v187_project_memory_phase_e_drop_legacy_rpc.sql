-- migration_v187_project_memory_phase_e_drop_legacy_rpc.sql
-- Project Memory Manager Phase E-1:
-- project_id版へのread path移行後に未使用となったfolder_name版Lore検索RPCを削除する。

begin;

drop function if exists public.match_lore_embeddings(vector, text, uuid, integer);
drop function if exists public.match_lore_embeddings_v2(vector, uuid, text, integer, double precision);
drop function if exists public.match_lore_embeddings_v2(vector, text, uuid, integer, double precision, text[], text[]);

commit;

notify pgrst, 'reload schema';

-- POSTFLIGHT（3列すべてtrueであること）
-- select
--   to_regprocedure('public.match_lore_embeddings(vector,text,uuid,integer)') is null
--     as match_lore_embeddings_dropped,
--   to_regprocedure('public.match_lore_embeddings_v2(vector,uuid,text,integer,double precision)') is null
--     as match_lore_embeddings_v2_scored_dropped,
--   to_regprocedure('public.match_lore_embeddings_v2(vector,text,uuid,integer,double precision,text[],text[])') is null
--     as match_lore_embeddings_v2_filtered_dropped;
