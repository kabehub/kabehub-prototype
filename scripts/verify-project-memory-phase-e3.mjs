import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const TEST_PROJECT_REF = "jvarrlsqttfjiysaedlg";

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

function pass(number, label, details = {}) {
  console.log(`[PASS] ${number}. ${label} ${JSON.stringify(details)}`);
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

function normalizeResult(data) {
  const result = Array.isArray(data) ? data[0] : data;
  const pastCount = Number(result?.pastCount ?? result?.past_count ?? 0);
  const expiredCount = Number(result?.expiredCount ?? result?.expired_count ?? 0);
  const total = Number(result?.total ?? pastCount + expiredCount);
  return { pastCount, expiredCount, total };
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

function fixtureRows(userId, folderName, projectId, pastTime, futureTime) {
  return [
    {
      user_id: userId,
      folder_name: folderName,
      project_id: projectId,
      chunk_text: "future plan with elapsed event_time",
      memory_kind: "plan",
      temporal_status: "future",
      event_time: pastTime,
      extraction_version: "temporal_v1",
    },
    {
      user_id: userId,
      folder_name: folderName,
      project_id: projectId,
      chunk_text: "current fact with elapsed valid_until",
      memory_kind: "fact",
      temporal_status: "current",
      valid_until: pastTime,
      extraction_version: "temporal_v1",
    },
    {
      user_id: userId,
      folder_name: folderName,
      project_id: projectId,
      chunk_text: "future plan with future event_time",
      memory_kind: "plan",
      temporal_status: "future",
      event_time: futureTime,
      extraction_version: "temporal_v1",
    },
    {
      user_id: userId,
      folder_name: folderName,
      project_id: projectId,
      chunk_text: "protected user edited record",
      memory_kind: "fact",
      temporal_status: "current",
      valid_until: pastTime,
      extraction_version: "user_edited",
    },
    {
      user_id: userId,
      folder_name: folderName,
      project_id: projectId,
      chunk_text: "pinned record",
      memory_kind: "fact",
      temporal_status: "current",
      valid_until: pastTime,
      extraction_version: "temporal_v1",
      is_pinned: true,
    },
    {
      user_id: userId,
      folder_name: folderName,
      project_id: projectId,
      chunk_text: "archived record",
      memory_kind: "todo",
      temporal_status: "future",
      event_time: pastTime,
      extraction_version: "temporal_v1",
      is_archived: true,
    },
  ].map((row) => ({
    is_pinned: false,
    is_archived: false,
    superseded_by: null,
    ...row,
  }));
}

async function selectFixtureState(client, projectId) {
  const { data, error } = await client
    .from("lore_embeddings")
    .select("chunk_text, temporal_status")
    .eq("project_id", projectId)
    .order("chunk_text", { ascending: true });
  expectNoError(error, `select fixture state for ${projectId}`);
  return data;
}

async function verifyMissingProjectRoute(authenticated, userId, missingFolderName) {
  const require = createRequire(import.meta.url);
  const Module = require("node:module");
  const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");
  const originalLoad = Module._load;
  const rpcCalls = [];
  const routeSupabase = {
    from(table) {
      return authenticated.from(table);
    },
    rpc(name, args) {
      rpcCalls.push({ name, args });
      return authenticated.rpc(name, args);
    },
  };

  Module._load = function loadWithRouteAuth(request, parent, isMain) {
    if (request === "@/lib/supabase/route-auth") {
      return {
        async requireRouteUser() {
          return {
            ok: true,
            user: { id: userId },
            supabase: routeSupabase,
            finalizeJson(payload, init = {}) {
              return Response.json(payload, init);
            },
          };
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;
    installTsLoader();
    installAliasResolver();
    const { NextRequest } = require("next/server");
    const route = require(resolve(
      "app/api/lore/update-temporal-status/route.ts",
    ));
    const response = await route.POST(new NextRequest(
      "https://www.kabehub.com/api/lore/update-temporal-status",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderName: missingFolderName }),
      },
    ));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      pastCount: 0,
      expiredCount: 0,
      total: 0,
    });
    assert.equal(rpcCalls.length, 0, "missing project must not invoke any RPC");
  } finally {
    Module._load = originalLoad;
  }
}

loadEnvFile(resolve(process.env.PHASE_E3_ENV_FILE ?? ".env.local.test.bak"));

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const expectedProjectRef = process.env.PHASE_E3_EXPECTED_PROJECT_REF ?? TEST_PROJECT_REF;

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

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `PhaseE3-${randomUUID()}-aA1!`;
let createdUserId = null;

async function run() {
  const email = `phase-e3-${suffix}@example.invalid`;
  const { data: created, error: createUserError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expectNoError(createUserError, "create Phase E-3 test user");
  createdUserId = created.user.id;

  const { data: signIn, error: signInError } = await anonymous.auth.signInWithPassword({
    email,
    password,
  });
  expectNoError(signInError, "sign in Phase E-3 test user");
  const accessToken = signIn.session?.access_token;
  assert.ok(accessToken, "access token must be returned");

  const authenticated = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const oldFolderName = `phase-e3-old-${suffix}`;
  const newFolderName = `phase-e3-new-${suffix}`;
  const oldProjectId = await insertProject(service, createdUserId, oldFolderName);
  const newProjectId = await insertProject(service, createdUserId, newFolderName);
  const pastTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const futureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const oldFixture = fixtureRows(
    createdUserId,
    oldFolderName,
    oldProjectId,
    pastTime,
    futureTime,
  );
  const newFixture = fixtureRows(
    createdUserId,
    newFolderName,
    newProjectId,
    pastTime,
    futureTime,
  );
  const { error: insertError } = await service
    .from("lore_embeddings")
    .insert([...oldFixture, ...newFixture]);
  expectNoError(insertError, "insert independent old/new temporal fixtures");

  const oldStateBefore = await selectFixtureState(service, oldProjectId);
  const newStateBefore = await selectFixtureState(service, newProjectId);
  const oldStateVisibleToCaller = await selectFixtureState(authenticated, oldProjectId);
  const newStateVisibleToCaller = await selectFixtureState(authenticated, newProjectId);
  assert.equal(oldStateBefore.length, oldFixture.length);
  assert.deepEqual(newStateBefore, oldStateBefore);
  assert.deepEqual(oldStateVisibleToCaller, oldStateBefore);
  assert.deepEqual(newStateVisibleToCaller, newStateBefore);

  const { data: oldData, error: oldError } = await authenticated.rpc(
    "update_lore_temporal_status",
    { p_user_id: createdUserId, p_folder_name: oldFolderName },
  );
  expectNoError(oldError, "run legacy temporal status RPC once");
  const oldResult = normalizeResult(oldData);

  const { data: newData, error: newError } = await authenticated.rpc(
    "update_lore_temporal_status_by_project",
    { p_user_id: createdUserId, p_project_id: newProjectId },
  );
  expectNoError(newError, "run project temporal status RPC once");
  const newResult = normalizeResult(newData);

  assert.deepEqual(
    { oldResult, newResult },
    {
      oldResult: { pastCount: 1, expiredCount: 1, total: 2 },
      newResult: { pastCount: 1, expiredCount: 1, total: 2 },
    },
    "legacy/project RPC counts on independent fixtures",
  );

  const oldState = await selectFixtureState(service, oldProjectId);
  const newState = await selectFixtureState(service, newProjectId);
  assert.deepEqual(newState, oldState);
  assert.deepEqual(oldState, [
    { chunk_text: "archived record", temporal_status: "future" },
    { chunk_text: "current fact with elapsed valid_until", temporal_status: "expired" },
    { chunk_text: "future plan with elapsed event_time", temporal_status: "past" },
    { chunk_text: "future plan with future event_time", temporal_status: "future" },
    { chunk_text: "pinned record", temporal_status: "current" },
    { chunk_text: "protected user edited record", temporal_status: "current" },
  ]);
  pass(1, "旧RPC・新RPCを独立した同型fixtureへ各1回実行し結果と更新状態が一致", {
    oldProjectId,
    newProjectId,
    fixtureRowsPerRpc: oldFixture.length,
    oldResult,
    newResult,
  });

  const missingFolderName = `phase-e3-missing-${suffix}`;
  await verifyMissingProjectRoute(authenticated, createdUserId, missingFolderName);
  pass(2, "project不存在時はゼロ件を返しRPCを呼び出さない", {
    folderName: missingFolderName,
    rpcCallCount: 0,
  });
}

let exitCode = 0;
try {
  await run();
} catch (error) {
  exitCode = 1;
  fail("Phase E-3 side-by-side verification", error);
} finally {
  if (createdUserId) {
    const { error } = await service.auth.admin.deleteUser(createdUserId);
    if (error) {
      exitCode = 1;
      fail(`cleanup user ${createdUserId}`, error);
    } else {
      console.log(`[CLEANUP] deleted test user ${createdUserId}`);
    }
  }
}

process.exitCode = exitCode;
