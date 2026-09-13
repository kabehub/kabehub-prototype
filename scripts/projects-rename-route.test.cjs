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
let rpcResult = { data: "Renamed Project", error: null };
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
  if (request === "@/lib/lore/openai") {
    return {
      AiProviderRequestError: class AiProviderRequestError extends Error {},
      async createEmbedding() {
        throw new Error("unexpected embedding call");
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
  "[projectId]",
  "route.ts",
));

function resetMocks(options = {}) {
  authenticated = options.authenticated ?? true;
  rpcResult = options.rpcResult ?? { data: "Renamed Project", error: null };
  rpcCalls = [];
}

function invokePatch(options = {}) {
  const rawBody =
    options.rawBody !== undefined
      ? options.rawBody
      : JSON.stringify(options.body);
  const request = new NextRequest(
    `https://www.kabehub.com/api/projects/${PROJECT_ID}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: rawBody,
    },
  );
  return route.PATCH(request, {
    params: Promise.resolve({ projectId: PROJECT_ID }),
  });
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("unauthenticated requests fail before parsing or database access", async () => {
  resetMocks({ authenticated: false });
  const response = await invokePatch({ rawBody: "{" });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.deepEqual(rpcCalls, []);
});

test("malformed JSON fails closed", async () => {
  resetMocks();
  const response = await invokePatch({ rawBody: "{" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid request body" });
  assert.deepEqual(rpcCalls, []);
});

for (const [label, body] of [
  ["missing", {}],
  ["null", { name: null }],
  ["number", { name: 123 }],
  ["array body", []],
]) {
  test(`${label} name fails closed`, async () => {
    resetMocks();
    const response = await invokePatch({ body });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "name (string) is required",
    });
    assert.deepEqual(rpcCalls, []);
  });
}

test("a whitespace-only name is rejected before the RPC", async () => {
  resetMocks();
  const response = await invokePatch({ body: { name: " \t\n " } });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "name is required" });
  assert.deepEqual(rpcCalls, []);
});

test("the RPC receives the original name and returns its trimmed canonical name", async () => {
  resetMocks({ rpcResult: { data: "Renamed Project", error: null } });
  const response = await invokePatch({ body: { name: "  Renamed Project  " } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    name: "Renamed Project",
  });
  assert.deepEqual(rpcCalls, [
    {
      name: "rename_project",
      args: {
        p_user_id: USER_ID,
        p_project_id: PROJECT_ID,
        p_new_name: "  Renamed Project  ",
      },
    },
  ]);
});

test("renaming to the current name is a successful no-op", async () => {
  resetMocks({ rpcResult: { data: "Current Project", error: null } });
  const response = await invokePatch({ body: { name: "Current Project" } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    name: "Current Project",
  });
});

for (const [code, message, status, error] of [
  ["42501", "Unauthorized", 403, "Forbidden"],
  ["P0001", "project not found", 404, "Project not found"],
]) {
  test(`maps RPC ${code} ${message}`, async () => {
    resetMocks({ rpcResult: { data: null, error: { code, message } } });
    const response = await invokePatch({ body: { name: "New Project" } });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error });
  });
}

test("maps only this route's unique violation to a duplicate-name 409", async () => {
  resetMocks({
    rpcResult: {
      data: null,
      error: { code: "23505", message: "duplicate key value" },
    },
  });
  const response = await invokePatch({ body: { name: "Existing Project" } });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "A Project with this name already exists",
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
  console.log(`passed ${tests.length} project rename route tests`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
