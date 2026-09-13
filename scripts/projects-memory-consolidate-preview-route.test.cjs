const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;

const PROJECT_ID = "project-1";
const USER_ID = "user-1";

let currentUser = { id: USER_ID };
let projectResult = { data: { id: PROJECT_ID }, error: null };
let topicsResult = { data: [], error: null };
let ignoreNeq = false;
let queryCalls = [];
let llmCalls = [];
let llmContent = null;

function createProjectQuery() {
  const state = { select: null, eq: [] };
  queryCalls.push({ table: "projects", state });
  const query = {
    select(columns) { state.select = columns; return query; },
    eq(column, value) { state.eq.push({ column, value }); return query; },
    maybeSingle() { return Promise.resolve(projectResult); },
  };
  return query;
}

function createTopicsQuery() {
  const state = { select: null, eq: [], neq: [], order: null };
  queryCalls.push({ table: "project_memory_topics", state });
  const resolve = () => {
    if (topicsResult.error || !Array.isArray(topicsResult.data)) return topicsResult;
    let data = [...topicsResult.data];
    if (!ignoreNeq) {
      for (const filter of state.neq) {
        data = data.filter((row) => row[filter.column] !== filter.value);
      }
    }
    if (state.order) {
      data.sort((a, b) => String(a[state.order.column]).localeCompare(String(b[state.order.column])));
    }
    return { data, error: null };
  };
  const query = {
    select(columns) { state.select = columns; return query; },
    eq(column, value) { state.eq.push({ column, value }); return query; },
    neq(column, value) { state.neq.push({ column, value }); return query; },
    order(column, options) { state.order = { column, options }; return query; },
    then(onFulfilled, onRejected) {
      return Promise.resolve(resolve()).then(onFulfilled, onRejected);
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
    if (table === "projects") return createProjectQuery();
    if (table === "project_memory_topics") return createTopicsQuery();
    throw new Error(`unexpected table: ${table}`);
  },
};

const originalLoad = Module._load;
Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "@/lib/supabase/route-handler") {
    return { createRouteHandlerSupabaseClient: () => supabase };
  }
  if (request === "@/lib/lore/openai") {
    return {
      async chatCompleteMini(...args) {
        llmCalls.push(args);
        return llmContent;
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
  "../app/api/projects/[projectId]/memory/consolidate/preview/route.ts",
));

const normalTopics = [
  {
    id: "topic-a",
    topic_key: "overview",
    revision: 3,
    updated_at: "2026-09-10T00:00:00.000Z",
    content_md: "Old overview",
  },
  {
    id: "topic-b",
    topic_key: "current-work",
    revision: 2,
    updated_at: "2026-09-11T00:00:00.000Z",
    content_md: "Current work",
  },
];

function resetMocks() {
  currentUser = { id: USER_ID };
  projectResult = { data: { id: PROJECT_ID }, error: null };
  topicsResult = { data: normalTopics, error: null };
  ignoreNeq = false;
  queryCalls = [];
  llmCalls = [];
  llmContent = JSON.stringify({
    topics: [
      { topic_id: "topic-a", needs_update: true, new_content_md: "New overview", reason: "remove duplication" },
      { topic_id: "topic-b", needs_update: false },
    ],
  });
}

function invoke({ apiKey = "openai-key" } = {}) {
  const headers = apiKey === null ? {} : { "x-openai-api-key": apiKey };
  const request = new NextRequest(
    `https://www.kabehub.com/api/projects/${PROJECT_ID}/memory/consolidate/preview`,
    { method: "POST", headers },
  );
  return route.POST(request, { params: Promise.resolve({ projectId: PROJECT_ID }) });
}

async function withoutConsoleError(action) {
  const originalError = console.error;
  console.error = () => {};
  try {
    return await action();
  } finally {
    console.error = originalError;
  }
}

const pendingTests = [];
function test(name, fn) {
  pendingTests.push({ name, fn });
}

test("requires the OpenAI BYOK header before database access", async () => {
  resetMocks();
  const response = await invoke({ apiKey: null });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "x-openai-api-key header required" });
  assert.equal(queryCalls.length, 0);
  assert.equal(llmCalls.length, 0);
});

test("runs normally when current_state does not exist and returns the fixed snapshot", async () => {
  resetMocks();
  const response = await invoke();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body.run_id, "string");
  assert.equal(body.model, "gpt-5.6-luna");
  assert.equal(body.prompt_version, 1);
  assert.deepEqual(body.considered_topics, [
    { topic_id: "topic-b", topic_key: "current-work", revision: 2 },
    { topic_id: "topic-a", topic_key: "overview", revision: 3 },
  ]);
  assert.deepEqual(body.topics, [{
    topic_id: "topic-a",
    topic_key: "overview",
    revision: 3,
    updated_at: "2026-09-10T00:00:00.000Z",
    old_content_md: "Old overview",
    new_content_md: "New overview",
    reason: "remove duplication",
  }]);
  const topicQuery = queryCalls.find((call) => call.table === "project_memory_topics");
  assert.deepEqual(topicQuery.state.neq, [{ column: "topic_key", value: "current_state" }]);
  assert.equal(llmCalls.length, 1);
  assert.equal(llmCalls[0][0], "openai-key");
  assert.deepEqual(llmCalls[0][3], { jsonMode: true, maxCompletionTokens: 8192 });
  const sentSnapshot = JSON.parse(llmCalls[0][2]);
  assert.deepEqual(Object.keys(sentSnapshot.topics[0]), [
    "topic_id", "topic_key", "revision", "updated_at", "content_md",
  ]);
});

test("excludes an existing current_state in the database query without requiring it", async () => {
  resetMocks();
  topicsResult = {
    data: [{
      id: "state-id",
      topic_key: "current_state",
      revision: 1,
      updated_at: "2026-09-12T00:00:00.000Z",
      content_md: "State",
    }],
    error: null,
  };
  const response = await invoke();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.considered_topics, []);
  assert.deepEqual(body.topics, []);
  assert.equal(llmCalls.length, 0);
});

test("Route validation rejects current_state if the query boundary is violated", async () => {
  resetMocks();
  topicsResult = {
    data: [{
      id: "state-id",
      topic_key: "current_state",
      revision: 1,
      updated_at: "2026-09-12T00:00:00.000Z",
      content_md: "State",
    }],
    error: null,
  };
  ignoreNeq = true;
  const response = await invoke();
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Invalid Project Memory snapshot" });
  assert.equal(llmCalls.length, 0);
});

test("fail-closes a model response whose topic IDs do not exactly match the snapshot", async () => {
  resetMocks();
  llmContent = JSON.stringify({ topics: [{ topic_id: "topic-a", needs_update: false }] });
  const response = await withoutConsoleError(invoke);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Project Memoryの整理案を生成できませんでした" });
});

test("rejects oversized snapshots without calling the model", async () => {
  resetMocks();
  topicsResult = {
    data: [{ ...normalTopics[0], content_md: "x".repeat(20_000) }],
    error: null,
  };
  const response = await invoke();
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "Project Memoryが大きすぎるため一括整理できません" });
  assert.equal(llmCalls.length, 0);
});

test("fail-closes a model proposal that empties a non-empty topic", async () => {
  resetMocks();
  llmContent = JSON.stringify({
    topics: [
      { topic_id: "topic-a", needs_update: true, new_content_md: "" },
      { topic_id: "topic-b", needs_update: false },
    ],
  });
  const response = await withoutConsoleError(invoke);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Project Memoryの整理案を生成できませんでした" });
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
  console.log(`passed ${pendingTests.length} project memory consolidate preview route tests`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
