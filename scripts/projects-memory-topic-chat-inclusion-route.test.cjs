const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;

const PROJECT_ID = "project-1";
const TOPIC_ID = "topic-1";
const USER_ID = "user-1";

const defaultTopicRow = {
  id: TOPIC_ID,
  project_id: PROJECT_ID,
  topic_key: "overview",
  content_md: "Initial content",
  revision: 1,
  created_at: "2026-09-09T00:00:00.000Z",
  updated_at: "2026-09-09T00:00:01.000Z",
};

let currentUser = null;
let projectResult = { data: null, error: null };
let topicResult = { data: null, error: null };
let rpcResult = { data: null, error: null };
let fromCalls = [];
let queryCalls = [];
let rpcCalls = [];

function projectColumns(row, columns) {
  if (!columns) return row;
  const names = columns.split(",").map((name) => name.trim());
  return Object.fromEntries(names.map((name) => [name, row[name]]));
}

function createQuery(table, result) {
  const state = { select: null, filters: [] };
  queryCalls.push({ table, state });

  function resolveSingle() {
    if (result.error || !result.data) return result;
    for (const { column, value } of state.filters) {
      if (column in result.data && result.data[column] !== value) {
        return { data: null, error: null };
      }
    }
    return { data: projectColumns(result.data, state.select), error: null };
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
    maybeSingle() {
      return Promise.resolve(resolveSingle());
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
    if (table === "project_memory_topics") throw new Error("chat inclusion must not preselect topics");
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
  "[topicId]",
  "chat-inclusion",
  "route.ts",
));


const props = { params: Promise.resolve({ projectId: PROJECT_ID, topicId: TOPIC_ID }) };
async function invoke(body = { include: true }, rawBody) {
  const request = new NextRequest(`https://www.kabehub.com/api/projects/${PROJECT_ID}/memory/topics/${TOPIC_ID}/chat-inclusion`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: rawBody ?? JSON.stringify(body),
  });
  return route.PATCH(request, props);
}
function reset() {
  currentUser = { id: USER_ID };
  projectResult = { data: { id: PROJECT_ID }, error: null };
  rpcResult = { data: { is_included: true, included_chars: 123 }, error: null };
  fromCalls = []; queryCalls = []; rpcCalls = [];
}
async function check(label, action) { reset(); await action(); console.log(`ok - ${label}`); }
(async () => {
  assert.equal(route.dynamic, "force-dynamic");
  await check("unauthenticated", async () => {
    currentUser = null;
    const response = await invoke();
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
    assert.deepEqual(fromCalls, []); assert.deepEqual(rpcCalls, []);
  });
  await check("foreign project", async () => {
    projectResult = { data: null, error: null };
    const response = await invoke();
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Project not found" });
    assert.deepEqual(rpcCalls, []);
    assert.deepEqual(queryCalls[0].state.filters, [{ column: "id", value: PROJECT_ID }, { column: "user_id", value: USER_ID }]);
  });
  await check("malformed JSON", async () => {
    const response = await invoke({}, "{");
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Invalid request body" });
    assert.deepEqual(rpcCalls, []);
  });
  for (const body of [null, [], "true", 1, {}, { include: null }, { include: 1 }, { include: "true" }]) {
    await check("boolean required " + JSON.stringify(body), async () => {
      const response = await invoke(body);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "include must be a boolean" });
      assert.deepEqual(rpcCalls, []);
    });
  }
  for (const include of [true, false]) await check("success and RPC arguments " + include, async () => {
    rpcResult.data.is_included = include;
    const response = await invoke({ include });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { topic: { id: TOPIC_ID, include_in_chat: include }, included_chars: 123 });
    assert.deepEqual(rpcCalls, [{ name: "set_project_memory_topic_chat_inclusion", args: {
      p_user_id: USER_ID, p_project_id: PROJECT_ID, p_topic_id: TOPIC_ID, p_include: include,
    } }]);
    assert.deepEqual(fromCalls, ["projects"]);
  });
  for (const [message, code, status, payload] of [
    ["topic not found", "P0001", 404, { error: "Topic not found" }],
    ["topic is empty", "P0001", 400, { error: "Topic is empty" }],
    ["include_in_chat is required", "P0001", 400, { error: "include_in_chat is required" }],
    ["chat inclusion limit exceeded", "P0001", 409, { error: "Chat inclusion limit exceeded", code: "chat_inclusion_limit_exceeded", max_chars: 8000 }],
    ["chat inclusion limit exceeded", "42501", 403, { error: "Forbidden" }],
    ["sensitive raw DB detail", "XX000", 500, { error: "Failed to process request" }],
  ]) await check("RPC mapping " + code + ": " + message, async () => {
    rpcResult = { data: null, error: { code, message } };
    const logs = []; const original = console.error;
    console.error = (...args) => logs.push(args);
    try {
      const response = await invoke();
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), payload);
      assert.deepEqual(logs, [["[db-operation-failed]", {
        route: "projects-memory-topics", operation: "set_project_memory_topic_chat_inclusion", table: "project_memory_topics", errorCode: code,
      }]]);
      assert.equal(JSON.stringify(logs).includes(message), false);
    } finally { console.error = original; }
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
