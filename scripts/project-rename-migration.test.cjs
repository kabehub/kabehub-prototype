const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const migrationPath = path.join(
  root,
  "docs",
  "applied",
  "migration_v198_project_memory_dreaming_final.sql",
);
const schemaPath = path.join(root, "docs", "schema.sql");
const readmePath = path.join(root, "docs", "applied", "README.md");

const migration = fs.readFileSync(migrationPath, "utf8");
const schema = fs.readFileSync(schemaPath, "utf8");
const readme = fs.readFileSync(readmePath, "utf8");

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function extractRenameDefinition(sql) {
  const match = sql.match(
    /create or replace function public\.rename_project\([\s\S]*?grant execute on function public\.rename_project\(uuid, uuid, text\)[\s\S]*?to authenticated;/,
  );
  assert.ok(match, "rename_project definition and grants must exist");
  return normalizeSql(match[0]);
}

assert.match(migration, /^begin;[\s\S]*commit;[\s\S]*notify pgrst, 'reload schema';\s*$/);
assert.match(migration, /returns text\s+language plpgsql\s+security definer\s+set search_path = ''/);
assert.match(
  migration,
  /p_user_id is null or auth\.uid\(\) is distinct from p_user_id[\s\S]*errcode = '42501'/,
);
assert.match(
  migration,
  /perform 1 from public\.projects p\s+where p\.id = p_project_id and p\.user_id = p_user_id\s+for update;/,
);
assert.match(migration, /v_new_name := btrim\(coalesce\(p_new_name, ''\)\)/);
assert.doesNotMatch(migration, /\b(?:char_length|length)\s*\(/i);

for (const table of [
  "projects",
  "project_settings",
  "novel_settings",
  "threads",
]) {
  assert.match(migration, new RegExp(`(?:update|public\\.)${table}`));
}

const renameDefinition = extractRenameDefinition(migration);
assert.doesNotMatch(renameDefinition, /lore_embeddings/);

assert.match(
  migration,
  /update public\.novel_settings ns\s+set folder_name = v_new_name\s+from public\.threads t\s+where ns\.thread_id = t\.id[\s\S]*?t\.project_id = p_project_id;/,
);
assert.doesNotMatch(
  migration,
  /update public\.novel_settings[\s\S]*?where\s+folder_name\s*=/,
);
assert.match(
  migration,
  /revoke execute on function public\.rename_project\(uuid, uuid, text\)\s+from public, anon, authenticated;\s+grant execute[\s\S]*?to authenticated;/,
);

assert.equal(
  extractRenameDefinition(schema),
  renameDefinition,
  "canonical schema must contain the exact v198 function and grants",
);
assert.match(readme, /migration_v195_rename_project\.sql/);

console.log("ok - v198 rename migration and canonical schema stay aligned");
