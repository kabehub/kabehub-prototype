const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage =
  require("node:async_hooks").AsyncLocalStorage;

let currentUser = null;
let currentAuthError = null;
let setRefreshedCookie = false;
let tableResults = {};
let normalFromCalls = [];
let reportRpcResult = { data: null, error: null };
let reportRpcCalls = [];
let exploreServiceRoleCalls = 0;
let serverClientCreateCount = 0;
let lastServerClient = null;
let bearerUser = null;
let bearerAuthError = null;
let bearerClientCreateCount = 0;
let bearerClientOptions = [];
let bearerGetUserTokens = [];
let bearerDbCalls = [];

function createQuery(table) {
  const query = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    ilike() {
      return query;
    },
    contains() {
      return query;
    },
    is() {
      return query;
    },
    in() {
      return query;
    },
    lt() {
      return query;
    },
    or() {
      return query;
    },
    then(onFulfilled, onRejected) {
      const result = tableResults[table] ?? { data: [], error: null };
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return query;
}

const originalLoad = Module._load;
Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "@supabase/ssr") {
    return {
      createServerClient(_url, _key, options) {
        serverClientCreateCount += 1;
        const client = {
          auth: {
            async getUser() {
              if (setRefreshedCookie) {
                options.cookies.setAll([
                  {
                    name: "sb-refresh",
                    value: "updated",
                    options: { path: "/", httpOnly: true },
                  },
                ]);
              }
              return {
                data: { user: currentUser },
                error: currentAuthError,
              };
            },
          },
          from(table) {
            normalFromCalls.push(table);
            return createQuery(table);
          },
        };
        lastServerClient = client;
        return client;
      },
    };
  }

  if (request === "@supabase/supabase-js") {
    return {
      createClient(_url, _key, options) {
        if (options?.global?.headers?.Authorization) {
          bearerClientCreateCount += 1;
          bearerClientOptions.push(options);
          return {
            auth: {
              async getUser(token) {
                bearerGetUserTokens.push(token);
                return {
                  data: { user: bearerUser },
                  error: bearerAuthError,
                };
              },
            },
            from(table) {
              const query = {
                select(columns) {
                  bearerDbCalls.push({ operation: "select", table, columns });
                  return query;
                },
                insert(values) {
                  bearerDbCalls.push({ operation: "insert", table, values });
                  return query;
                },
                then(onFulfilled, onRejected) {
                  return Promise.resolve({
                    data: [{ user_id: bearerUser?.id ?? null }],
                    error: null,
                  }).then(onFulfilled, onRejected);
                },
              };
              return query;
            },
          };
        }
        return {
          async rpc(name, args) {
            reportRpcCalls.push({ name, args });
            return reportRpcResult;
          },
        };
      },
    };
  }

  if (request === "@/lib/mcp-auth") {
    return {
      serviceRoleClient() {
        exploreServiceRoleCalls += 1;
        throw new Error("explore service-role client was not expected");
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
const {
  getOptionalRouteUser,
  requireRouteUser,
} = require(path.join(
  __dirname,
  "..",
  "lib",
  "supabase",
  "route-auth.ts"
));
const reports = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "reports",
  "route.ts"
));
const explore = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "explore",
  "route.ts"
));

const pendingTests = [];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

function resetMocks(options = {}) {
  currentUser = options.user ?? null;
  currentAuthError = options.authError ?? null;
  setRefreshedCookie = options.setRefreshedCookie ?? false;
  tableResults = options.tableResults ?? {};
  normalFromCalls = [];
  reportRpcResult = options.reportRpcResult ?? { data: null, error: null };
  reportRpcCalls = [];
  exploreServiceRoleCalls = 0;
  serverClientCreateCount = 0;
  lastServerClient = null;
  bearerUser = options.bearerUser ?? null;
  bearerAuthError = options.bearerAuthError ?? null;
  bearerClientCreateCount = 0;
  bearerClientOptions = [];
  bearerGetUserTokens = [];
  bearerDbCalls = [];
}

function requestFor(pathname, init) {
  return new NextRequest(`https://www.kabehub.com${pathname}`, init);
}

function assertRefreshedCookie(response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /sb-refresh=updated/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Path=\//i);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
}

test("requireRouteUser retains its 401 and cookie finalization contract", async () => {
  resetMocks({ setRefreshedCookie: true });

  const auth = await requireRouteUser(requestFor("/api/test"));

  assert.equal(auth.ok, false);
  if (auth.ok) assert.fail("authentication should have failed");
  assert.equal(auth.response.status, 401);
  assert.deepEqual(await auth.response.json(), { error: "Unauthorized" });
  assertRefreshedCookie(auth.response);
});

test("requireRouteUser exposes Cookie auth mode only on success", async () => {
  resetMocks({ user: { id: "cookie-user" } });

  const auth = await requireRouteUser(requestFor("/api/test"));

  assert.equal(auth.ok, true);
  if (!auth.ok) assert.fail("Cookie authentication should succeed");
  assert.equal(auth.authMode, "cookie");
});

test("getOptionalRouteUser returns null for an unauthenticated request", async () => {
  resetMocks();

  const auth = await getOptionalRouteUser(
    requestFor("/api/reports", { method: "POST" })
  );

  assert.equal(auth.ok, true);
  if (!auth.ok) assert.fail("Cookie optional-auth should stay anonymous");
  assert.equal(auth.user, null);
  assert.equal(Object.hasOwn(auth, "authMode"), false);
  assert.equal(serverClientCreateCount, 1);
  assert.equal(auth.supabase, lastServerClient);
});

test("getOptionalRouteUser ignores data.user when Supabase returns an auth error", async () => {
  resetMocks({
    user: { id: "stale-user" },
    authError: { message: "invalid session" },
  });

  const auth = await getOptionalRouteUser(requestFor("/api/test"));

  assert.equal(auth.user, null);
});

test("getOptionalRouteUser finalizeJson preserves refreshed cookies", async () => {
  resetMocks({
    user: { id: "user-1" },
    setRefreshedCookie: true,
  });

  const auth = await getOptionalRouteUser(requestFor("/api/test"));
  const response = auth.finalizeJson({ ok: true });

  assert.deepEqual(await response.json(), { ok: true });
  assertRefreshedCookie(response);
});

test("Bearer auth returns its RLS client for SELECT and INSERT", async () => {
  resetMocks({ bearerUser: { id: "bearer-user" } });
  const auth = await requireRouteUser(
    requestFor("/api/chat", {
      method: "POST",
      headers: { authorization: "Bearer valid-jwt" },
    })
  );

  assert.equal(auth.ok, true);
  if (!auth.ok) assert.fail("Bearer authentication should succeed");
  assert.equal(auth.authMode, "bearer");
  const selectResult = await auth.supabase.from("threads").select("id");
  const insertResult = await auth.supabase
    .from("threads")
    .insert({ user_id: auth.user.id });

  assert.deepEqual(selectResult, {
    data: [{ user_id: "bearer-user" }],
    error: null,
  });
  assert.deepEqual(insertResult, {
    data: [{ user_id: "bearer-user" }],
    error: null,
  });
  assert.equal(serverClientCreateCount, 0);
  assert.equal(bearerClientCreateCount, 1);
  assert.deepEqual(bearerGetUserTokens, ["valid-jwt"]);
  assert.equal(
    bearerClientOptions[0].global.headers.Authorization,
    "Bearer valid-jwt"
  );
  assert.deepEqual(bearerDbCalls, [
    { operation: "select", table: "threads", columns: "id" },
    {
      operation: "insert",
      table: "threads",
      values: { user_id: "bearer-user" },
    },
  ]);
});

test("invalid Bearer does not fall back to a valid Cookie", async () => {
  resetMocks({
    user: { id: "cookie-user" },
    bearerAuthError: { message: "invalid bearer" },
  });
  const auth = await requireRouteUser(
    requestFor("/api/chat", {
      method: "POST",
      headers: {
        authorization: "Bearer invalid-jwt",
        cookie: "sb-access-token=valid-cookie",
      },
    })
  );

  assert.equal(auth.ok, false);
  if (auth.ok) assert.fail("invalid Bearer should fail");
  assert.equal(auth.response.status, 401);
  assert.equal(serverClientCreateCount, 0);
  assert.equal(bearerClientCreateCount, 1);
  assert.deepEqual(bearerGetUserTokens, ["invalid-jwt"]);
});

test("empty Bearer does not create a client or fall back to Cookie", async () => {
  resetMocks({ user: { id: "cookie-user" } });
  const auth = await requireRouteUser(
    requestFor("/api/chat", {
      method: "POST",
      headers: {
        authorization: "Bearer   ",
        cookie: "sb-access-token=valid-cookie",
      },
    })
  );

  assert.equal(auth.ok, false);
  if (auth.ok) assert.fail("empty Bearer should fail");
  assert.equal(auth.response.status, 401);
  assert.equal(serverClientCreateCount, 0);
  assert.equal(bearerClientCreateCount, 0);
});

test("optional routes explicitly return 401 for invalid Bearer", async () => {
  resetMocks({ bearerAuthError: { message: "invalid bearer" } });
  const exploreResponse = await explore.GET(
    requestFor("/api/explore", {
      method: "GET",
      headers: { authorization: "Bearer invalid-jwt" },
    })
  );

  assert.equal(exploreResponse.status, 401);
  assert.deepEqual(normalFromCalls, []);

  resetMocks({ bearerAuthError: { message: "invalid bearer" } });
  const reportsResponse = await reports.POST(
    requestFor("/api/reports", {
      method: "POST",
      headers: {
        authorization: "Bearer invalid-jwt",
        "content-type": "application/json",
      },
      body: JSON.stringify({ threadId: "thread-1", reason: "spam" }),
    })
  );

  assert.equal(reportsResponse.status, 401);
  assert.deepEqual(reportRpcCalls, []);
});

test("reports submits null reporter user id for an anonymous request", async () => {
  resetMocks();
  const request = requestFor("/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ threadId: "thread-1", reason: "spam" }),
  });

  const response = await reports.POST(request);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(reportRpcCalls, [
    {
      name: "submit_report",
      args: {
        p_thread_id: "thread-1",
        p_reason: "spam",
        p_reporter_user_id: null,
        p_reporter_ip: "unknown",
      },
    },
  ]);
});

test("explore returns liked_by_me false for an anonymous request", async () => {
  resetMocks({
    tableResults: {
      public_threads_view: {
        data: [
          {
            id: "thread-1",
            title: "Public thread",
            is_public: true,
            created_at: "2026-08-01T00:00:00.000Z",
            updated_at: "2026-08-01T00:00:00.000Z",
            user_id: "owner-1",
            genre: null,
            share_token: "share-token",
            tags: [],
            allow_prompt_fork: false,
            fork_count: 0,
          },
        ],
        error: null,
      },
      likes: {
        data: [{ thread_id: "thread-1", user_id: "other-user" }],
        error: null,
      },
      messages: { data: [], error: null },
      profiles: { data: [], error: null },
      thread_tags: { data: [], error: null },
    },
  });

  const response = await explore.GET(requestFor("/api/explore"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].liked_by_me, false);
  assert.deepEqual(normalFromCalls, [
    "public_threads_view",
    "likes",
    "messages",
    "profiles",
    "thread_tags",
  ]);
  assert.equal(exploreServiceRoleCalls, 0);
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

  console.log(`${pendingTests.length} optional route auth tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
