const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;

const USER_ID = "user-1";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
let projectResult;
let settingsResult;
let chunksResult;
let queryCalls;

function createQuery(table) {
  const state = { select: null, filters: [], order: null };
  queryCalls.push({ table, state });

  const query = {
    select(columns) {
      state.select = columns;
      return query;
    },
    eq(column, value) {
      state.filters.push({ column, value });
      return query;
    },
    order(column, options) {
      state.order = { column, options };
      return query;
    },
    maybeSingle() {
      if (table === "projects") return Promise.resolve(projectResult);
      if (table === "project_settings") return Promise.resolve(settingsResult);
      throw new Error(`unexpected maybeSingle table: ${table}`);
    },
    then(onFulfilled, onRejected) {
      if (table === "project_settings") {
        return Promise.resolve(settingsResult).then(onFulfilled, onRejected);
      }
      if (table !== "lore_embeddings") {
        throw new Error(`unexpected awaited table: ${table}`);
      }
      return Promise.resolve(chunksResult).then(onFulfilled, onRejected);
    },
  };
  return query;
}

const supabase = {
  from(table) {
    return createQuery(table);
  },
};

const originalLoad = Module._load;
Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "@/lib/supabase/route-auth") {
    return {
      async requireRouteUser() {
        return {
          ok: true,
          user: { id: USER_ID },
          supabase,
          finalizeJson(payload, init = {}) {
            return Response.json(payload, {
              ...init,
              headers: {
                ...init.headers,
                "x-phase-d-finalized": "1",
              },
            });
          },
        };
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

installTsLoader();
installAliasResolver();

const { NextRequest } = require("next/server");
const projectSettingsRoute = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "project-settings",
  "route.ts",
));
const loreChunksRoute = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "lore",
  "chunks",
  "route.ts",
));

function resetMocks(options = {}) {
  projectResult = options.projectResult ?? { data: { id: PROJECT_ID }, error: null };
  settingsResult = options.settingsResult ?? { data: null, error: null };
  chunksResult = options.chunksResult ?? { data: [], error: null };
  queryCalls = [];
}

function invokeProjectSettings(folderName) {
  return projectSettingsRoute.GET(new NextRequest(
    `https://www.kabehub.com/api/project-settings?folder_name=${encodeURIComponent(folderName)}`,
  ));
}

function invokeProjectSettingsByProjectId(projectId = PROJECT_ID) {
  return projectSettingsRoute.GET(new NextRequest(
    `https://www.kabehub.com/api/project-settings?project_id=${encodeURIComponent(projectId)}`,
  ));
}

function invokeLoreChunks(folderName) {
  return loreChunksRoute.GET(new NextRequest(
    `https://www.kabehub.com/api/lore/chunks?folder_name=${encodeURIComponent(folderName)}`,
  ));
}

function invokeLoreChunksByProjectId(projectId = PROJECT_ID) {
  return loreChunksRoute.GET(new NextRequest(
    `https://www.kabehub.com/api/lore/chunks?project_id=${encodeURIComponent(projectId)}`,
  ));
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

for (const [label, invoke] of [
  ["project-settings", invokeProjectSettings],
  ["lore/chunks", invokeLoreChunks],
]) {
  test(`${label} rejects folder_name including empty values before DB`, async () => {
    for (const value of ["same-name", "missing-project", "other-user-project", "", "null", "42"]) {
      resetMocks();
      const response = await invoke(value);
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("x-phase-d-finalized"), "1");
      assert.deepEqual(await response.json(), {
        error: "folder_name is no longer supported; use project_id",
      });
      assert.deepEqual(queryCalls, []);
    }
  });
}

test("project-settings without project_id lists owned settings without resolving a project", async () => {
  const settings = [{ project_id: PROJECT_ID, folder_type: "novel" }];
  resetMocks({ settingsResult: { data: settings, error: null } });
  const response = await projectSettingsRoute.GET(new NextRequest(
    "https://www.kabehub.com/api/project-settings",
  ));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), settings);
  assert.deepEqual(queryCalls.map((call) => call.table), ["project_settings"]);
  assert.equal(queryCalls[0].state.select, "project_id, folder_type");
  assert.deepEqual(queryCalls[0].state.filters, [{ column: "user_id", value: USER_ID }]);
});

test("project-settings accepts an owned canonical project_id", async () => {
  resetMocks({
    settingsResult: {
      data: {
        system_prompt: "canonical setting",
        folder_type: null,
        pinned_github_files: [],
        github_repo: null,
        github_ref: null,
      },
      error: null,
    },
  });

  const response = await invokeProjectSettingsByProjectId();

  assert.equal(response.status, 200);
  assert.equal((await response.json()).project_id, PROJECT_ID);
  assert.deepEqual(queryCalls.map((call) => call.table), ["projects", "project_settings"]);
  assert.deepEqual(queryCalls[0].state.filters, [
    { column: "id", value: PROJECT_ID },
    { column: "user_id", value: USER_ID },
  ]);
  assert.deepEqual(queryCalls[1].state.filters, [
    { column: "user_id", value: USER_ID },
    { column: "project_id", value: PROJECT_ID },
  ]);
});

test("lore/chunks accepts an owned canonical project_id", async () => {
  const chunks = [{ id: "chunk-1", chunk_text: "canonical chunk", created_at: "2026-09-15" }];
  resetMocks({ chunksResult: { data: chunks, error: null } });

  const response = await invokeLoreChunksByProjectId();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { chunks });
  assert.deepEqual(queryCalls.map((call) => call.table), ["projects", "lore_embeddings"]);
  assert.deepEqual(queryCalls[0].state.filters, [
    { column: "id", value: PROJECT_ID },
    { column: "user_id", value: USER_ID },
  ]);
  assert.deepEqual(queryCalls[1].state.filters, [
    { column: "user_id", value: USER_ID },
    { column: "project_id", value: PROJECT_ID },
  ]);
  assert.deepEqual(queryCalls[1].state.order, {
    column: "created_at",
    options: { ascending: true },
  });
});

for (const [label, invoke] of [
  ["project-settings", invokeProjectSettingsByProjectId],
  ["lore/chunks", invokeLoreChunksByProjectId],
]) {
  test(`${label} returns 404 for an unowned canonical project_id`, async () => {
    resetMocks({ projectResult: { data: null, error: null } });

    const response = await invoke();

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Project not found" });
    assert.deepEqual(queryCalls.map((call) => call.table), ["projects"]);
  });

  test(`${label} rejects folder_name alongside canonical project_id before DB`, async () => {
    for (const value of ["legacy", "", "null", "42"]) {
      resetMocks();
      const route = label === "project-settings" ? projectSettingsRoute : loreChunksRoute;
      const response = await route.GET(new NextRequest(
        `https://www.kabehub.com/api/${label}?project_id=${PROJECT_ID}&folder_name=${value}`,
      ));

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: "folder_name is no longer supported; use project_id",
      });
      assert.deepEqual(queryCalls, []);
    }
  });

  test(`${label} rejects an empty canonical project_id`, async () => {
    resetMocks();

    const response = await invoke("");

    assert.equal(response.status, 400);
    assert.deepEqual(queryCalls, []);
  });
}

test("lore/chunks rejects a request without a project key", async () => {
  resetMocks();
  const response = await loreChunksRoute.GET(new NextRequest(
    "https://www.kabehub.com/api/lore/chunks",
  ));

  assert.equal(response.status, 400);
  assert.deepEqual(queryCalls, []);
});

for (const [label, invoke] of [
  ["project-settings", invokeProjectSettingsByProjectId],
  ["lore/chunks", invokeLoreChunksByProjectId],
]) {
  test(`${label} returns a finalized 500 when canonical ownership lookup fails`, async () => {
    resetMocks({
      projectResult: {
        data: null,
        error: { code: "57014", message: "raw project lookup failure" },
      },
    });

    const response = await invoke();

    assert.equal(response.status, 500);
    assert.equal(response.headers.get("x-phase-d-finalized"), "1");
    const body = await response.json();
    assert.deepEqual(body, { error: "Failed to load project" });
    assert.equal(JSON.stringify(body).includes("raw project lookup failure"), false);
    assert.deepEqual(queryCalls.map((call) => call.table), ["projects"]);
  });
}

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (error) {
      console.error(`not ok - ${name}`);
      throw error;
    }
  }
  console.log(`passed ${tests.length} Project Memory Phase D read route tests`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
