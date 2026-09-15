const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;
installTsLoader();
installAliasResolver();

const { getOwnedProject } = require("../lib/project-memory/get-owned-project.ts");
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const THREAD_ID = "33333333-3333-4333-8333-333333333333";
const POST_COLUMNS = "id, title, created_at, updated_at, project_id";
const GET_COLUMNS = "id, title, created_at, updated_at, is_public, genre, project_id, projects(user_id, name)";

let authenticated;
let rateLimitResponse;
let ownedResult;
let rpcResult;
let threadsResult;
let insertError;
let ownedCalls;
let rpcCalls;
let queryCalls;
let insertCalls;

const supabase = {
  from(table) {
    assert.ok(["projects", "threads"].includes(table));
    const state = { table, select: null, filters: [], order: null, limit: null };
    queryCalls.push(state);
    let payload;
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
      limit(count) {
        state.limit = count;
        return query;
      },
      overrideTypes() {
        return query;
      },
      insert(value) {
        assert.equal(table, "threads");
        payload = value;
        insertCalls.push(value);
        return query;
      },
      async maybeSingle() {
        assert.equal(table, "projects");
        return ownedResult;
      },
      async single() {
        assert.equal(table, "threads");
        assert.equal(state.select, POST_COLUMNS);
        return {
          data: insertError ? null : {
            id: THREAD_ID,
            title: payload.title,
            created_at: "2026-09-16T00:00:00Z",
            updated_at: "2026-09-16T00:00:00Z",
            project_id: payload.project_id,
          },
          error: insertError,
        };
      },
      then(onFulfilled, onRejected) {
        assert.equal(table, "threads");
        return Promise.resolve(threadsResult).then(onFulfilled, onRejected);
      },
    };
    return query;
  },
  async rpc(name, args) {
    rpcCalls.push({ name, args });
    return rpcResult;
  },
};

const originalLoad = Module._load;
Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "@/lib/mcp-auth") {
    return {
      async authenticateMcpToken() { return authenticated ? USER_ID : null; },
      serviceRoleClient() { return supabase; },
    };
  }
  if (request === "@/lib/rate-limit") {
    return { async checkMcpLimitResponse() { return rateLimitResponse; } };
  }
  if (request === "@/lib/project-memory/get-owned-project") {
    return {
      async getOwnedProject(client, userId, projectId) {
        assert.equal(client, supabase);
        ownedCalls.push({ userId, projectId });
        return getOwnedProject(client, userId, projectId);
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { NextRequest } = require("next/server");
const route = require(path.join(__dirname, "..", "app", "api", "mcp", "threads", "route.ts"));

function resetMocks(options = {}) {
  authenticated = options.authenticated ?? true;
  rateLimitResponse = options.rateLimitResponse ?? null;
  ownedResult = options.ownedResult ?? { data: { id: PROJECT_ID }, error: null };
  rpcResult = options.rpcResult ?? { data: PROJECT_ID, error: null };
  threadsResult = options.threadsResult ?? { data: [], error: null };
  insertError = options.insertError ?? null;
  ownedCalls = [];
  rpcCalls = [];
  queryCalls = [];
  insertCalls = [];
}

function invokePost(options = {}) {
  return route.POST(new NextRequest("https://www.kabehub.com/api/mcp/threads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: options.rawBody !== undefined ? options.rawBody : JSON.stringify(options.body),
  }));
}

function invokeGet() {
  return route.GET(new NextRequest("https://www.kabehub.com/api/mcp/threads"));
}

function assertNoDbAccess() {
  assert.deepEqual(ownedCalls, []);
  assert.deepEqual(rpcCalls, []);
  assert.deepEqual(queryCalls, []);
  assert.deepEqual(insertCalls, []);
}

async function assertCreated(response, projectId) {
  assert.equal(response.status, 201);
  const { thread } = await response.json();
  assert.equal(thread.id, THREAD_ID);
  assert.ok(Object.prototype.hasOwnProperty.call(thread, "project_id"));
  assert.equal(thread.project_id, projectId);
  assert.equal(insertCalls.length, 1);
  assert.equal(insertCalls[0].project_id, projectId);
  assert.equal(Object.prototype.hasOwnProperty.call(insertCalls[0], "folder_name"), false);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

for (const [method, invoke] of [["POST", () => invokePost({ rawBody: "{" })], ["GET", invokeGet]]) {
  test(`${method}: unauthenticated requests stop before database access`, async () => {
    resetMocks({ authenticated: false });
    const response = await invoke();
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "Unauthorized");
    assertNoDbAccess();
  });

  test(`${method}: rate-limited requests stop before database access`, async () => {
    resetMocks({ rateLimitResponse: Response.json({ error: "Too many requests" }, { status: 429 }) });
    const response = await invoke();
    assert.equal(response.status, 429);
    assertNoDbAccess();
  });
}

test("POST: malformed JSON fails before ownership lookup, RPC, or INSERT", async () => {
  resetMocks();
  const response = await invokePost({ rawBody: "{" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid request body" });
  assertNoDbAccess();
});

for (const [label, body] of [["null", null], ["array", []], ["number", 123], ["string", "project"], ["boolean", true]]) {
  test(`POST: ${label} body fails before database access`, async () => {
    resetMocks();
    const response = await invokePost({ body });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Invalid request body" });
    assertNoDbAccess();
  });
}

for (const body of [
  { project_id: PROJECT_ID, folder_name: "Foo" },
  { project_id: "", folder_name: "" },
  { project_id: PROJECT_ID, folder_name: "Foo", hasOwnProperty: 123 },
]) {
  test(`POST: string aliases are mutually exclusive (${JSON.stringify(body)})`, async () => {
    resetMocks();
    const response = await invokePost({ body });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "project_id and folder_name are mutually exclusive" });
    assertNoDbAccess();
  });
}

for (const key of ["project_id", "folder_name"]) {
  const otherKey = key === "project_id" ? "folder_name" : "project_id";
  for (const [label, value] of [["number", 123], ["object", {}], ["array", []], ["boolean", true]]) {
    for (const withOtherKey of [false, true]) {
      test(`POST: ${label} ${key}${withOtherKey ? " with other alias" : ""} fails before database access`, async () => {
        resetMocks();
        const body = { [key]: value };
        if (withOtherKey) body[otherKey] = otherKey === "project_id" ? PROJECT_ID : "Foo";
        const response = await invokePost({ body });
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { error: `${key} must be a string` });
        assertNoDbAccess();
      });
    }
  }
}

for (const body of [{}, { project_id: null }, { folder_name: null }, { project_id: null, folder_name: null }]) {
  test(`POST: unspecified/null aliases create an unassigned thread (${JSON.stringify(body)})`, async () => {
    resetMocks();
    await assertCreated(await invokePost({ body }), null);
    assert.deepEqual(ownedCalls, []);
    assert.deepEqual(rpcCalls, []);
    assert.deepEqual(insertCalls[0], {
      user_id: USER_ID, title: "無題", system_prompt: null, project_id: null, genre: null,
    });
  });
}

for (const extra of [{}, { folder_name: null }, { hasOwnProperty: 123 }]) {
  test(`POST: owned project_id uses the canonical ID (${JSON.stringify(extra)})`, async () => {
    resetMocks();
    await assertCreated(await invokePost({ body: {
      project_id: PROJECT_ID, title: "Canonical", system_prompt: "Prompt", genre: "work", ...extra,
    } }), PROJECT_ID);
    assert.deepEqual(ownedCalls, [{ userId: USER_ID, projectId: PROJECT_ID }]);
    assert.deepEqual(rpcCalls, []);
    assert.deepEqual(queryCalls[0], {
      table: "projects", select: "id",
      filters: [{ column: "id", value: PROJECT_ID }, { column: "user_id", value: USER_ID }],
      order: null, limit: null,
    });
    assert.deepEqual(insertCalls[0], {
      user_id: USER_ID, title: "Canonical", system_prompt: "Prompt", project_id: PROJECT_ID, genre: "work",
    });
  });
}

test("POST: unowned project_id returns 404 without RPC or INSERT", async () => {
  resetMocks({ ownedResult: { data: null, error: null } });
  const response = await invokePost({ body: { project_id: PROJECT_ID } });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Project not found" });
  assert.deepEqual(ownedCalls, [{ userId: USER_ID, projectId: PROJECT_ID }]);
  assert.deepEqual(rpcCalls, []);
  assert.deepEqual(insertCalls, []);
});

test("POST: ownership lookup errors stop before RPC or INSERT", async () => {
  resetMocks({ ownedResult: { data: null, error: { message: "database failure" } } });
  const response = await invokePost({ body: { project_id: PROJECT_ID } });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Failed to load project" });
  assert.deepEqual(rpcCalls, []);
  assert.deepEqual(insertCalls, []);
});

for (const [folderName, extra] of [["Foo", {}], [" Foo ", {}], [" Foo ", { project_id: null }], ["Foo", { hasOwnProperty: 123 }], ["", {}]]) {
  test(`POST: folder_name resolves without trimming (${JSON.stringify({ folderName, extra })})`, async () => {
    resetMocks();
    await assertCreated(await invokePost({ body: { folder_name: folderName, ...extra } }), PROJECT_ID);
    assert.deepEqual(ownedCalls, []);
    assert.deepEqual(rpcCalls, [{ name: "get_or_create_project", args: { p_user_id: USER_ID, p_name: folderName } }]);
  });
}

test("POST: alias resolution errors stop before INSERT", async () => {
  resetMocks({ rpcResult: { data: null, error: { message: "project resolution failed" } } });
  const response = await invokePost({ body: { folder_name: "Foo" } });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "project resolution failed" });
  assert.deepEqual(ownedCalls, []);
  assert.deepEqual(insertCalls, []);
});

test("POST: INSERT errors return 500", async () => {
  resetMocks({ insertError: { message: "thread creation failed" } });
  const response = await invokePost({ body: {} });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "thread creation failed" });
});

function threadRow(overrides = {}) {
  return {
    id: THREAD_ID, title: "Joined project", created_at: "2026-09-16T00:00:00Z",
    updated_at: "2026-09-16T00:00:00Z", is_public: false, genre: "work",
    project_id: PROJECT_ID, projects: { user_id: USER_ID, name: " Foo " },
    folder_name: "Stale legacy name", ...overrides,
  };
}

test("GET: project_id and legacy name come from the owned Project join", async () => {
  resetMocks({ threadsResult: { data: [threadRow()], error: null } });
  const response = await invokeGet();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { threads: [{
    id: THREAD_ID, title: "Joined project", created_at: "2026-09-16T00:00:00Z",
    updated_at: "2026-09-16T00:00:00Z", is_public: false, genre: "work",
    project_id: PROJECT_ID, folder_name: " Foo ",
  }] });
  assert.deepEqual(queryCalls, [{
    table: "threads", select: GET_COLUMNS, filters: [{ column: "user_id", value: USER_ID }],
    order: { column: "updated_at", options: { ascending: false } }, limit: 100,
  }]);
  assert.deepEqual(ownedCalls, []);
  assert.deepEqual(rpcCalls, []);
  assert.deepEqual(insertCalls, []);
});

test("GET: foreign, missing, or unassigned Project joins fail closed per row", async () => {
  const rows = [
    threadRow(),
    threadRow({ projects: { user_id: "another-user", name: "Private name" } }),
    threadRow({ projects: null }),
    threadRow({ projects: { name: "Missing owner" } }),
    threadRow({ project_id: null }),
  ];
  resetMocks({ threadsResult: { data: rows, error: null } });
  const response = await invokeGet();
  assert.equal(response.status, 200);
  const { threads } = await response.json();
  assert.deepEqual(threads.map((row) => row.folder_name), [" Foo ", null, null, null, null]);
  assert.deepEqual(threads.map((row) => row.project_id), [PROJECT_ID, PROJECT_ID, PROJECT_ID, PROJECT_ID, null]);
  assert.ok(threads.every((row) => !Object.prototype.hasOwnProperty.call(row, "projects")));
});

for (const data of [[], null]) {
  test(`GET: ${JSON.stringify(data)} data returns an empty list`, async () => {
    resetMocks({ threadsResult: { data, error: null } });
    const response = await invokeGet();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { threads: [] });
  });
}

test("GET: database errors return 500", async () => {
  resetMocks({ threadsResult: { data: null, error: { message: "thread listing failed" } } });
  const response = await invokeGet();
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "thread listing failed" });
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
  console.log(`passed ${tests.length} MCP thread project ID route tests`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
