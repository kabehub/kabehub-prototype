-- migration_v184_project_memory_topic_rpcs.sql
-- Project Memory Manager（仮） create_project_memory_topic() /
-- update_project_memory_topic() RPC新設。
--
-- 参照:
--   - KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v8（Phase A完了サマリー、
--     §2.2 Update Protocolの設計、§4 実装順）
--   - migration_v182_project_memory_phase_a.sql（projects /
--     project_memory_topics / project_memory_revisions の定義元。
--     topics/revisionsはSELECTのみauthenticatedに許可、write経路はこのRPCに限定）
--   - migration_v179_apply_branch_edit.sql（単一トランザクションRPCの構造・
--     revoke/grant execute の型）
--   - consolidate_dreaming_batch_multi のhardening migration（SECURITY DEFINER
--     ＋auth.uid()所有権検証＋BEGIN/COMMIT+NOTIFYの型）
--   - Claude/ChatGPT設計レビュー（v2→v3、2026-09-08〜09）
--
-- 【ステータス】設計確定（v4）。test環境で実動作テスト中にRETURNING句の
--   ambiguous columnバグを発見・修正済み。本番環境へは未適用。
--   Codex実装指示書と対で使用する。
--
-- 【v1→v2の変更点（ChatGPTレビュー1周目）】
--   1.【修正必須】p_expected_revision / p_edit_kind のNULL明示チェックを追加。
--      SQLの三値論理では `1 <> NULL` はtrueにならず、NULLだと楽観ロック・
--      edit_kind検証の両方をすり抜けるバグがあったため。
--   2.【修正必須】partial一致数の計算方式を string_to_array/array_length から
--      char_length差分方式へ変更（空contentでarray_lengthがNULLを返し、
--      一致数チェックを素通りするバグがあったため）。→ v3でさらにstrpos方式へ。
--   3. create側のUNIQUE違反捕捉を `WHEN unique_violation` から
--      `ON CONFLICT (project_id, topic_key) DO NOTHING` + `IF NOT FOUND` へ変更。
--      (project_id, topic_key) 以外のUNIQUE違反（revision側等）まで
--      「topic already exists」に誤診しないようにするため。
--   4. topic_key はtrim後の値（v_topic_key）をINSERTするよう修正
--      （検証はtrim後・保存は元の値、という不整合があったため）。
--   5. migration本体を BEGIN/COMMIT + NOTIFY pgrst, 'reload schema' で
--      ラップする方針を明記。
--   6. UPDATE文で updated_at を明示SETしない（project_memory_topics_updated_at
--      トリガーに一元化）。
--
-- 【v2→v3の変更点（ChatGPTレビュー2周目）】
--   1. partial編集の一意性判定を、char_length差分による「一致回数」計算から
--      strpos()による「開始位置」ベースの判定へ変更。
--      理由：content_md='aaa', old_text='aa' のような重複可能なケースで、
--      replace()は非オーバーラップ一致を1回と数えるため「一致回数」方式では
--      実際には複数開始位置が存在するケースを見逃し得る。v9設計資料の
--      「old_textが一意に1箇所存在？」という契約を文字通り実装するには
--      開始位置ベースの判定の方が正確。副次的に、空contentでも
--      strpos()は自然に0を返すため、v2で修正した空content回帰バグの
--      再発防止にもなる。
--
-- 【v3→v4の変更点（test環境での実動作テスト中に発見・修正）】
--   1.【修正必須】create_project_memory_topic() の
--      `returning id, created_at into v_topic_id, v_created_at` が
--      `column reference "created_at" is ambiguous` でエラーになるバグを修正。
--      原因：`returns table(..., created_at timestamptz)` で宣言したOUT引数が
--      関数本体内でPL/pgSQLの暗黙変数としてスコープに入るため、RETURNING句内の
--      無修飾`created_at`が「テーブル列」と「OUT引数」のどちらを指すか
--      あいまいになっていた。`insert into ... as t (...) ... returning t.id,
--      t.created_at` のようにテーブルエイリアスで明示することで解消。
--   2.【修正必須】同一原因のバグが update_project_memory_topic() の
--      `returning updated_at into v_updated_at`（OUT引数`updated_at`と衝突）
--      にも潜在していたため、同様にテーブルエイリアスで修正。
--      （実行時点では④のfull update検証で顕在化する前に併せて修正した）
--
-- 【スコープ外として見送った点】
--   - source_refsの要素schema・所有権検証（v9未確定事項。現時点ではjsonb配列
--     であることのみ強制する）
--   - 初期4topic(overview/current-work/principles/references)の一括作成処理
--     （このRPCを使う側＝Phase B/Update Protocol API実装時に対応）
--   - RLS実動作テスト・実動作Acceptance Criteriaの実行そのもの
--     （Codex実装指示書のAcceptance Criteriaとして別途記載、実行はtest環境で
--     手動実施）


-- ============================================================
-- PREFLIGHT（適用前に実行し、出力を確認する。migration本体には含めない）
-- ============================================================
--
-- -- 1. 対象2関数の既存有無・オーバーロード確認
-- --    【適用ゲート】ここで1件でもヒットした場合、シグネチャの衝突・
-- --    PostgRESTのRPC解決の曖昧化リスクがあるため、適用前に内容を確認する。
-- select
--   n.nspname,
--   p.proname,
--   pg_get_function_identity_arguments(p.oid) as args,
--   p.prosecdef
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in (
--     'create_project_memory_topic',
--     'update_project_memory_topic'
--   );
--
-- -- 2. 依存オブジェクトの存在確認（Phase Aが適用済みであることの確認）
-- select to_regclass('public.projects') as projects_exists,
--        to_regclass('public.project_memory_topics') as topics_exists,
--        to_regclass('public.project_memory_revisions') as revisions_exists,
--        to_regprocedure('public.update_updated_at_column()') as trigger_fn_exists;
--
-- -- 3. project_memory_topics_updated_at トリガーの存在確認
-- --    （UPDATE時にupdated_atを明示SETせずこのトリガーに一元化するため）
-- select event_object_table, trigger_name, action_timing, event_manipulation
-- from information_schema.triggers
-- where event_object_table = 'project_memory_topics';


begin;

-- ============================================================
-- create_project_memory_topic
-- ============================================================
create or replace function public.create_project_memory_topic(
  p_user_id uuid,
  p_project_id uuid,
  p_topic_key text,
  p_content_md text default '',
  p_source_refs jsonb default '[]'::jsonb
)
returns table(topic_id uuid, revision int, content_md text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topic_key text;
  v_topic_id uuid;
  v_created_at timestamptz;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  v_topic_key := btrim(coalesce(p_topic_key, ''));
  if v_topic_key = '' then
    raise exception 'topic_key is required' using errcode = 'P0001';
  end if;

  if p_source_refs is null or jsonb_typeof(p_source_refs) is distinct from 'array' then
    raise exception 'source_refs must be a jsonb array' using errcode = 'P0001';
  end if;

  -- SECURITY DEFINERは関数所有者権限で実行されるため実質RLSをバイパスする。
  -- 所有権はここで明示チェックする。
  perform 1 from public.projects p
  where p.id = p_project_id and p.user_id = p_user_id;
  if not found then
    raise exception 'project not found' using errcode = 'P0001';
  end if;

  insert into public.project_memory_topics as t (project_id, topic_key, content_md, revision)
  values (p_project_id, v_topic_key, coalesce(p_content_md, ''), 1)
  on conflict (project_id, topic_key) do nothing
  returning t.id, t.created_at into v_topic_id, v_created_at;

  if not found then
    raise exception 'topic already exists' using errcode = 'P0001';
  end if;

  insert into public.project_memory_revisions (topic_id, revision, content_md, edit_kind, source_refs)
  values (v_topic_id, 1, coalesce(p_content_md, ''), 'full', p_source_refs);

  return query select v_topic_id, 1, coalesce(p_content_md, ''), v_created_at;
end;
$$;

revoke execute on function public.create_project_memory_topic(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_project_memory_topic(uuid, uuid, text, text, jsonb)
  to authenticated;

-- ============================================================
-- update_project_memory_topic
-- ============================================================
create or replace function public.update_project_memory_topic(
  p_user_id uuid,
  p_topic_id uuid,
  p_expected_revision int,
  p_edit_kind text,                    -- 'full' | 'partial'
  p_new_content_md text default null,  -- full編集時に必須
  p_old_text text default null,        -- partial編集時に必須
  p_new_text text default null,        -- partial編集時に必須
  p_source_refs jsonb default '[]'::jsonb
)
returns table(revision int, content_md text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topic record;
  v_new_content text;
  v_next_revision int;
  v_updated_at timestamptz;
  v_first_pos int;
  v_second_pos int;
begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'expected_revision must be a positive integer' using errcode = 'P0001';
  end if;

  if p_edit_kind is null or p_edit_kind not in ('full', 'partial') then
    raise exception 'edit_kind must be full or partial' using errcode = 'P0001';
  end if;

  if p_source_refs is null or jsonb_typeof(p_source_refs) is distinct from 'array' then
    raise exception 'source_refs must be a jsonb array' using errcode = 'P0001';
  end if;

  -- 対象topic行をロック＋所有権確認（SECURITY DEFINERで実質RLSがバイパスされる
  -- ため、projectsとのJOINで所有権を明示チェックする）
  select t.content_md, t.revision
  into v_topic
  from public.project_memory_topics t
  join public.projects p on p.id = t.project_id
  where t.id = p_topic_id and p.user_id = p_user_id
  for update of t;

  if not found then
    raise exception 'topic not found' using errcode = 'P0001';
  end if;

  if v_topic.revision <> p_expected_revision then
    raise exception 'revision conflict' using errcode = 'P0001';
  end if;

  if p_edit_kind = 'full' then
    if p_new_content_md is null then
      raise exception 'new_content_md is required for full edit' using errcode = 'P0001';
    end if;
    v_new_content := p_new_content_md;
  else
    if p_old_text is null or p_old_text = '' or p_new_text is null then
      raise exception 'old_text and new_text are required for partial edit' using errcode = 'P0001';
    end if;

    -- 開始位置ベースの一意性判定（strpos方式）。
    -- 空contentでも自然に0を返すため、char_length差分方式で起きていた
    -- 「空contentへのpartial編集がold_text not foundを検出できない」
    -- 回帰バグを構造的に防ぐ。
    v_first_pos := strpos(v_topic.content_md, p_old_text);

    if v_first_pos = 0 then
      raise exception 'old_text not found' using errcode = 'P0001';
    end if;

    v_second_pos := strpos(
      substring(v_topic.content_md from v_first_pos + 1),
      p_old_text
    );

    if v_second_pos > 0 then
      raise exception 'old_text not unique' using errcode = 'P0001';
    end if;

    v_new_content := replace(v_topic.content_md, p_old_text, p_new_text);
  end if;

  v_next_revision := v_topic.revision + 1;

  -- updated_atは project_memory_topics_updated_at トリガー（Phase Aで作成済み）
  -- に一元化するため、ここでは明示SETしない。
  update public.project_memory_topics as t
  set content_md = v_new_content,
      revision = v_next_revision
  where t.id = p_topic_id
  returning t.updated_at into v_updated_at;

  insert into public.project_memory_revisions (topic_id, revision, content_md, edit_kind, source_refs)
  values (p_topic_id, v_next_revision, v_new_content, p_edit_kind, p_source_refs);

  return query select v_next_revision, v_new_content, v_updated_at;
end;
$$;

revoke execute on function public.update_project_memory_topic(uuid, uuid, int, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_project_memory_topic(uuid, uuid, int, text, text, text, text, jsonb)
  to authenticated;

commit;

notify pgrst, 'reload schema';


-- ============================================================
-- POSTFLIGHT（適用後に実行し、出力を確認する。migration本体には含めない）
-- ============================================================
--
-- -- 1. 構造確認：シグネチャ・SECURITY DEFINER・search_path固定
-- select
--   n.nspname,
--   p.proname,
--   pg_get_function_identity_arguments(p.oid) as args,
--   p.prosecdef,
--   p.proconfig
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in (
--     'create_project_memory_topic',
--     'update_project_memory_topic'
--   )
-- order by p.proname;
-- -- 期待値：各1行のみ（オーバーロードなし）、prosecdef = true、
-- -- proconfig に search_path=''相当のエントリが含まれること。
--
-- -- 2. EXECUTE権限確認
-- select
--   routine_name,
--   grantee,
--   privilege_type
-- from information_schema.role_routine_grants
-- where routine_schema = 'public'
--   and routine_name in (
--     'create_project_memory_topic',
--     'update_project_memory_topic'
--   )
-- order by routine_name, grantee;
-- -- 期待値：authenticated = EXECUTE あり、anon / PUBLIC = なし
--
-- -- 3. topics/revisionsテーブルの直接write権限が変化していないことの確認
-- --   （Phase Aの契約＝SELECTのみ、が今回のRPC追加で崩れていないこと）
-- select table_name, grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_name in ('project_memory_topics', 'project_memory_revisions')
--   and grantee in ('anon', 'authenticated')
-- order by table_name, grantee, privilege_type;
--
-- -- 【実動作テストはPOSTFLIGHTと分離し、test環境の一時ユーザー/projectで
-- --  別途実施する。Codex実装指示書のAcceptance Criteriaを参照】