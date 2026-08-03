const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage =
  require("node:async_hooks").AsyncLocalStorage;

let authCalls = 0;

const originalLoad = Module._load;
Module._load = function loadWithSupabaseMock(request, parent, isMain) {
  if (request === "@supabase/ssr") {
    return {
      createServerClient(_url, _key, options) {
        return {
          auth: {
            async getUser() {
              authCalls += 1;
              options.cookies.setAll([
                {
                  name: "sb-refresh",
                  value: "updated",
                  options: { path: "/", httpOnly: true },
                },
              ]);
              return {
                data: { user: { id: "user-1" } },
                error: null,
              };
            },
          },
          from() {
            throw new Error("database access was not expected");
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

const { NextRequest } = require("next/server");
const arena = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "arena",
  "route.ts"
));
const imageGen = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "image-gen",
  "route.ts"
));

let externalFetchCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  externalFetchCalls += 1;
  throw new Error("external API access was not expected");
};

const pendingTests = [];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

function assertRefreshedCookie(response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /sb-refresh=updated/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Path=\//i);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
}

test("arena invalid JSON preserves the refreshed auth cookie", async () => {
  const request = new NextRequest("https://www.kabehub.com/api/arena", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ invalid",
  });

  const originalConsoleError = console.error;
  console.error = () => {};
  let response;
  try {
    response = await arena.POST(request);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid JSON body" });
  assertRefreshedCookie(response);
});

test("image-gen invalid provider preserves the refreshed auth cookie", async () => {
  const request = new NextRequest("https://www.kabehub.com/api/image-gen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "invalid", prompt: "unused" }),
  });

  const response = await imageGen.POST(request);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "不正なproviderです" });
  assertRefreshedCookie(response);
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

  assert.equal(authCalls, pendingTests.length);
  assert.equal(externalFetchCalls, 0);
  globalThis.fetch = originalFetch;
  console.log(`${pendingTests.length} route auth cookie regression tests passed`);
})().catch((error) => {
  globalThis.fetch = originalFetch;
  console.error(error);
  process.exitCode = 1;
});
