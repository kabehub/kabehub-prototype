const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

globalThis.AsyncLocalStorage =
  require("node:async_hooks").AsyncLocalStorage;

let currentUser = null;
let sessionCheckCount = 0;
let setRefreshedCookie = false;

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
              return { data: { user: currentUser } };
            },
          },
        };
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(
  request,
  parent,
  isMain,
  options
) {
  if (request.startsWith("@/")) {
    request = path.join(__dirname, "..", request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2018,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
delete process.env.CSP_REPORT_ENDPOINT;
delete process.env.CSP_REPORT_ONLY;

const { NextRequest } = require("next/server");
const {
  unstable_doesMiddlewareMatch: doesProxyMatch,
} = require("next/experimental/testing/server");
const { config, proxy } = require(path.join(__dirname, "..", "proxy.ts"));

const pendingTests = [];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

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
  sessionCheckCount = 0;
  setRefreshedCookie = options.setRefreshedCookie ?? false;
  const request = new NextRequest(`https://www.kabehub.com${pathname}`, {
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

test("protected APIs return bodyless 401 for unauthenticated users", async () => {
  for (const pathname of ["/api/chat", "/api/stats"]) {
    assert.equal(matches(pathname), true);
    const result = await invoke(pathname, { setRefreshedCookie: true });
    assert.equal(result.sessionCheckCount, 1);
    assert.equal(result.response.status, 401);
    assert.equal(result.response.headers.has("location"), false);
    assert.equal(result.response.headers.get("cache-control"), "no-store");
    assert.equal(await result.response.text(), "");

    const setCookie = result.response.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /sb-refresh=updated/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Path=\//i);
  }
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
  assert.equal(protectedResult.response.status, 401);
  assert.equal(protectedResult.response.headers.has("location"), false);
});

test("known broad MCP and share exclusions remain unchanged", async () => {
  for (const pathname of [
    "/api/mcp-tokens",
    "/api/share/example-token/fork",
  ]) {
    assert.equal(matches(pathname), false);
    const result = await invoke(pathname);
    assert.equal(result.sessionCheckCount, 0);
    assert.equal(result.response.status, 200);
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
