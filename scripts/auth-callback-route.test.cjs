const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

globalThis.AsyncLocalStorage =
  require("node:async_hooks").AsyncLocalStorage;

let exchangeError = null;
let sessionUserId = "user-1";
let profile = { handle: "alice" };
let profileError = null;
let setAuthCookie = false;
let createClientCount = 0;
let profileFetchCount = 0;
let cookieWrites = [];

const originalLoad = Module._load;
Module._load = function loadWithAuthMocks(request, parent, isMain) {
  if (request === "@supabase/ssr") {
    return {
      createServerClient(_url, _key, options) {
        createClientCount += 1;
        return {
          auth: {
            async exchangeCodeForSession() {
              if (setAuthCookie) {
                options.cookies.setAll([
                  {
                    name: "sb-auth",
                    value: "session-cookie",
                    options: { path: "/", httpOnly: true },
                  },
                ]);
              }

              return {
                error: exchangeError,
                data: {
                  session: sessionUserId
                    ? { user: { id: sessionUserId } }
                    : null,
                },
              };
            },
          },
          from(table) {
            assert.equal(table, "profiles");
            return {
              select(columns) {
                assert.equal(columns, "handle");
                return {
                  eq(column, value) {
                    assert.equal(column, "id");
                    assert.equal(value, sessionUserId);
                    return {
                      async single() {
                        profileFetchCount += 1;
                        return { data: profile, error: profileError };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
  }

  if (request === "next/headers") {
    return {
      async cookies() {
        return {
          getAll() {
            return [];
          },
          set(name, value, options) {
            cookieWrites.push({ name, value, options });
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
  "auth",
  "callback",
  "route.ts"
));

const pendingTests = [];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

function resetScenario() {
  exchangeError = null;
  sessionUserId = "user-1";
  profile = { handle: "alice" };
  profileError = null;
  setAuthCookie = false;
}

async function invoke(params = {}) {
  createClientCount = 0;
  profileFetchCount = 0;
  cookieWrites = [];

  const url = new URL("https://www.kabehub.com/auth/callback");
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  return GET(new NextRequest(url));
}

function assertRedirect(response, expectedUrl) {
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), expectedUrl);
}

test("exchangeCodeForSession failure redirects to login", async () => {
  resetScenario();
  exchangeError = new Error("invalid auth code");

  const response = await invoke({ code: "bad-code", next: "/stats" });

  assertRedirect(response, "https://www.kabehub.com/login");
  assert.equal(createClientCount, 1);
  assert.equal(profileFetchCount, 0);
});

test("missing code redirects to login without creating a client", async () => {
  resetScenario();

  const response = await invoke({ next: "/stats" });

  assertRedirect(response, "https://www.kabehub.com/login");
  assert.equal(createClientCount, 0);
  assert.equal(profileFetchCount, 0);
});

test("users without a handle are sent to onboarding before protected next", async () => {
  resetScenario();
  profile = { handle: null };

  const response = await invoke({ code: "valid-code", next: "/stats" });

  assertRedirect(
    response,
    "https://www.kabehub.com/settings?onboarding=true"
  );
  assert.equal(profileFetchCount, 1);
});

test("users without a handle cannot bypass onboarding through next", async () => {
  resetScenario();
  profile = { handle: "" };

  const response = await invoke({
    code: "valid-code",
    next: "/share/abc",
  });

  assertRedirect(
    response,
    "https://www.kabehub.com/settings?onboarding=true"
  );
});

test("users with a handle return to protected next destinations", async () => {
  resetScenario();
  setAuthCookie = true;

  for (const next of [
    "/stats",
    "/settings",
    "/admin/storage-cleanup",
  ]) {
    const response = await invoke({ code: "valid-code", next });

    assertRedirect(response, `https://www.kabehub.com${next}`);
    assert.deepEqual(cookieWrites, [
      {
        name: "sb-auth",
        value: "session-cookie",
        options: { path: "/", httpOnly: true },
      },
    ]);
  }
});

test("users with a handle can return to a public share page", async () => {
  resetScenario();

  const response = await invoke({
    code: "valid-code",
    next: "/share/abc",
  });

  assertRedirect(response, "https://www.kabehub.com/share/abc");
});

test("untrusted or non-whitelisted next values fall back to root", async () => {
  resetScenario();

  for (const next of [
    "//evil.com",
    "https://evil.com",
    "/share/abc/extra",
    "/share/../../legal",
    "/login",
    "/explore",
    "/stats?tab=recent",
    "/stats#recent",
  ]) {
    const response = await invoke({ code: "valid-code", next });
    assertRedirect(
      response,
      "https://www.kabehub.com/",
      `${next}: fallback`
    );
  }
});

test("profile lookup errors are treated as missing handles", async () => {
  resetScenario();
  profile = { handle: "alice" };
  profileError = new Error("profile lookup failed");

  const response = await invoke({ code: "valid-code", next: "/stats" });

  assertRedirect(
    response,
    "https://www.kabehub.com/settings?onboarding=true"
  );
  assert.equal(profileFetchCount, 1);
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
  .then(() =>
    console.log(`${pendingTests.length} auth callback tests passed`)
  )
  .catch(() => {
    process.exitCode = 1;
  });
