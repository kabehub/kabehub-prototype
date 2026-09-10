import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const TEST_PROJECT_REF = "jvarrlsqttfjiysaedlg";
const UNIT_EMBEDDING = [1, ...Array.from({ length: 1535 }, () => 0)];

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

function texts(rows) {
  return new Set((rows ?? []).map((row) => row.chunk_text));
}

function assertIncludesOnly(actual, expected, context) {
  assert.deepEqual([...texts(actual)].sort(), [...expected].sort(), context);
}

async function apiRequest(baseUrl, accessToken, path) {
  const response = await fetch(new URL(path, baseUrl), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`GET ${path}: HTTP ${response.status} ${text}`);
  }
  return { status: response.status, body };
}

async function managementReadOnlyQuery(projectRef, accessToken, query) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Management SQL HTTP ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : [];
}

async function checkCatalogPostflight(projectRef, accessToken) {
  const rows = await managementReadOnlyQuery(
    projectRef,
    accessToken,
    `
      select
        to_regprocedure('public.match_lore_embeddings_by_project(vector,uuid,uuid,integer)')::text
          as simple_regprocedure,
        to_regprocedure('public.match_lore_embeddings_v2_by_project(vector,uuid,uuid,integer,double precision)')::text
          as v2_regprocedure,
        has_function_privilege('authenticated', 'public.match_lore_embeddings_by_project(vector,uuid,uuid,integer)', 'EXECUTE')
          as simple_authenticated,
        has_function_privilege('service_role', 'public.match_lore_embeddings_by_project(vector,uuid,uuid,integer)', 'EXECUTE')
          as simple_service_role,
        has_function_privilege('anon', 'public.match_lore_embeddings_by_project(vector,uuid,uuid,integer)', 'EXECUTE')
          as simple_anon,
        has_function_privilege('public', 'public.match_lore_embeddings_by_project(vector,uuid,uuid,integer)', 'EXECUTE')
          as simple_public,
        has_function_privilege('authenticated', 'public.match_lore_embeddings_v2_by_project(vector,uuid,uuid,integer,double precision)', 'EXECUTE')
          as v2_authenticated,
        has_function_privilege('service_role', 'public.match_lore_embeddings_v2_by_project(vector,uuid,uuid,integer,double precision)', 'EXECUTE')
          as v2_service_role,
        has_function_privilege('anon', 'public.match_lore_embeddings_v2_by_project(vector,uuid,uuid,integer,double precision)', 'EXECUTE')
          as v2_anon,
        has_function_privilege('public', 'public.match_lore_embeddings_v2_by_project(vector,uuid,uuid,integer,double precision)', 'EXECUTE')
          as v2_public;
    `,
  );
  const row = Array.isArray(rows) ? rows[0] : rows?.data?.[0];
  assert.ok(row?.simple_regprocedure);
  assert.ok(row?.v2_regprocedure);
  assert.equal(row.simple_authenticated, true);
  assert.equal(row.simple_service_role, true);
  assert.equal(row.simple_anon, false);
  assert.equal(row.simple_public, false);
  assert.equal(row.v2_authenticated, true);
  assert.equal(row.v2_service_role, true);
  assert.equal(row.v2_anon, false);
  assert.equal(row.v2_public, false);
  pass("①② catalog POSTFLIGHT (to_regprocedure / has_function_privilege)", row);
}

async function insertProject(client, userId, name) {
  const { data, error } = await client
    .from("projects")
    .insert({ user_id: userId, name })
    .select("id")
    .single();
  expectNoError(error, `insert project ${name}`);
  return data.id;
}

async function insertLore(client, userId, rows) {
  const payload = rows.map((row) => ({
    user_id: userId,
    folder_name: row.folderName,
    project_id: row.projectId,
    chunk_text: row.text,
    embedding: UNIT_EMBEDDING,
    memory_kind: "fact",
    temporal_status: "current",
    importance_score: 0.5,
    confidence_score: 0.8,
    tags: [],
    is_pinned: false,
    is_archived: false,
    extraction_version: "temporal_v1",
    source_type: "phase_d_verification",
  }));
  const { data, error } = await client
    .from("lore_embeddings")
    .insert(payload)
    .select("id");
  expectNoError(error, "insert Phase D lore fixtures");
  assert.equal(data.length, rows.length);
}

async function checkInvariants(client, label) {
  const tables = ["threads", "folder_settings", "lore_embeddings"];
  const missingProject = {};
  const missingFolder = {};

  for (const table of tables) {
    const { count: projectCount, error: projectError } = await client
      .from(table)
      .select("id", { count: "exact", head: true })
      .not("folder_name", "is", null)
      .is("project_id", null);
    expectNoError(projectError, `${table}: folder_name without project_id`);
    missingProject[table] = projectCount;
    assert.equal(projectCount, 0, `${table}: folder_name without project_id`);

    const { count: folderCount, error: folderError } = await client
      .from(table)
      .select("id", { count: "exact", head: true })
      .is("folder_name", null)
      .not("project_id", "is", null);
    expectNoError(folderError, `${table}: project_id without folder_name`);
    missingFolder[table] = folderCount;
    assert.equal(folderCount, 0, `${table}: project_id without folder_name`);
  }

  pass(`${label}: folder_name/project_id invariant`, {
    folder_name_set_project_id_null: missingProject,
    project_id_set_folder_name_null: missingFolder,
  });
}

function runLocalRegression(script) {
  const result = spawnSync(process.execPath, [resolve(script)], {
    stdio: "inherit",
    env: process.env,
  });
  assert.equal(result.status, 0, `${script} failed`);
}

loadEnvFile(resolve(process.env.PHASE_D_ENV_FILE ?? ".env.local.test.bak"));

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const expectedProjectRef = process.env.PHASE_D_EXPECTED_PROJECT_REF ?? TEST_PROJECT_REF;
const baseUrl = new URL(process.env.PHASE_D_BASE_URL ?? "http://127.0.0.1:3000");
const invariantOnly = process.env.PHASE_D_INVARIANT_ONLY === "1";
const managementAccessToken =
  process.env.PHASE_D_SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_ACCESS_TOKEN;

assert.equal(
  projectRef,
  expectedProjectRef,
  `Refusing to run against project ${projectRef}; expected ${expectedProjectRef}`,
);

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anonymous = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const unauthenticated = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

if (invariantOnly) {
  await checkInvariants(service, `DB ${projectRef}`);
  process.exit(0);
}

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `PhaseD-${randomUUID()}-aA1!`;
const createdUserIds = [];

async function createTestUser(label) {
  const email = `phase-d-${label}-${suffix}@example.invalid`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expectNoError(error, `create ${label} test user`);
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email };
}

async function rpcRows(client, name, args, context) {
  const { data, error } = await client.rpc(name, args);
  expectNoError(error, context);
  return data ?? [];
}

async function run() {
  if (managementAccessToken) {
    await checkCatalogPostflight(projectRef, managementAccessToken);
  } else {
    console.log(
      "[SKIP] catalog POSTFLIGHT requires PHASE_D_SUPABASE_ACCESS_TOKEN; " +
        "effective RPC checks will still run",
    );
  }

  runLocalRegression("scripts/project-memory-phase-d-read-routes.test.cjs");
  runLocalRegression("scripts/project-memory-phase-d-chat-invariant.test.cjs");
  pass("⑧⑨⑩⑬ local negative paths: finalized helper errors and both chat invariant directions");

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

  const folderA = `phase-d-a-${suffix}`;
  const folderB = `phase-d-b-${suffix}`;
  const otherOnlyFolder = `phase-d-other-only-${suffix}`;
  const projectA = await insertProject(service, userA.id, folderA);
  const projectB = await insertProject(service, userA.id, folderB);
  const otherSameNameProject = await insertProject(service, userB.id, folderA);
  const otherOnlyProject = await insertProject(service, userB.id, otherOnlyFolder);

  const sameText = `phase-d-same-${suffix}`;
  const otherText = `phase-d-other-${suffix}`;
  const globalText = `phase-d-global-${suffix}`;
  const otherUserText = `phase-d-other-user-${suffix}`;

  await insertLore(service, userA.id, [
    { folderName: folderA, projectId: projectA, text: sameText },
    { folderName: folderB, projectId: projectB, text: otherText },
    { folderName: null, projectId: null, text: globalText },
  ]);
  await insertLore(service, userB.id, [
    { folderName: folderA, projectId: otherSameNameProject, text: otherUserText },
    { folderName: otherOnlyFolder, projectId: otherOnlyProject, text: otherUserText },
  ]);

  const { error: settingsError } = await service.from("folder_settings").insert([
    {
      user_id: userA.id,
      folder_name: folderA,
      project_id: projectA,
      system_prompt: `owned-${suffix}`,
      folder_type: "novel",
      pinned_github_files: [],
    },
    {
      user_id: userB.id,
      folder_name: folderA,
      project_id: otherSameNameProject,
      system_prompt: `other-same-${suffix}`,
      folder_type: "novel",
      pinned_github_files: [],
    },
    {
      user_id: userB.id,
      folder_name: otherOnlyFolder,
      project_id: otherOnlyProject,
      system_prompt: `other-only-${suffix}`,
      folder_type: "novel",
      pinned_github_files: [],
    },
  ]);
  expectNoError(settingsError, "insert folder_settings fixtures");

  const serviceSimple = await rpcRows(
    service,
    "match_lore_embeddings_by_project",
    {
      query_embedding: UNIT_EMBEDDING,
      match_project_id: projectA,
      match_user_id: userA.id,
      match_count: 20,
    },
    "service_role match_lore_embeddings_by_project",
  );
  const serviceV2 = await rpcRows(
    service,
    "match_lore_embeddings_v2_by_project",
    {
      query_embedding: UNIT_EMBEDDING,
      f_user_id: userA.id,
      f_project_id: projectA,
      match_count: 20,
      match_threshold: 0,
    },
    "service_role match_lore_embeddings_v2_by_project",
  );
  assert.ok(texts(serviceSimple).has(sameText));
  assert.ok(texts(serviceV2).has(sameText));
  pass("① new RPCs exist and resolve by their UUID signatures", {
    match_lore_embeddings_by_project_rows: serviceSimple.length,
    match_lore_embeddings_v2_by_project_rows: serviceV2.length,
  });

  const authSimple = await rpcRows(
    authenticated,
    "match_lore_embeddings_by_project",
    {
      query_embedding: UNIT_EMBEDDING,
      match_project_id: projectA,
      match_user_id: userA.id,
      match_count: 20,
    },
    "authenticated match_lore_embeddings_by_project",
  );
  const authV2 = await rpcRows(
    authenticated,
    "match_lore_embeddings_v2_by_project",
    {
      query_embedding: UNIT_EMBEDDING,
      f_user_id: userA.id,
      f_project_id: projectA,
      match_count: 20,
      match_threshold: 0,
    },
    "authenticated match_lore_embeddings_v2_by_project",
  );

  const { error: anonSimpleError } = await unauthenticated.rpc(
    "match_lore_embeddings_by_project",
    {
      query_embedding: UNIT_EMBEDDING,
      match_project_id: projectA,
      match_user_id: userA.id,
      match_count: 1,
    },
  );
  const { error: anonV2Error } = await unauthenticated.rpc(
    "match_lore_embeddings_v2_by_project",
    {
      query_embedding: UNIT_EMBEDDING,
      f_user_id: userA.id,
      f_project_id: projectA,
      match_count: 1,
      match_threshold: 0,
    },
  );
  assert.ok(anonSimpleError, "anon must not execute match_lore_embeddings_by_project");
  assert.ok(anonV2Error, "anon must not execute match_lore_embeddings_v2_by_project");
  pass("② effective EXECUTE grants", {
    authenticated: true,
    service_role: true,
    anon: false,
    public_inheritance_leak_via_anon: false,
    anon_error_codes: [anonSimpleError.code, anonV2Error.code],
  });

  const oldSimple = await rpcRows(
    authenticated,
    "match_lore_embeddings",
    {
      query_embedding: UNIT_EMBEDDING,
      match_folder_name: folderA,
      match_user_id: userA.id,
      match_count: 20,
    },
    "old text match_lore_embeddings named arguments",
  );
  const oldScoredV2 = await rpcRows(
    authenticated,
    "match_lore_embeddings_v2",
    {
      query_embedding: UNIT_EMBEDDING,
      f_user_id: userA.id,
      f_folder_name: folderA,
      match_count: 20,
      match_threshold: 0,
    },
    "old f_ match_lore_embeddings_v2 named arguments",
  );
  const oldFilteredV2 = await rpcRows(
    authenticated,
    "match_lore_embeddings_v2",
    {
      query_embedding: UNIT_EMBEDDING,
      match_folder_name: folderA,
      match_user_id: userA.id,
      match_count: 20,
      match_threshold: 0,
      filter_memory_kinds: ["fact"],
      filter_temporal_status: ["current"],
    },
    "unused filter match_lore_embeddings_v2 named arguments",
  );
  pass("③ all old/new/filter RPC signatures resolve with named arguments", {
    old_simple: oldSimple.length,
    old_scored_v2: oldScoredV2.length,
    old_filtered_v2: oldFilteredV2.length,
    new_simple: authSimple.length,
    new_scored_v2: authV2.length,
  });

  assertIncludesOnly(authSimple, [sameText], "Lore Book project scope");
  assertIncludesOnly(authV2, [sameText, globalText], "v2 project plus global scope");
  assert.equal(texts(authV2).has(otherText), false);
  assert.equal(texts(authV2).has(otherUserText), false);
  pass("④⑤⑥ project scope keeps same/global and excludes other projects/users");

  const unassigned = await rpcRows(
    authenticated,
    "match_lore_embeddings_v2_by_project",
    {
      query_embedding: UNIT_EMBEDDING,
      f_user_id: userA.id,
      f_project_id: null,
      match_count: 20,
      match_threshold: 0,
    },
    "unassigned project search",
  );
  assertIncludesOnly(unassigned, [globalText], "unassigned thread scope");
  pass("⑦ null project searches only project_id IS NULL memory");

  assert.ok(texts(oldSimple).has(sameText));
  assert.ok(texts(oldScoredV2).has(sameText));
  assert.ok(texts(oldFilteredV2).has(sameText));

  const ownedSettings = await apiRequest(
    baseUrl,
    accessToken,
    `/api/folder-settings?folder_name=${encodeURIComponent(folderA)}`,
  );
  assert.equal(ownedSettings.status, 200);
  assert.equal(ownedSettings.body.system_prompt, `owned-${suffix}`);
  const ownedChunks = await apiRequest(
    baseUrl,
    accessToken,
    `/api/lore/chunks?folder_name=${encodeURIComponent(folderA)}`,
  );
  assert.equal(ownedChunks.status, 200);
  assert.deepEqual(ownedChunks.body.chunks.map((row) => row.chunk_text), [sameText]);

  const missingSettings = await apiRequest(
    baseUrl,
    accessToken,
    `/api/folder-settings?folder_name=${encodeURIComponent(`missing-${suffix}`)}`,
  );
  assert.deepEqual(missingSettings.body, {
    system_prompt: null,
    folder_type: null,
    pinned_github_files: [],
    github_repo: null,
    github_ref: null,
  });
  const missingChunks = await apiRequest(
    baseUrl,
    accessToken,
    `/api/lore/chunks?folder_name=${encodeURIComponent(`missing-${suffix}`)}`,
  );
  assert.deepEqual(missingChunks.body, { chunks: [] });

  const otherOnlySettings = await apiRequest(
    baseUrl,
    accessToken,
    `/api/folder-settings?folder_name=${encodeURIComponent(otherOnlyFolder)}`,
  );
  assert.equal(otherOnlySettings.body.system_prompt, null);
  const otherOnlyChunks = await apiRequest(
    baseUrl,
    accessToken,
    `/api/lore/chunks?folder_name=${encodeURIComponent(otherOnlyFolder)}`,
  );
  assert.deepEqual(otherOnlyChunks.body, { chunks: [] });
  pass("⑪⑫ query-parameter routes keep empty success and owner isolation");

  await checkInvariants(service, "⑭ test DB");
}

let exitCode = 0;
try {
  await run();
} catch (error) {
  exitCode = 1;
  fail("Phase D verification", error);
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
