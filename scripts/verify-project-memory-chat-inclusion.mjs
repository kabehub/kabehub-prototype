// Test DB only. Apply v204 manually before running this script; no migration is applied here.
// CHAT_INCLUSION_ENV_FILE defaults to .env.local.test.bak, then .env.test.local.
// Optional CHAT_INCLUSION_SUPABASE_ACCESS_TOKEN (or SUPABASE_ACCESS_TOKEN) enables catalog checks.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const TEST_PROJECT_REF = "jvarrlsqttfjiysaedlg";
const RPC = "set_project_memory_topic_chat_inclusion";
const countChars = text => [...text].length;
let passed = 0;
let failures = 0;
function pass(label) { passed++; console.log(`[PASS] ${label}`); }
function fail(label, error) { failures++; console.error(`[FAIL] ${label} ${error.message ?? error}`); }
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}
function required(name) {
  assert.ok(process.env[name], `${name} is required`);
  return process.env[name];
}
function ok(result) {
  if (result.error) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}
function expectError(result, message, code = "P0001") {
  assert.equal(result.error?.message, message);
  assert.equal(result.error?.code, code);
}
const CATALOG_QUERY = `
select c.data_type, c.is_nullable, c.column_default
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'project_memory_topics' and c.column_name = 'include_in_chat';
`;
const FUNCTION_QUERY = `
select pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid) as result, p.prosecdef, p.proconfig,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_ok,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'set_project_memory_topic_chat_inclusion';
`;
async function catalog() {
  const token = process.env.CHAT_INCLUSION_SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) { console.log("[SKIP] catalog: CHAT_INCLUSION_SUPABASE_ACCESS_TOKEN / SUPABASE_ACCESS_TOKEN is absent; fixture checks still run"); return; }
  async function query(sql) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${TEST_PROJECT_REF}/database/query/read-only`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(30_000),
    });
    assert.ok(response.ok, `Management SQL HTTP ${response.status}`);
    const result = await response.json();
    return Array.isArray(result) ? result : result.data;
  }
  const columns = await query(CATALOG_QUERY);
  assert.equal(columns.length, 1);
  assert.equal(columns[0].data_type, "boolean");
  assert.equal(columns[0].is_nullable, "NO");
  assert.match(columns[0].column_default, /^(?:false|false::boolean)$/);
  pass("1a catalog column boolean / NOT NULL / default false");
  const functions = await query(FUNCTION_QUERY);
  assert.equal(functions.length, 1);
  const fn = functions[0];
  assert.equal(fn.args, "p_user_id uuid, p_project_id uuid, p_topic_id uuid, p_include boolean");
  assert.equal(fn.result, "TABLE(is_included boolean, included_chars integer)");
  assert.equal(fn.prosecdef, true);
  assert.ok(fn.proconfig?.includes('search_path=""') || fn.proconfig?.includes("search_path="));
  assert.equal(fn.authenticated_ok, true);
  assert.equal(fn.anon_ok, false);
  pass("1b catalog RPC signature / return / SECURITY DEFINER / search_path / ACL");
}
async function fixtures(url) {
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, process.env.CHAT_INCLUSION_SERVICE_ROLE_KEY ?? required("SUPABASE_SERVICE_ROLE_KEY"), options);
  const anonKey = process.env.CHAT_INCLUSION_ANON_KEY ?? required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const users = [];
  const projects = [];
  const topics = [];
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = `ChatInclusion-${randomUUID()}-aA1!`;
  async function user(label) {
    const email = `chat-inclusion-${label}-${suffix}@example.invalid`;
    const data = ok(await service.auth.admin.createUser({ email, password, email_confirm: true }));
    const id = data.user.id;
    users.push(id);
    const client = createClient(url, anonKey, options);
    ok(await client.auth.signInWithPassword({ email, password }));
    return { id, client };
  }
  async function project(owner, label) {
    const data = ok(await service.from("projects").insert({ user_id: owner.id, name: `chat-inclusion-${label}-${suffix}` }).select("id").single());
    projects.push(data.id);
    return data.id;
  }
  async function topic(owner, projectId, label, content) {
    const data = ok(await owner.client.rpc("create_project_memory_topic", {
      p_user_id: owner.id, p_project_id: projectId, p_topic_key: `${label}-${suffix}`, p_content_md: content, p_source_refs: [],
    }).single());
    topics.push(data.topic_id);
    return data.topic_id;
  }
  const toggle = (owner, projectId, topicId, include, userId = owner.id) => owner.client.rpc(RPC, {
    p_user_id: userId, p_project_id: projectId, p_topic_id: topicId, p_include: include,
  }).single();
  async function snapshot(id) {
    const row = ok(await service.from("project_memory_topics").select("revision,updated_at,include_in_chat").eq("id", id).single());
    const result = await service.from("project_memory_revisions").select("id", { count: "exact", head: true }).eq("topic_id", id);
    ok(result);
    return { ...row, revisions: result.count };
  }
  try {
    const a = await user("a");
    const b = await user("b");
    const p = await project(a, "basic");
    const other = await project(a, "other");
    const pb = await project(b, "foreign");
    const content = "日本語😀a";
    const t = await topic(a, p, "basic", content);
    const before = await snapshot(t);
    assert.equal(before.include_in_chat, false);
    pass("2 new topic defaults OFF");
    assert.deepEqual(ok(await toggle(a, p, t, true)), { is_included: true, included_chars: countChars(content) });
    pass("3 OFF to ON returns code point count");
    const on = await snapshot(t);
    ok(await toggle(a, p, t, true));
    assert.deepEqual(await snapshot(t), on);
    pass("4 same-value ON preserves revision / revision rows / updated_at / inclusion");
    ok(await toggle(a, p, t, false));
    const after = await snapshot(t);
    assert.equal(after.revision, before.revision);
    assert.equal(after.revisions, before.revisions);
    assert.equal(after.include_in_chat, false);
    pass("5 OFF to ON to OFF preserves revision and history count");
    // btrim(text) trims spaces, matching the existing promotion RPC exactly.
    const empty = await topic(a, p, "empty", "   ");
    expectError(await toggle(a, p, empty, true), "topic is empty");
    assert.equal(ok(await toggle(a, p, empty, false)).is_included, false);
    pass("6 spaces-only ON rejected; OFF succeeds");
    const boundary = await project(a, "boundary");
    const mixed = "あ😀".repeat(3999);
    assert.equal(countChars(mixed), 7998);
    const base = await topic(a, boundary, "mixed", mixed);
    const two = await topic(a, boundary, "two", "日😀");
    const extra = await topic(a, boundary, "extra", "字");
    ok(await toggle(a, boundary, base, true));
    assert.deepEqual(ok(await toggle(a, boundary, two, true)), { is_included: true, included_chars: 8000 });
    expectError(await toggle(a, boundary, extra, true), "chat inclusion limit exceeded");
    pass("7 8000 succeeds / 8001 rejects with Japanese and emoji code points");
    const overProject = await project(a, "over-budget");
    const overTopic = await topic(a, overProject, "over-budget", "start");
    ok(await toggle(a, overProject, overTopic, true));
    ok(await a.client.rpc("update_project_memory_topic", {
      p_user_id: a.id, p_topic_id: overTopic, p_expected_revision: 1, p_edit_kind: "full", p_new_content_md: "あ".repeat(8001), p_source_refs: [],
    }).single());
    const overBefore = await snapshot(overTopic);
    assert.deepEqual(ok(await toggle(a, overProject, overTopic, true)), { is_included: true, included_chars: 8001 });
    assert.deepEqual(await snapshot(overTopic), overBefore);
    assert.deepEqual(ok(await toggle(a, overProject, overTopic, false)), { is_included: false, included_chars: 0 });
    pass("8 edited over-budget topic allows unchanged ON and OFF");
    const foreign = await topic(b, pb, "foreign", "foreign");
    expectError(await toggle(a, pb, foreign, true), "topic not found");
    expectError(await toggle(a, pb, foreign, true, b.id), "Unauthorized", "42501");
    pass("9 cross-user topic hidden; forged user ID rejected with 42501");
    expectError(await toggle(a, other, t, true), "topic not found");
    pass("10 mismatched project rejected");
    expectError(await toggle(a, p, t, null), "include_in_chat is required");
    pass("11 NULL inclusion rejected");
    const multi = await project(a, "multiple");
    const m1 = await topic(a, multi, "one", "あ😀");
    const m2 = await topic(a, multi, "two", "abc😀");
    ok(await toggle(a, multi, m1, true));
    assert.equal(ok(await toggle(a, multi, m2, true)).included_chars, 6);
    assert.equal(ok(await toggle(a, multi, m1, true)).included_chars, 6);
    assert.equal(ok(await toggle(a, multi, m1, false)).included_chars, 4);
    pass("12 included_chars matches multiple ON topics and excludes OFF topic");
    const raceProject = await project(a, "race");
    const r1 = await topic(a, raceProject, "a", "あ".repeat(5000));
    const r2 = await topic(a, raceProject, "b", "😀".repeat(5000));
    // This smoke test checks concurrent final state in a real environment.
    // Static contract tests establish lock presence and Project-before-topic order.
    const results = await Promise.all([toggle(a, raceProject, r1, true), toggle(a, raceProject, r2, true)]);
    const successes = results.filter(result => !result.error);
    const errors = results.filter(result => result.error);
    assert.equal(successes.length, 1);
    assert.equal(errors.length, 1);
    expectError(errors[0], "chat inclusion limit exceeded");
    assert.equal(successes[0].data.included_chars, 5000);
    const rows = ok(await service.from("project_memory_topics").select("id,content_md,include_in_chat").eq("project_id", raceProject));
    const included = rows.filter(row => row.include_in_chat);
    assert.equal(included.length, 1);
    assert.equal(included.reduce((total, row) => total + countChars(row.content_md), 0), 5000);
    assert.equal(ok(await toggle(a, raceProject, included[0].id, true)).included_chars, 5000);
    pass("13 concurrency smoke: one ON / one limit error / final count one / total 5000");
  } finally {
    for (const id of users.reverse()) {
      try { ok(await service.auth.admin.deleteUser(id)); console.log(`[CLEANUP] deleted test user ${id}`); }
      catch (error) { fail(`cleanup user ${id}`, error); }
    }
    // Verify cascades removed all tracked fixtures, including revision rows.
    for (const [table, ids, column] of [["projects", projects, "id"], ["project_memory_topics", topics, "id"], ["project_memory_revisions", topics, "topic_id"]]) {
      if (!ids.length) continue;
      try {
        const result = await service.from(table).select(column, { count: "exact", head: true }).in(column, ids);
        ok(result);
        assert.equal(result.count, 0, `${table} fixtures remain after user deletion`);
        pass(`cleanup ${table}: no remaining fixtures`);
      } catch (error) { fail(`cleanup ${table}`, error); }
    }
  }
}
async function main() {
  assert.equal(process.argv.length, 2, "No arguments supported; this verifier is always test-only");
  loadEnvFile(resolve(process.env.CHAT_INCLUSION_ENV_FILE ?? ".env.local.test.bak"));
  loadEnvFile(resolve(".env.test.local"));
  const url = process.env.CHAT_INCLUSION_SUPABASE_URL ?? required("NEXT_PUBLIC_SUPABASE_URL");
  const parsed = new URL(url);
  assert.equal(parsed.protocol, "https:");
  assert.equal(parsed.hostname, `${TEST_PROJECT_REF}.supabase.co`, `Refusing non-test DB ${parsed.hostname}`);
  try { await catalog(); } catch (error) { fail("1 catalog", error); }
  await fixtures(url);
}
try { await main(); } catch (error) { fail("chat inclusion verification", error); }
console.log(`[RESULT] passed=${passed} failed=${failures}`);
process.exitCode = failures ? 1 : 0;
