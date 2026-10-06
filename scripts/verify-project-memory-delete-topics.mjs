// Test DB only. Rui must apply v205 manually before running this verifier.
// No migrations are applied here. Excluded from normal *.test.cjs execution.
// DELETE_TOPICS_ENV_FILE defaults to .env.local.test.bak, then .env.test.local.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const TEST_PROJECT_REF = "jvarrlsqttfjiysaedlg";
const RPC = "delete_project_memory_topics";
let passed = 0, failures = 0;
const pass = label => { passed++; console.log(`[PASS] ${label}`); };
const fail = (label, error) => { failures++; console.error(`[FAIL] ${label}: ${error.message ?? error}`); };
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
function ok(result) { if (result.error) throw new Error(`${result.error.code}: ${result.error.message}`); return result.data; }
function expectError(result, message, code = "P0001") {
  assert.equal(result.error?.code, code);
  assert.equal(result.error?.message, message);
}

async function fixtures(url) {
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, process.env.DELETE_TOPICS_SERVICE_ROLE_KEY ?? required("SUPABASE_SERVICE_ROLE_KEY"), options);
  const anonKey = process.env.DELETE_TOPICS_ANON_KEY ?? required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const users = [], projects = [], topicIds = [], loreIds = [];
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = `DeleteTopics-${randomUUID()}-aA1!`;
  async function user(label) {
    const email = `delete-topics-${label}-${suffix}@example.invalid`;
    const { user: created } = ok(await service.auth.admin.createUser({ email, password, email_confirm: true }));
    users.push(created.id);
    const client = createClient(url, anonKey, options);
    ok(await client.auth.signInWithPassword({ email, password }));
    return { id: created.id, client };
  }
  async function project(owner, label) {
    const row = ok(await service.from("projects").insert({ user_id: owner.id, name: `delete-topics-${label}-${suffix}` }).select("id").single());
    projects.push(row.id); return row.id;
  }
  async function topic(owner, projectId, label) {
    const row = ok(await owner.client.rpc("create_project_memory_topic", {
      p_user_id: owner.id, p_project_id: projectId, p_topic_key: `${label}-${suffix}`, p_content_md: "日本語😀", p_source_refs: [],
    }).single());
    topicIds.push(row.topic_id); return row.topic_id;
  }
  const element = (id, revision = 1) => ({ topic_id: id, expected_revision: revision });
  const remove = (owner, projectId, topics, userId = owner.id) => owner.client.rpc(RPC, {
    p_user_id: userId, p_project_id: projectId, p_topics: topics,
  });
  async function rows(table, ids, column = "id") {
    return ok(await service.from(table).select("*").in(column, ids).order("id"));
  }
  async function assertUnchanged(ids, snapshot) {
    assert.deepEqual(await rows("project_memory_topics", ids), snapshot.topics);
    assert.deepEqual(await rows("project_memory_revisions", ids, "topic_id"), snapshot.revisions);
  }
  async function snapshot(ids) {
    return { topics: await rows("project_memory_topics", ids), revisions: await rows("project_memory_revisions", ids, "topic_id") };
  }
  try {
    const a = await user("a"), b = await user("b");
    const p = await project(a, "basic"), other = await project(a, "other"), foreignProject = await project(b, "foreign");
    const first = await topic(a, p, "first"), second = await topic(a, p, "second");
    ok(await a.client.rpc("update_project_memory_topic", {
      p_user_id: a.id, p_topic_id: first, p_expected_revision: 1, p_edit_kind: "full", p_new_content_md: "更新😀", p_source_refs: [],
    }).single());
    assert.equal((await rows("project_memory_revisions", [first, second], "topic_id")).length, 3);
    const embedding = Array(1536).fill(0); embedding[0] = 1;
    const promoted = ok(await a.client.rpc("promote_project_memory_topic_to_lore", {
      p_user_id: a.id, p_topic_id: first, p_expected_revision: 2, p_embedding: embedding,
    }).single());
    loreIds.push(promoted.lore_id);
    const beforeLore = await rows("lore_embeddings", loreIds);
    assert.equal(beforeLore.length, 1);
    assert.equal(ok(await remove(a, p, [element(first, 2), element(second)])), 2);
    assert.deepEqual(await rows("project_memory_topics", [first, second]), []);
    assert.deepEqual(await rows("project_memory_revisions", [first, second], "topic_id"), []);
    pass("1 two topics and all revision history deleted by cascade");
    assert.deepEqual(await rows("lore_embeddings", loreIds), beforeLore);
    pass("4 promoted Lore remains byte-for-byte unchanged");

    const local = await topic(a, p, "local"), local2 = await topic(a, p, "local2");
    const initial = await snapshot([local, local2]);
    expectError(await remove(a, p, [element(local), element(local2, 2)]), "revision conflict");
    await assertUnchanged([local, local2], initial);
    pass("2 one revision conflict leaves both topics and histories untouched");
    const otherTopic = await topic(a, other, "other"), foreign = await topic(b, foreignProject, "foreign");
    for (const id of [otherTopic, foreign, randomUUID()]) {
      const all = [local, local2, otherTopic, foreign], before = await snapshot(all);
      expectError(await remove(a, p, [element(local), element(id)]), "topic not found");
      await assertUnchanged(all, before);
    }
    pass("3 cross-project / cross-user / missing topic is fail-closed and atomic");

    const bad = [
      [null, "topics must be a jsonb array"], [{}, "topics must be a jsonb array"],
      [[], "topics must contain 1 to 50 items"], [Array(51).fill(element(local)), "topics must contain 1 to 50 items"],
      [[null], "invalid topic element"], [[{}], "invalid topic element"],
      [[element("invalid")], "invalid topic element"],
      ...[0, -1, 2147483648, 1e100, "999999999999999999999", "1", 1.5, null].map(rev => [[element(local, rev)], "invalid topic element"]),
      [[element(local), element(local)], "duplicate topic_id"],
      [[element(local), element(local.toUpperCase())], "duplicate topic_id"],
    ];
    // A genuine oversized JSON number (not a JSON string) exercises pre-cast upper bound.
    const oversized = JSON.parse(`[{"topic_id":"${local}","expected_revision":999999999999999999999}]`);
    bad.push([oversized, "invalid topic element"]);
    for (const [input, message] of bad) {
      expectError(await remove(a, p, input), message);
      await assertUnchanged([local, local2], initial);
    }
    pass("5 malformed inputs always return expected P0001, never 22P02 / overflow");
    expectError(await remove(a, p, [element(local)], b.id), "Unauthorized", "42501");
    expectError(await remove(a, p, [element(local)], null), "Unauthorized", "42501");
    await assertUnchanged([local, local2], initial);
    pass("6 forged / NULL user rejected with 42501");
  } finally {
    for (const id of users.reverse()) {
      try { ok(await service.auth.admin.deleteUser(id)); }
      catch (error) { fail(`cleanup test user ${id}`, error); }
    }
    for (const [table, ids, column] of [["projects", projects, "id"], ["project_memory_topics", topicIds, "id"],
      ["project_memory_revisions", topicIds, "topic_id"], ["lore_embeddings", loreIds, "id"]]) {
      if (!ids.length) continue;
      try { assert.deepEqual(await rows(table, ids, column), []); pass(`cleanup ${table}`); }
      catch (error) { fail(`cleanup ${table}`, error); }
    }
  }
}
async function main() {
  assert.equal(process.argv.length, 2, "No arguments supported; this verifier is always test-only");
  loadEnvFile(resolve(process.env.DELETE_TOPICS_ENV_FILE ?? ".env.local.test.bak"));
  loadEnvFile(resolve(".env.test.local"));
  const url = process.env.DELETE_TOPICS_SUPABASE_URL ?? required("NEXT_PUBLIC_SUPABASE_URL");
  const parsed = new URL(url);
  assert.equal(parsed.protocol, "https:");
  assert.equal(parsed.hostname, `${TEST_PROJECT_REF}.supabase.co`, `Refusing non-test DB ${parsed.hostname}`);
  await fixtures(url);
}
try { await main(); } catch (error) { fail("topic delete verification", error); }
console.log(`[RESULT] passed=${passed} failed=${failures}`);
process.exitCode = failures ? 1 : 0;
