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

function invokeLoreChunks(folderName) {
  return loreChunksRoute.GET(new NextRequest(
    `https://www.kabehub.com/api/lore/chunks?folder_name=${encodeURIComponent(folderName)}`,
  ));
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("project-settings resolves the owned project and queries by project_id", async () => {
  resetMocks({
    settingsResult: {
      data: {
        system_prompt: "owned setting",
        folder_type: "novel",
        pinned_github_files: ["README.md"],
        github_repo: "owner/repo",
        github_ref: "main",
      },
      error: null,
    },
  });

  const response = await invokeProjectSettings("same-name");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    project_id: PROJECT_ID,
    system_prompt: "owned setting",
    folder_type: "novel",
    pinned_github_files: ["README.md"],
    github_repo: "owner/repo",
    github_ref: "main",
  });
  assert.deepEqual(queryCalls.map((call) => call.table), ["projects", "project_settings"]);
  assert.deepEqual(queryCalls[0].state.filters, [
    { column: "user_id", value: USER_ID },
    { column: "name", value: "same-name" },
  ]);
  assert.deepEqual(queryCalls[1].state.filters, [
    { column: "user_id", value: USER_ID },
    { column: "project_id", value: PROJECT_ID },
  ]);
});

test("lore/chunks resolves the owned project and queries by project_id", async () => {
  const chunks = [{ id: "chunk-1", chunk_text: "owned chunk", created_at: "2026-09-10" }];
  resetMocks({ chunksResult: { data: chunks, error: null } });

  const response = await invokeLoreChunks("same-name");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { chunks });
  assert.deepEqual(queryCalls.map((call) => call.table), ["projects", "lore_embeddings"]);
  assert.deepEqual(queryCalls[1].state.filters, [
    { column: "user_id", value: USER_ID },
    { column: "project_id", value: PROJECT_ID },
  ]);
  assert.deepEqual(queryCalls[1].state.order, {
    column: "created_at",
    options: { ascending: true },
  });
});

test("an unresolved or other-user-only project name keeps successful empty responses", async () => {
  resetMocks({ projectResult: { data: null, error: null } });

  const settingsResponse = await invokeProjectSettings("other-user-project");
  assert.equal(settingsResponse.status, 200);
  assert.deepEqual(await settingsResponse.json(), {
    project_id: null,
    system_prompt: null,
    folder_type: null,
    pinned_github_files: [],
    github_repo: null,
    github_ref: null,
  });
  assert.deepEqual(queryCalls.map((call) => call.table), ["projects"]);

  resetMocks({ projectResult: { data: null, error: null } });
  const chunksResponse = await invokeLoreChunks("other-user-project");
  assert.equal(chunksResponse.status, 200);
  assert.deepEqual(await chunksResponse.json(), { chunks: [] });
  assert.deepEqual(queryCalls.map((call) => call.table), ["projects"]);
});

for (const [label, invoke] of [
  ["project-settings", invokeProjectSettings],
  ["lore/chunks", invokeLoreChunks],
]) {
  test(`${label} returns a finalized 500 when project resolution fails`, async () => {
    resetMocks({
      projectResult: {
        data: null,
        error: { code: "57014", message: "raw project lookup failure" },
      },
    });

    const response = await invoke("project-name");

    assert.equal(response.status, 500);
    assert.equal(response.headers.get("x-phase-d-finalized"), "1");
    const body = await response.json();
    assert.deepEqual(body, { error: "Failed to resolve project" });
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
