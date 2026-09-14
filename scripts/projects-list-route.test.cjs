const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const {
  installAliasResolver,
  installTsLoader,
} = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;

const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECTS = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Alpha" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Beta" },
];

let authenticated = true;
let queryResult = { data: PROJECTS, error: null };
let queryCalls = [];

const supabase = {
  from(table) {
    queryCalls.push({ operation: "from", table });
    return {
      select(columns) {
        queryCalls.push({ operation: "select", columns });
        return {
          async eq(column, value) {
            queryCalls.push({ operation: "eq", column, value });
            return queryResult;
          },
        };
      },
    };
  },
};

const originalLoad = Module._load;
Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "@/lib/supabase/route-auth") {
    return {
      async requireRouteUser() {
        if (!authenticated) {
          return {
            ok: false,
            response: Response.json({ error: "Unauthorized" }, { status: 401 }),
          };
        }
        return {
          ok: true,
          user: { id: USER_ID },
          supabase,
          finalizeJson(body, init) {
            return Response.json(body, init);
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
const { GET } = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "projects",
  "route.ts",
));

function resetMocks(options = {}) {
  authenticated = options.authenticated ?? true;
  queryResult = options.queryResult ?? { data: PROJECTS, error: null };
  queryCalls = [];
}

function invokeGet() {
  return GET(new NextRequest("https://www.kabehub.com/api/projects"));
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("unauthenticated requests return 401 before database access", async () => {
  resetMocks({ authenticated: false });
  const response = await invokeGet();
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.deepEqual(queryCalls, []);
});

test("returns only id and name from projects owned by the route user", async () => {
  resetMocks();
  const response = await invokeGet();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { projects: PROJECTS });
  assert.deepEqual(queryCalls, [
    { operation: "from", table: "projects" },
    { operation: "select", columns: "id, name" },
    { operation: "eq", column: "user_id", value: USER_ID },
  ]);
});

test("normalizes null project data to an empty list", async () => {
  resetMocks({ queryResult: { data: null, error: null } });
  const response = await invokeGet();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { projects: [] });
});

test("database errors return 500", async () => {
  resetMocks({ queryResult: { data: null, error: { message: "query failed" } } });
  const response = await invokeGet();
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "query failed" });
});

(async () => {
  try {
    for (const { name, fn } of tests) {
      await fn();
      console.log(`ok - ${name}`);
    }
    console.log(`passed ${tests.length} project list route tests`);
  } finally {
    Module._load = originalLoad;
  }
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
