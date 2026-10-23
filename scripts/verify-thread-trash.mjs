// Test DB only. v207 applied to test and production on 2026-10-23.
// Definition: docs/applied/migration_v207_thread_trash.sql; this verifier never applies migrations.
// Codex: node --check only; never execute this file or apply migrations.
// Manual CMD: node scripts\verify-thread-trash.mjs
// THREAD_TRASH_ENV_FILE defaults to .env.local.test.bak, then .env.test.local.
// Optional overrides: THREAD_TRASH_SUPABASE_URL, THREAD_TRASH_ANON_KEY,
// THREAD_TRASH_SERVICE_ROLE_KEY. The test project ref is fixed, with no CLI override.
// Creates disposable users and rows; never purges IDs from the global expired list.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const TEST_PROJECT_REF = "jvarrlsqttfjiysaedlg";
const DAY_MS = 24 * 60 * 60 * 1000;
// thread_tags_name_check: char_length(name) <= 20
const TAG_NAMES = { fixture: "trash-test", authenticated: "trash-auth", serviceRole: "trash-service" };
let passed = 0, failures = 0;
function pass(label) { passed++; console.log(`[PASS] ${label}`); }
function fail(label, error) { failures++; console.error(`[FAIL] ${label}: ${error.message ?? error}`); }
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
function expectPermissionDenied(result) {
  assert.equal(result.error?.code, "42501");
  assert.match(result.error.message, /permission denied for function/);
}

async function fixtures(url) {
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, process.env.THREAD_TRASH_SERVICE_ROLE_KEY ?? required("SUPABASE_SERVICE_ROLE_KEY"), options);
  const anonKey = process.env.THREAD_TRASH_ANON_KEY ?? required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const anon = createClient(url, anonKey, options);
  const users = [], threads = [], projects = [], loreIds = [];
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = `ThreadTrash-${randomUUID()}-aA1!`;
  async function user(label) {
    const email = `thread-trash-${label}-${suffix}@example.invalid`;
    const { user: created } = ok(await service.auth.admin.createUser({ email, password, email_confirm: true }));
    users.push(created.id);
    const client = createClient(url, anonKey, options);
    ok(await client.auth.signInWithPassword({ email, password }));
    return { id: created.id, client };
  }
  async function thread(owner, overrides = {}) {
    const row = ok(await service.from("threads").insert({ user_id: owner.id, title: `thread-trash-${suffix}`, ...overrides }).select("id").single());
    threads.push(row.id);
    return row.id;
  }
  async function lore(owner, threadId, overrides = {}) {
    const row = ok(await service.from("lore_embeddings").insert({ user_id: owner.id, source_thread_id: threadId, chunk_text: `trash fixture ${suffix}`, ...overrides }).select("id").single());
    loreIds.push(row.id);
    return row.id;
  }
  const row = async (table, id) => ok(await service.from(table).select("*").eq("id", id).single());
  const rows = async (table, ids) => ok(await service.from(table).select("*").in("id", ids).order("id"));
  const trash = (owner, id, userId = owner.id) => owner.client.rpc("soft_delete_thread", { p_user_id: userId, p_thread_id: id });
  const restore = (owner, id, userId = owner.id) => owner.client.rpc("restore_thread", { p_user_id: userId, p_thread_id: id });
  const list = owner => owner.client.rpc("list_trashed_threads", { p_user_id: owner.id });
  const purge = id => service.rpc("purge_expired_thread", { p_thread_id: id });
  const messagePayload = (owner, threadId) => ({ id: randomUUID(), user_id: owner.id, thread_id: threadId, role: "user", provider: "user", content: `trash fixture ${suffix}` });
  async function visibility(threadId, ownerId, messageId, tagId, visible) {
    assert.equal(ok(await anon.rpc("get_public_threads_projection").eq("id", threadId)).length, visible ? 1 : 0);
    assert.equal(ok(await anon.from("public_threads_view").select("id").eq("id", threadId)).length, visible ? 1 : 0);
    const message = await row("messages", messageId);
    assert.equal(ok(await anon.rpc("is_visible_public_message", { p_thread_id: threadId, p_created_at: message.created_at })), visible);
    assert.equal(ok(await anon.rpc("is_visible_public_thread_tag", { p_thread_id: threadId, p_tag_user_id: ownerId })), visible);
    assert.equal(ok(await anon.from("messages").select("id").eq("id", messageId)).length, visible ? 1 : 0);
    assert.equal(ok(await anon.from("thread_tags").select("id").eq("id", tagId)).length, visible ? 1 : 0);
  }

  try {
    const a = await user("a"), b = await user("b");
    const project = ok(await service.from("projects").insert({ user_id: a.id, name: `thread-trash-${suffix}` }).select("id").single()).id;
    projects.push(project);
    const parent = await thread(b, { is_public: true });
    await thread(b, { forked_from_id: parent }); // same-owner child is never counted
    const target = await thread(a, { forked_from_id: parent, is_public: true, project_id: project });
    const normal = await thread(a);
    const firstMessage = messagePayload(a, target);
    ok(await service.from("messages").insert(firstMessage));
    const tag = ok(await service.from("thread_tags").insert({ user_id: a.id, thread_id: target, name: TAG_NAMES.fixture }).select("id").single()).id;
    const threadNote = ok(await service.from("thread_notes").insert({ user_id: a.id, thread_id: target, content: "trash note" }).select("id").single()).id;
    const messageNote = ok(await service.from("message_notes").insert({ user_id: a.id, thread_id: target, message_id: firstMessage.id, content: "trash message note" }).select("id").single()).id;
    const draft = ok(await service.from("drafts").insert({ user_id: a.id, thread_id: target, content: "trash draft" }).select("id").single()).id;
    const pinned = await lore(a, target, { is_pinned: true });
    const manual = await lore(a, target, { is_archived: true });
    const superseded = await lore(a, target, { superseded_by: pinned });
    const foreignLore = await lore(b, target);
    const unrelated = await lore(a, normal);
    const eligible = await lore(a, target);
    const laterSuperseded = await lore(a, target);
    const protectedIds = [pinned, manual, superseded, foreignLore, unrelated];
    const protectedBefore = await rows("lore_embeddings", protectedIds);
    let deletedAt;

    await check("live thread: NULL deleted_at, public projection/messages/tags visible, fork count includes foreign-owner child", async () => {
      assert.equal((await row("threads", target)).deleted_at, null);
      await visibility(target, a.id, firstMessage.id, tag, true);
      ok(await a.client.rpc("recalc_fork_count", { p_thread_id: parent }));
      assert.equal((await row("threads", parent)).fork_count, 1);
      ok(await restore(a, normal)); // live restore is a no-op
      assert.equal((await row("threads", normal)).deleted_at, null);
    });

    await check("soft delete sets timestamp; repeat does not extend retention", async () => {
      deletedAt = ok(await trash(a, target));
      assert.ok(Number.isFinite(Date.parse(deletedAt)));
      assert.equal((await row("threads", target)).deleted_at, deletedAt);
      assert.equal(ok(await trash(a, target)), deletedAt);
      assert.equal((await row("threads", target)).deleted_at, deletedAt);
    });

    await check("Lore: only eligible rows archive with the exact deletion marker; protected rows unchanged", async () => {
      for (const id of [eligible, laterSuperseded]) {
        const le = await row("lore_embeddings", id);
        assert.equal(le.is_archived, true);
        assert.equal(le.archived_by_thread_delete_at, deletedAt);
      }
      assert.deepEqual(await rows("lore_embeddings", protectedIds), protectedBefore);
    });

    await check("foreign soft delete / restore rejected; forged and NULL p_user_id rejected before lookup", async () => {
      const before = await row("threads", target);
      expectError(await trash(b, target), "thread not found");
      expectError(await restore(b, target), "thread not found");
      for (const rpc of [trash, restore]) {
        expectError(await rpc(b, target, a.id), "Unauthorized", "42501");
        expectError(await rpc(a, target, null), "Unauthorized", "42501");
        expectError(await rpc(a, randomUUID()), "thread not found");
      }
      expectError(await b.client.rpc("list_trashed_threads", { p_user_id: a.id }), "Unauthorized", "42501");
      assert.deepEqual(await row("threads", target), before);
    });

    await check("RPC ACLs: anon cannot call user RPCs; authenticated/anon cannot call service RPCs", async () => {
      for (const name of ["soft_delete_thread", "restore_thread", "list_trashed_threads"]) {
        expectPermissionDenied(await anon.rpc(name, { p_user_id: a.id, ...(name === "list_trashed_threads" ? {} : { p_thread_id: target }) }));
      }
      for (const client of [a.client, anon]) {
        expectPermissionDenied(await client.rpc("list_expired_trashed_threads", { p_limit: 1 }));
        expectPermissionDenied(await client.rpc("purge_expired_thread", { p_thread_id: target }));
      }
    });

    await check("trash listing contains owned thread and expiry, excludes live/foreign threads and sorts newest first", async () => {
      assert.equal(ok(await a.client.rpc("thread_trash_retention")), "7 days");
      const newer = await thread(a);
      ok(await trash(a, newer));
      const result = ok(await list(a));
      assert.deepEqual(new Set(result.map(t => t.id)), new Set([target, newer]));
      for (let i = 1; i < result.length; i++) assert.ok(Date.parse(result[i - 1].deleted_at) >= Date.parse(result[i].deleted_at));
      const item = result.find(t => t.id === target);
      assert.deepEqual(Object.keys(item).sort(), ["id", "title", "deleted_at", "expires_at", "is_public", "project_id"].sort());
      assert.equal(item.deleted_at, deletedAt);
      assert.equal(Date.parse(item.expires_at) - Date.parse(item.deleted_at), 7 * DAY_MS);
      assert.equal(item.is_public, true);
      assert.equal(item.project_id, project);
      assert.deepEqual(ok(await list(b)), []);
      ok(await restore(a, newer));
    });

    await check("INSERT guard blocks authenticated and service_role messages, but normal threads accept both", async () => {
      for (const client of [a.client, service]) {
        expectError(await client.from("messages").insert(messagePayload(a, target)), "thread is in trash");
        ok(await client.from("messages").insert(messagePayload(a, normal)));
      }
      assert.equal(ok(await service.from("messages").select("id").eq("thread_id", target)).length, 1);
      assert.equal(ok(await service.from("messages").select("id").eq("thread_id", normal)).length, 2);
    });

    await check("INSERT guards also protect tags, thread notes, message notes and drafts", async () => {
      for (const [client, tagName] of [[a.client, TAG_NAMES.authenticated], [service, TAG_NAMES.serviceRole]]) {
        for (const [table, extra] of [["thread_tags", { name: tagName }], ["thread_notes", { content: "blocked" }],
          ["message_notes", { content: "blocked", message_id: firstMessage.id }], ["drafts", { content: "blocked" }]]) {
          expectError(await client.from(table).insert({ user_id: a.id, thread_id: target, ...extra }), "thread is in trash");
        }
      }
      // The guard lets absent parents proceed to the FK rather than manufacturing trash errors.
      assert.equal((await service.from("messages").insert(messagePayload(a, randomUUID()))).error?.code, "23503");
    });

    await check("anonymous callers cannot see trashed public thread in projection, public messages or tags", async () => {
      await visibility(target, a.id, firstMessage.id, tag, false);
      assert.equal((await row("threads", target)).is_public, true);
    });

    await check("fork count excludes trash, with same-owner child still excluded", async () => {
      assert.equal((await row("threads", parent)).fork_count, 0);
    });

    await check("purge before expiry, on live thread and absent ID returns false", async () => {
      for (const id of [target, normal, randomUUID()]) assert.equal(ok(await purge(id)), false);
      assert.equal((await row("threads", target)).deleted_at, deletedAt);
    });

    await check("restore clears all markers, preserves superseded archive and unmarked manual archive; repeat is a no-op", async () => {
      ok(await service.from("lore_embeddings").update({ superseded_by: pinned }).eq("id", laterSuperseded));
      ok(await restore(a, target));
      assert.equal((await row("threads", target)).deleted_at, null);
      assert.equal((await row("lore_embeddings", eligible)).is_archived, false);
      const supersededRow = await row("lore_embeddings", laterSuperseded);
      assert.equal(supersededRow.is_archived, true);
      assert.equal(supersededRow.superseded_by, pinned);
      for (const le of await rows("lore_embeddings", [...protectedIds, eligible, laterSuperseded])) assert.equal(le.archived_by_thread_delete_at, null);
      assert.deepEqual(await rows("lore_embeddings", protectedIds), protectedBefore);
      const before = { thread: await row("threads", target), lore: await rows("lore_embeddings", loreIds) };
      ok(await restore(a, target));
      assert.deepEqual({ thread: await row("threads", target), lore: await rows("lore_embeddings", loreIds) }, before);
      assert.deepEqual(ok(await list(a)), []);
    });

    await check("restoration restores fork count, anonymous visibility and INSERT access", async () => {
      assert.equal((await row("threads", parent)).fork_count, 1);
      await visibility(target, a.id, firstMessage.id, tag, true);
      for (const client of [a.client, service]) ok(await client.from("messages").insert(messagePayload(a, target)));
    });

    await check("eight-day-old trash rejects restore with exact P0001 and preserves all data", async () => {
      ok(await trash(a, target));
      // Dedicated fixture only: service_role changes timestamp to simulate expiration.
      const expiredAt = new Date(Date.now() - 8 * DAY_MS).toISOString();
      ok(await service.from("threads").update({ deleted_at: expiredAt }).eq("id", target));
      const before = { thread: await row("threads", target), lore: await rows("lore_embeddings", loreIds) };
      expectError(await restore(a, target), "trash retention expired");
      assert.deepEqual({ thread: await row("threads", target), lore: await rows("lore_embeddings", loreIds) }, before);
    });

    await check("expired listing validates limit, returns bounded expired rows in deleted_at/id order", async () => {
      for (const p_limit of [null, 0, -1, 201]) {
        expectError(await service.rpc("list_expired_trashed_threads", { p_limit }), "limit must be between 1 and 200");
      }
      for (const p_limit of [1, 200]) {
        const result = ok(await service.rpc("list_expired_trashed_threads", { p_limit }));
        assert.ok(result.length >= 1 && result.length <= p_limit);
        let previous;
        for (const item of result) {
          assert.deepEqual(Object.keys(item).sort(), ["id", "user_id"]);
          const th = await row("threads", item.id);
          assert.equal(item.user_id, th.user_id);
          assert.ok(th.deleted_at && Date.parse(th.deleted_at) + 7 * DAY_MS <= Date.now());
          if (previous) assert.ok(Date.parse(previous.deleted_at) < Date.parse(th.deleted_at) ||
            (Date.parse(previous.deleted_at) === Date.parse(th.deleted_at) && previous.id < th.id));
          previous = th;
        }
        // Read only: these rows can include other test data. Never purge this list.
      }
    });

    await check("purge after expiry returns true and CASCADE removes messages/tags/notes/drafts; repeat returns false", async () => {
      const beforeForkCount = (await row("threads", parent)).fork_count;
      assert.equal(beforeForkCount, 0);
      assert.equal(ok(await purge(target)), true);
      assert.deepEqual(await rows("threads", [target]), []);
      for (const table of ["messages", "thread_tags", "thread_notes", "message_notes", "drafts"]) {
        assert.deepEqual(ok(await service.from(table).select("id").eq("thread_id", target)), []);
      }
      for (const [table, id] of [["thread_tags", tag], ["thread_notes", threadNote], ["message_notes", messageNote], ["drafts", draft]]) {
        assert.deepEqual(await rows(table, [id]), []);
      }
      assert.equal(ok(await purge(target)), false);
      assert.equal((await row("threads", parent)).fork_count, beforeForkCount);
      // Lore FK is SET NULL, not CASCADE; physical deletion intentionally preserves Lore.
      for (const le of await rows("lore_embeddings", [eligible, pinned, manual, superseded, laterSuperseded, foreignLore])) assert.equal(le.source_thread_id, null);
    });
  } finally {
    for (const id of users.reverse()) {
      await check(`cleanup test user ${id}`, async () => { ok(await service.auth.admin.deleteUser(id)); });
    }
    for (const [table, ids] of [["projects", projects], ["threads", threads], ["lore_embeddings", loreIds]]) {
      if (!ids.length) continue;
      await check(`cleanup ${table}: no remaining fixtures`, async () => {
        const result = await service.from(table).select("id", { count: "exact", head: true }).in("id", ids);
        ok(result);
        assert.equal(result.count, 0);
      });
    }
    // Auth-user CASCADE also removes note/message/tag/draft fixtures and normal-thread INSERTs.
    for (const table of ["messages", "thread_tags", "thread_notes", "message_notes", "drafts"]) {
      if (!threads.length) continue;
      await check(`cleanup ${table}: no remaining thread children`, async () => {
        const result = await service.from(table).select("id", { count: "exact", head: true }).in("thread_id", threads);
        ok(result);
        assert.equal(result.count, 0);
      });
    }
  }
}

async function main() {
  assert.equal(process.argv.length, 2, "No arguments supported; this verifier is always test-only");
  loadEnvFile(resolve(process.env.THREAD_TRASH_ENV_FILE ?? ".env.local.test.bak"));
  loadEnvFile(resolve(".env.test.local"));
  const url = process.env.THREAD_TRASH_SUPABASE_URL ?? required("NEXT_PUBLIC_SUPABASE_URL");
  const parsed = new URL(url);
  assert.equal(parsed.protocol, "https:");
  assert.equal(parsed.hostname, `${TEST_PROJECT_REF}.supabase.co`, `Refusing non-test DB ${parsed.hostname}`);
  assert.equal(parsed.port, "");
  assert.equal(parsed.username, "");
  assert.equal(parsed.password, "");
  assert.equal(parsed.pathname, "/");
  assert.equal(parsed.search, "");
  assert.equal(parsed.hash, "");
  await fixtures(parsed.origin);
}
try { await main(); } catch (error) { fail("thread trash verification", error); }
console.log(`[RESULT] passed=${passed} failed=${failures}`);
process.exitCode = failures ? 1 : 0;
