const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;
const PROJECT_ID = "project-1";
const TOPIC_ID = "topic-1";
const INSTRUCTION = "instruction-sentinel";
const BODY = "body-sentinel";
const KEY = "key-sentinel";
let user, projectResult, topicResult, llmResult, llmError, calls, logs, writes;

const failWrite = (name) => () => { writes++; throw new Error(`unexpected ${name}`); };
function query(table) {
  const state = { table, select: null, eq: [], maybeSingle: false };
  calls.push(state);
  const result = table === "projects" ? () => projectResult : () => topicResult;
  return {
    select(value) { state.select = value; return this; },
    eq(column, value) { state.eq.push([column, value]); return this; },
    maybeSingle() { state.maybeSingle = true; return Promise.resolve(result()); },
    insert: failWrite("insert"), update: failWrite("update"),
    upsert: failWrite("upsert"), delete: failWrite("delete"),
  };
}
const supabase = {
  auth: { async getUser() { return { data: { user }, error: null }; } },
  from(table) {
    if (table !== "projects" && table !== "project_memory_topics") throw new Error(`unexpected table: ${table}`);
    return query(table);
  },
  rpc: failWrite("rpc"), insert: failWrite("insert"), update: failWrite("update"),
  upsert: failWrite("upsert"), delete: failWrite("delete"),
};

const logger = {
  dbOperationFailed(value) { logs.push(["dbOperationFailed", value]); },
  externalApiFailed(value) { logs.push(["externalApiFailed", value]); },
};
const originalLoad = Module._load;
Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "@/lib/supabase/route-handler") return { createRouteHandlerSupabaseClient: () => supabase };
  if (request === "@/lib/lore/openai") return {
    async chatCompleteMini(...args) {
      calls.push({ llm: args });
      if (llmError) throw llmError;
      return llmResult;
    },
  };
  if (request === "@/lib/logger") return logger;
  return originalLoad.call(this, request, parent, isMain);
};
installTsLoader();
installAliasResolver();
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
const { NextRequest } = require("next/server");
const { POST } = require(path.join(__dirname,
  "../app/api/projects/[projectId]/memory/topics/[topicId]/edit-preview/route.ts"));
const { MAX_INSTRUCTION_CHARS, MAX_INSTRUCTION_EDIT_INPUT_CHARS } = require(path.join(__dirname,
  "../lib/project-memory/instruction-edit.ts"));

function reset() {
  user = { id: "user-1" };
  projectResult = { data: { id: PROJECT_ID }, error: null };
  topicResult = { data: { id: TOPIC_ID, topic_key: "overview", revision: 3,
    updated_at: "2026-09-10T00:00:00.000Z", content_md: BODY }, error: null };
  llmResult = JSON.stringify({ applicable: true, new_content_md: "replacement-sentinel", summary: "updated" });
  llmError = null; calls = []; logs = []; writes = 0;
}
function invoke({ key = KEY, body = { instruction: INSTRUCTION }, raw } = {}) {
  const headers = key === null ? {} : { "x-openai-api-key": key };
  const req = new NextRequest(`https://www.kabehub.com/api/projects/${PROJECT_ID}/memory/topics/${TOPIC_ID}/edit-preview`, {
    method: "POST", headers, body: raw === undefined ? JSON.stringify(body) : raw,
  });
  return POST(req, { params: Promise.resolve({ projectId: PROJECT_ID, topicId: TOPIC_ID }) });
}
function checkLogs() {
  const serialized = JSON.stringify(logs);
  for (const secret of [INSTRUCTION, BODY, KEY]) assert.equal(serialized.includes(secret), false);
  assert.equal(writes, 0);
}
function checkEnvelope(value, kind) {
  assert.equal(value.result, kind);
  assert.match(value.run_id, /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i);
  assert.equal(value.model, "gpt-5.6-luna");
  assert.equal(value.prompt_version, 1);
  assert.equal(value.topic_id, TOPIC_ID);
  assert.equal(value.topic_key, topicResult.data.topic_key);
  assert.equal(value.revision, 3);
  assert.equal(value.updated_at, topicResult.data.updated_at);
}
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test("rejects missing key before auth", async () => {
  const response = await invoke({ key: null });
  assert.equal(response.status, 400); assert.equal(calls.length, 0);
});
test("returns auth response", async () => {
  user = null; const response = await invoke();
  assert.equal(response.status, 401); assert.equal(calls.length, 0);
});
test("rejects malformed instructions and body before project lookup", async () => {
  for (const arg of [{ raw: "{" }, { body: {} }, { body: { instruction: "" } },
    { body: { instruction: "   " } }, { body: { instruction: 3 } },
    { body: { instruction: "x".repeat(MAX_INSTRUCTION_CHARS + 1) } }]) {
    calls = []; const response = await invoke(arg);
    assert.equal(response.status, 400); assert.equal(calls.length, 0);
  }
});
test("returns project ownership errors", async () => {
  projectResult = { data: null, error: null };
  assert.equal((await invoke()).status, 404);
  assert.equal(calls.some((call) => call.table === "project_memory_topics"), false);
});
test("returns 404 for missing topic", async () => {
  topicResult = { data: null, error: null };
  assert.equal((await invoke()).status, 404);
});
test("logs only approved fields on database failure", async () => {
  topicResult = { data: null, error: { code: "DB_CODE", message: BODY } };
  assert.equal((await invoke()).status, 500);
  assert.deepEqual(logs, [["dbOperationFailed", { route: "projects-memory-topic-edit-preview",
    operation: "load_topic", table: "project_memory_topics", errorCode: "DB_CODE" }]]);
  checkLogs();
});
test("rejects invalid snapshot", async () => {
  topicResult.data.revision = 0;
  assert.equal((await invoke()).status, 500);
  assert.equal(calls.some((call) => call.llm), false);
});
test("checks serialized whole-input size", async () => {
  topicResult.data.content_md = "x".repeat(MAX_INSTRUCTION_EDIT_INPUT_CHARS - 1);
  assert.equal((await invoke()).status, 413);
  assert.equal(calls.some((call) => call.llm), false);
});
test("accepts the exact serialized input limit and rejects one character more", async () => {
  const { buildInstructionEditInput } = require(path.join(__dirname,
    "../lib/project-memory/instruction-edit.ts"));
  const snapshot = { topic_id: TOPIC_ID, topic_key: topicResult.data.topic_key, revision: 3,
    updated_at: topicResult.data.updated_at, content_md: "" };
  const overhead = buildInstructionEditInput(INSTRUCTION, snapshot).length;
  topicResult.data.content_md = "x".repeat(MAX_INSTRUCTION_EDIT_INPUT_CHARS - overhead);
  assert.equal(buildInstructionEditInput(INSTRUCTION, { ...snapshot, content_md: topicResult.data.content_md }).length,
    MAX_INSTRUCTION_EDIT_INPUT_CHARS);
  assert.equal((await invoke()).status, 200);
  topicResult.data.content_md += "x";
  assert.equal((await invoke()).status, 413);
});
test("fails closed for malformed, empty, and upstream model responses", async () => {
  for (const setup of [() => { llmResult = "{"; }, () => { llmResult = null; },
    () => { llmError = new Error(BODY); }]) {
    reset(); setup(); const response = await invoke();
    assert.equal(response.status, 502);
    assert.deepEqual(logs, [["externalApiFailed", { service: "openai",
      errorCode: llmResult === "{" ? "UPSTREAM_RESPONSE_INVALID" : "UPSTREAM_REQUEST_FAILED" }]]);
    checkLogs();
  }
});
test("returns proposal with complete envelope and read-only query", async () => {
  const response = await invoke(); assert.equal(response.status, 200);
  const value = await response.json(); checkEnvelope(value, "proposal");
  assert.equal(value.old_content_md, BODY);
  assert.equal(value.new_content_md, "replacement-sentinel");
  assert.equal(value.summary, "updated");
  const queryCall = calls.find((call) => call.table === "project_memory_topics");
  assert.equal(queryCall.select, "id, topic_key, revision, updated_at, content_md");
  assert.deepEqual(queryCall.eq, [["id", TOPIC_ID], ["project_id", PROJECT_ID]]);
  assert.equal(queryCall.maybeSingle, true);
  const llm = calls.find((call) => call.llm).llm;
  assert.equal(llm[0], KEY);
  assert.deepEqual(llm[3], { jsonMode: true, maxCompletionTokens: 65_536 });
  checkLogs(); assert.deepEqual(logs, []);
});
test("returns no_change with common envelope only", async () => {
  llmResult = JSON.stringify({ applicable: true, new_content_md: BODY, summary: "same" });
  const value = await (await invoke()).json(); checkEnvelope(value, "no_change");
  assert.equal(Object.hasOwn(value, "old_content_md"), false);
  assert.equal(Object.hasOwn(value, "summary"), false);
});
test("returns not_applicable with common envelope and reason", async () => {
  llmResult = JSON.stringify({ applicable: false, reason: "unrelated" });
  const value = await (await invoke()).json(); checkEnvelope(value, "not_applicable");
  assert.equal(value.reason, "unrelated");
});
test("allows current_state", async () => {
  topicResult.data.topic_key = "current_state";
  const value = await (await invoke()).json(); checkEnvelope(value, "proposal");
});

(async () => {
  for (const [name, fn] of tests) {
    reset(); await fn(); checkLogs(); console.log(`ok - ${name}`);
  }
  console.log(`passed ${tests.length} project memory topic edit preview route tests`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
