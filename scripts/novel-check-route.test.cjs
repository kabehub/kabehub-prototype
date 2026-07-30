const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage =
  require("node:async_hooks").AsyncLocalStorage;

let currentUser = null;
let setRefreshedCookie = false;
let fetchCallCount = 0;

const originalLoad = Module._load;
Module._load = function loadWithSupabaseMock(request, parent, isMain) {
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
              return { data: { user: currentUser } };
            },
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
const { POST } = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "novel-check",
  "route.ts"
));

const pendingTests = [];
const validBody = {
  texts: [{ name: "chapter.txt", content: "Example manuscript" }],
  modelId: "gemini-test",
  checkItems: ["Consistency"],
};

function test(name, fn) {
  pendingTests.push({ name, fn });
}

function resetMocks(options = {}) {
  currentUser = options.user ?? null;
  setRefreshedCookie = options.setRefreshedCookie ?? false;
  fetchCallCount = 0;
  global.fetch = async () => {
    fetchCallCount += 1;
    return new Response(
      'data: {"candidates":[{"content":{"parts":[{"text":"No issues"}]}}]}\n\n',
      { status: 200 }
    );
  };
}

function invoke(options = {}) {
  const headers = { "content-type": "application/json" };
  if (options.apiKey !== false) {
    headers["x-gemini-api-key"] = "gemini-key";
  }
  const request = new NextRequest(
    "https://www.kabehub.com/api/novel-check",
    {
      method: "POST",
      headers,
      body: JSON.stringify(options.body ?? validBody),
    }
  );
  return POST(request);
}

function assertRefreshedCookie(response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /sb-refresh=updated/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Path=\//i);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
}

test("unauthenticated 401 finalizes cookies without upstream fetch", async () => {
  resetMocks({ setRefreshedCookie: true });

  const response = await invoke();

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assertRefreshedCookie(response);
  assert.equal(fetchCallCount, 0);
});

test("missing API key 400 finalizes cookies without upstream fetch", async () => {
  resetMocks({
    user: { id: "user-1" },
    setRefreshedCookie: true,
  });

  const response = await invoke({ apiKey: false });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Gemini APIキーが設定されていません。",
  });
  assertRefreshedCookie(response);
  assert.equal(fetchCallCount, 0);
});

test("invalid input 400 finalizes cookies without upstream fetch", async () => {
  resetMocks({
    user: { id: "user-1" },
    setRefreshedCookie: true,
  });

  const response = await invoke({
    body: {
      texts: [{ name: "chapter.txt", content: 123 }],
      modelId: "gemini-test",
      checkItems: ["Consistency"],
    },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "texts must be an array of { name: string, content: string }",
  });
  assertRefreshedCookie(response);
  assert.equal(fetchCallCount, 0);
});

test("successful SSE preserves headers and overrides cache for refreshed cookies", async () => {
  resetMocks({
    user: { id: "user-1" },
    setRefreshedCookie: true,
  });

  const response = await invoke();

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    "text/event-stream; charset=utf-8"
  );
  assert.equal(response.headers.get("x-accel-buffering"), "no");
  assertRefreshedCookie(response);

  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(events, [
    { type: "meta", totalChars: 18, estimatedTokens: 22 },
    { type: "chunk", text: "No issues" },
    { type: "done", aborted: false },
  ]);
  assert.equal(fetchCallCount, 1);
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

  console.log(`${pendingTests.length} novel-check route tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
