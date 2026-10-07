const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");
installTsLoader();
installAliasResolver();
const { MAX_AUTO_SUMMARY_THREADS } = require("../lib/project-memory/auto-summary-limits.ts");
const root = path.join(__dirname, "..");
const file = "migration_v206_project_memory_auto_summary_cursors.sql";
const pending = path.join(root, "docs", file);
const migration = fs.readFileSync(fs.existsSync(pending) ? pending : path.join(root, "docs/applied", file), "utf8");
const schema = fs.readFileSync(path.join(root, "docs/schema.sql"), "utf8");
const normalize = sql => sql.replace(/--[^\r\n]*/g, " ").replace(/\s+/g, " ").trim();
const signature = "public.advance_project_memory_auto_summary_cursors(uuid, uuid, integer, jsonb)";
const tableName = "public.project_memory_auto_summary_cursors";
const sql = normalize(migration);
const pattern = /create table if not exists public\.project_memory_auto_summary_cursors \([\s\S]*?grant execute on function public\.advance_project_memory_auto_summary_cursors\([\s\S]*?to authenticated;/g;
const definitions = source => normalize(source).match(pattern) ?? [];
const rpc = sql.match(/create or replace function public\.advance_project_memory_auto_summary_cursors\([\s\S]*?\$\$;/)[0];
const body = rpc.split("as $$")[1].split("$$;")[0];
const table = sql.match(/create table if not exists public\.project_memory_auto_summary_cursors \([\s\S]*?\);/)[0];

test("v206 migration and schema definitions match after normalization", () => {
  assert.equal(definitions(migration).length, 1);
  assert.equal(definitions(schema).length, 1);
  assert.equal(definitions(schema)[0], definitions(migration)[0]);
  assert.ok(normalize(schema).indexOf("create table if not exists threads (") < normalize(schema).indexOf(table), "thread FK target exists first");
});

test("cursor columns, primary key, cascade FKs, no user_id or message FK", () => {
  assert.equal(table, `create table if not exists ${tableName} ( topic_id uuid not null references public.project_memory_topics(id) on delete cascade, thread_id uuid not null references public.threads(id) on delete cascade, message_id uuid not null, message_created_at timestamptz not null, updated_at timestamptz not null default now(), primary key (topic_id, thread_id) );`);
  assert.doesNotMatch(table, /\buser_id\b|message_id uuid not null references/);
  assert.match(sql, /create index if not exists idx_project_memory_auto_summary_cursors_thread on public\.project_memory_auto_summary_cursors\(thread_id\);/);
});

test("RLS uses topic ownership and table ACL allows authenticated SELECT only", () => {
  assert.ok(sql.includes(`alter table ${tableName} enable row level security;`));
  assert.match(sql, /create policy "project_memory_auto_summary_cursors: select own" on public\.project_memory_auto_summary_cursors for select using \(exists \( select 1 from public\.project_memory_topics t where t.id = project_memory_auto_summary_cursors.topic_id and t.user_id = auth.uid\(\) \)\);/);
  assert.ok(sql.includes(`revoke all on table ${tableName} from anon, authenticated; grant select on table ${tableName} to authenticated;`));
  assert.equal((sql.match(/create policy /g) ?? []).length, 1);
  assert.equal((sql.match(/grant .*? on table/g) ?? []).length, 1);
});

test("RPC signature, integer return, SECURITY DEFINER, empty search_path and ACL", () => {
  assert.match(rpc, /^create or replace function public\.advance_project_memory_auto_summary_cursors\( p_user_id uuid, p_topic_id uuid, p_expected_revision integer, p_cursors jsonb \) returns integer language plpgsql security definer set search_path = '' as \$\$/);
  assert.ok(sql.includes(`revoke execute on function ${signature} from public, anon, authenticated; grant execute on function ${signature} to authenticated;`));
  assert.equal((sql.match(/grant execute/g) ?? []).length, 1);
});

test("RPC steps follow auth, revision input, JSON validation, lock, existence, CAS, matching, upsert, count", () => {
  const steps = ["if p_user_id is null", "if p_expected_revision is null", "if p_cursors is null", "if jsonb_array_length(p_cursors)", "for v_element", "select array_agg", "if cardinality", "select t.project_id, t.revision into v_topic", "if not found or v_topic.project_id is null", "if v_topic.revision <> p_expected_revision", "for v_candidate", "m.created_at as message_created_at", "insert into public.project_memory_auto_summary_cursors", "where (excluded.message_created_at, excluded.message_id)", "get diagnostics v_changed = row_count", "v_advanced := v_advanced + v_changed", "return v_advanced"];
  const positions = steps.map(step => { const p = body.indexOf(step); assert.ok(p >= 0, step); return p; });
  for (let i = 1; i < positions.length; i++) assert.ok(positions[i] > positions[i - 1], `${steps[i]} follows ${steps[i - 1]}`);
  assert.match(body, /where t.id = p_topic_id and t.user_id = p_user_id for update; if not found/);
});

test("JSON shape, UUID string validation and duplicate detection precede casts and lock", () => {
  assert.match(body, /p_cursors is null or jsonb_typeof\(p_cursors\) is distinct from 'array'/);
  assert.match(body, /jsonb_array_length\(p_cursors\) = 0 or jsonb_array_length\(p_cursors\) > c_max/);
  assert.match(body, /jsonb_typeof\(v_element\) is distinct from 'object'/);
  for (const key of ["thread_id", "message_id"]) {
    assert.ok(body.includes(`jsonb_typeof(v_element->'${key}') is distinct from 'string'`));
    assert.ok(body.includes(`(v_element->>'${key}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`));
  }
  assert.ok(body.indexOf("invalid cursor element") < body.indexOf("::uuid"));
  assert.match(body, /cardinality\(v_thread_ids\) <> \(select count\(distinct id\) from unnest\(v_thread_ids\) as ids\(id\)\)/);
});

test("all error messages and SQLSTATE values are fixed", () => {
  for (const [message, code] of [["Unauthorized", "42501"], ["expected_revision must be a positive integer", "P0001"], ["cursors must be a jsonb array", "P0001"], ["cursors must contain 1 to 100 items", "P0001"], ["invalid cursor element", "P0001"], ["duplicate thread_id", "P0001"], ["topic not found", "P0001"], ["revision conflict", "P0001"]]) {
    assert.ok(body.includes(`raise exception '${message}' using errcode = '${code}';`));
  }
  assert.equal((body.match(/raise exception/g) ?? []).length, 8);
});

test("c_max matches shared MAX_AUTO_SUMMARY_THREADS and stays 100", () => {
  assert.equal(Number(body.match(/c_max constant integer := (\d+);/)[1]), MAX_AUTO_SUMMARY_THREADS);
  assert.equal(MAX_AUTO_SUMMARY_THREADS, 100);
});

test("candidate joins enforce ownership, project, user role, provider and skip invalid rows", () => {
  assert.match(body, /join public\.threads th on th.id = \(value->>'thread_id'\)::uuid and th.user_id = p_user_id and th.project_id = v_topic.project_id/);
  assert.match(body, /join public\.messages m on m.id = \(value->>'message_id'\)::uuid and m.thread_id = th.id and m.user_id = p_user_id and m.role = 'user' and m.provider not in \('memo', 'image_gen'\)/);
  assert.match(body, /m.created_at as message_created_at/);
  assert.doesNotMatch(body, /is_active|value->>?\s*'message_created_at'/);
  assert.doesNotMatch(body.slice(body.indexOf("for v_candidate")), /raise exception/);
});

test("monotonic tuple upsert ignores ties and regression, updates timestamp and counts changed rows", () => {
  assert.match(body, /values \(p_topic_id, v_candidate.thread_id, v_candidate.message_id, v_candidate.message_created_at\) on conflict \(topic_id, thread_id\) do update set message_id = excluded.message_id, message_created_at = excluded.message_created_at, updated_at = now\(\) where \(excluded.message_created_at, excluded.message_id\) > \(current_cursor.message_created_at, current_cursor.message_id\); get diagnostics v_changed = row_count; v_advanced := v_advanced \+ v_changed;/);
  assert.match(migration, /戻り値は診断用。呼び出し側は正否判定に使わず/);
});

test("RPC mutates only cursor table, never topics or revisions", () => {
  assert.doesNotMatch(body, /(?:insert into|update|delete from) public\.project_memory_(?:topics|revisions)\b/);
  assert.deepEqual(body.match(/\binsert into public\.\w+/g), ["insert into public.project_memory_auto_summary_cursors"]);
  assert.doesNotMatch(body, /\bdelete\b|\bupdate public\./);
});

test("migration is transactional, reapplicable, reloads schema and documents verification/rollback", () => {
  assert.match(sql, /^begin; create table if not exists/);
  assert.ok(sql.includes(`drop function if exists ${signature}; create or replace function`));
  assert.ok(sql.includes(`drop policy if exists "project_memory_auto_summary_cursors: select own" on ${tableName};`));
  assert.match(sql, /commit; notify pgrst, 'reload schema';$/);
  for (const catalog of ["to_regclass", "information_schema.columns", "pg_constraint", "pg_indexes", "pg_policies", "pg_get_function_identity_arguments", "pg_get_function_result", "prosecdef", "proconfig", "has_function_privilege", "has_table_privilege"]) assert.ok(migration.includes(catalog), catalog);
  assert.ok(migration.includes(`-- drop function if exists ${signature};`));
  assert.ok(migration.includes(`-- drop table if exists ${tableName};`));
});
