// Test DB only. Rui applies v206 manually before running; this script never applies migrations.
// Codex must only run node --check on this file, never execute it against a DB.
// AUTO_SUMMARY_CURSORS_ENV_FILE defaults to .env.local.test.bak, then .env.test.local.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const TEST_PROJECT_REF = "jvarrlsqttfjiysaedlg";
const RPC = "advance_project_memory_auto_summary_cursors";
const TABLE = "project_memory_auto_summary_cursors";
let passed = 0;
let failures = 0;
function pass(label) { passed++; console.log(`[PASS] ${label}`); }
function fail(label, error) { failures++; console.error(`[FAIL] ${label} ${error.message ?? error}`); }
async function check(label, fn) {
  try { await fn(); pass(label); } catch (error) { fail(label, error); }
}
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
function required(name) { assert.ok(process.env[name], `${name} is required`); return process.env[name]; }
function ok(result) {
  if (result.error) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}
function expectError(result, message, code = "P0001") {
  assert.equal(result.error?.code, code);
  assert.equal(result.error?.message, message);
}

async function fixtures(url) {
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, process.env.AUTO_SUMMARY_CURSORS_SERVICE_ROLE_KEY ?? required("SUPABASE_SERVICE_ROLE_KEY"), options);
  const anonKey = process.env.AUTO_SUMMARY_CURSORS_ANON_KEY ?? required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const anon = createClient(url, anonKey, options);
  const users = [];
  const projects = [];
  const topics = [];
  const threads = [];
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = `AutoSummaryCursor-${randomUUID()}-aA1!`;
  async function user(label) {
    const email = `auto-summary-cursors-${label}-${suffix}@example.invalid`;
    const data = ok(await service.auth.admin.createUser({ email, password, email_confirm: true }));
    users.push(data.user.id);
    const client = createClient(url, anonKey, options);
    ok(await client.auth.signInWithPassword({ email, password }));
    return { id: data.user.id, client };
  }
  async function project(owner, label) {
    const data = ok(await service.from("projects").insert({ user_id: owner.id, name: `auto-summary-cursors-${label}-${suffix}` }).select("id").single());
    projects.push(data.id);
    return data.id;
  }
  async function topic(owner, projectId, label) {
    const data = ok(await owner.client.rpc("create_project_memory_topic", {
      p_user_id: owner.id, p_project_id: projectId, p_topic_key: `${label}-${suffix}`, p_content_md: "cursor fixture", p_source_refs: [],
    }).single());
    topics.push(data.topic_id);
    return data.topic_id;
  }
  async function thread(owner, projectId) {
    const data = ok(await service.from("threads").insert({ user_id: owner.id, project_id: projectId, title: `auto-summary-cursors-${suffix}` }).select("id").single());
    threads.push(data.id);
    return data.id;
  }
  async function message(owner, threadId, overrides = {}) {
    const row = { id: randomUUID(), user_id: owner.id, thread_id: threadId, role: "user", provider: "unknown", content: "cursor fixture", created_at: "2026-01-02T00:00:00.000Z", ...overrides };
    ok(await service.from("messages").insert(row));
    return { thread_id: threadId, message_id: row.id };
  }
  const advance = (owner, topicId, cursors, revision = 1, userId = owner.id) => owner.client.rpc(RPC, {
    p_user_id: userId, p_topic_id: topicId, p_expected_revision: revision, p_cursors: cursors,
  });
  const cursorRows = async topicId => ok(await service.from(TABLE).select("*").eq("topic_id", topicId).order("thread_id"));
  async function topicSnapshot(topicId) {
    const topic = ok(await service.from("project_memory_topics").select("*").eq("id", topicId).single());
    const history = ok(await service.from("project_memory_revisions").select("*").eq("topic_id", topicId).order("revision"));
    return { topic, history };
  }
  try {
    const a = await user("a");
    const b = await user("b");
    const pa = await project(a, "a");
    const other = await project(a, "other");
    const pb = await project(b, "b");
    const ta = await topic(a, pa, "a");
    const tb = await topic(b, pb, "b");
    const th = await thread(a, pa);
    const first = await message(a, th);
    const before = await topicSnapshot(ta);

    await check("auth mismatch returns Unauthorized / 42501 before other validation", async () => {
      expectError(await advance(a, ta, null, null, b.id), "Unauthorized", "42501");
      expectError(await advance(b, ta, [first], 1, a.id), "Unauthorized", "42501");
    });
    await check("anon cannot execute RPC", async () => {
      const result = await anon.rpc(RPC, { p_user_id: a.id, p_topic_id: ta, p_expected_revision: 1, p_cursors: [first] });
      assert.equal(result.error?.code, "42501");
      assert.match(result.error.message, /permission denied for function/);
    });
    await check("insert advances and timestamp comes from messages, ignoring caller timestamp", async () => {
      assert.equal(ok(await advance(a, ta, [{ ...first, message_created_at: "2099-01-01T00:00:00Z" }])), 1);
      const rows = await cursorRows(ta);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].message_id, first.message_id);
      assert.equal(Date.parse(rows[0].message_created_at), Date.parse("2026-01-02T00:00:00Z"));
    });
    await check("same cursor and regression return zero and preserve updated_at", async () => {
      const before = await cursorRows(ta);
      const old = await message(a, th, { created_at: "2026-01-01T00:00:00Z" });
      assert.equal(ok(await advance(a, ta, [first])), 0);
      assert.equal(ok(await advance(a, ta, [old])), 0);
      assert.deepEqual(await cursorRows(ta), before);
    });
    await check("newer message updates existing cursor and updated_at", async () => {
      const before = await cursorRows(ta);
      const newer = await message(a, th, { created_at: "2026-01-03T00:00:00Z" });
      assert.equal(ok(await advance(a, ta, [newer])), 1);
      const rows = await cursorRows(ta);
      assert.equal(rows[0].message_id, newer.message_id);
      assert.ok(Date.parse(rows[0].updated_at) >= Date.parse(before[0].updated_at));
    });
    await check("same created_at uses UUID order for forward/tie/backward", async () => {
      const tieThread = await thread(a, pa);
      const prefix = randomUUID().slice(0, -1);
      const low = await message(a, tieThread, { id: `${prefix}0` });
      const high = await message(a, tieThread, { id: `${prefix}f` });
      assert.equal(ok(await advance(a, ta, [low])), 1);
      assert.equal(ok(await advance(a, ta, [high])), 1);
      const before = await cursorRows(ta);
      assert.equal(ok(await advance(a, ta, [low])), 0);
      assert.equal(ok(await advance(a, ta, [high])), 0);
      assert.deepEqual(await cursorRows(ta), before);
    });
    await check("revision conflict does not mutate cursors", async () => {
      const before = await cursorRows(ta);
      expectError(await advance(a, ta, [first], 2), "revision conflict");
      assert.deepEqual(await cursorRows(ta), before);
    });
    await check("topic with null project, absent topic and foreign topic are not found", async () => {
      const detached = await topic(a, pa, "detached");
      ok(await service.from("project_memory_topics").update({ project_id: null }).eq("id", detached));
      for (const id of [detached, randomUUID(), tb]) expectError(await advance(a, id, [first]), "topic not found");
    });
    await check("ineligible candidates skip individually while valid candidate advances", async () => {
      const candidates = [];
      candidates.push(await message(a, await thread(a, other)));
      candidates.push(await message(b, await thread(b, pb)));
      candidates.push(await message(b, await thread(a, pa))); // message owner differs from thread owner
      candidates.push(await message(a, await thread(a, pa), { role: "assistant" }));
      candidates.push(await message(a, await thread(a, pa), { provider: "memo" }));
      candidates.push(await message(a, await thread(a, pa), { provider: "image_gen" }));
      candidates.push({ thread_id: await thread(a, pa), message_id: randomUUID() });
      const mismatchedThread = await thread(a, pa);
      candidates.push({ thread_id: mismatchedThread, message_id: first.message_id });
      const before = await cursorRows(ta);
      assert.equal(ok(await advance(a, ta, candidates)), 0);
      assert.deepEqual(await cursorRows(ta), before);
      const valid = await message(a, await thread(a, pa));
      assert.equal(ok(await advance(a, ta, [...candidates, valid])), 1);
      assert.equal((await cursorRows(ta)).length, before.length + 1);
    });
    await check("is_active=false still advances", async () => {
      const inactive = await message(a, await thread(a, pa), { is_active: false });
      assert.equal(ok(await advance(a, ta, [inactive])), 1);
    });
    await check("duplicate thread UUIDs, including case variants, reject", async () => {
      expectError(await advance(a, ta, [first, first]), "duplicate thread_id");
      expectError(await advance(a, ta, [first, { ...first, thread_id: th.toUpperCase() }]), "duplicate thread_id");
    });
    await check("zero and 101 entries reject; 100 valid-shaped absent candidates succeed", async () => {
      expectError(await advance(a, ta, []), "cursors must contain 1 to 100 items");
      const absent = Array.from({ length: 101 }, () => ({ thread_id: randomUUID(), message_id: randomUUID() }));
      expectError(await advance(a, ta, absent), "cursors must contain 1 to 100 items");
      assert.equal(ok(await advance(a, ta, absent.slice(0, 100))), 0);
    });
    await check("revision and JSON validation precede topic existence checks", async () => {
      for (const revision of [null, 0, -1]) expectError(await advance(a, randomUUID(), null, revision), "expected_revision must be a positive integer");
      for (const cursors of [null, {}, "array"]) expectError(await advance(a, randomUUID(), cursors), "cursors must be a jsonb array");
      for (const element of [null, [], 1, {}, { thread_id: th, message_id: 1 }, { thread_id: "bad", message_id: first.message_id }, { thread_id: th, message_id: "bad" }]) {
        expectError(await advance(a, randomUUID(), [element]), "invalid cursor element");
      }
    });
    await check("RLS hides foreign cursor rows and allows own SELECT", async () => {
      const foreign = await message(b, await thread(b, pb));
      assert.equal(ok(await advance(b, tb, [foreign])), 1);
      assert.equal(ok(await b.client.from(TABLE).select("*").eq("topic_id", tb)).length, 1);
      assert.deepEqual(ok(await a.client.from(TABLE).select("*").eq("topic_id", tb)), []);
      assert.deepEqual(ok(await b.client.from(TABLE).select("*").eq("topic_id", ta)), []);
    });
    await check("direct authenticated writes and anon SELECT denied", async () => {
      const result = await a.client.from(TABLE).insert({ topic_id: ta, thread_id: th, message_id: first.message_id, message_created_at: "2026-01-02T00:00:00Z" });
      assert.equal(result.error?.code, "42501");
      assert.equal((await a.client.from(TABLE).update({ message_id: randomUUID() }).eq("topic_id", ta)).error?.code, "42501");
      assert.equal((await a.client.from(TABLE).delete().eq("topic_id", ta)).error?.code, "42501");
      assert.equal((await anon.from(TABLE).select("*")).error?.code, "42501");
    });
    await check("message physical deletion leaves cursor intact (no FK)", async () => {
      const temp = await message(a, await thread(a, pa));
      assert.equal(ok(await advance(a, ta, [temp])), 1);
      const before = await cursorRows(ta);
      ok(await service.from("messages").delete().eq("id", temp.message_id));
      assert.deepEqual(await cursorRows(ta), before);
    });
    await check("cursor advancement preserves full topic and revision history", async () => {
      assert.deepEqual(await topicSnapshot(ta), before);
    });
    await check("topic deletion cascades cursor rows", async () => {
      const tempTopic = await topic(a, pa, "cascade-topic");
      assert.equal(ok(await advance(a, tempTopic, [first])), 1);
      ok(await service.from("project_memory_topics").delete().eq("id", tempTopic));
      assert.deepEqual(await cursorRows(tempTopic), []);
    });
    await check("thread deletion cascades cursor rows", async () => {
      const tempThread = await thread(a, pa);
      const temp = await message(a, tempThread);
      assert.equal(ok(await advance(a, ta, [temp])), 1);
      ok(await service.from("threads").delete().eq("id", tempThread));
      assert.deepEqual(ok(await service.from(TABLE).select("*").eq("thread_id", tempThread)), []);
    });
  } finally {
    for (const id of users.reverse()) {
      await check(`cleanup test user ${id}`, async () => { ok(await service.auth.admin.deleteUser(id)); });
    }
    for (const [table, ids, column] of [["projects", projects, "id"], ["threads", threads, "id"], ["project_memory_topics", topics, "id"], ["project_memory_revisions", topics, "topic_id"], [TABLE, topics, "topic_id"]]) {
      if (!ids.length) continue;
      await check(`cleanup ${table}: no remaining fixtures`, async () => {
        const result = await service.from(table).select(column, { count: "exact", head: true }).in(column, ids);
        ok(result);
        assert.equal(result.count, 0);
      });
    }
  }
}
async function main() {
  assert.equal(process.argv.length, 2, "No arguments supported; this verifier is always test-only");
  loadEnvFile(resolve(process.env.AUTO_SUMMARY_CURSORS_ENV_FILE ?? ".env.local.test.bak"));
  loadEnvFile(resolve(".env.test.local"));
  const url = process.env.AUTO_SUMMARY_CURSORS_SUPABASE_URL ?? required("NEXT_PUBLIC_SUPABASE_URL");
  const parsed = new URL(url);
  assert.equal(parsed.protocol, "https:");
  assert.equal(parsed.hostname, `${TEST_PROJECT_REF}.supabase.co`, `Refusing non-test DB ${parsed.hostname}`);
  assert.equal(parsed.port, "");
  assert.equal(parsed.username, "");
  assert.equal(parsed.password, "");
  await fixtures(url);
}
try { await main(); } catch (error) { fail("auto summary cursor verification", error); }
console.log(`[RESULT] passed=${passed} failed=${failures}`);
process.exitCode = failures ? 1 : 0;
