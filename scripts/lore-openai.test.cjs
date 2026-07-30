const assert = require("node:assert/strict");
const path = require("node:path");
const { installTsLoader } = require("./testBootstrap.cjs");

installTsLoader();

const { createEmbedding, chatCompleteMini } = require(path.join(__dirname, "../lib/lore/openai.ts"));

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function response(ok, data) {
  return { ok, status: ok ? 200 : 400, json: async () => data };
}

async function rejectsMessage(promise, message) {
  await assert.rejects(promise, (error) => error instanceof Error && error.message === message);
}

(async () => {
  await test("createEmbedding sends the expected request", async () => {
    let call;
    global.fetch = async (...args) => {
      call = args;
      return response(true, { data: [{ embedding: [0.1, 0.2] }] });
    };
    assert.deepEqual(await createEmbedding("secret", "input text"), [0.1, 0.2]);
    assert.equal(call[0], "https://api.openai.com/v1/embeddings");
    assert.equal(call[1].method, "POST");
    assert.equal(call[1].headers.Authorization, "Bearer secret");
    assert.equal(JSON.parse(call[1].body).model, "text-embedding-3-small");
  });

  await test("createEmbedding passes AbortSignal by reference", async () => {
    const controller = new AbortController();
    let fetchOptions;
    global.fetch = async (_url, options) => {
      fetchOptions = options;
      return response(true, { data: [{ embedding: [1] }] });
    };
    await createEmbedding("key", "input", { signal: controller.signal });
    assert.equal(fetchOptions.signal, controller.signal);
  });

  await test("createEmbedding uses the generic HTTP error by default", async () => {
    global.fetch = async () => response(false, { error: { message: "provider detail" } });
    await rejectsMessage(createEmbedding("key", "input"), "OpenAI APIへのリクエストに失敗しました");
  });

  await test("createEmbedding never exposes provider error bodies", async () => {
    global.fetch = async () => response(false, { error: { message: "provider detail" } });
    await rejectsMessage(createEmbedding("key", "input"), "OpenAI APIへのリクエストに失敗しました");
  });

  await test("createEmbedding uses a fixed error for missing or malformed embeddings", async () => {
    for (const data of [{}, { data: [{ embedding: "not an array" }] }]) {
      global.fetch = async () => response(true, data);
      await rejectsMessage(createEmbedding("key", "input"), "OpenAI APIへのリクエストに失敗しました");
    }
  });

  await test("chatCompleteMini omits response_format by default", async () => {
    let body;
    global.fetch = async (_url, options) => {
      body = JSON.parse(options.body);
      return response(true, { choices: [{ message: { content: "ok" } }] });
    };
    await chatCompleteMini("key", "system", "user");
    assert.equal(body.model, "gpt-4o-mini");
    assert.equal(Object.hasOwn(body, "response_format"), false);
  });

  await test("chatCompleteMini includes JSON response_format in jsonMode", async () => {
    let body;
    global.fetch = async (_url, options) => {
      body = JSON.parse(options.body);
      return response(true, { choices: [{ message: { content: "{}" } }] });
    };
    await chatCompleteMini("key", "system", "user", { jsonMode: true });
    assert.deepEqual(body.response_format, { type: "json_object" });
  });

  await test("chatCompleteMini throws the expected HTTP error", async () => {
    global.fetch = async () => response(false, {});
    await rejectsMessage(chatCompleteMini("key", "system", "user"), "OpenAI APIへのリクエストに失敗しました");
  });

  await test("chatCompleteMini returns null for non-string content", async () => {
    for (const data of [{}, { choices: [{ message: { content: null } }] }]) {
      global.fetch = async () => response(true, data);
      assert.equal(await chatCompleteMini("key", "system", "user"), null);
    }
  });

  await test("chatCompleteMini returns string content unchanged", async () => {
    global.fetch = async () => response(true, { choices: [{ message: { content: "  value\n" } }] });
    assert.equal(await chatCompleteMini("key", "system", "user"), "  value\n");
  });

  console.log(`${passed} lore OpenAI tests passed`);
})().catch(() => {
  process.exitCode = 1;
});
