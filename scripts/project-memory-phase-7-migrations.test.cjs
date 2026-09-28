const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(
  path.join(
    root,
    "docs",
    "applied",
    "migration_v201_delete_project_promotion_delegation.sql",
  ),
  "utf8",
);
const schema = fs.readFileSync(path.join(root, "docs", "schema.sql"), "utf8");

function normalizeSql(sql) {
  return sql
    .replace(/--[^\r\n]*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

function extractFunction(sql, name, signature, granteePattern) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedSignature = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const normalized = normalizeSql(sql);
  const match = normalized.match(
    new RegExp(
      `create or replace function public\\.${escapedName}\\([\\s\\S]*?` +
        `grant execute on function public\\.${escapedName}\\(\\s*${escapedSignature}\\s*\\)` +
        `[\\s\\S]*?to ${granteePattern};`,
    ),
  );
  assert.ok(match, `${name} definition and grants must exist`);
  return match[0];
}

assert.match(
  migration,
  /^begin;[\s\S]*?commit;\s*\r?\n\s*notify pgrst, 'reload schema';/m,
);

assert.match(
  normalizeSql(migration),
  /do \$\$ begin if to_regprocedure\('public\.promote_project_memory_topic_to_lore\(uuid,uuid,integer,vector\)'\) is null then raise exception/,
  "v201 must fail closed when the v200 Promotion RPC is missing",
);

const deleteDefinition = extractFunction(
  migration,
  "delete_project_preserving_contents",
  "uuid, uuid, boolean, jsonb",
  "authenticated",
);
assert.equal(
  extractFunction(
    schema,
    "delete_project_preserving_contents",
    "uuid, uuid, boolean, jsonb",
    "authenticated",
  ),
  deleteDefinition,
  "canonical schema delete RPC must match v201",
);

assert.match(
  deleteDefinition,
  /perform 1 from public\.promote_project_memory_topic_to_lore\(p_user_id, v_topic\.id, \(v_promo->>'expected_revision'\)::int, \(v_promo->>'embedding'\)::public\.vector\)/,
  "delete RPC must delegate Lore promotion writes to promote_project_memory_topic_to_lore",
);

assert.doesNotMatch(
  deleteDefinition,
  /insert into public\.lore_embeddings/,
  "delete RPC must not insert into lore_embeddings directly anymore",
);

assert.match(
  deleteDefinition,
  /if coalesce\(array_length\(v_nonempty_topic_ids, 1\), 0\) <> coalesce\(array_length\(v_promo_topic_ids, 1\), 0\) then raise exception 'topic changed during promotion'/,
  "delete RPC must keep its own TOCTOU pre-validation",
);

assert.match(
  deleteDefinition,
  /if not found or v_topic\.revision is distinct from \(v_promo->>'expected_revision'\)::int or not \(v_topic\.id = any\(v_nonempty_topic_ids\)\) then raise exception 'topic changed during promotion'/,
  "delete RPC must keep its per-topic revision/membership re-check before delegating",
);

assert.match(
  deleteDefinition,
  /update public\.lore_embeddings set project_id = null where project_id = p_project_id and user_id = p_user_id;/,
  "delete RPC must keep globalizing existing Lore rows on Project delete",
);

// Phase 3の境界：v200 Promotion Contract自体（RPC本体・index）は変更しない
assert.doesNotMatch(
  migration,
  /create or replace function public\.promote_project_memory_topic_to_lore/,
  "v201 must not redefine promote_project_memory_topic_to_lore itself",
);
assert.doesNotMatch(
  migration,
  /create (?:unique )?index/,
  "v201 must not touch Promotion Contract indexes",
);

console.log("ok - v201 delete-RPC promotion delegation and canonical schema stay aligned");
