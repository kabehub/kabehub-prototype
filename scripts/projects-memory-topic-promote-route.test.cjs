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
let existingResult;
let editedResult;
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
    is(column, value) { state.filters.push({ column, value }); return query; },
    order(column, options) { state.order = { column, options }; return query; },
    then(resolve, reject) { return Promise.resolve(editedResult).then(resolve, reject); },
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
    if (table === "lore_embeddings") return createQuery(table, existingResult);
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
  existingResult = options.existingResult ?? { data: null, error: null };
  editedResult = options.editedResult ?? { data: [], error: null };
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
        p_acknowledged_edited_lore_ids: [],
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

const OTHER_LORE_ID = "66666666-6666-4666-8666-666666666666";
const editedRows = [{ id: LORE_ID, chunk_text: "\n Edited title\nbody" }, { id: OTHER_LORE_ID, chunk_text: "Other" }];
for (const rows of [editedRows.slice(0, 1), editedRows]) {
  test(`unacknowledged ${rows.length} edited active rows stop before embedding`, async () => {
    resetMocks({ editedResult: { data: rows, error: null } });
    const response = await invokePost();
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.code, "edited_lore_needs_confirmation");
    assert.deepEqual(body.edited_lores, rows.map((row, i) => ({ id: row.id, title: i ? "Other" : "Edited title" })));
    assert.deepEqual(embeddingCalls, []);
    assert.deepEqual(rpcCalls, []);
    const lookup = queryCalls.at(-1);
    assert.deepEqual(lookup.state.filters, [
      { column: "user_id", value: USER_ID }, { column: "source_type", value: "project_memory_promotion" },
      { column: "metadata->>source_topic_id", value: TOPIC_ID }, { column: "is_archived", value: false },
      { column: "superseded_by", value: null }, { column: "extraction_version", value: "user_edited" },
    ]);
  });
}
test("acknowledged IDs are normalized and deduplicated and permit promotion", async () => {
  resetMocks({ editedResult: { data: editedRows, error: null } });
  const response = await invokePost({ body: { expected_revision: 3, acknowledged_edited_lore_ids: [LORE_ID, OTHER_LORE_ID, LORE_ID] } });
  assert.equal(response.status, 200);
  assert.deepEqual(rpcCalls[0].args.p_acknowledged_edited_lore_ids, [LORE_ID, OTHER_LORE_ID]);
  assert.equal(embeddingCalls.length, 1);
});
test("partial acknowledgement still requires confirmation of the complete edited list", async () => {
  resetMocks({ editedResult: { data: editedRows, error: null } });
  const response = await invokePost({ body: { expected_revision: 3, acknowledged_edited_lore_ids: [LORE_ID] } });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).edited_lores.length, 2);
  assert.equal(embeddingCalls.length, 0);
});
for (const [label, is_archived, superseded_by] of [
  ["active", false, null],
  ["superseded", true, OTHER_LORE_ID],
  ["unarchived but superseded", false, OTHER_LORE_ID],
]) {
  test(`existing same revision ${label} retains the legacy embedding/promotion path`, async () => {
    resetMocks({ existingResult: { data: { id: LORE_ID, is_archived, superseded_by }, error: null },
      editedResult: { data: editedRows, error: null },
      rpcResult: { data: { lore_id: LORE_ID, created: false }, error: null } });
    const response = await invokePost();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { lore_id: LORE_ID, created: false });
    assert.equal(queryCalls.filter((row) => row.table === "lore_embeddings").length, 1);
    assert.equal(queryCalls.at(-1).state.select, "id, is_archived, superseded_by");
    assert.deepEqual(embeddingCalls, [{ key: "openai-test-key", input: defaultTopic.content_md }]);
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].name, "promote_project_memory_topic_to_lore");
    assert.deepEqual(logCalls, []);
  });
  test(`existing same revision ${label} still requires an API key`, async () => {
    resetMocks({ existingResult: { data: { id: LORE_ID, is_archived, superseded_by }, error: null } });
    const response = await invokePost({ openaiKey: null });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "x-openai-api-key header required" });
    assert.deepEqual(embeddingCalls, []);
    assert.deepEqual(rpcCalls, []);
  });
}

const archivedPromotion = { id: LORE_ID, is_archived: true, superseded_by: null };
for (const restored of [true, false]) {
  for (const openaiKey of ["openai-test-key", null]) {
    test(`archived same revision restores without embedding (restored=${restored}, key=${openaiKey !== null})`, async () => {
      resetMocks({ existingResult: { data: { ...archivedPromotion }, error: null },
        editedResult: { data: editedRows, error: null },
        rpcResult: { data: { lore_id: OTHER_LORE_ID, restored }, error: null } });
      const response = await invokePost({ openaiKey });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { lore_id: OTHER_LORE_ID, created: false, restored });
      assert.deepEqual(embeddingCalls, []);
      assert.deepEqual(rpcCalls, [{ name: "restore_archived_project_memory_promotion", args: {
        p_user_id: USER_ID, p_topic_id: TOPIC_ID, p_expected_revision: 3,
      } }]);
      const lookups = queryCalls.filter((row) => row.table === "lore_embeddings");
      assert.equal(lookups.length, 1, "restoration skips edited replacement confirmation");
      assert.equal(lookups[0].state.select, "id, is_archived, superseded_by");
      assert.deepEqual(lookups[0].state.filters, [
        { column: "user_id", value: USER_ID },
        { column: "source_type", value: "project_memory_promotion" },
        { column: "metadata->>source_topic_id", value: TOPIC_ID },
        { column: "metadata->>source_revision", value: "3" },
      ]);
      assert.deepEqual(logCalls, []);
    });
  }
}

for (const [code, message, status, payload] of [
  ["P0001", "revision conflict", 409, { error: "Revision conflict" }],
  ...["restore_conflict_active_exists", "restore_not_allowed_superseded", "promotion_not_found"].map((message) =>
    ["P0001", message, 409, {
      error: "昇格Loreを復元できません。一覧を更新して状態を確認してください。",
      code: "promotion_restore_unavailable",
    }]),
  ["P0001", "topic not found", 404, { error: "Topic not found" }],
  ["P0001", "expected_revision must be a positive integer", 400, { error: "expected_revision must be a positive integer" }],
  ["42501", "Unauthorized", 403, { error: "Forbidden" }],
  ["42501", "promotion_not_found", 403, { error: "Forbidden" }],
  ["XX000", "promotion_not_found", 500, { error: "Failed to process request" }],
  ["XX000", "private database detail", 500, { error: "Failed to process request" }],
]) {
  test(`restore RPC error ${code}/${message} maps to ${status} and is logged`, async () => {
    resetMocks({ existingResult: { data: { ...archivedPromotion }, error: null },
      rpcResult: { data: null, error: { code, message } } });
    const response = await invokePost({ openaiKey: null });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), payload);
    assert.deepEqual(embeddingCalls, []);
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].name, "restore_archived_project_memory_promotion");
    assert.deepEqual(logCalls, [{
      route: "projects-memory-topics-promote", operation: "restore_archived_project_memory_promotion",
      table: "lore_embeddings", errorCode: code,
    }]);
  });
}
test("new edit during embedding is rejected by RPC and returns refreshed confirmation", async () => {
  resetMocks({ editedResult: { data: editedRows.slice(0, 1), error: null },
    rpcResult: { data: null, error: { code: "P0001", message: "edited_lore_needs_confirmation" } } });
  embeddingImpl = async () => { embeddingCalls.push({}); editedResult = { data: editedRows, error: null }; return [0.1]; };
  const response = await invokePost({ body: { expected_revision: 3, acknowledged_edited_lore_ids: [LORE_ID] } });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).edited_lores.length, 2);
  assert.equal(embeddingCalls.length, 1);
  assert.equal(rpcCalls.length, 1);
});
for (const value of [null, "id", ["bad"], [1], Array(101).fill(LORE_ID)]) {
  test(`invalid acknowledgements ${JSON.stringify(value).slice(0, 40)}`, async () => {
    resetMocks();
    const response = await invokePost({ body: { expected_revision: 3, acknowledged_edited_lore_ids: value } });
    assert.equal(response.status, 400);
    assert.equal(queryCalls.length, 0);
  });
}
for (const stage of ["existing", "edited", "refresh"]) {
  test(`promotion lookup failure ${stage} fails closed`, async () => {
    resetMocks(stage === "existing" ? { existingResult: { data: null, error: { message: "private" } } }
      : stage === "edited" ? { editedResult: { data: null, error: { message: "private" } } }
      : { rpcResult: { data: null, error: { code: "P0001", message: "edited_lore_needs_confirmation" } } });
    if (stage === "refresh") embeddingImpl = async () => { editedResult = { data: null, error: { message: "private" } }; return [0.1]; };
    const response = await invokePost();
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Failed to load promotion" });
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
  console.log(`passed ${tests.length} project memory topic promotion route tests`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
