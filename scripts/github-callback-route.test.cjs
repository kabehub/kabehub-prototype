const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

let completionResult = { ok: true };
let completionCalls = [];

const originalLoad = Module._load;
Module._load = function loadWithGithubCallbackMocks(request, parent, isMain) {
  if (request === "@/lib/github-oauth-complete") {
    return {
      async completeGithubOAuth(params) {
        completionCalls.push(params);
        return completionResult;
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

installTsLoader();
installAliasResolver();

process.env.GITHUB_REDIRECT_URI =
  "https://www.kabehub.com/api/auth/github/callback";

const { NextRequest } = require("next/server");
const { GET } = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "auth",
  "github",
  "callback",
  "route.ts"
));

async function invoke(query = "?code=oauth-code&state=oauth-state") {
  completionCalls = [];
  return GET(
    new NextRequest(
      `https://www.kabehub.com/api/auth/github/callback${query}`
    )
  );
}

const pendingTests = [];
function test(name, fn) {
  pendingTests.push({ name, fn });
}

test("web callback preserves its connected settings redirect", async () => {
  completionResult = { ok: true };
  const response = await invoke();
  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://www.kabehub.com/settings?github=connected"
  );
  assert.deepEqual(completionCalls, [
    {
      code: "oauth-code",
      state: "oauth-state",
      redirectUri: "https://www.kabehub.com/api/auth/github/callback",
    },
  ]);
});

test("web callback preserves its error settings redirect", async () => {
  completionResult = { ok: false, reason: "github_user" };
  const response = await invoke();
  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://www.kabehub.com/settings?github=error"
  );
});

test("web callback rejects missing parameters without running completion", async () => {
  completionResult = { ok: true };
  const response = await invoke("?code=oauth-code");
  assert.equal(
    response.headers.get("location"),
    "https://www.kabehub.com/settings?github=error"
  );
  assert.equal(completionCalls.length, 0);
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
  console.log(`${pendingTests.length} GitHub web callback tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
