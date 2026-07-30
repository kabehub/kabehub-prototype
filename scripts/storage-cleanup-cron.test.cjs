const assert = require("node:assert/strict");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

const rootDir = path.resolve(__dirname, "..");
const routePath = "app/api/cron/storage-cleanup/route.ts";

installAliasResolver();
installTsLoader({
  transformOutput(output, filename) {
    const relativePath = path.relative(rootDir, filename).split(path.sep).join("/");
    if (relativePath === routePath) {
      return `${output}\nmodule.exports.__test = { getCleanupMode, selectCandidatePaths };`;
    }
    return output;
  },
});

const adminModule = require("../lib/supabase/admin.ts");
const storageCleanupModule = require("../lib/supabase/storage-cleanup.ts");
const route = require(`../${routePath}`);
const { getCleanupMode, selectCandidatePaths } = route.__test;

function createSupabaseMock(candidateRows = []) {
  const state = {
    inserts: [],
    updates: [],
    rpcCalls: [],
    candidateRows,
    rpcError: null,
  };

  const supabase = {
    from(table) {
      assert.equal(table, "storage_cleanup_runs");
      return {
        insert(payload) {
          state.inserts.push(payload);
          return {
            select(column) {
              assert.equal(column, "id");
              return {
                async single() {
                  return { data: { id: "run-1" }, error: null };
                },
              };
            },
          };
        },
        update(payload) {
          return {
            async eq(column, value) {
              state.updates.push({ payload, column, value });
              return { data: null, error: null };
            },
          };
        },
      };
    },
    async rpc(name, args) {
      state.rpcCalls.push({ name, args });
      return { data: state.candidateRows, error: state.rpcError };
    },
    storage: {},
  };

  return { state, supabase };
}

function authorizedRequest(secret = "test-cron-secret") {
  return { headers: new Headers({ authorization: `Bearer ${secret}` }) };
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("dry-run mode is the default and only exact false selects delete mode", () => {
  assert.equal(getCleanupMode(undefined), "dry_run");
  assert.equal(getCleanupMode("true"), "dry_run");
  assert.equal(getCleanupMode("FALSE"), "dry_run");
  assert.equal(getCleanupMode("false"), "delete");
});

test("candidate selection caps work at 50 and detects an additional row", () => {
  const rows = Array.from({ length: 51 }, (_, index) => ({
    storage_path: `user/thread/${index}.png`,
  }));
  const result = selectCandidatePaths(rows);

  assert.equal(result.limitReached, true);
  assert.equal(result.paths.length, 50);
  assert.equal(result.paths.includes("user/thread/50.png"), false);
});

test("missing CRON_SECRET fails closed before creating an admin client", async () => {
  delete process.env.CRON_SECRET;
  let clientCreated = false;
  adminModule.createAdminSupabaseClient = () => {
    clientCreated = true;
  };

  const response = await route.GET({ headers: new Headers() });

  assert.equal(response.status, 500);
  assert.equal(clientCreated, false);
});

test("invalid authorization returns 401 without running cleanup", async () => {
  process.env.CRON_SECRET = "test-cron-secret";
  let clientCreated = false;
  adminModule.createAdminSupabaseClient = () => {
    clientCreated = true;
  };

  const response = await route.GET({
    headers: new Headers({ authorization: "Bearer wrong" }),
  });

  assert.equal(response.status, 401);
  assert.equal(clientCreated, false);
});

test("dry-run records 50 candidates and never calls removeStoragePaths", async () => {
  process.env.CRON_SECRET = "test-cron-secret";
  delete process.env.STORAGE_CLEANUP_DRY_RUN;
  const candidates = Array.from({ length: 51 }, (_, index) => ({
    storage_path: `user/thread/${index}.png`,
  }));
  const { state, supabase } = createSupabaseMock(candidates);
  let removeCalled = false;
  adminModule.createAdminSupabaseClient = () => supabase;
  storageCleanupModule.removeStoragePaths = async () => {
    removeCalled = true;
  };

  const response = await route.GET(authorizedRequest());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    mode: "dry_run",
    candidateCount: 50,
    limitReached: true,
  });
  assert.equal(removeCalled, false);
  assert.deepEqual(state.rpcCalls, [
    { name: "find_orphan_storage_candidates", args: { p_limit: 51 } },
  ]);
  assert.equal(state.updates.at(-1).payload.candidate_count, 50);
  assert.equal(state.updates.at(-1).payload.limit_reached, true);
});

test("delete mode passes only selected candidate paths to removeStoragePaths", async () => {
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.STORAGE_CLEANUP_DRY_RUN = "false";
  const candidates = [
    { storage_path: "user/thread/a.png" },
    { storage_path: "user/thread/b.png" },
  ];
  const { state, supabase } = createSupabaseMock(candidates);
  let receivedSupabase;
  let receivedPaths;
  adminModule.createAdminSupabaseClient = () => supabase;
  storageCleanupModule.removeStoragePaths = async (client, paths) => {
    receivedSupabase = client;
    receivedPaths = paths;
    return {
      attemptedCount: 2,
      succeededCount: 2,
      failedCount: 0,
      errorCodes: [],
    };
  };

  const response = await route.GET(authorizedRequest());

  assert.equal(response.status, 200);
  assert.equal(receivedSupabase, supabase);
  assert.deepEqual(receivedPaths, ["user/thread/a.png", "user/thread/b.png"]);
  assert.equal(state.updates.at(-1).payload.status, "succeeded");
  assert.equal(state.updates.at(-1).payload.succeeded_count, 2);
});

test("partial deletion failure is recorded and returns HTTP 500", async () => {
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.STORAGE_CLEANUP_DRY_RUN = "false";
  const { state, supabase } = createSupabaseMock([
    { storage_path: "user/thread/a.png" },
    { storage_path: "user/thread/b.png" },
  ]);
  adminModule.createAdminSupabaseClient = () => supabase;
  storageCleanupModule.removeStoragePaths = async () => ({
    attemptedCount: 2,
    succeededCount: 1,
    failedCount: 1,
    errorCodes: ["storage-error"],
  });

  const response = await route.GET(authorizedRequest());
  const update = state.updates.at(-1).payload;

  assert.equal(response.status, 500);
  assert.equal(update.status, "partial_failure");
  assert.equal(update.failed_count, 1);
  assert.deepEqual(update.error_codes, ["storage-error"]);
});

async function run() {
  let passed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`ok - ${name}`);
    } catch (error) {
      console.error(`not ok - ${name}`);
      throw error;
    }
  }
  console.log(`${passed} storage cleanup cron tests passed`);
}

run().catch(() => {
  process.exitCode = 1;
});
