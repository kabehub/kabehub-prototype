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

class MockAiProviderRequestError extends Error {
  constructor(status) {
    super("OpenAI APIへのリクエストに失敗しました");
    this.status = status;
  }
}

let currentUser = { id: USER_ID };
let topicsResult = { data: [], error: null };
let rpcResult = { data: null, error: null };
let queryCalls = [];
let rpcCalls = [];
let embeddingCalls = [];
let embeddingImpl = async (key, input) => {
  embeddingCalls.push({ key, input });
  return [input.length, 0.5];
};

function createTopicsQuery() {
  const state = { select: null, filters: [] };
  queryCalls.push(state);
  const query = {
    select(columns) {
      state.select = columns;
      return query;
    },
    eq(column, value) {
      state.filters.push({ column, value });
      return query;
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(topicsResult).then(onFulfilled, onRejected);
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
    assert.equal(table, "project_memory_topics");
    return createTopicsQuery();
  },
  async rpc(name, args) {
    rpcCalls.push({ name, args });
    return rpcResult;
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
  if (request === "@/lib/lore/openai") {
    return {
      AiProviderRequestError: MockAiProviderRequestError,
      createEmbedding(key, input) {
        return embeddingImpl(key, input);
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
  "route.ts",
));

function resetMocks(options = {}) {
  currentUser = options.user === undefined ? { id: USER_ID } : options.user;
  topicsResult = options.topicsResult ?? { data: [], error: null };
  rpcResult = options.rpcResult ?? { data: null, error: null };
  embeddingCalls = [];
  queryCalls = [];
  rpcCalls = [];
  embeddingImpl = async (key, input) => {
    embeddingCalls.push({ key, input });
    return [input.length, 0.5];
  };
}

function invokeDelete(options = {}) {
  const headers = { "content-type": "application/json" };
  if (options.openaiKey) {
    headers["x-openai-api-key"] = options.openaiKey;
  }
  const rawBody =
    options.rawBody !== undefined
      ? options.rawBody
      : JSON.stringify(options.body);
  const request = new NextRequest(
    `https://www.kabehub.com/api/projects/${PROJECT_ID}`,
    { method: "DELETE", headers, body: rawBody },
  );
  return route.DELETE(request, {
    params: Promise.resolve({ projectId: PROJECT_ID }),
  });
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("unauthenticated requests fail before parsing or database access", async () => {
  resetMocks({ user: null });
  const response = await invokeDelete({ rawBody: "{" });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.deepEqual(queryCalls, []);
  assert.deepEqual(rpcCalls, []);
});

test("malformed JSON fails closed", async () => {
  resetMocks();
  const response = await invokeDelete({ rawBody: "{" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid request body" });
  assert.deepEqual(rpcCalls, []);
});

for (const [label, body] of [
  ["missing", {}],
  ["null", { promoteToLore: null }],
  ["string", { promoteToLore: "false" }],
  ["number", { promoteToLore: 0 }],
]) {
  test(`${label} promoteToLore fails closed`, async () => {
    resetMocks();
    const response = await invokeDelete({ body });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "promoteToLore (boolean) is required",
    });
    assert.deepEqual(queryCalls, []);
    assert.deepEqual(rpcCalls, []);
  });
}

test("promotion requires the OpenAI header before topic lookup", async () => {
  resetMocks();
  const response = await invokeDelete({ body: { promoteToLore: true } });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "x-openai-api-key header required",
  });
  assert.deepEqual(queryCalls, []);
  assert.deepEqual(rpcCalls, []);
});

test("non-promotion always sends an empty promotions array", async () => {
  resetMocks();
  const response = await invokeDelete({ body: { promoteToLore: false } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.deepEqual(queryCalls, []);
  assert.deepEqual(embeddingCalls, []);
  assert.deepEqual(rpcCalls, [
    {
      name: "delete_project_preserving_contents",
      args: {
        p_user_id: USER_ID,
        p_project_id: PROJECT_ID,
        p_promote_to_lore: false,
        p_lore_promotions: [],
      },
    },
  ]);
});

test("promotion embeds only non-empty topics sequentially", async () => {
  resetMocks({
    topicsResult: {
      data: [
        { id: "topic-1", content_md: "first", revision: 2 },
        { id: "topic-empty", content_md: " \n ", revision: 1 },
        { id: "topic-2", content_md: "second", revision: 4 },
      ],
      error: null,
    },
  });
  let active = 0;
  let maxActive = 0;
  embeddingImpl = async (key, input) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    embeddingCalls.push({ key, input });
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    return [input.length];
  };

  const response = await invokeDelete({
    body: { promoteToLore: true },
    openaiKey: "test-openai-key",
  });

  assert.equal(response.status, 200);
  assert.equal(maxActive, 1);
  assert.deepEqual(embeddingCalls, [
    { key: "test-openai-key", input: "first" },
    { key: "test-openai-key", input: "second" },
  ]);
  assert.deepEqual(queryCalls[0], {
    select: "id, content_md, revision",
    filters: [
      { column: "project_id", value: PROJECT_ID },
      { column: "user_id", value: USER_ID },
    ],
  });
  assert.deepEqual(rpcCalls[0].args.p_lore_promotions, [
    { topic_id: "topic-1", expected_revision: 2, embedding: [5] },
    { topic_id: "topic-2", expected_revision: 4, embedding: [6] },
  ]);
});

test("provider status is preserved and the RPC is not called", async () => {
  resetMocks({
    topicsResult: {
      data: [{ id: "topic-1", content_md: "content", revision: 1 }],
      error: null,
    },
  });
  embeddingImpl = async () => {
    throw new MockAiProviderRequestError(429);
  };
  const response = await invokeDelete({
    body: { promoteToLore: true },
    openaiKey: "test-openai-key",
  });
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), {
    error: "OpenAI APIへのリクエストに失敗しました",
  });
  assert.deepEqual(rpcCalls, []);
});

test("a provider network failure falls back to 502", async () => {
  resetMocks({
    topicsResult: {
      data: [{ id: "topic-1", content_md: "content", revision: 1 }],
      error: null,
    },
  });
  embeddingImpl = async () => {
    throw new MockAiProviderRequestError(null);
  };
  const response = await invokeDelete({
    body: { promoteToLore: true },
    openaiKey: "test-openai-key",
  });
  assert.equal(response.status, 502);
  assert.deepEqual(rpcCalls, []);
});

test("topic lookup errors stop before embedding and deletion", async () => {
  resetMocks({
    topicsResult: { data: null, error: { message: "topic lookup failed" } },
  });
  const response = await invokeDelete({
    body: { promoteToLore: true },
    openaiKey: "test-openai-key",
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "topic lookup failed" });
  assert.deepEqual(embeddingCalls, []);
  assert.deepEqual(rpcCalls, []);
});

for (const [message, expectedStatus, expectedError] of [
  ["project not found", 404, "Project not found"],
  ["promote_to_lore is required", 400, "promote_to_lore is required"],
  ["lore_promotions must be a jsonb array", 400, "lore_promotions must be a jsonb array"],
  ["lore_promotions must be empty when promote_to_lore is false", 400, "lore_promotions must be empty when promote_to_lore is false"],
  ["topic changed during promotion", 409, "Topic changed during promotion"],
  ["invalid lore promotion element", 400, "invalid lore promotion element"],
  ["duplicate topic_id in lore_promotions", 400, "duplicate topic_id in lore_promotions"],
]) {
  test(`maps the RPC error: ${message}`, async () => {
    resetMocks({ rpcResult: { data: null, error: { code: "P0001", message } } });
    const response = await invokeDelete({ body: { promoteToLore: false } });
    assert.equal(response.status, expectedStatus);
    assert.deepEqual(await response.json(), { error: expectedError });
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
  console.log(`passed ${tests.length} project deletion route tests`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
