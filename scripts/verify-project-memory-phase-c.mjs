import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const TEST_PROJECT_REF = "jvarrlsqttfjiysaedlg";
const ZERO_EMBEDDING = Array.from({ length: 1536 }, () => 0);

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function pass(label, details = {}) {
  console.log(`[PASS] ${label} ${JSON.stringify(details)}`);
}

function fail(label, error) {
  console.error(`[FAIL] ${label} ${JSON.stringify({
    message: error instanceof Error ? error.message : String(error),
  })}`);
}

function expectNoError(error, context) {
  if (error) {
    throw new Error(`${context}: ${error.code ?? "unknown"} ${error.message}`);
  }
}

function expectRpcError(error, code, messagePart, context) {
  assert.ok(error, `${context}: RPC should fail`);
  assert.equal(error.code, code, `${context}: SQLSTATE`);
  if (messagePart) assert.match(error.message, new RegExp(messagePart));
  pass(context, { code: error.code, message: error.message });
}

async function apiRequest(baseUrl, accessToken, path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  if (init.body !== undefined) headers.set("content-type", "application/json");

  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path}: HTTP ${response.status} ${text}`);
  }
  return { status: response.status, body };
}

async function selectSingle(client, table, id, columns) {
  const { data, error } = await client
    .from(table)
    .select(columns)
    .eq("id", id)
    .single();
  expectNoError(error, `select ${table}/${id}`);
  return data;
}

async function insertLore(client, userId, rows) {
  const payload = rows.map((row, index) => ({
    user_id: userId,
    folder_name: row.folderName ?? null,
    project_id: row.projectId ?? null,
    chunk_text: row.text ?? `phase-c-source-${index}`,
    embedding: ZERO_EMBEDDING,
    memory_kind: "fact",
    temporal_status: "current",
    importance_score: 0.5,
    confidence_score: 0.8,
    tags: [],
    is_pinned: false,
    is_archived: false,
    extraction_version: row.extractionVersion ?? "temporal_v1",
    source_type: "phase_c_verification",
    ...(row.createdAt ? { created_at: row.createdAt } : {}),
  }));
  const { data, error } = await client
    .from("lore_embeddings")
    .insert(payload)
    .select("id");
  expectNoError(error, "insert lore fixtures");
  assert.equal(data.length, rows.length);
  return data.map((row) => row.id);
}

async function deleteLore(client, ids) {
  if (!ids.length) return;
  const { error } = await client.from("lore_embeddings").delete().in("id", ids);
  expectNoError(error, "delete negative-test lore fixtures");
}

async function fetchAll(client, table, columns, configure = (query) => query) {
  const pageSize = 1000;
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const query = configure(client.from(table).select(columns)).range(start, start + pageSize - 1);
    const { data, error } = await query;
    expectNoError(error, `fetch invariant rows from ${table}`);
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

loadEnvFile(resolve(process.env.PHASE_C_ENV_FILE ?? ".env.local.test.bak"));

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const openaiKey = process.env.PHASE_C_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
const baseUrl = new URL(process.env.PHASE_C_BASE_URL ?? "http://127.0.0.1:3000");

assert.equal(
  new URL(supabaseUrl).hostname.split(".")[0],
  TEST_PROJECT_REF,
  `Refusing to run outside test project ${TEST_PROJECT_REF}`,
);
if (!openaiKey) {
  throw new Error("PHASE_C_OPENAI_API_KEY or OPENAI_API_KEY is required for embed/like verification");
}

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anonymous = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `PhaseC-${randomUUID()}-aA1!`;
const createdUserIds = [];

async function createTestUser(label) {
  const email = `phase-c-${label}-${suffix}@example.invalid`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expectNoError(error, `create ${label} test user`);
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email };
}

async function getProject(client, userId, name) {
  const { data, error } = await client.rpc("get_or_create_project", {
    p_user_id: userId,
    p_name: name,
  });
  expectNoError(error, `get_or_create_project(${name})`);
  assert.match(data, /^[0-9a-f-]{36}$/i);
  return data;
}

async function run() {
  const userA = await createTestUser("a");
  const userB = await createTestUser("b");

  const { data: signIn, error: signInError } = await anonymous.auth.signInWithPassword({
    email: userA.email,
    password,
  });
  expectNoError(signInError, "sign in test user A");
  const accessToken = signIn.session?.access_token;
  assert.ok(accessToken, "access token must be returned");

  const authenticated = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const folderA = `phase-c-a-${suffix}`;
  const folderB = `phase-c-b-${suffix}`;
  const folderMcp = `phase-c-mcp-${suffix}`;
  const threadId = randomUUID();

  await apiRequest(baseUrl, accessToken, `/api/threads/${threadId}`, {
    method: "PATCH",
    body: { title: "Phase C verification", folder_name: folderA },
  });
  let thread = await selectSingle(service, "threads", threadId, "id, user_id, folder_name, project_id");
  assert.equal(thread.user_id, userA.id);
  assert.equal(thread.folder_name, folderA);
  assert.ok(thread.project_id);
  const firstProjectId = thread.project_id;
  pass("① 新規スレッド作成→project_id非null", thread);

  await apiRequest(baseUrl, accessToken, `/api/threads/${threadId}`, {
    method: "PATCH",
    body: { folder_name: folderB },
  });
  thread = await selectSingle(service, "threads", threadId, "id, folder_name, project_id");
  assert.equal(thread.folder_name, folderB);
  assert.ok(thread.project_id);
  assert.notEqual(thread.project_id, firstProjectId);
  const projectB = thread.project_id;
  pass("② フォルダ付け替え→project_id更新", thread);

  await apiRequest(baseUrl, accessToken, "/api/project-settings", {
    method: "POST",
    body: { folder_name: folderB, system_prompt: "Phase C" },
  });
  const { data: projectSettings, error: projectError } = await service
    .from("project_settings")
    .select("folder_name, project_id")
    .eq("user_id", userA.id)
    .eq("folder_name", folderB)
    .single();
  expectNoError(projectError, "select project settings");
  assert.equal(projectSettings.project_id, projectB);
  pass("③ project-settings保存→project_id確認", projectSettings);

  await apiRequest(baseUrl, accessToken, "/api/lore/embed", {
    method: "POST",
    headers: { "x-openai-api-key": openaiKey },
    body: { folderName: folderB, chunks: [{ text: "Phase C embed verification" }] },
  });
  const { data: embeddedRows, error: embedSelectError } = await service
    .from("lore_embeddings")
    .select("id, folder_name, project_id")
    .eq("user_id", userA.id)
    .eq("folder_name", folderB);
  expectNoError(embedSelectError, "select embedded lore");
  assert.ok(embeddedRows.length > 0);
  assert.ok(embeddedRows.every((row) => row.project_id === projectB));
  pass("④ lore embed→project_id確認", { count: embeddedRows.length, project_id: projectB });

  const { data: message, error: messageError } = await service
    .from("messages")
    .insert({
      thread_id: threadId,
      user_id: userA.id,
      role: "assistant",
      provider: "phase_c_verification",
      content: "Phase C liked AI verification",
    })
    .select("id")
    .single();
  expectNoError(messageError, "insert liked_ai source message");
  await apiRequest(baseUrl, accessToken, "/api/lore/like", {
    method: "POST",
    headers: { "x-openai-api-key": openaiKey },
    body: { messageId: message.id },
  });
  const { data: liked, error: likedError } = await service
    .from("lore_embeddings")
    .select("id, folder_name, project_id")
    .eq("source_message_id", message.id)
    .eq("extraction_version", "liked_ai")
    .single();
  expectNoError(likedError, "select liked_ai lore");
  assert.equal(liked.folder_name, folderB);
  assert.equal(liked.project_id, projectB);
  pass("⑤ liked_ai→project_id伝播", liked);

  const mergeIds = await insertLore(service, userA.id, [
    { folderName: folderB, projectId: projectB, createdAt: "2026-01-01T00:00:00Z" },
    { folderName: folderB, projectId: projectB, createdAt: "2026-01-02T00:00:00Z" },
  ]);
  const { data: mergedId, error: mergeError } = await authenticated.rpc(
    "merge_user_edited_lore_pair",
    {
      p_user_id: userA.id,
      p_lore_id_a: mergeIds[0],
      p_lore_id_b: mergeIds[1],
      p_merged_text: "Phase C user edited merge",
      p_embedding: ZERO_EMBEDDING,
      p_memory_kind: "fact",
      p_temporal_status: "current",
    },
  );
  expectNoError(mergeError, "merge_user_edited_lore_pair");
  const merged = await selectSingle(service, "lore_embeddings", mergedId, "id, folder_name, project_id");
  assert.equal(merged.folder_name, folderB);
  assert.equal(merged.project_id, projectB);
  pass("⑥ merge_user_edited_lore_pair→project_id伝播", merged);

  const pairIds = await insertLore(service, userA.id, [
    { folderName: folderB, projectId: projectB },
    { folderName: folderB, projectId: projectB },
  ]);
  const { data: pairMergedId, error: pairMergeError } = await authenticated.rpc(
    "consolidate_dreaming_batch",
    {
      p_user_id: userA.id,
      p_lore_id_a: pairIds[0],
      p_lore_id_b: pairIds[1],
      p_merged_text: "Phase C dreaming pair",
      p_embedding: ZERO_EMBEDDING,
      p_memory_kind: "fact",
      p_temporal_status: "current",
      p_folder_name: folderB,
      p_importance: 0.5,
      p_confidence: 0.8,
    },
  );
  expectNoError(pairMergeError, "consolidate_dreaming_batch");
  const pairMerged = await selectSingle(service, "lore_embeddings", pairMergedId, "id, folder_name, project_id");
  assert.equal(pairMerged.project_id, projectB);
  pass("⑦ consolidate_dreaming_batch（2件版）→project_id伝播", pairMerged);

  const multiIds = await insertLore(service, userA.id, Array.from({ length: 3 }, () => ({
    folderName: folderB,
    projectId: projectB,
  })));
  const { data: multiMergedId, error: multiMergeError } = await authenticated.rpc(
    "consolidate_dreaming_batch_multi",
    {
      p_user_id: userA.id,
      p_source_ids: multiIds,
      p_merged_text: "Phase C dreaming multi",
      p_embedding: ZERO_EMBEDDING,
      p_memory_kind: "fact",
      p_temporal_status: "current",
      p_folder_name: folderB,
      p_importance: 0.5,
      p_confidence: 0.8,
    },
  );
  expectNoError(multiMergeError, "consolidate_dreaming_batch_multi");
  const multiMerged = await selectSingle(service, "lore_embeddings", multiMergedId, "id, folder_name, project_id");
  assert.equal(multiMerged.project_id, projectB);
  pass("⑧ consolidate_dreaming_batch_multi（N件版）→project_id伝播", multiMerged);

  const rawMcpToken = `kh_phase_c_${randomUUID()}`;
  const tokenHash = createHash("sha256").update(rawMcpToken).digest("hex");
  const { error: tokenError } = await service.from("mcp_tokens").insert({
    user_id: userA.id,
    token_hash: tokenHash,
    name: "Phase C verification",
  });
  expectNoError(tokenError, "insert MCP token fixture");
  const mcpResponse = await apiRequest(baseUrl, rawMcpToken, "/api/mcp/threads", {
    method: "POST",
    body: { title: "Phase C MCP", folder_name: folderMcp },
  });
  const mcpThread = await selectSingle(
    service,
    "threads",
    mcpResponse.body.thread.id,
    "id, folder_name, project_id",
  );
  assert.equal(mcpThread.folder_name, folderMcp);
  assert.ok(mcpThread.project_id);
  pass("⑨ MCP経由スレッド作成→project_id確認", mcpThread);

  const branchResponse = await apiRequest(baseUrl, accessToken, `/api/threads/${threadId}/branch-to`, {
    method: "POST",
    body: { anchorMessageId: message.id },
  });
  const branched = await selectSingle(
    service,
    "threads",
    branchResponse.body.thread.id,
    "id, folder_name, project_id, forked_from_id",
  );
  assert.equal(branched.folder_name, folderB);
  assert.equal(branched.project_id, projectB);
  assert.equal(branched.forked_from_id, threadId);
  pass("⑩ branch-to→project_id伝播", branched);

  const { error: unauthorizedError } = await authenticated.rpc("get_or_create_project", {
    p_user_id: userB.id,
    p_name: `phase-c-unauthorized-${suffix}`,
  });
  expectRpcError(unauthorizedError, "42501", "Unauthorized", "negative: User AがUser Bを指定→42501");

  const { error: blankError } = await authenticated.rpc("get_or_create_project", {
    p_user_id: userA.id,
    p_name: "   ",
  });
  expectRpcError(blankError, "P0001", "name is required", "negative: 空白のみの名前→P0001");

  const idempotentName = `phase-c-idempotent-${suffix}`;
  const idempotentA = await getProject(authenticated, userA.id, idempotentName);
  const idempotentB = await getProject(authenticated, userA.id, idempotentName);
  assert.equal(idempotentA, idempotentB);
  pass("negative: 同一名を2回→同じproject_id", { project_id: idempotentA });

  const serviceProject = await getProject(service, userA.id, `phase-c-service-role-${suffix}`);
  pass("service_roleからget_or_create_project呼び出し", { project_id: serviceProject });

  const otherProject = await getProject(service, userA.id, `phase-c-other-${suffix}`);
  let negativeIds = await insertLore(service, userA.id, [
    { folderName: folderB, projectId: projectB },
    { folderName: `phase-c-other-${suffix}`, projectId: otherProject },
  ]);
  const { error: pairDifferentError } = await authenticated.rpc("consolidate_dreaming_batch", {
    p_user_id: userA.id,
    p_lore_id_a: negativeIds[0],
    p_lore_id_b: negativeIds[1],
    p_merged_text: "must fail",
    p_embedding: ZERO_EMBEDDING,
    p_memory_kind: "fact",
    p_temporal_status: "current",
    p_folder_name: folderB,
    p_importance: 0.5,
    p_confidence: 0.8,
  });
  expectRpcError(pairDifferentError, "P0001", "different projects", "negative: 2件版でproject不一致→失敗");
  await deleteLore(service, negativeIds);

  const mixedFolder = `phase-c-mixed-${suffix}`;
  negativeIds = await insertLore(service, userA.id, [
    { folderName: mixedFolder, projectId: null },
    { folderName: mixedFolder, projectId: null },
    { folderName: mixedFolder, projectId: projectB },
  ]);
  const { error: mixedMultiError } = await authenticated.rpc("consolidate_dreaming_batch_multi", {
    p_user_id: userA.id,
    p_source_ids: negativeIds,
    p_merged_text: "must fail",
    p_embedding: ZERO_EMBEDDING,
    p_memory_kind: "fact",
    p_temporal_status: "current",
    p_folder_name: mixedFolder,
    p_importance: 0.5,
    p_confidence: 0.8,
  });
  expectRpcError(mixedMultiError, "P0001", "different projects", "negative: N件版でNULL/非NULL混在→失敗");
  await deleteLore(service, negativeIds);

  const nullProjectIds = await insertLore(service, userA.id, Array.from({ length: 3 }, () => ({
    folderName: null,
    projectId: null,
  })));
  const { data: nullMergedId, error: nullMultiError } = await authenticated.rpc(
    "consolidate_dreaming_batch_multi",
    {
      p_user_id: userA.id,
      p_source_ids: nullProjectIds,
      p_merged_text: "Phase C unassigned merge",
      p_embedding: ZERO_EMBEDDING,
      p_memory_kind: "fact",
      p_temporal_status: "current",
      p_folder_name: null,
      p_importance: 0.5,
      p_confidence: 0.8,
    },
  );
  expectNoError(nullMultiError, "all-null project multi merge");
  const nullMerged = await selectSingle(service, "lore_embeddings", nullMergedId, "id, folder_name, project_id");
  assert.equal(nullMerged.folder_name, null);
  assert.equal(nullMerged.project_id, null);
  pass("negative: N件版で全source NULL project_id→成功", nullMerged);

  negativeIds = await insertLore(service, userA.id, [
    { folderName: folderB, projectId: projectB },
    { folderName: folderB, projectId: projectB },
  ]);
  const { error: callerFolderError } = await authenticated.rpc("consolidate_dreaming_batch", {
    p_user_id: userA.id,
    p_lore_id_a: negativeIds[0],
    p_lore_id_b: negativeIds[1],
    p_merged_text: "must fail",
    p_embedding: ZERO_EMBEDDING,
    p_memory_kind: "fact",
    p_temporal_status: "current",
    p_folder_name: folderA,
    p_importance: 0.5,
    p_confidence: 0.8,
  });
  expectRpcError(callerFolderError, "P0001", "p_folder_name does not match", "negative: caller folder不一致→P0001");
  await deleteLore(service, negativeIds);

  const invariantTables = ["threads", "project_settings", "lore_embeddings"];
  const missing = {};
  for (const table of invariantTables) {
    const { count, error } = await service
      .from(table)
      .select("id", { count: "exact", head: true })
      .not("folder_name", "is", null)
      .is("project_id", null);
    expectNoError(error, `missing project invariant for ${table}`);
    missing[table] = count;
    assert.equal(count, 0, `${table}: folder_name without project_id`);
  }
  pass("DB invariant: folder_name設定済み/project_id未設定が0件", missing);

  const projects = await fetchAll(service, "projects", "id, user_id, name");
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const mismatched = {};
  for (const table of invariantTables) {
    const rows = await fetchAll(
      service,
      table,
      "id, user_id, folder_name, project_id",
      (query) => query.not("project_id", "is", null),
    );
    mismatched[table] = rows.filter((row) => {
      const project = projectById.get(row.project_id);
      return project && (project.user_id !== row.user_id || project.name !== row.folder_name);
    }).length;
    assert.equal(mismatched[table], 0, `${table}: mismatched project reference`);
  }
  pass("DB invariant: projectのuser/name不一致が0件", mismatched);
}

let exitCode = 0;
try {
  await run();
} catch (error) {
  exitCode = 1;
  fail("Phase C verification", error);
} finally {
  for (const userId of createdUserIds.reverse()) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) {
      exitCode = 1;
      fail(`cleanup user ${userId}`, error);
    } else {
      console.log(`[CLEANUP] deleted test user ${userId}`);
    }
  }
}

process.exitCode = exitCode;
