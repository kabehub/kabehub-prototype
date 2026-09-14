const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const {
  installAliasResolver,
  installTsLoader,
} = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

let authenticated = true;
let rpcResult = { data: PROJECT_ID, error: null };
let rpcCalls = [];

const supabase = {
  async rpc(name, args) {
    rpcCalls.push({ name, args });
    return rpcResult;
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
const route = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "projects",
  "route.ts",
));

function resetMocks(options = {}) {
  authenticated = options.authenticated ?? true;
  rpcResult = options.rpcResult ?? { data: PROJECT_ID, error: null };
  rpcCalls = [];
}

function invokePost(options = {}) {
  const rawBody =
    options.rawBody !== undefined
      ? options.rawBody
      : JSON.stringify(options.body);
  const request = new NextRequest("https://www.kabehub.com/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
  return route.POST(request);
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("unauthenticated requests fail before parsing or RPC access", async () => {
  resetMocks({ authenticated: false });
  const response = await invokePost({ rawBody: "{" });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.deepEqual(rpcCalls, []);
});

test("malformed JSON fails closed", async () => {
  resetMocks();
  const response = await invokePost({ rawBody: "{" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid request body" });
  assert.deepEqual(rpcCalls, []);
});

for (const [label, body] of [
  ["null body", null],
  ["string body", "project"],
  ["number body", 123],
  ["array body", []],
]) {
  test(`${label} is rejected as a non-object request body`, async () => {
    resetMocks();
    const response = await invokePost({ body });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Invalid request body" });
    assert.deepEqual(rpcCalls, []);
  });
}

for (const [label, body] of [
  ["missing", {}],
  ["null", { name: null }],
  ["number", { name: 123 }],
]) {
  test(`${label} name fails closed`, async () => {
    resetMocks();
    const response = await invokePost({ body });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "name (string) is required",
    });
    assert.deepEqual(rpcCalls, []);
  });
}

for (const [label, name] of [
  ["empty", ""],
  ["whitespace-only", " \t\n "],
]) {
  test(`${label} name is rejected before the RPC`, async () => {
    resetMocks();
    const response = await invokePost({ body: { name } });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "name is required" });
    assert.deepEqual(rpcCalls, []);
  });
}

test("trims the canonical name for both the RPC and response", async () => {
  resetMocks();
  const response = await invokePost({ body: { name: "  Test Project  " } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    project_id: PROJECT_ID,
    name: "Test Project",
  });
  assert.deepEqual(rpcCalls, [
    {
      name: "get_or_create_project",
      args: {
        p_user_id: USER_ID,
        p_name: "Test Project",
      },
    },
  ]);
});

test("maps an RPC 42501 error to 403", async () => {
  resetMocks({
    rpcResult: {
      data: null,
      error: { code: "42501", message: "permission denied" },
    },
  });
  const response = await invokePost({ body: { name: "Test Project" } });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Forbidden" });
});

test("maps an unknown RPC error to 500", async () => {
  resetMocks({
    rpcResult: {
      data: null,
      error: { code: "XX000", message: "unexpected database error" },
    },
  });
  const response = await invokePost({ body: { name: "Test Project" } });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "Failed to process request",
  });
});

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
  console.log(`passed ${tests.length} project create route tests`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
