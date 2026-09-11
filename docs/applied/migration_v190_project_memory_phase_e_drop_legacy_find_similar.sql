-- migration_v190_project_memory_phase_e_drop_legacy_find_similar.sql
-- Project Memory Manager Phase E-2:
-- project_id版への切り替え後に不要となった旧folder_name版の類似Loreペア検索RPCを削除する。

begin;

drop function if exists public.find_similar_lore_pairs(uuid, text, double precision, integer);
drop function if exists public.find_similar_lore_pairs_v2(uuid, double precision, integer, integer, text);

commit;

notify pgrst, 'reload schema';

-- POSTFLIGHT（2列ともtrueであること）
-- select
--   to_regprocedure('public.find_similar_lore_pairs(uuid,text,double precision,integer)') is null
--     as find_similar_lore_pairs_dropped,
--   to_regprocedure('public.find_similar_lore_pairs_v2(uuid,double precision,integer,integer,text)') is null
--     as find_similar_lore_pairs_v2_dropped;
