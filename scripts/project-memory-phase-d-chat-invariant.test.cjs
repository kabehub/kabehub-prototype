const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;

const USER_ID = "user-1";
const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

let threadFixture;
let databaseCalls;
let loreCalls;
let backgroundTasks;
let upstreamCalls;
let upstreamBodies;

function routeQuery(table) {
  const state = { select: null, filters: [] };
  databaseCalls.push({ table, state });
  const query = {
    select(columns) {
      state.select = columns;
      return query;
    },
    eq(column, value) {
      state.filters.push({ column, value });
      return query;
    },
    not() {
      return query;
    },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    async maybeSingle() {
      if (table === "threads") return { data: threadFixture, error: null };
      if (table === "project_settings") {
        return {
          data: {
            system_prompt: "project system prompt",
            folder_type: "novel",
            pinned_github_files: [],
            github_repo: null,
            github_ref: null,
          },
          error: null,
        };
      }
      if (table === "messages") return { data: null, error: null };
      return { data: null, error: null };
    },
    async single() {
      return { data: null, error: null };
    },
    async insert() {
      return { data: null, error: null };
    },
    async upsert() {
      return { data: null, error: null };
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
    },
  };
  return query;
}

const supabase = {
  from(table) {
    return routeQuery(table);
  },
  rpc(name) {
    throw new Error(`unexpected RPC call: ${name}`);
  },
};

const loreMock = {
  async embedQuery() {
    loreCalls.push("embedQuery");
    return [1];
  },
  async searchLoreByEmbeddingForProject() {
    loreCalls.push("searchLoreByEmbeddingForProject");
    return ["canonical lore context"];
  },
  async searchLoreV2ByEmbeddingForProject() {
    loreCalls.push("searchLoreV2ByEmbeddingForProject");
    return [{
      chunkText: "canonical memory context",
      memoryKind: "fact",
      temporalStatus: "current",
      confidenceScore: 0.9,
    }];
  },
  async searchLoreV2ForProject() {
    loreCalls.push("searchLoreV2ForProject");
    return [{ chunkText: "canonical rag context", memoryKind: "fact" }];
  },
};

const originalLoad = Module._load;
Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "@vercel/functions") {
    return {
      waitUntil(promise) {
        backgroundTasks.push(Promise.resolve(promise));
      },
    };
  }
  if (request === "@/lib/supabase/route-auth") {
    return {
      async requireRouteUser() {
        return {
          ok: true,
          user: { id: USER_ID },
          supabase,
          finalizeResponse(response) {
            return response;
          },
        };
      },
    };
  }
  if (request === "@/lib/supabase/route-handler") {
    return {
      createRouteHandlerSupabaseClient() {
        throw new Error("route-handler client should not be created directly");
      },
    };
  }
  if (request === "@/lib/rate-limit") {
    return {
      async checkChatRateLimit() {
        return { allowed: true, limit: 10, remaining: 9, resetAt: Date.now() + 60_000 };
      },
    };
  }
  if (request === "@/lib/lore") return loreMock;
  if (request === "@/lib/aiUsage") {
    return {
      calculateTextUsageCost() {
        return { estimatedCostUsd: null, costSource: null };
      },
      async recordUsageEvent() {
        return true;
      },
    };
  }
  if (request === "@/lib/mcp-auth") {
    return {
      serviceRoleClient() {
        return {};
      },
    };
  }
  if (request === "@/lib/github-tool-loop") {
    return {
      async runGithubToolLoop() {
        throw new Error("GitHub tool loop must be skipped");
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
const { POST } = require(path.join(__dirname, "..", "app", "api", "chat", "route.ts"));

const originalFetch = global.fetch;
global.fetch = async (url, init) => {
  upstreamCalls += 1;
  upstreamBodies.push({ url: String(url), body: init?.body });
  return new Response([
    'data: {"candidates":[{"content":{"parts":[{"text":"chat continued"}]}}]}',
    'data: {"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":2}}',
    "",
  ].join("\n"), { status: 200 });
};

async function verifyCanonicalProjectContext() {
  const label = "folder_name null / project_id set";
  const fixture = {
    folder_name: null,
    project_id: PROJECT_ID,
    user_id: USER_ID,
  };
  threadFixture = fixture;
  databaseCalls = [];
  loreCalls = [];
  backgroundTasks = [];
  upstreamCalls = 0;
  upstreamBodies = [];

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const request = new NextRequest("https://www.kabehub.com/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gemini-api-key": "gemini-key",
        "x-openai-api-key": "openai-key",
      },
      body: JSON.stringify({
        threadId: THREAD_ID,
        messages: [],
        userContent: "このプロジェクトの記憶を使って続きを回答して",
        provider: "gemini",
        modelId: "gemini-2.5-flash",
      }),
    });

    const response = await POST(request);
    assert.equal(response.status, 200, `${label}: chat status`);
    assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
    const body = await response.text();
    assert.match(body, /chat continued/, `${label}: upstream response`);
    await Promise.all(backgroundTasks);

    assert.equal(upstreamCalls, 1, `${label}: chat upstream continues exactly once`);
    assert.match(upstreamBodies[0].url, /generativelanguage\.googleapis\.com/);
    assert.deepEqual(loreCalls, [
      "embedQuery",
      "searchLoreByEmbeddingForProject",
      "searchLoreV2ByEmbeddingForProject",
      "searchLoreV2ForProject",
    ], `${label}: all three memory paths run`);
    const projectSettingsCall = databaseCalls.find(
      (call) => call.table === "project_settings",
    );
    assert.ok(projectSettingsCall, `${label}: project-scoped settings are loaded`);
    assert.deepEqual(projectSettingsCall.state.filters, [
      { column: "user_id", value: USER_ID },
      { column: "project_id", value: PROJECT_ID },
    ]);
    const upstreamBody = upstreamBodies[0].body;
    assert.match(upstreamBody, /project system prompt/);
    assert.match(upstreamBody, /canonical lore context/);
    assert.match(upstreamBody, /canonical memory context/);
    assert.match(upstreamBody, /canonical rag context/);
    assert.equal(
      warnings.filter(
        (call) =>
          call[0] === "[best-effort-failed]" &&
          call[1]?.operation === "project-memory-invariant-broken",
      ).length,
      0,
      `${label}: no legacy invariant warning`,
    );
    console.log(`ok - ${label}`);
  } finally {
    console.warn = originalWarn;
  }
}

(async () => {
  try {
    await verifyCanonicalProjectContext();
    console.log("passed Project Memory Phase D canonical chat context test");
  } finally {
    global.fetch = originalFetch;
  }
})().catch((error) => {
  global.fetch = originalFetch;
  console.error(error);
  process.exitCode = 1;
});
