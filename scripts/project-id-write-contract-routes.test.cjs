const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;

const USER_ID = "user-1";
const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

let projectResult;
let threadResult;
let rpcResult;
let queryCalls;
let rpcCalls;
let embeddingCalls;
let externalFetchCalls;

function createQuery(table) {
  const state = {
    table,
    operation: null,
    payload: null,
    options: null,
    select: null,
    filters: [],
  };
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
    upsert(payload, options) {
      state.operation = "upsert";
      state.payload = payload;
      state.options = options ?? null;
      return query;
    },
    insert(payload) {
      state.operation = "insert";
      state.payload = payload;
      return query;
    },
    delete() {
      state.operation = "delete";
      return query;
    },
    maybeSingle() {
      if (table === "projects") return Promise.resolve(projectResult);
      if (table === "threads") return Promise.resolve(threadResult);
      throw new Error(`unexpected maybeSingle table: ${table}`);
    },
    single() {
      if (table === "threads" && state.operation === "upsert") {
        return Promise.resolve({
          data: {
            id: THREAD_ID,
            user_id: USER_ID,
            folder_name: "legacy value",
            ...state.payload,
          },
          error: null,
        });
      }
      throw new Error(`unexpected single call: ${table} ${state.operation}`);
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
    },
  };
  return query;
}

const supabase = {
  from(table) {
    return createQuery(table);
  },
  rpc(name, args) {
    rpcCalls.push({ name, args });
    return Promise.resolve(rpcResult);
  },
};

const originalLoad = Module._load;
Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "@/lib/supabase/route-auth") {
    return {
      async requireRouteUser() {
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
    class AiProviderRequestError extends Error {}
    return {
      AiProviderRequestError,
      async createEmbedding(key, text) {
        embeddingCalls.push({ key, text });
        return [1, 0, 0];
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

installTsLoader();
installAliasResolver();

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

const { NextRequest } = require("next/server");
const threadRoute = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "threads",
  "[id]",
  "route.ts",
));
const projectSettingsRoute = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "project-settings",
  "route.ts",
));
const extractSettingsRoute = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "extract-settings",
  "route.ts",
));
const loreEmbedRoute = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "lore",
  "embed",
  "route.ts",
));

function resetMocks(options = {}) {
  projectResult = options.projectResult ?? { data: { id: PROJECT_ID }, error: null };
  threadResult = options.threadResult ?? {
    data: { id: THREAD_ID, share_token: null },
    error: null,
  };
  rpcResult = options.rpcResult ?? { data: PROJECT_ID, error: null };
  queryCalls = [];
  rpcCalls = [];
  embeddingCalls = [];
  externalFetchCalls = 0;
}

function invokeThreadPatch(body) {
  return threadRoute.PATCH(
    new NextRequest(`https://www.kabehub.com/api/threads/${THREAD_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: THREAD_ID }) },
  );
}

function invokeProjectSettingsPost(body) {
  return projectSettingsRoute.POST(new NextRequest(
    "https://www.kabehub.com/api/project-settings",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  ));
}

function invokeExtractSettings(body, includeApiKey = true) {
  return extractSettingsRoute.POST(new NextRequest(
    "https://www.kabehub.com/api/extract-settings",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(includeApiKey ? { "x-anthropic-api-key": "anthropic-key" } : {}),
      },
      body: JSON.stringify(body),
    },
  ));
}

function invokeLoreEmbed(body) {
  return loreEmbedRoute.POST(new NextRequest(
    "https://www.kabehub.com/api/lore/embed",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-openai-api-key": "openai-key",
      },
      body: JSON.stringify(body),
    },
  ));
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("threads PATCH sets an owned project_id without writing folder_name", async () => {
  resetMocks();
  const response = await invokeThreadPatch({ project_id: PROJECT_ID });

  assert.equal(response.status, 200);
  assert.equal(rpcCalls.length, 0);
  const projectQuery = queryCalls.find((call) => call.table === "projects");
  assert.deepEqual(projectQuery.filters, [
    { column: "id", value: PROJECT_ID },
    { column: "user_id", value: USER_ID },
  ]);
  const write = queryCalls.find((call) => call.table === "threads" && call.operation === "upsert");
  assert.equal(write.payload.project_id, PROJECT_ID);
  assert.equal("folder_name" in write.payload, false);
});

test("threads PATCH clears project_id without RPC or ownership lookup", async () => {
  resetMocks();
  const response = await invokeThreadPatch({ project_id: null });

  assert.equal(response.status, 200);
  assert.equal(rpcCalls.length, 0);
  assert.equal(queryCalls.some((call) => call.table === "projects"), false);
  const write = queryCalls.find((call) => call.table === "threads" && call.operation === "upsert");
  assert.equal(write.payload.project_id, null);
  assert.equal("folder_name" in write.payload, false);
});

test("threads PATCH rejects an unowned project_id", async () => {
  resetMocks({ projectResult: { data: null, error: null } });
  const response = await invokeThreadPatch({ project_id: PROJECT_ID });

  assert.equal(response.status, 404);
  assert.equal(queryCalls.some((call) => call.operation === "upsert"), false);
});

test("threads PATCH rejects project_id and folder_name together", async () => {
  resetMocks();
  const response = await invokeThreadPatch({ project_id: PROJECT_ID, folder_name: "legacy" });

  assert.equal(response.status, 400);
  assert.deepEqual(queryCalls, []);
  assert.deepEqual(rpcCalls, []);
});

test("threads PATCH rejects folder_name regardless of value before DB or RPC", async () => {
  for (const folder_name of ["legacy", null, "", 42, false, [], {}]) {
    for (const canonical of [{}, { project_id: PROJECT_ID }, { project_id: null }]) {
      resetMocks();
      const response = await invokeThreadPatch({ ...canonical, folder_name });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: "folder_name is no longer supported; use project_id",
      });
      assert.deepEqual(queryCalls, []);
      assert.deepEqual(rpcCalls, []);
    }
  }
});

test("threads PATCH with title only leaves both project keys untouched", async () => {
  resetMocks();
  const response = await invokeThreadPatch({ title: "Renamed" });

  assert.equal(response.status, 200);
  const write = queryCalls.find((call) => call.table === "threads" && call.operation === "upsert");
  assert.equal(write.payload.title, "Renamed");
  assert.equal("project_id" in write.payload, false);
  assert.equal("folder_name" in write.payload, false);
});

test("project-settings POST upserts an owned project by user_id,project_id", async () => {
  resetMocks();
  const response = await invokeProjectSettingsPost({
    project_id: PROJECT_ID,
    system_prompt: "prompt",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(rpcCalls, []);
  const write = queryCalls.find(
    (call) => call.table === "project_settings" && call.operation === "upsert",
  );
  assert.equal(write.payload.project_id, PROJECT_ID);
  assert.equal("folder_name" in write.payload, false);
  assert.deepEqual(write.options, { onConflict: "user_id,project_id" });
});

test("project-settings POST rejects missing or unowned project_id", async () => {
  resetMocks();
  let response = await invokeProjectSettingsPost({ system_prompt: "prompt" });
  assert.equal(response.status, 400);
  assert.deepEqual(queryCalls, []);

  resetMocks({ projectResult: { data: null, error: null } });
  response = await invokeProjectSettingsPost({ project_id: PROJECT_ID });
  assert.equal(response.status, 404);
  assert.equal(queryCalls.some((call) => call.table === "project_settings"), false);
});

test("extract-settings rejects invalid threadId before database or external AI", async () => {
  for (const threadId of ["", 42]) {
    resetMocks();
    const response = await invokeExtractSettings({ threadId, messages: [] });
    assert.equal(response.status, 400);
    assert.deepEqual(queryCalls, []);
    assert.equal(externalFetchCalls, 0);
  }
});

test("extract-settings rejects an unowned thread before external AI", async () => {
  resetMocks({ threadResult: { data: null, error: null } });
  const response = await invokeExtractSettings(
    { threadId: THREAD_ID, messages: [] },
    false,
  );

  assert.equal(response.status, 404);
  assert.equal(externalFetchCalls, 0);
  assert.deepEqual(queryCalls[0].filters, [
    { column: "id", value: THREAD_ID },
    { column: "user_id", value: USER_ID },
  ]);
});

test("lore/embed canonical projectId skips RPC and writes project_id only", async () => {
  resetMocks();
  const response = await invokeLoreEmbed({
    projectId: PROJECT_ID,
    chunks: [{ text: "canonical lore" }],
  });

  assert.equal(response.status, 200);
  assert.deepEqual(rpcCalls, []);
  assert.equal(embeddingCalls.length, 1);
  const write = queryCalls.find(
    (call) => call.table === "lore_embeddings" && call.operation === "insert",
  );
  assert.equal(write.payload[0].project_id, PROJECT_ID);
  assert.equal("folder_name" in write.payload[0], false);
});

test("lore/embed rejects folderName regardless of value before DB, RPC or embedding", async () => {
  for (const folderName of ["legacy", null, "", 42, false, [], {}]) {
    for (const canonical of [{}, { projectId: PROJECT_ID }]) {
      resetMocks();
      const response = await invokeLoreEmbed({
        ...canonical,
        folderName,
        chunks: [{ text: "must not embed" }],
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: "folderName is no longer supported; use projectId",
      });
      assert.deepEqual(queryCalls, []);
      assert.deepEqual(rpcCalls, []);
      assert.deepEqual(embeddingCalls, []);
    }
  }
});

test("lore/embed rejects both or neither project key before embedding", async () => {
  for (const body of [
    { projectId: PROJECT_ID, folderName: "legacy", chunks: [] },
    { chunks: [] },
  ]) {
    resetMocks();
    const response = await invokeLoreEmbed(body);
    assert.equal(response.status, 400);
    assert.deepEqual(queryCalls, []);
    assert.deepEqual(rpcCalls, []);
    assert.deepEqual(embeddingCalls, []);
  }
});

const originalFetch = global.fetch;
global.fetch = async () => {
  externalFetchCalls += 1;
  throw new Error("unexpected external fetch");
};

(async () => {
  try {
    for (const { name, fn } of tests) {
      try {
        await fn();
        console.log(`ok - ${name}`);
      } catch (error) {
        console.error(`not ok - ${name}`);
        throw error;
      }
    }
    console.log(`passed ${tests.length} project_id write contract route tests`);
  } finally {
    global.fetch = originalFetch;
    Module._load = originalLoad;
  }
})().catch((error) => {
  global.fetch = originalFetch;
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
