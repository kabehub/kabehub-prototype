const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const rateLimitResults = new Map();

class MockRatelimit {
  constructor(options) {
    this.options = options;
  }

  static slidingWindow(limit, window) {
    return { limit, window };
  }

  async limit(userId) {
    const result = rateLimitResults.get(userId);
    if (!result) throw new Error(`Missing rate limit mock for ${userId}`);
    return result;
  }
}

class MockRedis {
  constructor(options) {
    this.options = options;
  }
}

const originalLoad = Module._load;
Module._load = function loadWithRateLimitMocks(request, parent, isMain) {
  if (request === "@upstash/ratelimit") {
    return { Ratelimit: MockRatelimit };
  }

  if (request === "@upstash/redis") {
    return { Redis: MockRedis };
  }

  if (request === "next/server") {
    return {
      NextResponse: {
        json(body, init = {}) {
          return new Response(JSON.stringify(body), {
            ...init,
            headers: {
              "content-type": "application/json",
              ...init.headers,
            },
          });
        },
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
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

const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const {
  checkChatRateLimit,
  checkMcpRateLimit,
  checkMcpLimitResponse,
} = require(path.join(__dirname, "..", "lib", "rate-limit.ts"));

const pendingTests = [];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

function setUpstashEnv() {
  process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
}

function restoreUpstashEnv() {
  if (originalUrl === undefined) {
    delete process.env.UPSTASH_REDIS_REST_URL;
  } else {
    process.env.UPSTASH_REDIS_REST_URL = originalUrl;
  }

  if (originalToken === undefined) {
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  } else {
    process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  }
}

test("Upstash未設定時はchatとMCPの両方を許可する", async () => {
  const expected = { allowed: true, limit: 0, remaining: 0, resetAt: 0 };

  assert.deepEqual(await checkChatRateLimit("chat-without-upstash"), expected);
  assert.deepEqual(await checkMcpRateLimit("mcp-without-upstash"), expected);
});

test("MCP許可時はレスポンスを返さない", async () => {
  setUpstashEnv();
  rateLimitResults.set("allowed-user", {
    success: true,
    limit: 60,
    remaining: 59,
    reset: 1_060_000,
  });

  assert.equal(await checkMcpLimitResponse("allowed-user"), null);
});

test("MCP拒否時は既存契約どおりの429レスポンスを返す", async () => {
  setUpstashEnv();
  const originalDateNow = Date.now;
  Date.now = () => 1_000_000;
  rateLimitResults.set("rejected-user", {
    success: false,
    limit: 60,
    remaining: 0,
    reset: 1_012_001,
  });

  try {
    const response = await checkMcpLimitResponse("rejected-user");

    assert.ok(response);
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      error: "リクエストが多すぎます。少し待ってから再度お試しください。",
      retryAfter: 13,
    });
    assert.equal(response.headers.get("X-RateLimit-Limit"), "60");
    assert.equal(response.headers.get("X-RateLimit-Remaining"), "0");
    assert.equal(response.headers.get("Retry-After"), "13");
  } finally {
    Date.now = originalDateNow;
  }
});

test("reset時刻が過去または現在でもretryAfterを1秒以上にする", async () => {
  setUpstashEnv();
  const originalDateNow = Date.now;
  Date.now = () => 1_000_000;

  try {
    for (const [userId, reset] of [
      ["past-reset-user", 999_000],
      ["current-reset-user", 1_000_000],
    ]) {
      rateLimitResults.set(userId, {
        success: false,
        limit: 60,
        remaining: 0,
        reset,
      });

      const response = await checkMcpLimitResponse(userId);
      assert.ok(response);
      assert.equal((await response.json()).retryAfter, 1);
      assert.equal(response.headers.get("Retry-After"), "1");
    }
  } finally {
    Date.now = originalDateNow;
  }
});

(async () => {
  try {
    for (const { name, fn } of pendingTests) {
      await fn();
      console.log(`ok - ${name}`);
    }

    console.log(`${pendingTests.length} rate limit tests passed`);
  } finally {
    restoreUpstashEnv();
    Module._load = originalLoad;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
