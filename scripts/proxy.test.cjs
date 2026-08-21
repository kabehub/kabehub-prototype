const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage =
  require("node:async_hooks").AsyncLocalStorage;

let currentUser = null;
let currentAuthError = null;
let sessionCheckCount = 0;
let setRefreshedCookie = false;
let bearerUser = null;
let bearerAuthError = null;
let bearerGetUserTokens = [];
let bearerClientOptions = [];

const originalLoad = Module._load;
Module._load = function loadWithSupabaseMock(request, parent, isMain) {
  if (request === "@supabase/ssr") {
    return {
      createServerClient(_url, _key, options) {
        return {
          auth: {
            async getUser() {
              sessionCheckCount += 1;
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
        };
      },
    };
  }
  if (request === "@supabase/supabase-js") {
    return {
      createClient(_url, _key, options) {
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
        };
      },
    };
  }
  if (request === "@kabehub/shared") {
    return originalLoad.call(
      this,
      path.join(__dirname, "..", "packages", "shared", "src", "index.ts"),
      parent,
      isMain
    );
  }
  return originalLoad.call(this, request, parent, isMain);
};

installTsLoader();
installAliasResolver();

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
delete process.env.CSP_REPORT_ENDPOINT;
delete process.env.CSP_REPORT_ONLY;

const { NextRequest } = require("next/server");
const {
  unstable_doesMiddlewareMatch: doesProxyMatch,
} = require("next/experimental/testing/server");
const {
  appendVaryOrigin,
  config,
  proxy,
} = require(path.join(__dirname, "..", "proxy.ts"));
const {
  API_KEY_HEADER_NAMES,
} = require("@kabehub/shared");
const {
  isMcpBearerApi,
  isProtectedPagePath,
  isProtectedRedirectPath,
  isPublicShareReadApi,
} = require(path.join(__dirname, "..", "lib", "proxy-paths.ts"));

const pendingTests = [];
const protectedPagePaths = [
  "/stats",
  "/memory",
  "/album",
  "/arena",
  "/calendar",
  "/image",
  "/novel-check",
  "/threads/abc/tree",
];
const protectedRedirectPaths = [
  "/",
  "/settings",
  "/settings/x",
  "/admin",
  "/admin/x",
  ...protectedPagePaths,
];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

// Next.js 16.2.11 の testing API は method を受け取らないため、
// config.matcher の判定は pathname/headers のみ（method 非依存）で検証する。
function matches(pathname, headers) {
  return doesProxyMatch({
    config,
    nextConfig: {},
    url: `https://www.kabehub.com${pathname}`,
    headers,
  });
}

async function invoke(pathname, options = {}) {
  currentUser = options.user ?? null;
  currentAuthError = options.authError ?? null;
  sessionCheckCount = 0;
  setRefreshedCookie = options.setRefreshedCookie ?? false;
  bearerUser = options.bearerUser ?? null;
  bearerAuthError = options.bearerAuthError ?? null;
  bearerGetUserTokens = [];
  bearerClientOptions = [];
  const request = new NextRequest(`https://www.kabehub.com${pathname}`, {
    method: options.method ?? "GET",
    headers: options.headers,
  });
  const response = await proxy(request);
  return { response, sessionCheckCount };
}

function assertReportOnlyCsp(response) {
  const value = response.headers.get(
    "content-security-policy-report-only"
  );
  assert.ok(value, "Report-Only CSP header should be present");
  assert.match(value, /'nonce-[^']+'/);
  return value;
}

async function assertJsonUnauthorized(response) {
  assert.equal(response.status, 401);
  assert.equal(response.headers.has("location"), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(
    response.headers.get("content-type") ?? "",
    /^application\/json\b/i
  );
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
}

function assertAllowedCors(response, origin = "capacitor://localhost") {
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.equal(
    response.headers.has("access-control-allow-credentials"),
    false
  );
  const varyValues = (response.headers.get("vary") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase());
  assert.equal(varyValues.filter((value) => value === "origin").length, 1);
}

test("CORS preflight short-circuits before auth with shared BYOK headers", async () => {
  const result = await invoke("/api/chat", {
    method: "OPTIONS",
    headers: {
      origin: "capacitor://localhost",
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization, content-type",
    },
  });

  assert.equal(result.response.status, 204);
  assert.equal(result.sessionCheckCount, 0);
  assert.deepEqual(bearerGetUserTokens, []);
  assertAllowedCors(result.response);
  assert.equal(result.response.headers.get("access-control-allow-methods"), "POST");
  assert.equal(
    result.response.headers.get("access-control-allow-headers"),
    [
      "Authorization",
      "Content-Type",
      ...Object.values(API_KEY_HEADER_NAMES),
    ].join(", ")
  );
});

test("chat pass-through carries CORS headers for the downstream SSE response", async () => {
  const result = await invoke("/api/chat", {
    method: "POST",
    user: { id: "cookie-user" },
    headers: { origin: "https://localhost" },
  });

  assert.equal(result.response.status, 200);
  assertAllowedCors(result.response, "https://localhost");
  console.log(
    `chat CORS raw header: Access-Control-Allow-Origin: ${result.response.headers.get("access-control-allow-origin")}`
  );
});

test("valid Supabase Bearer authenticates without reading Cookie auth", async () => {
  const result = await invoke("/api/chat", {
    method: "POST",
    user: { id: "cookie-user" },
    bearerUser: { id: "bearer-user" },
    headers: {
      authorization: "Bearer valid-jwt",
      cookie: "sb-access-token=valid-cookie",
      origin: "capacitor://localhost",
    },
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.sessionCheckCount, 0);
  assert.deepEqual(bearerGetUserTokens, ["valid-jwt"]);
  assert.equal(
    bearerClientOptions[0].global.headers.Authorization,
    "Bearer valid-jwt"
  );
  assertAllowedCors(result.response);
});

test("invalid Bearer never falls back to a valid Cookie", async () => {
  const result = await invoke("/api/chat", {
    method: "POST",
    user: { id: "cookie-user" },
    bearerAuthError: { message: "invalid bearer" },
    headers: {
      authorization: "Bearer invalid-jwt",
      cookie: "sb-access-token=valid-cookie",
      origin: "capacitor://localhost",
    },
  });

  assert.equal(result.sessionCheckCount, 0);
  assert.deepEqual(bearerGetUserTokens, ["invalid-jwt"]);
  await assertJsonUnauthorized(result.response);
  assertAllowedCors(result.response);
});

test("empty Bearer never falls back to a valid Cookie", async () => {
  const result = await invoke("/api/chat", {
    method: "POST",
    user: { id: "cookie-user" },
    headers: {
      authorization: "Bearer   ",
      cookie: "sb-access-token=valid-cookie",
    },
  });

  assert.equal(result.sessionCheckCount, 0);
  assert.deepEqual(bearerGetUserTokens, []);
  await assertJsonUnauthorized(result.response);
});

test("reports now matches proxy, skips Cookie pre-auth, and receives CORS", async () => {
  assert.equal(matches("/api/reports"), true);
  const result = await invoke("/api/reports", {
    method: "POST",
    headers: { origin: "capacitor://localhost" },
  });

  assert.equal(result.sessionCheckCount, 0);
  assert.equal(result.response.status, 200);
  assertAllowedCors(result.response);
});

test("internal and MCP routes never receive CORS headers", async () => {
  for (const { pathname, method } of [
    { pathname: "/api/mcp/threads", method: "GET" },
    { pathname: "/api/cron/storage-cleanup", method: "GET" },
    { pathname: "/api/csp-report", method: "POST" },
    { pathname: "/api/auth/github/callback", method: "GET" },
  ]) {
    const result = await invoke(pathname, {
      method,
      headers: { origin: "capacitor://localhost" },
    });
    assert.equal(
      result.response.headers.has("access-control-allow-origin"),
      false,
      `${method} ${pathname}: ACAO`
    );
    assert.equal(
      result.response.headers.has("vary"),
      false,
      `${method} ${pathname}: Vary`
    );
  }
});

test("Vary Origin de-duplicates case-insensitively", () => {
  const headers = new Headers({ Vary: "Accept-Encoding, oRiGiN" });
  appendVaryOrigin(headers);
  assert.equal(headers.get("vary"), "Accept-Encoding, oRiGiN");

  const missing = new Headers({ Vary: "Accept-Encoding" });
  appendVaryOrigin(missing);
  assert.equal(missing.get("vary"), "Accept-Encoding, Origin");
});

test("MCP Bearer API uses a segment boundary", () => {
  assert.equal(isMcpBearerApi("/api/mcp"), true);
  assert.equal(isMcpBearerApi("/api/mcp/"), true);
  assert.equal(isMcpBearerApi("/api/mcp/threads"), true);
  assert.equal(isMcpBearerApi("/api/mcp-tokens"), false);
  assert.equal(isMcpBearerApi("/api/mcpx"), false);
});

test("only public share read paths are session-exempt", () => {
  assert.equal(isPublicShareReadApi("/api/share/abc", "GET"), true);
  assert.equal(isPublicShareReadApi("/api/share/abc/", "HEAD"), true);
  assert.equal(isPublicShareReadApi("/api/share/abc", "POST"), false);
  assert.equal(isPublicShareReadApi("/api/share/abc/fork", "GET"), false);
  assert.equal(isPublicShareReadApi("/api/share/abc/fork", "POST"), false);
  assert.equal(isPublicShareReadApi("/api/share", "GET"), false);
});

test("newly protected page paths normalize one trailing slash", () => {
  assert.equal(isProtectedPagePath("/stats/"), true);
  assert.equal(isProtectedPagePath("/arena/"), true);
  assert.equal(isProtectedPagePath("/threads/abc/tree/"), true);
});

test("protected redirect paths use the complete explicit page whitelist", () => {
  for (const pathname of protectedRedirectPaths) {
    assert.equal(
      isProtectedRedirectPath(pathname),
      true,
      `${pathname}: protected redirect path`
    );
  }

  for (const pathname of [
    "/login",
    "/explore",
    "/share/abc",
    "/arena/abc",
  ]) {
    assert.equal(
      isProtectedRedirectPath(pathname),
      false,
      `${pathname}: rejected redirect path`
    );
  }
});

test("login runs the session check but is never an allowed next target", async () => {
  assert.equal(matches("/login"), true);
  assert.equal(isProtectedRedirectPath("/login"), false);

  const anonymous = await invoke("/login");
  assert.equal(anonymous.sessionCheckCount, 1);
  assert.equal(anonymous.response.status, 200);
});

test("every next generated for an anonymous protected page is allowed", async () => {
  for (const pathname of protectedRedirectPaths) {
    const result = await invoke(pathname);
    assert.equal(
      result.sessionCheckCount,
      1,
      `${pathname}: session check`
    );
    assert.equal(result.response.status, 307, `${pathname}: redirect status`);

    const location = new URL(result.response.headers.get("location"));
    const next = location.searchParams.get("next");
    assert.equal(location.pathname, "/login", `${pathname}: login redirect`);
    assert.equal(next, pathname, `${pathname}: generated next`);
    assert.equal(
      isProtectedRedirectPath(next),
      true,
      `${pathname}: generated next is accepted`
    );
  }
});

test("thread tree matcher includes a trailing slash", () => {
  assert.equal(
    matches("/threads/abc/tree/", { "next-router-prefetch": "1" }),
    true,
    "/threads/abc/tree/ should match config.matcher during prefetch"
  );
});

test("thread tree matcher rejects a lookalike nested path", () => {
  assert.equal(
    matches("/threads/abc/tree/extra", { "next-router-prefetch": "1" }),
    false,
    "/threads/abc/tree/extra should not match config.matcher during prefetch"
  );
});

test("newly protected pages enforce auth including prefetch", async () => {
  const prefetchHeaders = { "next-router-prefetch": "1" };

  for (const pathname of protectedPagePaths) {
    assert.equal(
      isProtectedPagePath(pathname),
      true,
      `${pathname}: protected path`
    );
    assert.equal(matches(pathname), true, `${pathname}: normal matcher`);

    const anonymous = await invoke(pathname);
    assert.equal(
      anonymous.sessionCheckCount,
      1,
      `${pathname}: anonymous session check`
    );
    assert.equal(anonymous.response.status, 307, `${pathname}: redirect status`);
    const location = new URL(anonymous.response.headers.get("location"));
    assert.equal(location.pathname, "/login", `${pathname}: redirect pathname`);
    assert.equal(
      location.searchParams.get("next"),
      pathname,
      `${pathname}: redirect next`
    );

    assert.equal(
      matches(pathname, prefetchHeaders),
      true,
      `${pathname}: prefetch matcher`
    );

    const authenticated = await invoke(pathname, {
      user: { id: "user-1" },
    });
    assert.equal(
      authenticated.sessionCheckCount,
      1,
      `${pathname}: authenticated session check`
    );
    assert.equal(
      authenticated.response.status,
      200,
      `${pathname}: authenticated status`
    );
    assert.equal(
      authenticated.response.headers.has("location"),
      false,
      `${pathname}: authenticated location`
    );
  }
});

test("nearby public pages stay outside the new auth boundary", async () => {
  const publicPaths = [
    "/arena/abc",
    "/threads/abc",
    "/threads/abc/tree/extra",
    "/explore",
  ];
  const prefetchHeaders = { purpose: "prefetch" };

  for (const pathname of publicPaths) {
    assert.equal(
      isProtectedPagePath(pathname),
      false,
      `${pathname}: protected path`
    );
    assert.equal(
      matches(pathname, prefetchHeaders),
      false,
      `${pathname}: prefetch matcher`
    );

    const result = await invoke(pathname);
    assert.equal(
      result.sessionCheckCount,
      0,
      `${pathname}: direct proxy session check`
    );
    assert.equal(result.response.status, 200, `${pathname}: direct proxy status`);
  }
});

test("MCP and share matcher/session boundaries match the specification", async () => {
  const cases = [
    {
      pathname: "/api/mcp",
      method: "GET",
      matcherRuns: false,
      sessionCheckRuns: false,
    },
    {
      pathname: "/api/mcp/",
      method: "GET",
      matcherRuns: false,
      sessionCheckRuns: false,
    },
    {
      pathname: "/api/mcp/threads",
      method: "GET",
      matcherRuns: false,
      sessionCheckRuns: false,
    },
    {
      pathname: "/api/mcp-tokens",
      method: "GET",
      matcherRuns: true,
      sessionCheckRuns: true,
    },
    {
      pathname: "/api/mcpx",
      method: "GET",
      matcherRuns: true,
      sessionCheckRuns: true,
    },
    {
      pathname: "/api/share/abc",
      method: "GET",
      matcherRuns: true,
      sessionCheckRuns: false,
    },
    {
      pathname: "/api/share/abc/",
      method: "GET",
      matcherRuns: true,
      sessionCheckRuns: false,
    },
    {
      pathname: "/api/share/abc",
      method: "POST",
      matcherRuns: true,
      sessionCheckRuns: true,
    },
    {
      pathname: "/api/share/abc/fork",
      method: "POST",
      matcherRuns: true,
      sessionCheckRuns: true,
    },
    {
      pathname: "/api/share/abc/fork/",
      method: "POST",
      matcherRuns: true,
      sessionCheckRuns: true,
    },
    {
      pathname: "/api/share/abc/fork/x",
      method: "GET",
      matcherRuns: true,
      sessionCheckRuns: true,
    },
    {
      pathname: "/api/shared-something",
      method: "GET",
      matcherRuns: true,
      sessionCheckRuns: true,
    },
  ];

  for (const {
    pathname,
    method,
    matcherRuns,
    sessionCheckRuns,
  } of cases) {
    assert.equal(
      matches(pathname),
      matcherRuns,
      `${method} ${pathname}: matcherRuns`
    );
    const result = await invoke(pathname, { method });
    assert.equal(
      result.sessionCheckCount,
      sessionCheckRuns ? 1 : 0,
      `${method} ${pathname}: sessionCheckRuns`
    );
  }
});

test("normal and prefetch root requests retain auth checks", async () => {
  assert.equal(matches("/"), true);
  const normal = await invoke("/", { setRefreshedCookie: true });
  assert.equal(normal.sessionCheckCount, 1);
  assert.equal(normal.response.status, 307);
  assert.equal(
    normal.response.headers.get("location"),
    "https://www.kabehub.com/login?next=%2F"
  );
  assertReportOnlyCsp(normal.response);
  assert.match(normal.response.headers.get("set-cookie") ?? "", /sb-refresh=updated/);

  const headers = { "next-router-prefetch": "1" };
  assert.equal(matches("/", headers), true);
  const prefetch = await invoke("/", { headers });
  assert.equal(prefetch.sessionCheckCount, 1);
  assert.equal(prefetch.response.status, 307);
  assert.equal(
    prefetch.response.headers.has("content-security-policy-report-only"),
    false
  );
});

test("normal and prefetch settings requests retain auth checks", async () => {
  assert.equal(matches("/settings"), true);
  const normal = await invoke("/settings");
  assert.equal(normal.sessionCheckCount, 1);
  assert.equal(normal.response.status, 307);
  assertReportOnlyCsp(normal.response);

  const headers = { purpose: "prefetch" };
  assert.equal(matches("/settings", headers), true);
  const prefetch = await invoke("/settings", { headers });
  assert.equal(prefetch.sessionCheckCount, 1);
  assert.equal(prefetch.response.status, 307);
  assert.equal(
    prefetch.response.headers.has("content-security-policy-report-only"),
    false
  );
});

test("admin subpaths receive CSP and retain session checks", async () => {
  const pathname = "/admin/storage-cleanup";
  assert.equal(matches(pathname), true);

  const anonymous = await invoke(pathname);
  assert.equal(anonymous.sessionCheckCount, 1);
  assert.equal(anonymous.response.status, 307);
  assert.equal(
    anonymous.response.headers.get("location"),
    "https://www.kabehub.com/login?next=%2Fadmin%2Fstorage-cleanup"
  );
  assertReportOnlyCsp(anonymous.response);

  const authenticated = await invoke(pathname, {
    user: { id: "admin-user" },
  });
  assert.equal(authenticated.sessionCheckCount, 1);
  assert.equal(authenticated.response.status, 200);
  assertReportOnlyCsp(authenticated.response);
});

test("explore pages receive CSP without a session check", async () => {
  assert.equal(matches("/explore"), true);
  const normal = await invoke("/explore");
  assert.equal(normal.sessionCheckCount, 0);
  assert.equal(normal.response.status, 200);
  assertReportOnlyCsp(normal.response);

  const headers = { "next-router-prefetch": "1" };
  assert.equal(matches("/explore", headers), false);
  const prefetch = await invoke("/explore", { headers });
  assert.equal(prefetch.sessionCheckCount, 0);
  assert.equal(
    prefetch.response.headers.has("content-security-policy-report-only"),
    false
  );
});

test("Google auth callback receives CSP without a session check", async () => {
  assert.equal(matches("/auth/callback?code=test"), true);

  const result = await invoke("/auth/callback?code=test");

  assert.equal(result.sessionCheckCount, 0);
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.has("location"), false);
  assertReportOnlyCsp(result.response);
});

test("optional-auth explore API checks session without redirect", async () => {
  assert.equal(matches("/api/explore"), true);
  const result = await invoke("/api/explore");
  assert.equal(result.sessionCheckCount, 1);
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.has("location"), false);
  assert.equal(
    result.response.headers.has("content-security-policy-report-only"),
    false
  );
});

test("protected APIs return JSON 401 for unauthenticated users", async () => {
  for (const pathname of ["/api/chat", "/api/stats"]) {
    assert.equal(matches(pathname), true);
    const result = await invoke(pathname, { setRefreshedCookie: true });
    assert.equal(result.sessionCheckCount, 1);
    await assertJsonUnauthorized(result.response);

    const setCookie = result.response.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /sb-refresh=updated/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Path=\//i);
  }
});

test("protected API auth errors return JSON 401 with cookies and no CSP", async () => {
  const result = await invoke("/api/chat", {
    authError: { message: "invalid session" },
    setRefreshedCookie: true,
  });

  assert.equal(result.sessionCheckCount, 1);
  await assertJsonUnauthorized(result.response);
  assert.match(
    result.response.headers.get("set-cookie") ?? "",
    /sb-refresh=updated/
  );
  assert.equal(
    result.response.headers.has("content-security-policy-report-only"),
    false
  );
});

test("protected page auth errors redirect to login with CSP", async () => {
  const result = await invoke("/stats", {
    authError: { message: "invalid session" },
  });

  assert.equal(result.sessionCheckCount, 1);
  assert.equal(result.response.status, 307);
  assert.equal(
    result.response.headers.get("location"),
    "https://www.kabehub.com/login?next=%2Fstats"
  );
  assertReportOnlyCsp(result.response);
});

test("authenticated protected API requests pass through the proxy", async () => {
  assert.equal(matches("/api/chat"), true);
  const result = await invoke("/api/chat", { user: { id: "user-1" } });
  assert.equal(result.sessionCheckCount, 1);
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.has("location"), false);
});

test("CSP reports bypass CSP and Supabase auth", async () => {
  assert.equal(matches("/api/csp-report"), false);
  const result = await invoke("/api/csp-report");
  assert.equal(result.sessionCheckCount, 0);
  assert.equal(result.response.status, 200);
  assert.equal(
    result.response.headers.has("content-security-policy-report-only"),
    false
  );
});

test("GitHub callback matcher and session-check exclusions share a path boundary", async () => {
  for (const pathname of [
    "/api/auth/github/callback",
    "/api/auth/github/callback/provider",
  ]) {
    assert.equal(matches(pathname), false);
    const result = await invoke(pathname);
    assert.equal(result.sessionCheckCount, 0);
    assert.equal(result.response.status, 200);
  }

  const lookalike = "/api/auth/github/callback-evil";
  assert.equal(matches(lookalike), true);
  const protectedResult = await invoke(lookalike);
  assert.equal(protectedResult.sessionCheckCount, 1);
  await assertJsonUnauthorized(protectedResult.response);
});

test("newly protected MCP token operations and share fork return JSON 401", async () => {
  for (const { pathname, method } of [
    { pathname: "/api/mcp-tokens", method: "GET" },
    { pathname: "/api/mcp-tokens", method: "POST" },
    { pathname: "/api/mcp-tokens", method: "DELETE" },
    { pathname: "/api/share/abc/fork", method: "POST" },
  ]) {
    assert.equal(matches(pathname), true);
    const result = await invoke(pathname, { method });
    assert.equal(result.sessionCheckCount, 1);
    await assertJsonUnauthorized(result.response);
  }
});

test("authenticated MCP token operations and share fork pass through the proxy", async () => {
  for (const { pathname, method } of [
    { pathname: "/api/mcp-tokens", method: "GET" },
    { pathname: "/api/mcp-tokens", method: "POST" },
    { pathname: "/api/mcp-tokens", method: "DELETE" },
    { pathname: "/api/share/abc/fork", method: "POST" },
  ]) {
    assert.equal(matches(pathname), true);
    const result = await invoke(pathname, {
      method,
      user: { id: "user-1" },
    });
    assert.equal(result.sessionCheckCount, 1);
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.has("location"), false);
  }
});

test("login redirect behavior remains unchanged", async () => {
  const anonymous = await invoke("/login");
  assert.equal(anonymous.sessionCheckCount, 1);
  assert.equal(anonymous.response.status, 200);

  const authenticated = await invoke("/login", { user: { id: "user-1" } });
  assert.equal(authenticated.sessionCheckCount, 1);
  assert.equal(authenticated.response.status, 307);
  assert.equal(
    authenticated.response.headers.get("location"),
    "https://www.kabehub.com/"
  );
});

test("login stays visible when Supabase returns both a user and auth error", async () => {
  const result = await invoke("/login", {
    user: { id: "stale-user" },
    authError: { message: "invalid session" },
  });

  assert.equal(result.sessionCheckCount, 1);
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.has("location"), false);
  assertReportOnlyCsp(result.response);
});

test("CSP mode is fail-safe and nonce changes per request", async () => {
  delete process.env.CSP_REPORT_ONLY;
  const first = assertReportOnlyCsp((await invoke("/explore")).response);

  process.env.CSP_REPORT_ONLY = "true";
  assertReportOnlyCsp((await invoke("/explore")).response);

  process.env.CSP_REPORT_ONLY = "typo";
  assertReportOnlyCsp((await invoke("/explore")).response);

  process.env.CSP_REPORT_ONLY = "false";
  const enforced = (await invoke("/explore")).response;
  assert.ok(enforced.headers.get("content-security-policy"));
  assert.equal(
    enforced.headers.has("content-security-policy-report-only"),
    false
  );

  delete process.env.CSP_REPORT_ONLY;
  const second = assertReportOnlyCsp((await invoke("/explore")).response);
  const firstNonce = first.match(/'nonce-([^']+)'/)[1];
  const secondNonce = second.match(/'nonce-([^']+)'/)[1];
  assert.notEqual(firstNonce, secondNonce);
});

test("Reporting-Endpoints is emitted only when configured", async () => {
  delete process.env.CSP_REPORT_ENDPOINT;
  const local = (await invoke("/explore")).response;
  assert.equal(local.headers.has("reporting-endpoints"), false);
  assert.doesNotMatch(assertReportOnlyCsp(local), /report-to csp-endpoint/);

  process.env.CSP_REPORT_ENDPOINT =
    "https://www.kabehub.com/api/csp-report";
  const production = (await invoke("/explore")).response;
  assert.equal(
    production.headers.get("reporting-endpoints"),
    'csp-endpoint="https://www.kabehub.com/api/csp-report"'
  );
  assert.match(assertReportOnlyCsp(production), /report-to csp-endpoint/);
  delete process.env.CSP_REPORT_ENDPOINT;
});

test("untrusted CSP request headers are replaced with the generated policy", async () => {
  const result = await invoke("/explore", {
    headers: {
      "content-security-policy": "default-src https://attacker.example",
      "content-security-policy-report-only":
        "default-src https://attacker.example",
    },
  });
  const responsePolicy = assertReportOnlyCsp(result.response);
  const forwardedPolicy = result.response.headers.get(
    "x-middleware-request-content-security-policy-report-only"
  );
  const forwardedEnforcePolicy = result.response.headers.get(
    "x-middleware-request-content-security-policy"
  );
  const forwardedNonce = result.response.headers.get(
    "x-middleware-request-x-nonce"
  );

  assert.equal(forwardedPolicy, responsePolicy);
  assert.equal(forwardedEnforcePolicy, null);
  assert.ok(forwardedNonce);
  assert.match(responsePolicy, new RegExp(`'nonce-${forwardedNonce}'`));
  assert.doesNotMatch(responsePolicy, /attacker\.example/);
});

pendingTests
  .reduce(
    (previous, { name, fn }) =>
      previous
        .then(fn)
        .then(() => console.log(`ok - ${name}`))
        .catch((error) => {
          console.error(`not ok - ${name}`);
          throw error;
        }),
    Promise.resolve()
  )
  .then(() => console.log(`${pendingTests.length} proxy tests passed`))
  .catch(() => {
    process.exitCode = 1;
  });
