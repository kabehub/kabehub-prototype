const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

globalThis.AsyncLocalStorage =
  require("node:async_hooks").AsyncLocalStorage;

let currentUser = null;
let setRefreshedCookie = false;
let databaseResult = { data: [], error: null };

function createQuery() {
  const query = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    gte() {
      return query;
    },
    order() {
      return query;
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(databaseResult).then(onFulfilled, onRejected);
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
          from() {
            return createQuery();
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

const { NextRequest } = require("next/server");
const { GET } = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "stats",
  "route.ts"
));

const pendingTests = [];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

function resetMocks(options = {}) {
  currentUser = options.user ?? null;
  setRefreshedCookie = options.setRefreshedCookie ?? false;
  databaseResult = options.databaseResult ?? { data: [], error: null };
}

function invoke() {
  const request = new NextRequest(
    "https://www.kabehub.com/api/stats?period=all&tz=Asia%2FTokyo"
  );
  return GET(request);
}

function assertRefreshedCookie(response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /sb-refresh=updated/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Path=\//i);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
}

test("unauthenticated 401 preserves the response and refreshed cookie", async () => {
  resetMocks({ setRefreshedCookie: true });

  const response = await invoke();

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assertRefreshedCookie(response);
});

test("authenticated success preserves the response and refreshed cookie", async () => {
  resetMocks({
    user: { id: "user-1" },
    setRefreshedCookie: true,
    databaseResult: { data: [], error: null },
  });

  const response = await invoke();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    sends: 0,
    total_tokens: 0,
    by_model: [],
    hourly: {},
    since: "1970-01-01T00:00:00.000Z",
  });
  assertRefreshedCookie(response);
});

test("database 500 preserves the response and refreshed cookie", async () => {
  resetMocks({
    user: { id: "user-1" },
    setRefreshedCookie: true,
    databaseResult: {
      data: null,
      error: { message: "stats query failed" },
    },
  });

  const response = await invoke();

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "stats query failed" });
  assertRefreshedCookie(response);
});

test("responses without refreshed cookies do not add cookie or cache headers", async () => {
  resetMocks({ user: { id: "user-1" } });

  const response = await invoke();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    sends: 0,
    total_tokens: 0,
    by_model: [],
    hourly: {},
    since: "1970-01-01T00:00:00.000Z",
  });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("cache-control"), null);
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
