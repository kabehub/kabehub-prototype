const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const migration = read("docs/migration_v202_project_memory_promotion_confirmation.sql");
const schema = read("docs/schema.sql");
const normalize = (sql) => sql.replace(/--[^\r\n]*/g, " ").replace(/\s+/g, " ").trim();
const extract = (sql) => {
  const match = sql.match(/create or replace function public\.promote_project_memory_topic_to_lore\([\s\S]*?grant execute on function public\.promote_project_memory_topic_to_lore\([\s\S]*?to authenticated;/);
  assert.ok(match);
  return normalize(match[0]);
};
const latest = extract(migration);
assert.equal(extract(schema), latest, "canonical RPC and v202 must match");
assert.match(normalize(migration), /begin; drop function public\.promote_project_memory_topic_to_lore\(uuid, uuid, int, vector\); create or replace function/);
assert.match(normalize(migration), /commit; notify pgrst, 'reload schema';$/);
assert.match(latest, /p_embedding vector, p_acknowledged_edited_lore_ids uuid\[\] default null/);
assert.match(latest, /revoke execute on function public\.promote_project_memory_topic_to_lore\(uuid, uuid, int, vector, uuid\[\]\) from public, anon, authenticated/);
assert.match(latest, /grant execute on function public\.promote_project_memory_topic_to_lore\(uuid, uuid, int, vector, uuid\[\]\) to authenticated/);
assert.equal((schema.match(/create or replace function public\.promote_project_memory_topic_to_lore\(/g) ?? []).length, 1, "no ambiguous overloads in canonical schema");
const noReplacement = latest.indexOf("return query select v_existing_id, false;");
const guardStart = latest.indexOf("if p_acknowledged_edited_lore_ids is not null then");
const supersede = latest.indexOf("update public.lore_embeddings set is_archived = true");
assert.ok(noReplacement < guardStart && guardStart < supersede, "guard follows idempotent return and precedes supersede");
assert.match(latest.slice(guardStart, supersede), /order by le.id for update loop/);
assert.match(latest, /if v_old_lore.extraction_version = 'user_edited' and not exists \( select 1 from unnest\(p_acknowledged_edited_lore_ids\) ack\(id\) where ack.id = v_old_lore.id \) then raise exception 'edited_lore_needs_confirmation' using errcode = 'P0001'/);
const lockPredicate = latest.slice(guardStart, supersede).match(/where le.user_id = p_user_id[\s\S]*?and le.superseded_by is null/)[0].replace(/le\./g, "");
const updatePredicate = latest.slice(supersede).match(/where user_id = p_user_id[\s\S]*?and superseded_by is null/)[0];
assert.equal(lockPredicate, updatePredicate, "locked rows must exactly match supersede targets");
// Removing the new argument, local variable, and guard yields the unchanged v200 RPC.
const withoutGuard = latest.slice(0, guardStart) + latest.slice(supersede);
assert.equal(withoutGuard
  .replace(", p_acknowledged_edited_lore_ids uuid[] default null", "")
  .replace(" v_old_lore record;", "")
  .replaceAll("(uuid, uuid, int, vector, uuid[])", "(uuid, uuid, int, vector)")
  .replace(/\s+/g, " "),
  extract(read("docs/applied/migration_v200_project_memory_topic_promotion.sql")),
  "null guard preserves the historical RPC body and grants");
const deletion = schema.match(/create or replace function public\.delete_project_preserving_contents\([\s\S]*?grant execute on function public\.delete_project_preserving_contents\([\s\S]*?to authenticated;/)[0];
assert.match(normalize(deletion), /perform 1 from public\.promote_project_memory_topic_to_lore\( p_user_id, v_topic.id, \(v_promo->>'expected_revision'\)::int, \(v_promo->>'embedding'\)::public.vector \)/);
assert.doesNotMatch(migration, /create or replace function public\.delete_project_preserving_contents|cascade/i);
require("./project-memory-phase-7-migrations.test.cjs");
console.log("ok - v202 confirmation, exact supersede locks, idempotency ordering, null compatibility, schema sync");
