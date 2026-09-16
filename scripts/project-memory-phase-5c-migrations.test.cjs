const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const v198 = fs.readFileSync(
  path.join(root, "docs", "migration_v198_project_memory_dreaming_final.sql"),
  "utf8",
);
const v197 = fs.readFileSync(
  path.join(root, "docs", "applied", "migration_v197_project_memory_dreaming_by_project.sql"),
  "utf8",
);
const v199 = fs.readFileSync(
  path.join(root, "docs", "migration_v199_lore_embeddings_folder_name_drop.sql"),
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

function extractFunction(sql, name, signature) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedSignature = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = normalizeSql(sql).match(new RegExp(
    `create or replace function public\\.${escapedName}\\([\\s\\S]*?grant execute on function public\\.${escapedName}\\(\\s*${escapedSignature}\\s*\\)[\\s\\S]*?to authenticated;`,
  ));
  assert.ok(match, `${name} definition and grants must exist`);
  return match[0];
}

assert.match(v198, /^begin;[\s\S]*commit;[\s\S]*notify pgrst, 'reload schema';\s*$/);
assert.match(v199, /^begin;[\s\S]*commit;[\s\S]*notify pgrst, 'reload schema';\s*$/);

const functions = [
  [
    "consolidate_dreaming_batch_by_project",
    "uuid, uuid, uuid, text, vector, text, text, double precision, double precision",
    true,
  ],
  [
    "consolidate_dreaming_batch_multi_by_project",
    "uuid, uuid[], text, vector, text, text, double precision, double precision",
    true,
  ],
  [
    "merge_user_edited_lore_pair_by_project",
    "uuid, uuid, uuid, text, vector, text, text",
    true,
  ],
  ["rename_project", "uuid, uuid, text", false],
  ["delete_project_preserving_contents", "uuid, uuid, boolean, jsonb", false],
];

for (const [name, signature, isProjectLoreRpc] of functions) {
  const migrationDefinition = extractFunction(v198, name, signature);
  assert.equal(
    normalizeSql(extractFunction(schema, name, signature)),
    normalizeSql(migrationDefinition),
    `${name}: canonical schema must match v198`,
  );
  if (isProjectLoreRpc) {
    const expectedFromV197 = extractFunction(v197, name, signature)
      .replace(/\bv_folder_name\s+text;/g, "")
      .replace(/select name into v_folder_name/g, "perform 1")
      .replace(/folder_name,\s*project_id/g, "project_id")
      .replace(/v_folder_name,\s*v_project_id/g, "v_project_id");
    assert.equal(
      normalizeSql(migrationDefinition),
      normalizeSql(expectedFromV197),
      `${name}: v198 must be the minimal folder_name removal from v197`,
    );
    assert.doesNotMatch(migrationDefinition, /\bfolder_name\b/);
    assert.match(
      migrationDefinition,
      /if v_project_id is not null then\s+perform 1\s+from public\.projects\s+where id = v_project_id and user_id = p_user_id;\s+if not found then\s+raise exception 'project not found'/,
    );
  }
}

const renameDefinition = extractFunction(v198, "rename_project", "uuid, uuid, text");
assert.doesNotMatch(renameDefinition, /lore_embeddings/);

const deleteDefinition = extractFunction(
  v198,
  "delete_project_preserving_contents",
  "uuid, uuid, boolean, jsonb",
);
const loreWrites = deleteDefinition.match(
  /(?:insert into|update) public\.lore_embeddings[\s\S]*?;/g,
);
assert.equal(loreWrites?.length, 2);
for (const write of loreWrites) assert.doesNotMatch(write, /\bfolder_name\b/);
assert.match(
  deleteDefinition,
  /update public\.threads\s+set project_id = null,\s+folder_name = null/,
);
assert.doesNotMatch(v198, /create or replace function public\.rollback_dreaming_batch_multi/);

assert.doesNotMatch(v199, /\bcascade\b/i);
for (const statement of [
  "drop function public.consolidate_dreaming_batch(uuid, uuid, uuid, text, vector, text, text, text, double precision, double precision);",
  "drop function public.consolidate_dreaming_batch_multi(uuid, uuid[], text, vector, text, text, text, double precision, double precision);",
  "drop function public.merge_user_edited_lore_pair(uuid, uuid, uuid, text, vector, text, text);",
  "drop index if exists public.idx_lore_embeddings_user_folder;",
  "alter table public.lore_embeddings drop column folder_name;",
]) {
  assert.ok(
    normalizeSql(v199).includes(normalizeSql(statement)),
    `v199 must contain: ${statement}`,
  );
}
assert.equal((v199.match(/to_regprocedure\(/g) ?? []).length, 3);

for (const oldName of [
  "consolidate_dreaming_batch",
  "consolidate_dreaming_batch_multi",
  "merge_user_edited_lore_pair",
]) {
  assert.doesNotMatch(
    schema,
    new RegExp(`create or replace function (?:public\\.)?${oldName}\\(`),
  );
}
const loreTable = schema.match(
  /create table if not exists lore_embeddings \([\s\S]*?\n\);/,
)?.[0];
assert.ok(loreTable);
assert.doesNotMatch(loreTable, /\bfolder_name\b/);
assert.doesNotMatch(schema, /idx_lore_embeddings_user_folder/);

console.log("ok - v198/v199 Phase 5C migrations and canonical schema stay aligned");
