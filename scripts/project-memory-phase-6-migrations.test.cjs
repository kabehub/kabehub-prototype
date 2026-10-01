const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(
  path.join(
    root,
    "docs",
    "applied",
    "migration_v200_project_memory_topic_promotion.sql",
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

function extractIndex(sql, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = normalizeSql(sql).match(
    new RegExp(`create (?:unique )?index if not exists ${escapedName}[\\s\\S]*?;`),
  );
  assert.ok(match, `${name} definition must exist`);
  return match[0].replace("on public.lore_embeddings", "on lore_embeddings");
}

assert.match(migration, /^begin;[\s\S]*?commit;\s*\r?\n\s*notify pgrst, 'reload schema';/);

const promotion = extractFunction(
  migration,
  "promote_project_memory_topic_to_lore",
  "uuid, uuid, int, vector",
  "authenticated",
);
assert.match(promotion, /language plpgsql security definer set search_path = ''/);
assert.match(
  promotion,
  /if p_user_id is null or auth\.uid\(\) is distinct from p_user_id then raise exception 'Unauthorized' using errcode = '42501'/,
);
assert.match(promotion, /if p_embedding is null then raise exception 'embedding is required'/);
assert.match(
  promotion,
  /from public\.projects p where p\.id = v_project_id and p\.user_id = p_user_id for update;[\s\S]*?from public\.project_memory_topics t[\s\S]*?for update;/,
  "promotion must lock Project before topic",
);
assert.match(promotion, /if v_topic\.revision <> p_expected_revision then raise exception 'revision conflict'/);
assert.match(promotion, /if btrim\(v_topic\.content_md\) = '' then raise exception 'topic is empty'/);
assert.match(
  promotion,
  /jsonb_build_object\('source_topic_id', v_topic\.id, 'source_topic_key', v_topic\.topic_key, 'source_project_id', v_topic\.project_id, 'source_revision', p_expected_revision\)/,
);
assert.match(promotion, /exception when unique_violation then[\s\S]*?return query select v_existing_id, false/);
assert.match(
  promotion,
  /set is_archived = true, superseded_by = v_new_id[\s\S]*?id <> v_new_id[\s\S]*?is_archived = false[\s\S]*?superseded_by is null/,
);
assert.match(promotion, /return query select v_new_id, true/);

const matchLore = extractFunction(
  migration,
  "match_lore_embeddings_by_project",
  "vector, uuid, uuid, integer",
  "authenticated, service_role",
);
assert.equal(
  extractFunction(
    schema,
    "match_lore_embeddings_by_project",
    "vector, uuid, uuid, integer",
    "authenticated, service_role",
  ),
  matchLore,
  "canonical schema Lore Book search RPC must match v200",
);
assert.match(matchLore, /and is_archived = false and superseded_by is null/);

for (const indexName of [
  "idx_lore_embeddings_promotion_source_revision",
  "idx_lore_embeddings_promotion_active_by_topic",
]) {
  assert.equal(
    extractIndex(schema, indexName),
    extractIndex(migration, indexName),
    `${indexName}: canonical schema must match v200`,
  );
}

const uniqueIndex = extractIndex(
  migration,
  "idx_lore_embeddings_promotion_source_revision",
);
assert.match(uniqueIndex, /^create unique index/);
assert.match(
  uniqueIndex,
  /\(user_id, \(metadata->>'source_topic_id'\), \(metadata->>'source_revision'\)\) where source_type = 'project_memory_promotion'/,
);

const activeIndex = extractIndex(
  migration,
  "idx_lore_embeddings_promotion_active_by_topic",
);
assert.doesNotMatch(activeIndex, /^create unique index/);
assert.match(
  activeIndex,
  /\(user_id, \(metadata->>'source_topic_id'\)\) where source_type = 'project_memory_promotion' and is_archived = false and superseded_by is null/,
);

assert.doesNotMatch(migration, /create or replace function public\.delete_project_preserving_contents/);
assert.doesNotMatch(migration, /create or replace function public\.(?:create|update)_project_memory_topic/);

console.log("ok - v200 historical promotion contract and canonical indexes/search stay aligned");
