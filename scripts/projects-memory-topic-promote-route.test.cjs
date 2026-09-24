const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const TOPIC_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const LORE_ID = "55555555-5555-4555-8555-555555555555";

class MockAiProviderRequestError extends Error {
  constructor(status) {
    super("OpenAI APIへのリクエストに失敗しました");
    this.status = status;
  }
}

const defaultProject = { id: PROJECT_ID, user_id: USER_ID };
const defaultTopic = {
  id: TOPIC_ID,
  project_id: PROJECT_ID,
  content_md: "  Full topic snapshot\nwith details.  ",
  revision: 3,
};

let authenticated = true;
let projectResult;
let topicResult;
let rpcResult;
let queryCalls;
let rpcCalls;
let embeddingCalls;
let logCalls;
let embeddingImpl;

function projectColumns(row, columns) {
  if (!columns) return row;
  const names = columns.split(",").map((name) => name.trim());
  return Object.fromEntries(names.map((name) => [name, row[name]]));
}

function createQuery(table, result) {
  const state = { select: null, filters: [] };
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
    maybeSingle() {
      if (result.error || !result.data) return Promise.resolve(result);
      for (const { column, value } of state.filters) {
        if (column in result.data && result.data[column] !== value) {
          return Promise.resolve({ data: null, error: null });
        }
      }
      return Promise.resolve({
        data: projectColumns(result.data, state.select),
        error: null,
      });
    },
  };
  return query;
}

const supabase = {
  from(table) {
    if (table === "projects") return createQuery(table, projectResult);
    if (table === "project_memory_topics") return createQuery(table, topicResult);
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
          finalizeJson(payload, init = {}) {
            return Response.json(payload, init);
          },
        };
      },
    };
  }
  if (request === "@/lib/lore/openai") {
    return {
      AiProviderRequestError: MockAiProviderRequestError,
      createEmbedding(key, input) {
        return embeddingImpl(key, input);
      },
    };
  }
  if (request === "@/lib/logger") {
    return {
      dbOperationFailed(details) {
        logCalls.push(details);
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
  "memory",
  "topics",
  "[topicId]",
  "promote",
  "route.ts",
));

function resetMocks(options = {}) {
  authenticated = options.authenticated ?? true;
  projectResult = options.projectResult ?? {
    data: { ...defaultProject },
    error: null,
  };
  topicResult = options.topicResult ?? {
    data: { ...defaultTopic },
    error: null,
  };
  rpcResult = options.rpcResult ?? {
    data: { lore_id: LORE_ID, created: true },
    error: null,
  };
  queryCalls = [];
  rpcCalls = [];
  embeddingCalls = [];
  logCalls = [];
  embeddingImpl = async (key, input) => {
    embeddingCalls.push({ key, input });
    return [0.1, 0.2, 0.3];
  };
}

function invokePost(options = {}) {
  const rawBody =
    options.rawBody !== undefined
      ? options.rawBody
      : JSON.stringify(options.body ?? { expected_revision: 3 });
  const headers = { "content-type": "application/json" };
  if (options.openaiKey !== null) {
    headers["x-openai-api-key"] = options.openaiKey ?? "openai-test-key";
  }
  const request = new NextRequest(
    `https://www.kabehub.com/api/projects/${PROJECT_ID}/memory/topics/${TOPIC_ID}/promote`,
    { method: "POST", headers, body: rawBody },
  );
  return route.POST(request, {
    params: Promise.resolve({ projectId: PROJECT_ID, topicId: TOPIC_ID }),
  });
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("unauthenticated requests stop before body parsing and database access", async () => {
  resetMocks({ authenticated: false });
  const response = await invokePost({ rawBody: "{" });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.deepEqual(queryCalls, []);
  assert.deepEqual(embeddingCalls, []);
});

test("malformed JSON is rejected before database access", async () => {
  resetMocks();
  const response = await invokePost({ rawBody: "{" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid request body" });
  assert.deepEqual(queryCalls, []);
});

for (const [label, expectedRevision] of [
  ["missing", undefined],
  ["string", "3"],
  ["zero", 0],
  ["fractional", 1.5],
  ["null", null],
]) {
  test(`${label} expected_revision is rejected before database access`, async () => {
    resetMocks();
    const body = {};
    if (expectedRevision !== undefined) body.expected_revision = expectedRevision;
    const response = await invokePost({ body });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "expected_revision must be a positive integer",
    });
    assert.deepEqual(queryCalls, []);
  });
}

test("a cross-user project is returned as 404 before topic lookup", async () => {
  resetMocks({ projectResult: { data: null, error: null } });
  const response = await invokePost();
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Project not found" });
  assert.deepEqual(queryCalls.map((call) => call.table), ["projects"]);
  assert.deepEqual(embeddingCalls, []);
  assert.deepEqual(rpcCalls, []);
});

test("a topic in another project is returned as 404", async () => {
  resetMocks({
    topicResult: {
      data: { ...defaultTopic, project_id: OTHER_PROJECT_ID },
      error: null,
    },
  });
  const response = await invokePost();
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Topic not found" });
  assert.deepEqual(embeddingCalls, []);
  assert.deepEqual(rpcCalls, []);
});

test("stale revision returns 409 before OpenAI is called", async () => {
  resetMocks();
  const response = await invokePost({ body: { expected_revision: 2 } });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "Revision conflict" });
  assert.deepEqual(embeddingCalls, []);
  assert.deepEqual(rpcCalls, []);
});

for (const emptyContent of ["", " \n\t "]) {
  test(`empty topic ${JSON.stringify(emptyContent)} returns 400 before OpenAI`, async () => {
    resetMocks({
      topicResult: {
        data: { ...defaultTopic, content_md: emptyContent },
        error: null,
      },
    });
    const response = await invokePost();
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Topic is empty" });
    assert.deepEqual(embeddingCalls, []);
    assert.deepEqual(rpcCalls, []);
  });
}

test("the OpenAI key is required after validating the server snapshot", async () => {
  resetMocks();
  const response = await invokePost({ openaiKey: null });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "x-openai-api-key header required",
  });
  assert.deepEqual(embeddingCalls, []);
  assert.deepEqual(rpcCalls, []);
});

test("success embeds the complete server snapshot and returns the RPC contract", async () => {
  resetMocks();
  const response = await invokePost();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { lore_id: LORE_ID, created: true });
  assert.deepEqual(embeddingCalls, [
    { key: "openai-test-key", input: defaultTopic.content_md },
  ]);
  assert.deepEqual(queryCalls[1].state, {
    select: "content_md, revision",
    filters: [
      { column: "id", value: TOPIC_ID },
      { column: "project_id", value: PROJECT_ID },
    ],
  });
  assert.deepEqual(rpcCalls, [
    {
      name: "promote_project_memory_topic_to_lore",
      args: {
        p_user_id: USER_ID,
        p_topic_id: TOPIC_ID,
        p_expected_revision: 3,
        p_embedding: [0.1, 0.2, 0.3],
      },
    },
  ]);
});

test("an idempotent RPC response is returned unchanged", async () => {
  resetMocks({
    rpcResult: { data: { lore_id: LORE_ID, created: false }, error: null },
  });
  const response = await invokePost();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { lore_id: LORE_ID, created: false });
});

for (const [message, status, expectedError] of [
  ["revision conflict", 409, "Revision conflict"],
  ["topic not found", 404, "Topic not found"],
  ["topic is empty", 400, "Topic is empty"],
]) {
  test(`RPC error ${message} maps to ${status}`, async () => {
    resetMocks({ rpcResult: { data: null, error: { code: "P0001", message } } });
    const response = await invokePost();
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: expectedError });
    assert.deepEqual(logCalls, [
      {
        route: "projects-memory-topics-promote",
        operation: "promote_project_memory_topic_to_lore",
        table: "lore_embeddings",
        errorCode: "P0001",
      },
    ]);
  });
}

test("provider status is preserved and the RPC is not called", async () => {
  resetMocks();
  embeddingImpl = async () => {
    throw new MockAiProviderRequestError(429);
  };
  const response = await invokePost();
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), {
    error: "OpenAI APIへのリクエストに失敗しました",
  });
  assert.deepEqual(rpcCalls, []);
});

test("topic lookup failures do not expose database errors", async () => {
  resetMocks({
    topicResult: {
      data: null,
      error: { code: "57014", message: "sensitive database detail" },
    },
  });
  const response = await invokePost();
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Failed to load topic" });
  assert.deepEqual(embeddingCalls, []);
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
  console.log(`passed ${tests.length} project memory topic promotion route tests`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
