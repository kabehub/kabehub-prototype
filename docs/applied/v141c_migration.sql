-- v141-C: liked_ai を Dreaming 保護対象に追加
-- Supabase Dashboard > SQL Editor で以下を順番に実行すること

-- Step 1: RPC 存在確認
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('find_similar_lore_pairs_v2', 'consolidate_dreaming_batch', 'consolidate_dreaming_batch_multi');

-- Step 2: 各 RPC の現在の定義を取得（コピーして Step 3-5 で修正）
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'find_similar_lore_pairs_v2';
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'consolidate_dreaming_batch';
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'consolidate_dreaming_batch_multi';

-- Step 3: find_similar_lore_pairs_v2 の修正
-- 取得した定義内の以下の行を変更して CREATE OR REPLACE FUNCTION として実行:
--   変更前: AND a.extraction_version NOT IN ('user_edited', 'user_created')
--   変更後: AND a.extraction_version NOT IN ('user_edited', 'user_created', 'liked_ai')

-- Step 4: consolidate_dreaming_batch の修正
-- 取得した定義内の以下の行を変更して CREATE OR REPLACE FUNCTION として実行:
--   変更前: IF v_source.extraction_version IN ('user_edited', 'user_created') THEN
--   変更後: IF v_source.extraction_version IN ('user_edited', 'user_created', 'liked_ai') THEN

-- Step 5: consolidate_dreaming_batch_multi が存在する場合も同様に修正
-- （Step 1 の確認で存在した場合のみ）

-- Step 6: スキーマキャッシュをリフレッシュ（必須）
NOTIFY pgrst, 'reload schema';
