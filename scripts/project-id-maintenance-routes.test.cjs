const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;

const USER_ID = "user-1";
let trace;
const supabase = {
  from(table) {
    trace.queries.push(table);
    throw new Error("maintenance routes must not query projects");
  },
  async rpc(name, args) {
    trace.rpcCalls.push({ name, args });
    return { data: { past_count: 1, expired_count: 2 }, error: null };
  },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
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
              headers: { "x-phase-3-finalized": "1" },
            });
          },
        };
      },
    };
  }
  if (request === "@/lib/lore/dreaming") {
    return {
      async runDreamingBatch(client, key, userId, options) {
        trace.dreamingCalls.push({ client, key, userId, options });
        return { processed: 0 };
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

installTsLoader();
installAliasResolver();
const { NextRequest } = require("next/server");
const temporalRoute = require(path.resolve(__dirname, "../app/api/lore/update-temporal-status/route.ts"));
const dreamingRoute = require(path.resolve(__dirname, "../app/api/lore/dreaming-batch/route.ts"));
Module._load = originalLoad;

function resetTrace() {
  trace = { queries: [], rpcCalls: [], dreamingCalls: [] };
}

function invoke(route, name, body) {
  return route.POST(new NextRequest(`https://www.kabehub.com/api/lore/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-openai-api-key": "openai-key" },
    body: JSON.stringify(body),
  }));
}

for (const [name, route] of [
  ["update-temporal-status", temporalRoute],
  ["dreaming-batch", dreamingRoute],
]) {
  for (const folderName of ["legacy", null, "", 42, false, [], {}]) {
    test(`${name} rejects folderName=${JSON.stringify(folderName)} before DB, RPC or dreaming`, async () => {
      resetTrace();
      const response = await invoke(route, name, { folderName, limit: 1, threshold: 0.9 });
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("x-phase-3-finalized"), "1");
      assert.deepEqual(await response.json(), { error: "folderName is no longer supported" });
      assert.deepEqual(trace, { queries: [], rpcCalls: [], dreamingCalls: [] });
    });
  }
}

test("update-temporal-status without folderName calls the RPC with p_project_id:null", async () => {
  resetTrace();
  const response = await invoke(temporalRoute, "update-temporal-status", {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { pastCount: 1, expiredCount: 2, total: 3 });
  assert.deepEqual(trace.rpcCalls, [{
    name: "update_lore_temporal_status_by_project",
    args: { p_user_id: USER_ID, p_project_id: null },
  }]);
  assert.deepEqual(trace.queries, []);
});

test("dreaming-batch without folderName passes explicit null and preserves limit/threshold", async () => {
  resetTrace();
  const response = await invoke(dreamingRoute, "dreaming-batch", { limit: 2, threshold: 0.9 });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { processed: 0 });
  assert.deepEqual(trace.dreamingCalls, [{
    client: supabase,
    key: "openai-key",
    userId: USER_ID,
    options: { limit: 2, threshold: 0.9, folderName: null },
  }]);
  assert.deepEqual(trace.queries, []);
  assert.deepEqual(trace.rpcCalls, []);
});
