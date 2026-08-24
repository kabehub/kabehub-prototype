const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

let authMode = "cookie";
let stateCalls = [];

const originalLoad = Module._load;
Module._load = function loadWithGithubConnectMocks(request, parent, isMain) {
  if (request === "@/lib/supabase/route-auth") {
    return {
      async requireRouteUser() {
        return {
          ok: true,
          authMode,
          user: { id: "user-1" },
          finalizeJson(body, init) {
            return Response.json(body, init);
          },
          finalizeResponse(response) {
            return response;
          },
        };
      },
    };
  }

  if (request === "@/lib/github-token-store") {
    return {
      async createOAuthState(userId) {
        stateCalls.push(userId);
        return "oauth-state";
      },
      async deleteGithubToken() {},
      async getGithubTokenStrict() {
        return null;
      },
    };
  }

  if (request === "@/lib/github-oauth") {
    return {
      async checkGithubToken() {
        return "valid";
      },
      async revokeGithubAuthorization() {
        return { ok: true };
      },
    };
  }

  if (request === "@/lib/logger") {
    return { dbOperationFailed() {} };
  }

  return originalLoad.call(this, request, parent, isMain);
};

installTsLoader();
installAliasResolver();

process.env.GITHUB_CLIENT_ID = "client-id";
process.env.GITHUB_REDIRECT_URI =
  "https://www.kabehub.com/api/auth/github/callback";
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
  "route.ts"
));

function request() {
  stateCalls = [];
  return new NextRequest("https://www.kabehub.com/api/auth/github");
}

function assertAuthorizeUrl(rawUrl, redirectUri) {
  const url = new URL(rawUrl);
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.pathname, "/login/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "client-id");
  assert.equal(url.searchParams.get("redirect_uri"), redirectUri);
  assert.equal(url.searchParams.get("scope"), "repo");
  assert.equal(url.searchParams.get("state"), "oauth-state");
}

const pendingTests = [];
function test(name, fn) {
  pendingTests.push({ name, fn });
}

test("Cookie auth keeps the web authorization redirect", async () => {
  authMode = "cookie";
  const response = await GET(request());
  assert.equal(response.status, 302);
  assertAuthorizeUrl(
    response.headers.get("location"),
    "https://www.kabehub.com/api/auth/github/callback"
  );
  assert.deepEqual(stateCalls, ["user-1"]);
});

test("Bearer auth returns the mobile authorization URL as JSON", async () => {
  authMode = "bearer";
  const response = await GET(request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ["url"]);
  assertAuthorizeUrl(
    body.url,
    "https://www.kabehub.com/api/auth/github/mobile-callback"
  );
  assert.deepEqual(stateCalls, ["user-1"]);
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
  console.log(`${pendingTests.length} GitHub connect route tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
