const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(path.join(
  __dirname,
  "..",
  "docs",
  "migration_v196_project_settings_project_id_contract.sql",
), "utf8");
const schema = fs.readFileSync(path.join(__dirname, "..", "docs", "schema.sql"), "utf8");

assert.match(migration, /^--[\s\S]*?begin;[\s\S]*commit;\s*notify pgrst, 'reload schema';\s*$/);
assert.match(
  migration,
  /alter table public\.project_settings\s+add constraint project_settings_user_id_project_id_key unique \(user_id, project_id\);/,
);
assert.match(
  migration,
  /alter table public\.project_settings\s+alter column folder_name drop not null;/,
);
assert.match(migration, /count\(\*\) as row_count[\s\S]*content_hash/);

const projectSettingsDefinition = schema.match(
  /create table if not exists project_settings \([\s\S]*?\n\);/,
)?.[0];
assert.ok(projectSettingsDefinition, "project_settings canonical definition");
assert.match(projectSettingsDefinition, /folder_name\s+text,/);
assert.doesNotMatch(projectSettingsDefinition, /folder_name\s+text not null/);
assert.match(
  projectSettingsDefinition,
  /constraint project_settings_user_id_project_id_key unique \(user_id, project_id\)/,
);

console.log("ok - v196 project_settings project_id contract matches canonical schema");
