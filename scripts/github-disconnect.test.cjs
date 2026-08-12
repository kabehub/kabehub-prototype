const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

let tokenReadResult = { data: null, error: null };
let tokenDeleteResult = { error: null };
let decryptShouldFail = false;
let deleteCallCount = 0;
let fetchPlan = [];
let fetchCalls = [];
let dbLogs = [];
let externalApiLogs = [];

function createTokenStoreClient() {
  return {
    from(table) {
      assert.equal(table, "user_github_tokens");
      return {
        select(columns) {
          assert.equal(columns, "access_token");
          return {
            eq(column, value) {
              assert.equal(column, "user_id");
              assert.equal(value, "user-1");
              return {
                async maybeSingle() {
                  return tokenReadResult;
                },
              };
            },
          };
        },
        delete() {
          return {
            async eq(column, value) {
              assert.equal(column, "user_id");
              assert.equal(value, "user-1");
              deleteCallCount += 1;
              return tokenDeleteResult;
            },
          };
        },
      };
    },
  };
}

const originalLoad = Module._load;
Module._load = function loadWithGithubDisconnectMocks(request, parent, isMain) {
  if (request === "@/lib/supabase/route-auth") {
    return {
      async requireRouteUser() {
        return {
          ok: true,
          user: { id: "user-1" },
          finalizeJson(body, init) {
            return Response.json(body, init);
          },
        };
      },
    };
  }

  if (request === "@/lib/mcp-auth") {
    return {
      serviceRoleClient() {
        return createTokenStoreClient();
      },
    };
  }

  if (request === "@/lib/github-token-crypto") {
    return {
      async decryptToken() {
        if (decryptShouldFail) throw new Error("decrypt failed");
        return "github-access-token";
      },
      async encryptToken(value) {
        return value;
      },
    };
  }

  if (request === "@/lib/logger") {
    return {
      dbOperationFailed(params) {
        dbLogs.push(params);
      },
      dbOperationFailedBestEffort() {},
      externalApiFailed(params) {
        externalApiLogs.push(params);
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

installTsLoader();
installAliasResolver();

process.env.GITHUB_CLIENT_ID = "client-id";
process.env.GITHUB_CLIENT_SECRET = "client-secret";

global.fetch = async (url, options) => {
  fetchCalls.push({ url: String(url), options });
  const result = fetchPlan.shift();
  if (result instanceof Error) throw result;
  if (typeof result !== "number") throw new Error("missing fetch plan");
  return { status: result };
};

const { DELETE } = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "auth",
  "github",
  "route.ts"
));

const pendingTests = [];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

function resetScenario(options = {}) {
  tokenReadResult = options.tokenReadResult ?? {
    data: { access_token: "encrypted-token" },
    error: null,
  };
  tokenDeleteResult = options.tokenDeleteResult ?? { error: null };
  decryptShouldFail = options.decryptShouldFail ?? false;
  deleteCallCount = 0;
  fetchPlan = [...(options.fetchPlan ?? [])];
  fetchCalls = [];
  dbLogs = [];
  externalApiLogs = [];
}

async function invoke() {
  return DELETE({});
}

async function assertResponse(response, status, body) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), body);
}

test("missing DB token skips GitHub and succeeds", async () => {
  resetScenario({ tokenReadResult: { data: null, error: null } });

  const response = await invoke();

  await assertResponse(response, 200, { ok: true });
  assert.equal(fetchCalls.length, 0);
  assert.equal(deleteCallCount, 0);
});

test("DB read failure skips GitHub and preserves the DB row", async () => {
  resetScenario({
    tokenReadResult: {
      data: null,
      error: { code: "DB_READ_FAILED", message: "read failed" },
    },
  });

  const response = await invoke();

  await assertResponse(response, 500, { error: "GitHub連携の解除に失敗しました" });
  assert.equal(fetchCalls.length, 0);
  assert.equal(deleteCallCount, 0);
  assert.deepEqual(dbLogs, [
    {
      route: "github-token-store",
      operation: "get-github-token-strict",
      table: "user_github_tokens",
      errorCode: "DB_READ_FAILED",
    },
  ]);
});

test("decrypt failure skips GitHub and preserves the DB row", async () => {
  resetScenario({ decryptShouldFail: true });

  const response = await invoke();

  await assertResponse(response, 500, { error: "GitHub連携の解除に失敗しました" });
  assert.equal(fetchCalls.length, 0);
  assert.equal(deleteCallCount, 0);
  assert.deepEqual(dbLogs, [
    {
      route: "github-token-store",
      operation: "decrypt-github-token",
      table: "user_github_tokens",
      errorType: "Error",
    },
  ]);
});

test("a 204 grant revoke deletes the DB token and succeeds", async () => {
  resetScenario({ fetchPlan: [204] });

  const response = await invoke();

  await assertResponse(response, 200, { ok: true });
  assert.equal(deleteCallCount, 1);
  assert.equal(fetchCalls.length, 1);
  const [{ url, options }] = fetchCalls;
  assert.equal(url, "https://api.github.com/applications/client-id/grant");
  assert.equal(options.method, "DELETE");
  assert.equal(options.cache, "no-store");
  assert.equal(options.headers.Accept, "application/vnd.github+json");
  assert.equal(options.headers["X-GitHub-Api-Version"], "2026-03-10");
  assert.equal(
    options.headers.Authorization,
    `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`
  );
  assert.deepEqual(JSON.parse(options.body), {
    access_token: "github-access-token",
  });
  assert.ok(options.signal instanceof AbortSignal);
});

test("an invalid token after revoke failure deletes the DB token", async () => {
  resetScenario({ fetchPlan: [422, 404] });

  const response = await invoke();

  await assertResponse(response, 200, { ok: true });
  assert.equal(deleteCallCount, 1);
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0].options.method, "DELETE");
  assert.equal(
    fetchCalls[1].url,
    "https://api.github.com/applications/client-id/token"
  );
  assert.equal(fetchCalls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(fetchCalls[1].options.body), {
    access_token: "github-access-token",
  });
  assert.deepEqual(externalApiLogs, [
    {
      service: "github",
      status: 422,
      errorCode: "GRANT_REVOKE_FAILED",
    },
  ]);
});

test("a valid or indeterminate token after revoke failure preserves the DB row", async () => {
  for (const checkStatus of [200, 422]) {
    resetScenario({ fetchPlan: [500, checkStatus] });

    const response = await invoke();

    await assertResponse(response, 500, { error: "GitHub連携の解除に失敗しました" });
    assert.equal(deleteCallCount, 0);
    assert.equal(fetchCalls.length, 2);
    assert.equal(externalApiLogs[0].errorCode, "GRANT_REVOKE_FAILED");
    if (checkStatus === 200) {
      assert.equal(externalApiLogs.length, 1);
    } else {
      assert.equal(externalApiLogs.length, 2);
      assert.deepEqual(externalApiLogs[1], {
        service: "github",
        status: 422,
        errorCode: "TOKEN_CHECK_FAILED",
      });
    }
  }
});

test("DB delete failure after a 204 revoke returns an error", async () => {
  resetScenario({
    fetchPlan: [204],
    tokenDeleteResult: {
      error: { code: "DB_DELETE_FAILED", message: "delete failed" },
    },
  });

  const response = await invoke();

  await assertResponse(response, 500, { error: "GitHub連携の解除に失敗しました" });
  assert.equal(deleteCallCount, 1);
  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(dbLogs, [
    {
      route: "auth-github",
      operation: "disconnect",
      table: "user_github_tokens",
      errorType: "Error",
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

  console.log(`${pendingTests.length} GitHub disconnect tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
