const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

globalThis.AsyncLocalStorage =
  require("node:async_hooks").AsyncLocalStorage;

let currentUser = null;
let currentAuthError = null;
let setRefreshedCookie = false;
let fetchResult = { content: "", truncated: false };
let fetchCallCount = 0;
let fetchedUrls = [];

const originalLoad = Module._load;
Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "@supabase/ssr") {
    return {
      createServerClient(_url, _key, options) {
        return {
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
        };
      },
    };
  }

  if (request === "@/lib/github") {
    return {
      async fetchGithubFile(url) {
        fetchCallCount += 1;
        fetchedUrls.push(url);
        return fetchResult;
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

const { NextRequest } = require("next/server");
const { POST } = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "fetch-github",
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
  fetchResult = options.fetchResult ?? { content: "", truncated: false };
  fetchCallCount = 0;
  fetchedUrls = [];
}

async function invoke(options = {}) {
  const request = new NextRequest(
    "https://www.kabehub.com/api/fetch-github",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: options.rawBody ?? JSON.stringify(options.body),
    }
  );
  return POST(request);
}

function assertNoRefreshCacheHeader(response) {
  assert.equal(response.headers.get("cache-control"), null);
}

test("unauthenticated requests are rejected before GitHub fetch", async () => {
  resetMocks();

  const response = await invoke({
    body: { url: "https://github.com/example/repo/blob/main/README.md" },
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.equal(fetchCallCount, 0);
  assertNoRefreshCacheHeader(response);
});

test("authenticated success preserves response and refreshed cookies", async () => {
  const url = "https://github.com/example/repo/blob/main/README.md";
  resetMocks({
    user: { id: "user-1" },
    setRefreshedCookie: true,
    fetchResult: { content: "# Example", truncated: false },
  });

  const response = await invoke({ body: { url } });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    content: "# Example",
    truncated: false,
  });
  assert.equal(fetchCallCount, 1);
  assert.deepEqual(fetchedUrls, [url]);

  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /sb-refresh=updated/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Path=\//i);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("invalid JSON preserves the existing 400 contract", async () => {
  resetMocks({ user: { id: "user-1" } });

  const response = await invoke({ rawBody: "{" });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Invalid request body",
  });
  assert.equal(fetchCallCount, 0);
  assertNoRefreshCacheHeader(response);
});

test("a non-string URL preserves the existing 400 contract", async () => {
  resetMocks({ user: { id: "user-1" } });

  const response = await invoke({ body: { url: 123 } });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "url is required" });
  assert.equal(fetchCallCount, 0);
  assertNoRefreshCacheHeader(response);
});

test("supported validation errors preserve the existing 400 contract", async () => {
  for (const error of [
    "サポートされていないURLまたはブランチです",
    "サポートされていない拡張子です",
  ]) {
    resetMocks({
      user: { id: "user-1" },
      fetchResult: { error },
    });

    const response = await invoke({
      body: { url: "https://github.com/example/repo/blob/main/file.bin" },
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error });
    assert.equal(fetchCallCount, 1);
    assertNoRefreshCacheHeader(response);
  }
});

test("other GitHub errors preserve the existing 502 contract", async () => {
  resetMocks({
    user: { id: "user-1" },
    fetchResult: { error: "GitHub API request failed" },
  });

  const response = await invoke({
    body: { url: "https://github.com/example/repo/blob/main/README.md" },
  });

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: "GitHub API request failed",
  });
  assert.equal(fetchCallCount, 1);
  assertNoRefreshCacheHeader(response);
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

  console.log(`${pendingTests.length} fetch-github route tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
