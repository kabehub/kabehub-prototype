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
  } finally {
    global.fetch = originalFetch;
  }

  console.log("chat usage tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
