-- migration_v182_project_memory_phase_a_DRAFT_v5.sql
-- Project Memory Manager（仮）Phase A: projects / project_memory_topics /
-- project_memory_revisions の新設と、既存3テーブル（threads / folder_settings /
-- lore_embeddings）への project_id カラム追加（nullable・段階移行）。
--
-- 参照: KabeHub_Project_Memory_Manager_設計検討_引き継ぎ資料_v7 §2.1・2.6・2.7・3
--       + ChatGPTレビュー2周（2026-09-08）
--
-- 【ステータス】DRAFT v5 — ChatGPTレビュー3周目（文言修正のみ）反映済み。DB未適用。
--   Codex実装指示書化の直前段階。
--
-- 【v3→v4の変更点（ChatGPTレビュー2周目反映）】
--   1.【修正必須】projects にもACL制限を追加。RLSはTRUNCATE等のテーブルレベル
--      操作を制御しないため、project_memory_topics/revisionsと同様
--      `revoke all ... / grant select, insert ...` で契約をSQL privilegeでも
--      固定する（ai_usage_events precedentと同型）。
--   2.【修正必須】再実行安全性を確保。今回新規に作る全policy名・trigger名について、
--      CREATE直前に対応する DROP POLICY IF EXISTS / DROP TRIGGER IF EXISTS を
--      追加した（migration_v176のtrigger再作成パターンに準拠）。
--   3. Preflight/Postflight検証クエリを追加（migration本体＝begin/commitの外側、
--      運用者が適用前後に手動実行して出力を確認する想定）。
--   4. UNIQUE(user_id, name)がuser_id左端のindexを兼ねるため、idx_projects_userを削除
--      （topics/revisionsで単独indexを削除したのと同じ理由）。
--
-- 【v4→v5の変更点（ChatGPTレビュー3周目・文言修正のみ、設計変更なし）】
--   1. postflightのcross-userテストコメントを訂正：USING通過後にWITH CHECKで
--      失敗した場合は「0 rows updated」ではなく「RLSエラーでコマンド全体がabort」
--      が正しい（PostgreSQL公式仕様どおり）。
--   2. preflightのpolicy名一致確認を、単なる参考出力から「想定外policyが1本でも
--      あればSTOPする適用ゲート」に格上げ。
--   3. postflightのACLコメントを「projects=SELECT/INSERT、
--      project_memory_topics/revisions=SELECTのみ」に正確化。
--
-- 【スコープ外として見送った点】
--   - RLSの実動作テスト（User AがUser Bのproject_idをUPDATEしてRLS拒否されるか）は
--     migration本体に含めない。Codex実装指示書のAcceptance Criteriaに別途記載する。
--   - RLS policyのstyle統一（`to authenticated` + `(select auth.uid())`最適化）は
--     別チケット。
--
-- 【次ステップ用メモ】
--   apply_branch_edit は security invoker だが、次に作る
--   create_project_memory_topic() / update_project_memory_topic() は
--   security definer にする（consolidate_dreaming_batch_multi と同じ形）。
--   auth.uid()所有権検証・EXECUTE revoke/grant・対象行FOR UPDATEをセットで持つ。
--   v7 §2.2に一行追記すること。


-- ============================================================
-- PREFLIGHT（適用前に実行し、出力を確認する。migration本体には含めない）
-- ============================================================
--
-- -- 3新規テーブルの不存在確認（初回適用時は全てnullのはず。再実行時は非nullで問題ない）
-- select to_regclass('public.projects') as projects_exists,
--        to_regclass('public.project_memory_topics') as topics_exists,
--        to_regclass('public.project_memory_revisions') as revisions_exists;
--
-- -- 既存3テーブルのproject_idカラム不存在確認（初回のみ想定どおりゼロ件のはず）
-- select table_name, column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in ('threads', 'folder_settings', 'lore_embeddings')
--   and column_name = 'project_id';
--
-- -- 現在のpolicy名一覧（threads/folder_settings/lore_embeddings）
-- -- 【適用ゲート】ここで得られる名前が、下記migration本体のDROP POLICY対象と
-- -- 完全に一致することを確認する。想定外のpolicyが1本でも存在した場合は
-- -- migrationを適用せず、差異を調査する（canonicalから消えた旧policyがDBに
-- -- 残存し、複数policyがOR結合されて緩い方が有効になる、という過去事故と
-- -- 同種のリスクがあるため、参考出力ではなく適用ゲートとして扱う）。
-- select schemaname, tablename, policyname, cmd
-- from pg_policies
-- where tablename in ('threads', 'folder_settings', 'lore_embeddings')
-- order by tablename, cmd;
--
-- -- update_updated_at_column() 関数の存在確認
-- select to_regprocedure('public.update_updated_at_column()');


begin;

-- ============================================================
-- projects テーブル
-- ============================================================
create table if not exists projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Phase B backfillの冪等性・folder_name→projects.id JOINの一意性確保
  constraint projects_user_name_unique unique (user_id, name)
);
-- (4) UNIQUE(user_id, name)がuser_id単独検索にも使えるため、
--     idx_projects_user は追加しない。

alter table projects enable row level security;

-- (2) 再実行安全化：新規に作る2 policyともCREATE直前にDROP IF EXISTS
drop policy if exists "projects: select own" on projects;
create policy "projects: select own"
  on projects for select
  using (auth.uid() = user_id);

drop policy if exists "projects: insert own" on projects;
create policy "projects: insert own"
  on projects for insert
  with check (auth.uid() = user_id);

-- UPDATE/DELETE policyは意図的に作らない。
-- rename・削除はPhase D以降の専用RPC（security definer）まではDBレベルでも不可。

-- (1) ACLでも契約を固定する（ai_usage_events precedentと同型）
revoke all on table projects from anon, authenticated;
grant select, insert on table projects to authenticated;

drop trigger if exists projects_updated_at on projects;
create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at_column();
-- ↑ 現時点でUPDATE policy・ACLがないためuser経由では発火しないが、将来のrename RPC
--   （security definer）から呼ばれた際にそのまま機能するよう定義だけ先に置く。

-- ============================================================
-- project_memory_topics テーブル
-- ============================================================
create table if not exists project_memory_topics (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  topic_key  text not null,
  content_md text not null default '',
  revision   integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_memory_topics_revision_positive check (revision >= 1),
  constraint project_memory_topics_project_topic_unique unique (project_id, topic_key)
);
-- UNIQUE(project_id, topic_key)がproject_id単独検索にも使えるため、単独indexは追加しない。

alter table project_memory_topics enable row level security;

drop policy if exists "project_memory_topics: select own" on project_memory_topics;
create policy "project_memory_topics: select own"
  on project_memory_topics for select
  using (
    exists (
      select 1 from projects p
      where p.id = project_memory_topics.project_id
        and p.user_id = auth.uid()
    )
  );
-- INSERT/UPDATE/DELETEはpolicyを作らない（＝RLS有効テーブルでpolicyが無いコマンドは
-- 全行拒否）。書き込みは将来のcreate/update_project_memory_topic()（security definer）
-- 経由のみとする。

revoke all on table project_memory_topics from anon, authenticated;
grant select on table project_memory_topics to authenticated;

drop trigger if exists project_memory_topics_updated_at on project_memory_topics;
create trigger project_memory_topics_updated_at
  before update on project_memory_topics
  for each row execute function update_updated_at_column();
-- ↑ 将来のupdate_project_memory_topic()（security definer）から呼ばれる前提。

-- ============================================================
-- project_memory_revisions テーブル
-- ============================================================
create table if not exists project_memory_revisions (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references project_memory_topics(id) on delete cascade,
  revision    integer not null,
  content_md  text not null,
  edit_kind   text not null,
  source_refs jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  constraint project_memory_revisions_edit_kind_check
    check (edit_kind in ('partial', 'full')),
  constraint project_memory_revisions_revision_positive check (revision >= 1),
  constraint project_memory_revisions_source_refs_is_array
    check (jsonb_typeof(source_refs) = 'array'),
  constraint project_memory_revisions_topic_revision_unique unique (topic_id, revision)
);
-- UNIQUE(topic_id, revision)がtopic_id単独検索にも使えるため、単独indexは追加しない。

alter table project_memory_revisions enable row level security;

drop policy if exists "project_memory_revisions: select own" on project_memory_revisions;
create policy "project_memory_revisions: select own"
  on project_memory_revisions for select
  using (
    exists (
      select 1 from project_memory_topics t
      join projects p on p.id = t.project_id
      where t.id = project_memory_revisions.topic_id
        and p.user_id = auth.uid()
    )
  );
-- INSERTもpolicyを作らずRPC専用にする（revisionはUPDATE/DELETE不可の監査証跡）。

revoke all on table project_memory_revisions from anon, authenticated;
grant select on table project_memory_revisions to authenticated;

-- ============================================================
-- 既存3テーブルへの project_id カラム追加（nullable・段階移行）
-- ============================================================

alter table threads
  add column if not exists project_id uuid references projects(id);

alter table folder_settings
  add column if not exists project_id uuid references projects(id);

alter table lore_embeddings
  add column if not exists project_id uuid references projects(id);

create index if not exists idx_threads_project on threads(project_id);
create index if not exists idx_folder_settings_project on folder_settings(project_id);
create index if not exists idx_lore_embeddings_project on lore_embeddings(project_id);

-- ============================================================
-- cross-user project_id 防止のRLS更新
-- ============================================================

-- --- folder_settings -------------------------------------------------
-- 既存は "自分のフォルダ設定のみ操作可" という単一FOR ALL policy
-- （確認済み：using/with check ともに auth.uid() = user_id のみ）。
-- lore_embeddingsと同じ4分割スタイルに揃えつつ、insert/updateにproject所有権
-- チェックを追加する。
drop policy if exists "自分のフォルダ設定のみ操作可" on folder_settings;

drop policy if exists "folder_settings: select own" on folder_settings;
create policy "folder_settings: select own"
  on folder_settings for select
  using (auth.uid() = user_id);

drop policy if exists "folder_settings: insert own" on folder_settings;
create policy "folder_settings: insert own"
  on folder_settings for insert
  with check (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (
        select 1 from projects p
        where p.id = folder_settings.project_id
          and p.user_id = auth.uid()
      )
    )
  );

drop policy if exists "folder_settings: update own" on folder_settings;
create policy "folder_settings: update own"
  on folder_settings for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (
        select 1 from projects p
        where p.id = folder_settings.project_id
          and p.user_id = auth.uid()
      )
    )
  );

drop policy if exists "folder_settings: delete own" on folder_settings;
create policy "folder_settings: delete own"
  on folder_settings for delete
  using (auth.uid() = user_id);

-- --- lore_embeddings ---------------------------------------------------
-- 既存の select/insert/update/delete own を確認済み（select/deleteは変更不要、
-- かつ既にDROP→CREATE方式で管理されているためそのまま踏襲）。
-- insert/updateのwith checkにproject所有権チェックを追加する形でrecreate。
drop policy if exists "lore_embeddings: insert own" on lore_embeddings;
create policy "lore_embeddings: insert own"
  on lore_embeddings for insert
  with check (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (
        select 1 from projects p
        where p.id = lore_embeddings.project_id
          and p.user_id = auth.uid()
      )
    )
  );

drop policy if exists "lore_embeddings: update own" on lore_embeddings;
create policy "lore_embeddings: update own"
  on lore_embeddings for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (
        select 1 from projects p
        where p.id = lore_embeddings.project_id
          and p.user_id = auth.uid()
      )
    )
  );

-- --- threads -------------------------------------------------------
-- 確認済み：既存は "Users can manage own threads" という単一FOR ALL policy
-- （using/with check ともに auth.uid() = user_id のみ）。folder_settingsと
-- 同じ4分割スタイルで再作成し、insert/updateにproject所有権チェックを追加する。
drop policy if exists "Users can manage own threads" on threads;

drop policy if exists "threads: select own" on threads;
create policy "threads: select own"
  on threads for select
  using (auth.uid() = user_id);

drop policy if exists "threads: insert own" on threads;
create policy "threads: insert own"
  on threads for insert
  with check (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (
        select 1 from projects p
        where p.id = threads.project_id
          and p.user_id = auth.uid()
      )
    )
  );

drop policy if exists "threads: update own" on threads;
create policy "threads: update own"
  on threads for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (
        select 1 from projects p
        where p.id = threads.project_id
          and p.user_id = auth.uid()
      )
    )
  );

drop policy if exists "threads: delete own" on threads;
create policy "threads: delete own"
  on threads for delete
  using (auth.uid() = user_id);

-- 【注記】threadsの公開スレッド読み取りは既存どおり
-- get_public_threads_projection() 等のSECURITY DEFINER関数経由（B-01対応）で
-- 行われており、上記RLS分割はその経路に影響しない。

commit;


-- ============================================================
-- POSTFLIGHT（適用後に実行し、出力を確認する。migration本体には含めない）
-- ============================================================
--
-- -- 3新規テーブルの列・nullability・default
-- select table_name, column_name, is_nullable, column_default, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in ('projects', 'project_memory_topics', 'project_memory_revisions')
-- order by table_name, ordinal_position;
--
-- -- CHECK/UNIQUE制約
-- select conrelid::regclass as table_name, conname, contype, pg_get_constraintdef(oid) as definition
-- from pg_constraint
-- where conrelid::regclass::text in ('projects', 'project_memory_topics', 'project_memory_revisions')
-- order by table_name, conname;
--
-- -- 既存3テーブルのproject_id列とFKのdelete action（RESTRICT/NO ACTIONになっているか）
-- select tc.table_name, kcu.column_name, rc.delete_rule
-- from information_schema.table_constraints tc
-- join information_schema.key_column_usage kcu
--   on tc.constraint_name = kcu.constraint_name
-- join information_schema.referential_constraints rc
--   on tc.constraint_name = rc.constraint_name
-- where tc.table_name in ('threads', 'folder_settings', 'lore_embeddings')
--   and kcu.column_name = 'project_id';
--
-- -- index一覧（idx_projects_userが存在しないこと、重複indexがないことを確認）
-- select tablename, indexname, indexdef
-- from pg_indexes
-- where tablename in ('projects', 'project_memory_topics', 'project_memory_revisions',
--                      'threads', 'folder_settings', 'lore_embeddings')
-- order by tablename, indexname;
--
-- -- policy一覧（本文で意図したものだけが存在し、旧policyが残っていないこと）
-- select schemaname, tablename, policyname, cmd, qual, with_check
-- from pg_policies
-- where tablename in ('projects', 'project_memory_topics', 'project_memory_revisions',
--                      'threads', 'folder_settings', 'lore_embeddings')
-- order by tablename, cmd;
--
-- -- ACL（projects = SELECT/INSERT、project_memory_topics/revisions = SELECTのみ、
-- -- になっているか）
-- select table_name, grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_name in ('projects', 'project_memory_topics', 'project_memory_revisions')
--   and grantee in ('anon', 'authenticated')
-- order by table_name, grantee, privilege_type;
--
-- -- trigger一覧
-- select event_object_table, trigger_name, action_timing, event_manipulation
-- from information_schema.triggers
-- where event_object_table in ('projects', 'project_memory_topics')
-- order by event_object_table;
--
-- -- 【推奨・別途テスト環境で実施】cross-user project_id防止のRLS実動作テスト
-- -- User AのセッションでUser A所有のthreadに対し、project_idをUser Bの
-- -- projects.idにUPDATEしようとする。
-- -- 期待結果：USING (auth.uid() = user_id) 自体は通過するが、更新後の行が
-- -- WITH CHECKに失敗するため、0 rows updatedではなくRLSエラーでコマンド全体が
-- -- abortされる。あわせて元のproject_idが変更されていないことを確認する。
-- -- INSERTについても同様（User Aのuser_id＋User Bのproject_idでRLSエラー）。
-- -- migration本体には含めず、Codex実装指示書のAcceptance Criteriaに記載する。
