const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

let completionResult = { ok: true };
let completionCalls = [];

const originalLoad = Module._load;
Module._load = function loadWithMobileCallbackMocks(request, parent, isMain) {
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

process.env.GITHUB_MOBILE_REDIRECT_URI =
  "https://www.kabehub.com/api/auth/github/mobile-callback";

const { NextRequest } = require("next/server");
const { GET } = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "auth",
  "github",
  "mobile-callback",
  "route.ts"
));

async function invoke(query = "?code=oauth-code&state=oauth-state") {
  completionCalls = [];
  return GET(
    new NextRequest(
      `https://www.kabehub.com/api/auth/github/mobile-callback${query}`
    )
  );
}

const pendingTests = [];
function test(name, fn) {
  pendingTests.push({ name, fn });
}

test("successful completion redirects to connected with HTTP 302", async () => {
  completionResult = { ok: true };
  const response = await invoke();
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://www.kabehub.com/mobile/auth/github/callback?status=connected"
  );
  assert.deepEqual(completionCalls, [
    {
      code: "oauth-code",
      state: "oauth-state",
      redirectUri:
        "https://www.kabehub.com/api/auth/github/mobile-callback",
    },
  ]);
});

test("failed completion redirects to error with HTTP 302 instead of throwing", async () => {
  completionResult = { ok: false, reason: "save_failed" };
  const response = await invoke();
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://www.kabehub.com/mobile/auth/github/callback?status=error"
  );
});

test("missing callback parameters redirect to error without completion", async () => {
  completionResult = { ok: true };
  const response = await invoke("?state=oauth-state");
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://www.kabehub.com/mobile/auth/github/callback?status=error"
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
  console.log(`${pendingTests.length} GitHub mobile callback tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
