const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;

const backgroundTasks = [];
const usageUpserts = [];
let upstreamCalls = 0;

function routeQuery(table) {
  const query = {
    select() { return query; },
    eq() { return query; },
    not() { return query; },
    order() { return query; },
    limit() { return query; },
    async maybeSingle() {
      return table === "threads"
        ? { data: { folder_name: null, user_id: "user-1" }, error: null }
        : { data: null, error: null };
    },
    async single() { return { data: null, error: null }; },
    async insert() { return { data: null, error: null }; },
    async upsert() { return { data: null, error: null }; },
    then(onFulfilled, onRejected) {
      return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
    },
  };
  return query;
}

const originalLoad = Module._load;
Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "@vercel/functions") {
    return {
      waitUntil(promise) {
        backgroundTasks.push(Promise.resolve(promise));
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
  if (request === "@supabase/ssr") {
    return {
      createServerClient(_url, _key, options) {
        return {
          auth: {
            async getUser() {
              options.cookies.setAll([{
                name: "sb-refresh",
                value: "updated",
                options: { path: "/", httpOnly: true },
              }]);
              return { data: { user: { id: "user-1" } }, error: null };
            },
          },
          from(table) { return routeQuery(table); },
        };
      },
    };
  }
  if (request === "@supabase/supabase-js") {
    return {
      createClient() {
        return {
          from(table) {
            assert.equal(table, "ai_usage_events");
            return {
              async upsert(payload, options) {
                usageUpserts.push({ payload, options });
                return { error: null };
              },
            };
          },
        };
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
global.fetch = async () => {
  upstreamCalls += 1;
  return new Response([
    'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}',
    'data: {"usageMetadata":{"promptTokenCount":1000,"candidatesTokenCount":100,"thoughtsTokenCount":50,"cachedContentTokenCount":200}}',
    "",
  ].join("\n"), { status: 200 });
};

(async () => {
  try {
    const request = new NextRequest("https://www.kabehub.com/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gemini-api-key": "gemini-key",
      },
      body: JSON.stringify({
        threadId: "11111111-1111-4111-8111-111111111111",
        messages: [],
        userContent: "Hello",
        provider: "gemini",
        modelId: "gemini-2.5-flash",
      }),
    });

    const response = await POST(request);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
    assert.equal(response.headers.get("x-accel-buffering"), "no");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const setCookie = response.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /sb-refresh=updated/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Path=\//i);

    const body = await response.text();
    assert.match(body, /"type":"meta"/);
    assert.match(body, /"type":"chunk","text":"Hello"/);
    assert.match(body, /"type":"done","aborted":false/);

    await Promise.all(backgroundTasks);
    assert.equal(upstreamCalls, 1);
    assert.equal(usageUpserts.length, 2);
    assert.equal(usageUpserts[0].payload.message_id, null);
    assert.match(usageUpserts[1].payload.message_id, /^[0-9a-f-]{36}$/i);
    assert.equal(usageUpserts[1].payload.status, "completed");
    assert.deepEqual(usageUpserts[1].options, { onConflict: "id" });
    console.log("chat route auth streaming test passed");
  } finally {
    global.fetch = originalFetch;
  }
})().catch((error) => {
  global.fetch = originalFetch;
  console.error(error);
  process.exitCode = 1;
});
