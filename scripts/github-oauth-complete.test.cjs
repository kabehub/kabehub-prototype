const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

let consumeImplementation;
let saveImplementation;
let fetchPlan;
let externalApiLogs;
let dbLogs;
let saveCalls;

const originalLoad = Module._load;
Module._load = function loadWithGithubOAuthMocks(request, parent, isMain) {
  if (request === "@/lib/github-token-store") {
    return {
      async consumeOAuthState(state) {
        return consumeImplementation(state);
      },
      async saveGithubToken(...args) {
        saveCalls.push(args);
        return saveImplementation(...args);
      },
    };
  }

  if (request === "@/lib/logger") {
    return {
      externalApiFailed(params) {
        externalApiLogs.push(params);
      },
      dbOperationFailed(params) {
        dbLogs.push(params);
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

installTsLoader();
installAliasResolver();

const { completeGithubOAuth } = require(path.join(
  __dirname,
  "..",
  "lib",
  "github-oauth-complete.ts"
));

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resetScenario() {
  consumeImplementation = async () => "user-1";
  saveImplementation = async () => {};
  fetchPlan = [
    jsonResponse({ access_token: "github-token", scope: "repo" }),
    jsonResponse({ login: "octocat" }),
  ];
  externalApiLogs = [];
  dbLogs = [];
  saveCalls = [];
  global.fetch = async () => {
    const next = fetchPlan.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error("missing fetch plan");
    return next;
  };
}

async function complete() {
  return completeGithubOAuth({
    code: "oauth-code",
    state: "oauth-state",
    redirectUri: "https://www.kabehub.com/api/auth/github/mobile-callback",
  });
}

const pendingTests = [];
function test(name, fn) {
  pendingTests.push({ name, fn });
}

test("valid state exchanges and saves the GitHub token", async () => {
  resetScenario();
  assert.deepEqual(await complete(), { ok: true });
  assert.deepEqual(saveCalls, [
    ["user-1", "github-token", "repo", "octocat"],
  ]);
});

test("invalid state returns invalid_state", async () => {
  resetScenario();
  consumeImplementation = async () => null;
  assert.deepEqual(await complete(), { ok: false, reason: "invalid_state" });
  assert.equal(saveCalls.length, 0);
});

test("state consumption exceptions do not escape", async () => {
  resetScenario();
  consumeImplementation = async () => {
    throw new TypeError("database unavailable");
  };
  assert.deepEqual(await complete(), { ok: false, reason: "invalid_state" });
  assert.deepEqual(dbLogs, [
    {
      route: "github-oauth-complete",
      operation: "consume-oauth-state",
      table: "github_oauth_states",
      errorType: "TypeError",
    },
  ]);
});

test("token exchange fetch exceptions return token_exchange", async () => {
  resetScenario();
  fetchPlan = [new TypeError("network failure")];
  assert.deepEqual(await complete(), { ok: false, reason: "token_exchange" });
  assert.equal(externalApiLogs[0].errorType, "TypeError");
});

test("token endpoint non-2xx returns token_exchange", async () => {
  resetScenario();
  fetchPlan = [jsonResponse({ message: "failure" }, 502)];
  assert.deepEqual(await complete(), { ok: false, reason: "token_exchange" });
  assert.equal(externalApiLogs[0].status, 502);
});

test("token endpoint JSON parse failure returns token_exchange", async () => {
  resetScenario();
  fetchPlan = [new Response("not json", { status: 200 })];
  assert.deepEqual(await complete(), { ok: false, reason: "token_exchange" });
});

test("token endpoint OAuth error returns token_exchange", async () => {
  resetScenario();
  fetchPlan = [jsonResponse({ error: "bad_verification_code" })];
  assert.deepEqual(await complete(), { ok: false, reason: "token_exchange" });
});

test("token endpoint error field is rejected even when empty", async () => {
  resetScenario();
  fetchPlan = [jsonResponse({ error: "", access_token: "github-token" })];
  assert.deepEqual(await complete(), { ok: false, reason: "token_exchange" });
});

test("missing access token returns token_exchange", async () => {
  resetScenario();
  fetchPlan = [jsonResponse({ scope: "repo" })];
  assert.deepEqual(await complete(), { ok: false, reason: "token_exchange" });
});

test("non-object token JSON returns token_exchange without throwing", async () => {
  resetScenario();
  fetchPlan = [jsonResponse(null)];
  assert.deepEqual(await complete(), { ok: false, reason: "token_exchange" });
});

test("GitHub user fetch exceptions return github_user", async () => {
  resetScenario();
  fetchPlan[1] = new TypeError("network failure");
  assert.deepEqual(await complete(), { ok: false, reason: "github_user" });
  assert.equal(externalApiLogs[0].errorType, "TypeError");
});

test("GitHub user non-2xx returns github_user", async () => {
  resetScenario();
  fetchPlan[1] = jsonResponse({ message: "failure" }, 503);
  assert.deepEqual(await complete(), { ok: false, reason: "github_user" });
  assert.equal(externalApiLogs[0].status, 503);
});

test("GitHub user JSON parse failure returns github_user", async () => {
  resetScenario();
  fetchPlan[1] = new Response("not json", { status: 200 });
  assert.deepEqual(await complete(), { ok: false, reason: "github_user" });
});

test("non-object GitHub user JSON returns github_user without throwing", async () => {
  resetScenario();
  fetchPlan[1] = jsonResponse(null);
  assert.deepEqual(await complete(), { ok: false, reason: "github_user" });
});

test("token save exceptions return save_failed", async () => {
  resetScenario();
  saveImplementation = async () => {
    throw new TypeError("database unavailable");
  };
  assert.deepEqual(await complete(), { ok: false, reason: "save_failed" });
  assert.deepEqual(dbLogs, [
    {
      route: "github-oauth-complete",
      operation: "save-github-token",
      table: "user_github_tokens",
      errorType: "TypeError",
    },
  ]);
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
  console.log(`${pendingTests.length} GitHub OAuth completion tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
