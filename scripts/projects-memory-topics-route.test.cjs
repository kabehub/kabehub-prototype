const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;

const PROJECT_ID = "project-1";
const USER_ID = "user-1";

let currentUser = null;
let projectResult = { data: null, error: null };
let topicsResult = { data: [], error: null };
let rpcResult = { data: null, error: null };
let fromCalls = [];
let queryCalls = [];
let rpcCalls = [];

function createQuery(table, result) {
  const state = { select: null, filters: [], order: null };
  queryCalls.push({ table, state });

  function resolveResult() {
    if (result.error || !Array.isArray(result.data)) return result;

    let data = [...result.data];
    if (state.order) {
      const { column, options } = state.order;
      data.sort((left, right) => {
        const comparison = String(left[column]).localeCompare(String(right[column]));
        return options?.ascending === false ? -comparison : comparison;
      });
    }
    return { data, error: null };
  }

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
      return Promise.resolve(resolveResult());
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(resolveResult()).then(onFulfilled, onRejected);
    },
  };
  return query;
}

const supabase = {
  auth: {
    async getUser() {
      return { data: { user: currentUser }, error: null };
    },
  },
  from(table) {
    fromCalls.push(table);
    if (table === "projects") return createQuery(table, projectResult);
    if (table === "project_memory_topics") return createQuery(table, topicsResult);
    throw new Error(`unexpected table access: ${table}`);
  },
  rpc(name, args) {
    rpcCalls.push({ name, args });
    return {
      single() {
        return Promise.resolve(rpcResult);
      },
    };
  },
};

const originalLoad = Module._load;
Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "@/lib/supabase/route-handler") {
    return {
      createRouteHandlerSupabaseClient() {
        return supabase;
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

installTsLoader();
installAliasResolver();

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

const { NextRequest } = require("next/server");
const route = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "projects",
  "[projectId]",
  "memory",
  "topics",
  "route.ts",
));

const pendingTests = [];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

function resetMocks(options = {}) {
  currentUser = options.user === undefined ? { id: USER_ID } : options.user;
  projectResult = options.projectResult ?? {
    data: { id: PROJECT_ID },
    error: null,
  };
  topicsResult = options.topicsResult ?? { data: [], error: null };
  rpcResult = options.rpcResult ?? {
    data: {
      topic_id: "topic-1",
      revision: 1,
      content_md: "Initial content",
      created_at: "2026-09-09T00:00:00.000Z",
    },
    error: null,
  };
  fromCalls = [];
  queryCalls = [];
  rpcCalls = [];
}

function routeProps() {
  return { params: Promise.resolve({ projectId: PROJECT_ID }) };
}

function invokeGet() {
  const request = new NextRequest(
    `https://www.kabehub.com/api/projects/${PROJECT_ID}/memory/topics`,
  );
  return route.GET(request, routeProps());
}

function invokePost(options = {}) {
  const rawBody =
    options.rawBody !== undefined ? options.rawBody : JSON.stringify(options.body);
  const request = new NextRequest(
    `https://www.kabehub.com/api/projects/${PROJECT_ID}/memory/topics`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rawBody,
    },
  );
  return route.POST(request, routeProps());
}

async function captureConsoleError(action) {
  const calls = [];
  const originalError = console.error;
  console.error = (...args) => calls.push(args);
  try {
    return { response: await action(), calls };
  } finally {
    console.error = originalError;
  }
}

test("unauthenticated GET is rejected before database or RPC access", async () => {
  resetMocks({ user: null });

  const response = await invokeGet();

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.deepEqual(fromCalls, []);
  assert.deepEqual(rpcCalls, []);
});

test("GET returns Project not found when the project is not owned", async () => {
  resetMocks({ projectResult: { data: null, error: null } });

  const response = await invokeGet();

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Project not found" });
  assert.deepEqual(fromCalls, ["projects"]);
  assert.deepEqual(rpcCalls, []);
});

test("GET returns 500 when the project lookup fails", async () => {
  resetMocks({
    projectResult: {
      data: null,
      error: { code: "57014", message: "raw project failure" },
    },
  });

  const response = await invokeGet();

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Failed to load project" });
  assert.deepEqual(fromCalls, ["projects"]);
});

test("GET returns an empty topics array", async () => {
  resetMocks();

  const response = await invokeGet();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { topics: [] });
  assert.deepEqual(fromCalls, ["projects", "project_memory_topics"]);
});

test("GET requests topic_key ascending order and returns that order", async () => {
  const later = {
    id: "topic-2",
    topic_key: "timeline",
    revision: 2,
    created_at: "2026-09-09T00:00:02.000Z",
    updated_at: "2026-09-09T00:00:03.000Z",
  };
  const earlier = {
    id: "topic-1",
    topic_key: "overview",
    revision: 1,
    created_at: "2026-09-09T00:00:00.000Z",
    updated_at: "2026-09-09T00:00:01.000Z",
  };
  resetMocks({ topicsResult: { data: [later, earlier], error: null } });

  const response = await invokeGet();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { topics: [earlier, later] });
  assert.deepEqual(queryCalls[1].state.order, {
    column: "topic_key",
    options: { ascending: true },
  });
  assert.equal(queryCalls[1].state.select.includes("content_md"), false);
});

test("GET returns a fixed 500 response when the topic lookup fails", async () => {
  resetMocks({
    topicsResult: {
      data: null,
      error: { code: "57014", message: "raw topics failure" },
    },
  });

  const response = await invokeGet();

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.deepEqual(body, { error: "Failed to load topics" });
  assert.equal(JSON.stringify(body).includes("raw topics failure"), false);
});

test("unauthenticated POST is rejected before database or RPC access", async () => {
  resetMocks({ user: null });

  const response = await invokePost({ body: { topic_key: "overview" } });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.deepEqual(fromCalls, []);
  assert.deepEqual(rpcCalls, []);
});

test("POST rejects malformed JSON before database or RPC access", async () => {
  resetMocks();

  const response = await invokePost({ rawBody: "{" });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid request body" });
  assert.deepEqual(fromCalls, []);
  assert.deepEqual(rpcCalls, []);
});

for (const [label, body] of [
  ["missing", {}],
  ["empty", { topic_key: "" }],
  ["whitespace-only", { topic_key: "   " }],
]) {
  test(`POST rejects a ${label} topic_key before the RPC`, async () => {
    resetMocks();

    const response = await invokePost({ body });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "topic_key is required" });
    assert.deepEqual(fromCalls, []);
    assert.deepEqual(rpcCalls, []);
  });
}

test("POST uses the trimmed topic_key in both the RPC and response", async () => {
  resetMocks();

  const response = await invokePost({
    body: { topic_key: "  overview  ", content_md: "Initial content" },
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.topic.topic_key, "overview");
  assert.equal(rpcCalls[0].args.p_topic_key, "overview");
  assert.equal(fromCalls.length, 0);
});

test("POST rejects a non-array source_refs before the RPC", async () => {
  resetMocks();

  const response = await invokePost({
    body: { topic_key: "overview", source_refs: "not-an-array" },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "source_refs must be a jsonb array",
  });
  assert.deepEqual(fromCalls, []);
  assert.deepEqual(rpcCalls, []);
});

test("POST defaults source_refs to an empty array", async () => {
  resetMocks();

  const response = await invokePost({ body: { topic_key: "overview" } });

  assert.equal(response.status, 201);
  assert.deepEqual(rpcCalls[0].args.p_source_refs, []);
});

test("POST returns the normalized create response contract", async () => {
  resetMocks();

  const response = await invokePost({
    body: {
      topic_key: "overview",
      content_md: "Initial content",
      source_refs: [{ kind: "message", id: "message-1" }],
    },
  });

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    topic: {
      id: "topic-1",
      topic_key: "overview",
      revision: 1,
      content_md: "Initial content",
      created_at: "2026-09-09T00:00:00.000Z",
    },
  });
  assert.deepEqual(rpcCalls, [
    {
      name: "create_project_memory_topic",
      args: {
        p_user_id: USER_ID,
        p_project_id: PROJECT_ID,
        p_topic_key: "overview",
        p_content_md: "Initial content",
        p_source_refs: [{ kind: "message", id: "message-1" }],
      },
    },
  ]);
  assert.deepEqual(fromCalls, []);
});

const rpcMessageMappings = [
  ["project not found", 404, "Project not found"],
  ["topic not found", 404, "Topic not found"],
  ["topic already exists", 409, "Topic already exists"],
  ["revision conflict", 409, "Revision conflict"],
  ["old_text not found", 409, "old_text not found"],
  ["old_text not unique", 409, "old_text not unique"],
  ["topic_key is required", 400, "topic_key is required"],
  ["source_refs must be a jsonb array", 400, "source_refs must be a jsonb array"],
  ["expected_revision must be a positive integer", 400, "expected_revision must be a positive integer"],
  ["edit_kind must be full or partial", 400, "edit_kind must be full or partial"],
  ["new_content_md is required for full edit", 400, "new_content_md is required for full edit"],
  ["old_text and new_text are required for partial edit", 400, "old_text and new_text are required for partial edit"],
];

for (const [message, expectedStatus, expectedError] of rpcMessageMappings) {
  test(`POST maps the exact RPC message: ${message}`, async () => {
    resetMocks({
      rpcResult: { data: null, error: { code: "P0001", message } },
    });

    const { response, calls } = await captureConsoleError(() =>
      invokePost({ body: { topic_key: "overview" } }),
    );

    assert.equal(response.status, expectedStatus);
    assert.deepEqual(await response.json(), { error: expectedError });
    assert.deepEqual(calls, [
      [
        "[db-operation-failed]",
        {
          route: "projects-memory-topics",
          operation: "create_project_memory_topic",
          table: "project_memory_topics",
          errorCode: "P0001",
        },
      ],
    ]);
  });
}

test("POST prioritizes SQLSTATE 42501 over the RPC message", async () => {
  resetMocks({
    rpcResult: {
      data: null,
      error: { code: "42501", message: "topic not found" },
    },
  });

  const { response } = await captureConsoleError(() =>
    invokePost({ body: { topic_key: "overview" } }),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Forbidden" });
});

test("POST fail-closes unknown RPC errors without exposing raw messages", async () => {
  const rawMessage = "unknown invariant with sensitive database detail";
  resetMocks({
    rpcResult: {
      data: null,
      error: { code: "XX000", message: rawMessage },
    },
  });

  const { response, calls } = await captureConsoleError(() =>
    invokePost({ body: { topic_key: "overview" } }),
  );

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.deepEqual(body, { error: "Failed to process request" });
  assert.equal(JSON.stringify(body).includes(rawMessage), false);
  assert.deepEqual(calls, [
    [
      "[db-operation-failed]",
      {
        route: "projects-memory-topics",
        operation: "create_project_memory_topic",
        table: "project_memory_topics",
        errorCode: "XX000",
      },
    ],
  ]);
  assert.equal(JSON.stringify(calls).includes(rawMessage), false);
});

(async () => {
  for (const { name, fn } of pendingTests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (error) {
      console.error(`not ok - ${name}`);
      throw error;
    }
  }
  console.log(`passed ${pendingTests.length} project memory topics route tests`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
