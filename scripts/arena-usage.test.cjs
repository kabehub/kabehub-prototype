const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.crypto ??= webcrypto;

let assistantInsertError = null;
let insertedMessages = [];
let calculateCalls = [];
let recordCalls = [];
let serviceRoleCalls = 0;
let serviceRoleShouldThrow = false;
let dbLogs = [];

const serviceRoleClientValue = { kind: "service-role-client" };

function createSupabaseClient() {
  return {
    from(table) {
      assert.equal(table, "messages");
      return {
        async insert(payload) {
          insertedMessages.push(payload);
          return { error: assistantInsertError };
        },
      };
    },
  };
}

const originalLoad = Module._load;
Module._load = function loadWithArenaUsageMocks(request, parent, isMain) {
  if (request === "@/lib/supabase/route-auth") {
    return {
      async requireRouteUser() {
        return {
          ok: true,
          user: { id: "user-1" },
          supabase: createSupabaseClient(),
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

  if (request === "@/lib/aiUsage") {
    return {
      calculateTextUsageCost(provider, modelId, usage, pricedAt) {
        calculateCalls.push({ provider, modelId, usage, pricedAt });
        return { estimatedCostUsd: 0.0123, costSource: "computed" };
      },
      async recordUsageEvent(client, params) {
        recordCalls.push({ client, params });
        return true;
      },
    };
  }

  if (request === "@/lib/mcp-auth") {
    return {
      serviceRoleClient() {
        serviceRoleCalls += 1;
        if (serviceRoleShouldThrow) throw new Error("service role unavailable");
        return serviceRoleClientValue;
      },
    };
  }

  if (request === "@/lib/logger") {
    return {
      dbOperationFailed(params) {
        dbLogs.push(params);
      },
      dbCompensationFailed() {},
      externalApiFailed() {},
      toExternalService(provider) {
        return provider;
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

installTsLoader({
  transformOutput(output, filename) {
    if (filename.endsWith(path.join("app", "api", "arena", "route.ts"))) {
      return `${output}\nmodule.exports.__test = { callClaude, callGemini, callOpenAI, callAI };`;
    }
    return output;
  },
});
installAliasResolver();

const arenaRoute = require("../app/api/arena/route.ts");
const { POST } = arenaRoute;
const { callClaude, callGemini, callOpenAI, callAI } = arenaRoute.__test;

const pendingTests = [];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

function jsonResponse(data, status = 200) {
  return Response.json(data, { status });
}

function resetScenario(options = {}) {
  assistantInsertError = options.assistantInsertError ?? null;
  insertedMessages = [];
  calculateCalls = [];
  recordCalls = [];
  serviceRoleCalls = 0;
  serviceRoleShouldThrow = options.serviceRoleShouldThrow ?? false;
  dbLogs = [];
}

function claudeFixture(text = "Claude response") {
  return {
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: {
      input_tokens: 101,
      output_tokens: 23,
      cache_creation_input_tokens: 11,
      cache_read_input_tokens: 7,
    },
  };
}

function requestBody(overrides = {}) {
  return {
    threadId: "thread-1",
    history: [{ role: "user", content: "討論を始めます" }],
    currentProvider: "claude",
    currentPrompt: "簡潔に答えてください",
    opponentLabel: "相手",
    selfLabel: "自分",
    isFirst: false,
    topic: "テスト",
    modelId: "claude-sonnet-4-5",
    ...overrides,
  };
}

async function invokeArena(body, headers = {}) {
  const request = new Request("http://localhost/api/arena", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return POST(request);
}

async function assertJsonResponse(response, status, expected) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), expected);
}

test("callClaude returns text and Anthropic usage", async () => {
  global.fetch = async () => jsonResponse(claudeFixture());

  const result = await callClaude(
    "key",
    [{ role: "user", content: "hello" }],
    undefined,
    "claude-sonnet-4-5",
  );

  assert.deepEqual(result, {
    text: "Claude response",
    usage: {
      inputTokens: 101,
      outputTokens: 23,
      cacheCreationInputTokens: 11,
      cacheReadInputTokens: 7,
    },
  });
});

test("callGemini returns visible text and aggregated usage", async () => {
  global.fetch = async () => jsonResponse({
    candidates: [{
      content: {
        parts: [
          { text: "hidden thought", thought: true },
          { text: "Gemini response" },
        ],
      },
    }],
    usageMetadata: {
      promptTokenCount: 202,
      candidatesTokenCount: 31,
      thoughtsTokenCount: 13,
      cachedContentTokenCount: 17,
    },
  });

  const result = await callGemini(
    "key",
    [{ role: "user", content: "hello" }],
    undefined,
    "gemini-2.5-flash",
  );

  assert.deepEqual(result, {
    text: "Gemini response",
    usage: {
      inputTokens: 202,
      outputTokens: 44,
      cacheReadInputTokens: 17,
    },
  });
});

test("callOpenAI returns Chat Completions text and usage", async () => {
  global.fetch = async () => jsonResponse({
    choices: [{ message: { content: "Chat Completions response" } }],
    usage: {
      prompt_tokens: 303,
      completion_tokens: 41,
      prompt_tokens_details: {
        cached_tokens: 19,
      },
    },
  });

  const result = await callOpenAI(
    "key",
    [{ role: "user", content: "hello" }],
    undefined,
    "gpt-5.6-terra",
  );

  assert.deepEqual(result, {
    text: "Chat Completions response",
    usage: {
      inputTokens: 303,
      outputTokens: 41,
      cachedInputTokens: 19,
      cacheWriteInputTokens: null,
    },
  });
});

test("callOpenAI returns Responses API text and usage", async () => {
  global.fetch = async () => jsonResponse({
    output: [{
      content: [
        { type: "reasoning", text: "hidden" },
        { type: "output_text", text: "Responses API response" },
      ],
    }],
    usage: {
      input_tokens: 404,
      output_tokens: 53,
      input_tokens_details: {
        cached_tokens: 29,
        cache_write_tokens: 3,
      },
    },
  });

  const result = await callOpenAI(
    "key",
    [{ role: "user", content: "hello" }],
    undefined,
    "gpt-5.5-pro",
  );

  assert.deepEqual(result, {
    text: "Responses API response",
    usage: {
      inputTokens: 404,
      outputTokens: 53,
      cachedInputTokens: 29,
      cacheWriteInputTokens: 3,
    },
  });
});

test("callAI includes the resolved model id", async () => {
  global.fetch = async () => jsonResponse(claudeFixture("resolved"));

  const result = await callAI(
    "claude",
    [{ role: "user", content: "hello" }],
    "system",
    { anthropic: "key" },
    "claude-sonnet-4-5",
  );

  assert.equal(result.text, "resolved");
  assert.equal(result.modelId, "claude-sonnet-4-5");
  assert.equal(result.usage.inputTokens, 101);
});

test("POST records arena usage with the saved assistant message id", async () => {
  resetScenario();
  global.fetch = async () => jsonResponse(claudeFixture());

  const response = await invokeArena(requestBody(), { "x-anthropic-api-key": "key" });
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.saved, true);
  assert.equal(body.message.content, "Claude response");
  assert.equal(insertedMessages.length, 1);
  assert.equal(recordCalls.length, 1);
  assert.equal(recordCalls[0].client, serviceRoleClientValue);
  assert.equal(recordCalls[0].params.requestType, "arena");
  assert.equal(recordCalls[0].params.provider, "claude");
  assert.equal(recordCalls[0].params.modelId, "claude-sonnet-4-5");
  assert.equal(recordCalls[0].params.messageId, body.message.id);
  assert.equal(recordCalls[0].params.threadId, "thread-1");
  assert.equal(recordCalls[0].params.inputTokens, 101);
  assert.equal(recordCalls[0].params.outputTokens, 23);
  assert.equal(recordCalls[0].params.cacheCreationInputTokens, 11);
  assert.equal(recordCalls[0].params.cacheReadInputTokens, 7);
  assert.equal(recordCalls[0].params.status, "completed");
  assert.ok(recordCalls[0].params.pricedAt instanceof Date);
  assert.equal(calculateCalls.length, 1);
  assert.equal(calculateCalls[0].provider, "claude");
  assert.equal(calculateCalls[0].modelId, "claude-sonnet-4-5");
});

test("POST records usage with messageId null when assistant insert fails", async () => {
  resetScenario({ assistantInsertError: { code: "ASSISTANT_INSERT_FAILED" } });
  global.fetch = async () => jsonResponse(claudeFixture());

  const response = await invokeArena(requestBody(), { "x-anthropic-api-key": "key" });
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.saved, false);
  assert.equal(recordCalls.length, 1);
  assert.equal(recordCalls[0].params.requestType, "arena");
  assert.equal(recordCalls[0].params.modelId, "claude-sonnet-4-5");
  assert.equal(recordCalls[0].params.messageId, null);
});

test("POST skips usage recording when the provider call fails", async () => {
  resetScenario();
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called without an API key");
  };

  const response = await invokeArena(requestBody());
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.saved, true);
  assert.match(body.message.content, /APIキーが設定されていません/);
  assert.equal(fetchCalled, false);
  assert.equal(calculateCalls.length, 0);
  assert.equal(recordCalls.length, 0);
  assert.equal(serviceRoleCalls, 0);
});

test("serviceRoleClient failure preserves saved true and HTTP 200", async () => {
  resetScenario({ serviceRoleShouldThrow: true });
  global.fetch = async () => jsonResponse(claudeFixture());

  const response = await invokeArena(requestBody(), { "x-anthropic-api-key": "key" });
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.saved, true);
  assert.equal(serviceRoleCalls, 1);
  assert.equal(recordCalls.length, 0);
  assert.deepEqual(dbLogs, [{
    route: "arena",
    operation: "record-usage-event",
    table: "ai_usage_events",
    errorType: "Error",
  }]);
});

test("serviceRoleClient failure preserves saved false and HTTP 200", async () => {
  resetScenario({
    assistantInsertError: { code: "ASSISTANT_INSERT_FAILED" },
    serviceRoleShouldThrow: true,
  });
  global.fetch = async () => jsonResponse(claudeFixture());

  const response = await invokeArena(requestBody(), { "x-anthropic-api-key": "key" });
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.saved, false);
  assert.equal(serviceRoleCalls, 1);
  assert.equal(recordCalls.length, 0);
  assert.ok(dbLogs.some((entry) => entry.operation === "record-usage-event"));
  assert.ok(dbLogs.some((entry) => entry.operation === "insert_assistant_message"));
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

  console.log(`${pendingTests.length} arena usage tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
