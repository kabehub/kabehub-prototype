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
  topicResult = options.topicResult ?? {
    data: { ...defaultTopicRow },
    error: null,
  };
  rpcResult = options.rpcResult ?? {
    data: {
      revision: 2,
      content_md: "Updated content",
      updated_at: "2026-09-09T00:00:02.000Z",
    },
    error: null,
  };
  fromCalls = [];
  queryCalls = [];
  rpcCalls = [];
}

function routeProps() {
  return {
    params: Promise.resolve({ projectId: PROJECT_ID, topicId: TOPIC_ID }),
  };
}

function invokeGet() {
  const request = new NextRequest(
    `https://www.kabehub.com/api/projects/${PROJECT_ID}/memory/topics/${TOPIC_ID}`,
  );
  return route.GET(request, routeProps());
}

function invokePatch(options = {}) {
  const rawBody =
    options.rawBody !== undefined ? options.rawBody : JSON.stringify(options.body);
  const request = new NextRequest(
    `https://www.kabehub.com/api/projects/${PROJECT_ID}/memory/topics/${TOPIC_ID}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: rawBody,
    },
  );
  return route.PATCH(request, routeProps());
}

function validFullBody(overrides = {}) {
  return {
    expected_revision: 1,
    edit_kind: "full",
    new_content_md: "Updated content",
    ...overrides,
  };
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
});

test("GET returns Topic not found when the topic does not exist", async () => {
  resetMocks({ topicResult: { data: null, error: null } });

  const response = await invokeGet();

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Topic not found" });
  assert.deepEqual(fromCalls, ["projects", "project_memory_topics"]);
});

test("GET returns Topic not found when the topic belongs to another project", async () => {
  resetMocks({
    topicResult: {
      data: { ...defaultTopicRow, project_id: "project-2" },
      error: null,
    },
  });

  const response = await invokeGet();

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Topic not found" });
  assert.deepEqual(queryCalls[1].state.filters, [
    { column: "id", value: TOPIC_ID },
    { column: "project_id", value: PROJECT_ID },
  ]);
});

test("GET returns 500 when the topic lookup fails", async () => {
  resetMocks({
    topicResult: {
      data: null,
      error: { code: "57014", message: "raw topic failure" },
    },
  });

  const response = await invokeGet();

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.deepEqual(body, { error: "Failed to load topic" });
  assert.equal(JSON.stringify(body).includes("raw topic failure"), false);
});

test("GET returns the single-topic response contract", async () => {
  resetMocks();

  const response = await invokeGet();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    topic: {
      id: TOPIC_ID,
      topic_key: "overview",
      content_md: "Initial content",
      revision: 1,
      created_at: "2026-09-09T00:00:00.000Z",
      updated_at: "2026-09-09T00:00:01.000Z",
    },
  });
});

test("unauthenticated PATCH is rejected before database or RPC access", async () => {
  resetMocks({ user: null });

  const response = await invokePatch({ body: validFullBody() });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.deepEqual(fromCalls, []);
  assert.deepEqual(rpcCalls, []);
});

test("PATCH rejects malformed JSON before database or RPC access", async () => {
  resetMocks();

  const response = await invokePatch({ rawBody: "{" });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid request body" });
  assert.deepEqual(fromCalls, []);
  assert.deepEqual(rpcCalls, []);
});

for (const [label, expectedRevision] of [
  ["fractional", 1.5],
  ["zero", 0],
  ["null", null],
  ["string", "1"],
  ["missing", undefined],
]) {
  test(`PATCH rejects a ${label} expected_revision before database access`, async () => {
    resetMocks();
    const body = validFullBody();
    if (expectedRevision === undefined) delete body.expected_revision;
    else body.expected_revision = expectedRevision;

    const response = await invokePatch({ body });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "expected_revision must be a positive integer",
    });
    assert.deepEqual(fromCalls, []);
    assert.deepEqual(rpcCalls, []);
  });
}

test("PATCH rejects an invalid edit_kind before database access", async () => {
  resetMocks();

  const response = await invokePatch({
    body: validFullBody({ edit_kind: "replace" }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "edit_kind must be full or partial",
  });
  assert.deepEqual(fromCalls, []);
  assert.deepEqual(rpcCalls, []);
});

test("PATCH full edit requires new_content_md before database access", async () => {
  resetMocks();
  const body = validFullBody();
  delete body.new_content_md;

  const response = await invokePatch({ body });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "new_content_md is required for full edit",
  });
  assert.deepEqual(fromCalls, []);
  assert.deepEqual(rpcCalls, []);
});

for (const [label, body] of [
  ["missing old_text", { expected_revision: 1, edit_kind: "partial", new_text: "new" }],
  ["empty old_text", { expected_revision: 1, edit_kind: "partial", old_text: "", new_text: "new" }],
  ["missing new_text", { expected_revision: 1, edit_kind: "partial", old_text: "old" }],
]) {
  test(`PATCH partial edit rejects ${label} before database access`, async () => {
    resetMocks();

    const response = await invokePatch({ body });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "old_text and new_text are required for partial edit",
    });
    assert.deepEqual(fromCalls, []);
    assert.deepEqual(rpcCalls, []);
  });
}

test("PATCH rejects non-array source_refs before database access", async () => {
  resetMocks();

  const response = await invokePatch({
    body: validFullBody({ source_refs: "not-an-array" }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "source_refs must be a jsonb array",
  });
  assert.deepEqual(fromCalls, []);
  assert.deepEqual(rpcCalls, []);
});

test("PATCH returns Project not found without calling the RPC", async () => {
  resetMocks({ projectResult: { data: null, error: null } });

  const response = await invokePatch({ body: validFullBody() });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Project not found" });
  assert.deepEqual(fromCalls, ["projects"]);
  assert.deepEqual(rpcCalls, []);
});

test("PATCH returns Topic not found for a different project without calling the RPC", async () => {
  resetMocks({
    topicResult: {
      data: { ...defaultTopicRow, project_id: "project-2" },
      error: null,
    },
  });

  const response = await invokePatch({ body: validFullBody() });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Topic not found" });
  assert.deepEqual(fromCalls, ["projects", "project_memory_topics"]);
  assert.deepEqual(rpcCalls, []);
});

test("PATCH full edit calls the RPC and returns the normalized response", async () => {
  resetMocks();

  const response = await invokePatch({ body: validFullBody() });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    topic: {
      id: TOPIC_ID,
      revision: 2,
      content_md: "Updated content",
      updated_at: "2026-09-09T00:00:02.000Z",
    },
  });
  assert.deepEqual(rpcCalls, [
    {
      name: "update_project_memory_topic",
      args: {
        p_user_id: USER_ID,
        p_topic_id: TOPIC_ID,
        p_expected_revision: 1,
        p_edit_kind: "full",
        p_new_content_md: "Updated content",
        p_old_text: null,
        p_new_text: null,
        p_source_refs: [],
      },
    },
  ]);
});

test("PATCH partial edit sends partial fields and explicit source_refs", async () => {
  resetMocks();
  const sourceRefs = [{ kind: "message", id: "message-1" }];

  const response = await invokePatch({
    body: {
      expected_revision: 1,
      edit_kind: "partial",
      old_text: "Initial",
      new_text: "Updated",
      source_refs: sourceRefs,
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(rpcCalls[0].args, {
    p_user_id: USER_ID,
    p_topic_id: TOPIC_ID,
    p_expected_revision: 1,
    p_edit_kind: "partial",
    p_new_content_md: null,
    p_old_text: "Initial",
    p_new_text: "Updated",
    p_source_refs: sourceRefs,
  });
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
  test(`PATCH maps the exact RPC message: ${message}`, async () => {
    resetMocks({
      rpcResult: { data: null, error: { code: "P0001", message } },
    });

    const { response, calls } = await captureConsoleError(() =>
      invokePatch({ body: validFullBody() }),
    );

    assert.equal(response.status, expectedStatus);
    assert.deepEqual(await response.json(), { error: expectedError });
    assert.deepEqual(calls, [
      [
        "[db-operation-failed]",
        {
          route: "projects-memory-topics",
          operation: "update_project_memory_topic",
          table: "project_memory_topics",
          errorCode: "P0001",
        },
      ],
    ]);
  });
}

test("PATCH prioritizes SQLSTATE 42501 over the RPC message", async () => {
  resetMocks({
    rpcResult: {
      data: null,
      error: { code: "42501", message: "revision conflict" },
    },
  });

  const { response } = await captureConsoleError(() =>
    invokePatch({ body: validFullBody() }),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Forbidden" });
});

test("PATCH fail-closes unknown RPC errors without exposing raw messages", async () => {
  const rawMessage = "unknown invariant with sensitive database detail";
  resetMocks({
    rpcResult: {
      data: null,
      error: { code: "XX000", message: rawMessage },
    },
  });

  const { response, calls } = await captureConsoleError(() =>
    invokePatch({ body: validFullBody() }),
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
        operation: "update_project_memory_topic",
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
  console.log(`passed ${pendingTests.length} project memory topic-id route tests`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
