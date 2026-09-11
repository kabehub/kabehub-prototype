const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;

const USER_ID = "user-1";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
let projectResult;
let rpcResult;
let trace;

function resetMocks(options = {}) {
  projectResult = options.projectResult ?? { data: { id: PROJECT_ID }, error: null };
  rpcResult = options.rpcResult ?? { data: [], error: null };
  trace = {
    projectQueries: [],
    rpcCalls: [],
  };
}

const supabase = {
  rpc(name, args) {
    trace.rpcCalls.push({ name, args });
    return Promise.resolve(rpcResult);
  },
  from(table) {
    assert.equal(table, "projects");
    const state = { table, select: null, filters: [] };
    trace.projectQueries.push(state);
    const query = {
      select(columns) {
        state.select = columns;
        return query;
      },
      eq(column, value) {
        state.filters.push({ column, value });
        return query;
      },
      maybeSingle() {
        return Promise.resolve(projectResult);
      },
    };
    return query;
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
            return Response.json(payload, init);
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
const candidatesRoute = require(path.resolve(
  __dirname,
  "../app/api/lore/consolidate/candidates/route.ts",
));

function invoke(query = "") {
  const suffix = query ? `?${query}` : "";
  return candidatesRoute.GET(new NextRequest(
    `https://www.kabehub.com/api/lore/consolidate/candidates${suffix}`,
  ));
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("folderName未指定ならproject resolverを使わずnullで新RPCを呼ぶ", async () => {
  resetMocks();

  const response = await invoke();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { candidates: [] });
  assert.equal(trace.projectQueries.length, 0);
  assert.equal(trace.rpcCalls.length, 1);
  assert.equal(trace.rpcCalls[0].name, "find_similar_lore_pairs_by_project");
  assert.equal(trace.rpcCalls[0].args.p_project_id, null);
  assert.equal("p_folder_name" in trace.rpcCalls[0].args, false);
});

test("folderName指定かつproject存在なら解決したUUIDで新RPCを呼ぶ", async () => {
  resetMocks();

  const response = await invoke("folderName=owned-project");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { candidates: [] });
  assert.equal(trace.projectQueries.length, 1);
  assert.deepEqual(trace.projectQueries[0].filters, [
    { column: "user_id", value: USER_ID },
    { column: "name", value: "owned-project" },
  ]);
  assert.equal(trace.rpcCalls.length, 1);
  assert.equal(trace.rpcCalls[0].name, "find_similar_lore_pairs_by_project");
  assert.equal(trace.rpcCalls[0].args.p_project_id, PROJECT_ID);
});

test("folderName指定かつproject不存在ならRPCを呼ばず空候補を返す", async () => {
  resetMocks({ projectResult: { data: null, error: null } });

  const response = await invoke("folderName=missing-project");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { candidates: [] });
  assert.equal(trace.projectQueries.length, 1);
  assert.equal(trace.rpcCalls.length, 0);
});

test("folderName指定かつproject解決失敗なら500を返す", async () => {
  resetMocks({
    projectResult: {
      data: null,
      error: { code: "57014", message: "raw lookup failure" },
    },
  });

  const response = await invoke("folderName=failed-project");

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Failed to resolve project" });
  assert.equal(trace.projectQueries.length, 1);
  assert.equal(trace.rpcCalls.length, 0);
});

(async () => {
  let passed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`ok - ${name}`);
    } catch (error) {
      console.error(`not ok - ${name}`);
      throw error;
    }
  }
  console.log(`1..${passed}`);
  console.log(`# ${passed} Project Memory Phase E candidates tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
