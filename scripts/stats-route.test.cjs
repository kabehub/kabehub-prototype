const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;

let currentUser = null;
let setRefreshedCookie = false;
let databaseResults = {
  messages: { data: [], error: null },
  ai_usage_events: { data: [], error: null },
};

function createQuery(table) {
  const query = {
    select() { return query; },
    eq() { return query; },
    gte() { return query; },
    order() { return query; },
    then(onFulfilled, onRejected) {
      return Promise.resolve(databaseResults[table]).then(onFulfilled, onRejected);
    },
  };
  return query;
}

const originalLoad = Module._load;
Module._load = function loadWithSupabaseMock(request, parent, isMain) {
  if (request === "@supabase/ssr") {
    return {
      createServerClient(_url, _key, options) {
        return {
          auth: {
            async getUser() {
              if (setRefreshedCookie) {
                options.cookies.setAll([{
                  name: "sb-refresh",
                  value: "updated",
                  options: { path: "/", httpOnly: true },
                }]);
              }
              return { data: { user: currentUser } };
            },
          },
          from(table) { return createQuery(table); },
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

const { NextRequest } = require("next/server");
const { GET } = require(path.join(__dirname, "..", "app", "api", "stats", "route.ts"));

const pendingTests = [];

function test(name, fn) { pendingTests.push({ name, fn }); }

function resetMocks(options = {}) {
  currentUser = options.user ?? null;
  setRefreshedCookie = options.setRefreshedCookie ?? false;
  databaseResults = {
    messages: options.messagesResult ?? { data: [], error: null },
    ai_usage_events: options.eventsResult ?? { data: [], error: null },
  };
}

function invoke() {
  return GET(new NextRequest("https://www.kabehub.com/api/stats?period=all&tz=Asia%2FTokyo"));
}

function assertRefreshedCookie(response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /sb-refresh=updated/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Path=\//i);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
}

function emptyResponse() {
  return {
    sends: 0,
    total_tokens: 0,
    cost: null,
    priced_count: 0,
    unpriced_count: 0,
    by_model: [],
    hourly: {},
    since: "1970-01-01T00:00:00.000Z",
  };
}

function event(overrides = {}) {
  return {
    id: "event-1",
    message_id: null,
    provider: "gemini",
    model_id: "gemini-2.5-flash",
    input_tokens: 100,
    output_tokens: 50,
    estimated_cost_usd: 0.42,
    cost_source: "computed",
    priced_at: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

function message(overrides = {}) {
  return {
    id: "message-1",
    role: "assistant",
    provider: "openai",
    model_id: "gpt-4o",
    input_tokens: 100,
    output_tokens: 50,
    created_at: "2026-08-15T00:00:00.000Z",
    ai_usage_events: [],
    ...overrides,
  };
}

test("unauthenticated 401 preserves the response and refreshed cookie", async () => {
  resetMocks({ setRefreshedCookie: true });
  const response = await invoke();
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assertRefreshedCookie(response);
});

test("authenticated empty success preserves the response and refreshed cookie", async () => {
  resetMocks({ user: { id: "user-1" }, setRefreshedCookie: true });
  const response = await invoke();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), emptyResponse());
  assertRefreshedCookie(response);
});

test("responses without refreshed cookies do not add cookie or cache headers", async () => {
  resetMocks({ user: { id: "user-1" } });
  const response = await invoke();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), emptyResponse());
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("cache-control"), null);
});

test("database 500 preserves the response and refreshed cookie", async () => {
  resetMocks({
    user: { id: "user-1" },
    setRefreshedCookie: true,
    messagesResult: { data: null, error: { message: "stats query failed" } },
  });
  const response = await invoke();
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "stats query failed" });
  assertRefreshedCookie(response);
});

test("events-only data is aggregated from ai_usage_events", async () => {
  resetMocks({ user: { id: "user-1" }, eventsResult: { data: [event()], error: null } });
  const body = await (await invoke()).json();
  assert.equal(body.total_tokens, 150);
  assert.equal(body.cost, 0.42);
  assert.equal(body.priced_count, 1);
  assert.equal(body.unpriced_count, 0);
  assert.deepEqual(body.by_model, [{
    key: "gemini/gemini-2.5-flash",
    count: 1,
    input_tokens: 100,
    output_tokens: 50,
    cost: 0.42,
    priced_count: 1,
    unpriced_count: 0,
  }]);
});

test("legacy-only messages use message created_at pricing epoch", async () => {
  resetMocks({
    user: { id: "user-1" },
    messagesResult: { data: [message({
      model_id: "gpt-5.6-terra",
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      created_at: "2026-07-29T23:59:59.000Z",
    })], error: null },
  });
  const body = await (await invoke()).json();
  assert.equal(body.cost, 17.5);
  assert.equal(body.priced_count, 1);
  assert.equal(body.by_model[0].cost, 17.5);
});

test("legacy messages and new events coexist without dropping either source", async () => {
  resetMocks({
    user: { id: "user-1" },
    messagesResult: { data: [message({ input_tokens: 100_000, output_tokens: 50_000 })], error: null },
    eventsResult: { data: [event({ estimated_cost_usd: "0.25" })], error: null },
  });
  const body = await (await invoke()).json();
  assert.equal(body.total_tokens, 150_150);
  assert.equal(body.cost, 1);
  assert.equal(body.priced_count, 2);
  assert.equal(body.by_model.length, 2);
});

test("message with event uses event only while eventless message uses legacy fallback", async () => {
  resetMocks({
    user: { id: "user-1" },
    messagesResult: { data: [
      message({
        id: "message-with-event",
        input_tokens: 999_000_000,
        output_tokens: 999_000_000,
        ai_usage_events: [{ id: "event-for-message" }],
      }),
      message({ id: "legacy-message", input_tokens: 1_000_000, output_tokens: 1_000_000 }),
    ], error: null },
    eventsResult: { data: [event({
      id: "event-for-message",
      message_id: "message-with-event",
      provider: "openai",
      model_id: "gpt-4o",
      input_tokens: 10,
      output_tokens: 5,
      estimated_cost_usd: 0.5,
    })], error: null },
  });
  const body = await (await invoke()).json();
  assert.equal(body.total_tokens, 2_000_015);
  assert.equal(body.cost, 13);
  assert.deepEqual(body.by_model, [{
    key: "openai/gpt-4o",
    count: 2,
    input_tokens: 1_000_010,
    output_tokens: 1_000_005,
    cost: 13,
    priced_count: 2,
    unpriced_count: 0,
  }]);
});

test("unavailable events still count and preserve priced subtotal", async () => {
  resetMocks({
    user: { id: "user-1" },
    eventsResult: { data: [
      event(),
      event({ id: "event-2", estimated_cost_usd: null, cost_source: "unavailable" }),
    ], error: null },
  });
  const body = await (await invoke()).json();
  assert.equal(body.cost, 0.42);
  assert.equal(body.priced_count, 1);
  assert.equal(body.unpriced_count, 1);
  assert.equal(body.by_model[0].count, 2);
  assert.equal(body.by_model[0].unpriced_count, 1);
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
  console.log(`${pendingTests.length} stats route tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
