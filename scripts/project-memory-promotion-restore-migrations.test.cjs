const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("docs/applied/migration_v203_project_memory_promotion_restore.sql");
const schema = read("docs/schema.sql");
const normalize = (sql) => sql.replace(/--[^\r\n]*/g, " ").replace(/\s+/g, " ").trim();
const extract = (sql, name) => {
  const match = sql.match(new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?` +
    `grant execute on function public\\.${name}\\([\\s\\S]*?to authenticated;`,
  ));
  assert.ok(match, `${name} definition and grants must exist`);
  return normalize(match[0]);
};

const name = "restore_archived_project_memory_promotion";
const restore = extract(migration, name);
assert.equal(extract(schema, name), restore, "canonical restore RPC and v203 must match");
assert.equal((schema.match(/create or replace function public\.restore_archived_project_memory_promotion\(/g) ?? []).length, 1);
assert.match(normalize(migration), /^begin; create or replace function[\s\S]*commit; notify pgrst, 'reload schema';$/);
assert.match(restore, /p_user_id uuid, p_topic_id uuid, p_expected_revision integer \) returns table\(lore_id uuid, restored boolean\) language plpgsql security definer set search_path = ''/);
assert.match(restore, /if p_user_id is null or auth\.uid\(\) is distinct from p_user_id then raise exception 'Unauthorized' using errcode = '42501'/);
assert.match(restore, /if p_expected_revision is null or p_expected_revision < 1 then raise exception 'expected_revision must be a positive integer' using errcode = 'P0001'/);

const locator = restore.indexOf("select t.project_id into v_project_id");
const projectLock = restore.indexOf("perform 1 from public.projects p");
const topicLock = restore.indexOf("select t.id, t.revision into v_topic");
const revisionCheck = restore.indexOf("if v_topic.revision <> p_expected_revision");
const loreLock = restore.indexOf("for v_lore in select le.*");
assert.ok(locator < projectLock && projectLock < topicLock && topicLock < revisionCheck && revisionCheck < loreLock,
  "locator, Project lock, authoritative topic lock, revision check, Lore locks must stay ordered");
assert.match(restore.slice(locator, projectLock), /where t.id = p_topic_id and t.user_id = p_user_id;/);
assert.match(restore.slice(projectLock, topicLock), /where p.id = v_project_id and p.user_id = p_user_id for update;/);
assert.match(restore.slice(topicLock, revisionCheck), /where t.id = p_topic_id and t.user_id = p_user_id and t.project_id = v_project_id for update;/);
assert.match(restore, /if v_topic.revision <> p_expected_revision then raise exception 'revision conflict' using errcode = 'P0001'/);
assert.match(restore.slice(loreLock), /where le.user_id = p_user_id and le.source_type = 'project_memory_promotion' and le.metadata->>'source_topic_id' = v_topic.id::text and \( le.metadata->>'source_revision' = p_expected_revision::text or \(le.is_archived = false and le.superseded_by is null\) \) order by le.id for update loop/);
assert.match(restore, /if v_lore.metadata->>'source_revision' = p_expected_revision::text then v_target := v_lore; end if;/);
assert.match(restore, /if v_lore.is_archived = false and v_lore.superseded_by is null then v_active_count := v_active_count \+ 1; end if;/);

const notFound = restore.indexOf("if v_target.id is null");
const idempotent = restore.indexOf("if v_target.is_archived = false and v_target.superseded_by is null");
const superseded = restore.indexOf("if v_target.superseded_by is not null");
const archived = restore.indexOf("if v_target.is_archived is not true");
const conflict = restore.indexOf("if v_active_count > 0");
const update = restore.indexOf("update public.lore_embeddings");
assert.ok(loreLock < notFound && notFound < idempotent && idempotent < superseded && superseded < archived && archived < conflict && conflict < update,
  "locked snapshot must drive not-found, idempotency, supersede/NULL rejection and conflict checks before mutation");
assert.match(restore, /if v_target.id is null then raise exception 'promotion_not_found' using errcode = 'P0001'/);
assert.match(restore, /if v_target.is_archived = false and v_target.superseded_by is null then return query select v_target.id, false; return; end if;/);
assert.match(restore, /if v_target.superseded_by is not null then raise exception 'restore_not_allowed_superseded' using errcode = 'P0001'/);
assert.match(restore, /if v_active_count > 0 then raise exception 'restore_conflict_active_exists' using errcode = 'P0001'/);

const writes = restore.match(/update public\.lore_embeddings[\s\S]*?;/g) ?? [];
assert.deepEqual(writes, ["update public.lore_embeddings set is_archived = false where id = v_target.id and user_id = p_user_id;"],
  "restore must update only is_archived; edited text, embedding, metadata and superseded_by stay intact");
assert.doesNotMatch(restore, /\b(?:insert into|delete from)\b|p_embedding|openai|extraction_version\s*=/i);
assert.match(restore, /return query select v_target.id, true;/);
assert.match(restore, /revoke execute on function public\.restore_archived_project_memory_promotion\(uuid, uuid, integer\) from public, anon, authenticated;/);
assert.match(restore, /grant execute on function public\.restore_archived_project_memory_promotion\(uuid, uuid, integer\) to authenticated;/);
assert.doesNotMatch(normalize(migration), /create (?:unique )?index|drop function|create or replace function public\.(?:promote_project_memory_topic_to_lore|delete_project_preserving_contents)/);

assert.match(migration, /適用順序: DB→アプリ/);
assert.match(migration, /初回適用前確認（0行を期待/);
assert.match(migration, /pg_get_function_identity_arguments/);
assert.match(migration, /has_function_privilege\('authenticated'/);
assert.match(migration, /has_function_privilege\('anon'/);
assert.match(migration, /先にアプリを旧コードへ戻し/);
assert.match(migration, /-- drop function if exists public\.restore_archived_project_memory_promotion\(uuid, uuid, integer\);/);

assert.equal(extract(schema, "promote_project_memory_topic_to_lore"),
  extract(read("docs/applied/migration_v202_project_memory_promotion_confirmation.sql"), "promote_project_memory_topic_to_lore"),
  "v203 must leave the canonical v202 promotion definition and grants unchanged");
assert.equal(extract(schema, "delete_project_preserving_contents"),
  extract(read("docs/applied/migration_v201_delete_project_promotion_delegation.sql"), "delete_project_preserving_contents"),
  "v203 must leave the v201 deletion definition, including its four-argument call, unchanged");
console.log("ok - v203 restore/schema sync, authorization, ordered locks, idempotency, preservation, grants and legacy RPC compatibility");
