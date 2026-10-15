const assert = require("node:assert/strict");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;
installTsLoader({
  transformOutput(output, filename) {
    if (filename.endsWith(path.join("app", "api", "chat", "route.ts"))) {
      return `${output}\nmodule.exports.__test = { streamClaude, streamGemini, streamOpenAI };`;
    }
    return output;
  },
});
installAliasResolver();

const {
  streamClaude,
  streamGemini,
  streamOpenAI,
} = require("../app/api/chat/route.ts").__test;
const { calculateTextUsageCost } = require("../lib/aiUsage.ts");

async function consume(stream) {
  const reader = stream.getReader();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += value;
  }
  return text;
}

function sse(lines) {
  return new Response(lines.map((line) => `data: ${JSON.stringify(line)}\n`).join(""), { status: 200 });
}

(async () => {
  const originalFetch = global.fetch;
  const pricedAt = new Date("2026-08-15T00:00:00.000Z");
  try {
    let claudeUsage = null;
    global.fetch = async () => sse([
      {
        type: "message_start",
        message: {
          usage: {
            input_tokens: 1000,
            cache_creation_input_tokens: 200,
            cache_read_input_tokens: 300,
          },
        },
      },
      { type: "content_block_delta", delta: { type: "text_delta", text: "Claude" } },
      { type: "message_delta", usage: { output_tokens: 100 }, delta: { stop_reason: "end_turn" } },
    ]);
    const claudeText = await consume(streamClaude(
      "key",
      [{ role: "user", content: "hello" }],
      undefined,
      undefined,
      "claude-sonnet-4-5",
      [],
      undefined,
      (usage) => { claudeUsage = usage; },
    ));
    assert.equal(claudeText, "Claude");
    assert.deepEqual(claudeUsage, {
      input_tokens: 1000,
      output_tokens: 100,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 300,
    });
    assert.equal(calculateTextUsageCost("claude", "claude-sonnet-4-5", {
      inputTokens: claudeUsage.input_tokens,
      outputTokens: claudeUsage.output_tokens,
      cacheCreationInputTokens: claudeUsage.cache_creation_input_tokens,
      cacheReadInputTokens: claudeUsage.cache_read_input_tokens,
    }, pricedAt).costSource, "computed");

    let geminiUsage = null;
    global.fetch = async () => sse([
      { candidates: [{ content: { parts: [{ text: "Gemini" }] } }] },
      {
        usageMetadata: {
          promptTokenCount: 1000,
          candidatesTokenCount: 100,
          thoughtsTokenCount: 50,
          cachedContentTokenCount: 200,
        },
      },
    ]);
    const geminiText = await consume(streamGemini(
      "key",
      [{ role: "user", content: "hello" }],
      undefined,
      "gemini-2.5-flash",
      [],
      undefined,
      (usage) => { geminiUsage = usage; },
    ));
    assert.equal(geminiText, "Gemini");
    assert.deepEqual(geminiUsage, {
      input_tokens: 1000,
      output_tokens: 150,
      normal_input_tokens: 800,
      cache_read_input_tokens: 200,
    });

    let argonUsage = null;
    let argonRequestBody = null;
    global.fetch = async (_url, init) => {
      argonRequestBody = JSON.parse(init.body);
      return sse([
        { candidates: [{ content: { parts: [{ text: "hidden", thought: true }, { text: "visible" }] } }] },
        { usageMetadata: { promptTokenCount: 6042, candidatesTokenCount: 19, totalTokenCount: 6061 } },
      ]);
    };
    const argonText = await consume(streamGemini(
      "key",
      [{ role: "user", content: "hello" }],
      undefined,
      "gemini-4-argon",
      [],
      undefined,
      (usage) => { argonUsage = usage; },
    ));
    assert.equal(argonText, "visible");
    assert.deepEqual(argonUsage, {
      input_tokens: 6042,
      output_tokens: 19,
      normal_input_tokens: 6042,
      cache_read_input_tokens: null,
    });
    for (const key of ["generationConfig", "thinkingConfig", "includeThoughts"]) {
      assert.equal(Object.hasOwn(argonRequestBody, key), false);
    }

    // Only a successfully drained stream may emit a finish diagnostic.
    for (const [reasons, expected] of [
      [["MAX_TOKENS", "MAX_TOKENS", undefined], "MAX_TOKENS"],
      [["MAX_TOKENS", "SOMETHING_NEW", undefined], "OTHER"],
      [["SAFETY"], "OTHER"],
      [["CONTINUATION"], "OTHER"],
      [["MAX_TOKENS", "STOP", undefined], null],
      [[undefined], null],
      [[123, null], null],
    ]) {
      const warnings = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnings.push(args);
      try {
        global.fetch = async () => sse([
          { candidates: [{ content: { parts: [{ text: "visible" }] } }] },
          ...reasons.map(finishReason => ({ candidates: [{ finishReason }] })),
          { usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 50, cachedContentTokenCount: 200 } },
        ]);
        let usage = null;
        assert.equal(await consume(streamGemini(
          "key", [{ role: "user", content: "hello" }], undefined, "gemini-4-argon",
          [], undefined, (value) => { usage = value; },
        )), "visible");
        assert.deepEqual(usage, {
          input_tokens: 1000, output_tokens: 150, normal_input_tokens: 800, cache_read_input_tokens: 200,
        });
        assert.deepEqual(warnings, expected === null ? [] : [["[gemini-abnormal-finish]", {
          modelId: "gemini-4-argon", finishReason: expected,
        }]]);
        assert.ok(!JSON.stringify(warnings).includes("SOMETHING_NEW"));
      } finally {
        console.warn = originalWarn;
      }
    }

    for (const errorName of ["AbortError", "Error"]) {
      const warnings = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnings.push(args);
      try {
        const abortController = new AbortController();
        let pulls = 0;
        global.fetch = async () => new Response(new ReadableStream({
          pull(controller) {
            if (pulls++ === 0) {
              controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({
                candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "partial" }] } }],
                usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100 },
              }) + '\n'));
            } else {
              const error = new Error("synthetic stream failure");
              error.name = errorName;
              if (errorName === "AbortError") abortController.abort();
              controller.error(error);
            }
          },
        }));
        let usage = null;
        const result = consume(streamGemini(
          "key", [{ role: "user", content: "hello" }], undefined, "gemini-4-argon",
          [], abortController.signal, (value) => { usage = value; },
        ));
        if (errorName === "AbortError") {
          assert.equal(await result, "partial");
        } else {
          await assert.rejects(result);
        }
        assert.deepEqual(usage, {
          input_tokens: 1000, output_tokens: 100, normal_input_tokens: 1000,
          cache_read_input_tokens: null, aborted: errorName === "AbortError",
        });
        assert.deepEqual(warnings, []);
      } finally {
        console.warn = originalWarn;
      }
    }

    for (const failure of ["fetch", "http"]) {
      const warnings = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnings.push(args);
      try {
        global.fetch = async () => {
          if (failure === "fetch") throw new Error("synthetic fetch failure");
          return new Response("synthetic upstream failure", { status: 503 });
        };
        let usage = null;
        await assert.rejects(consume(streamGemini(
          "key", [{ role: "user", content: "hello" }], undefined, "gemini-4-argon",
          [], undefined, (value) => { usage = value; },
        )));
        assert.deepEqual(usage, { input_tokens: null, output_tokens: null, aborted: false });
        assert.deepEqual(warnings, []);
      } finally {
        console.warn = originalWarn;
      }
    }

    let openaiUsage = null;
    global.fetch = async () => sse([
      { choices: [{ delta: { content: "OpenAI" } }] },
      {
        choices: [],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 100,
          prompt_tokens_details: {
            cached_tokens: 200,
            cache_write_tokens: 100,
          },
        },
      },
    ]);
    const openaiText = await consume(streamOpenAI(
      "key",
      [{ role: "user", content: "hello" }],
      undefined,
      "gpt-5.6-terra",
      [],
      undefined,
      (usage) => { openaiUsage = usage; },
    ));
    assert.equal(openaiText, "OpenAI");
    assert.deepEqual(openaiUsage, {
      input_tokens: 1000,
      output_tokens: 100,
      normal_input_tokens: 700,
      cached_input_tokens: 200,
      cache_write_input_tokens: 100,
    });

    let astraRequestBody = null;
    global.fetch = async (_url, init) => {
      astraRequestBody = JSON.parse(init.body);
      return sse([{ choices: [{ delta: { content: "Astra" } }] }]);
    };
    assert.equal(await consume(streamOpenAI(
      "key",
      [{ role: "user", content: "hello" }],
      undefined,
      "gpt-6-astra",
    )), "Astra");
    assert.equal(astraRequestBody.reasoning_effort, "medium");

    let existingModelRequestBody = null;
    global.fetch = async (_url, init) => {
      existingModelRequestBody = JSON.parse(init.body);
      return sse([{ choices: [{ delta: { content: "Mini" } }] }]);
    };
    assert.equal(await consume(streamOpenAI(
      "key",
      [{ role: "user", content: "hello" }],
      undefined,
      "gpt-5.4-mini",
    )), "Mini");
    assert.equal(Object.hasOwn(existingModelRequestBody, "reasoning_effort"), false);
  } finally {
    global.fetch = originalFetch;
  }

  console.log("chat usage tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
