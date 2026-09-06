const assert = require("node:assert/strict");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

installTsLoader();
installAliasResolver();

const {
  calculateImageUsageCost,
  calculateTextUsageCost,
  recordUsageEvent,
} = require("../lib/aiUsage.ts");

function approx(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${label}: ${actual} !== ${expected}`);
}

const pricedAt = new Date("2026-08-15T00:00:00.000Z");

// Claude response fixture: input + cache creation + cache read + output.
const claude = calculateTextUsageCost("claude", "claude-sonnet-4-5", {
  inputTokens: 1_000_000,
  outputTokens: 1_000_000,
  cacheCreationInputTokens: 1_000_000,
  cacheReadInputTokens: 1_000_000,
}, pricedAt);
assert.equal(claude.costSource, "computed");
approx(claude.estimatedCostUsd, 22.05, "claude cache cost");

const fable51CacheRead = calculateTextUsageCost("claude", "claude-fable-5-1", {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 1_000_000,
}, pricedAt);
assert.equal(fable51CacheRead.costSource, "computed");
approx(fable51CacheRead.estimatedCostUsd, 0.25, "claude model-specific cache read cost");

const legacyClaudeCacheRead = calculateTextUsageCost("claude", "claude-fable-5", {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 1_000_000,
}, pricedAt);
assert.equal(legacyClaudeCacheRead.costSource, "computed");
approx(legacyClaudeCacheRead.estimatedCostUsd, 1, "claude fallback cache read multiplier");

// OpenAI response fixture: prompt_tokens_details.{cached_tokens,cache_write_tokens}.
const openai = calculateTextUsageCost("openai", "gpt-5.6-terra", {
  inputTokens: 1_000_000,
  outputTokens: 500_000,
  cachedInputTokens: 200_000,
  cacheWriteInputTokens: 100_000,
}, pricedAt);
assert.equal(openai.costSource, "computed");
approx(openai.estimatedCostUsd, 7.69, "openai cache cost");

// cache_write_tokensはregistry capabilityを持つモデルだけ1.25倍課金する。
const noCacheWriteCapability = calculateTextUsageCost("openai", "gpt-5.5", {
  inputTokens: 1_000,
  outputTokens: 100,
  cacheWriteInputTokens: 100,
}, pricedAt);
assert.equal(noCacheWriteCapability.costSource, "computed");
approx(noCacheWriteCapability.estimatedCostUsd, 0.008, "non-cache-write model cost");

// GPT-5.5 Proはcached input割引非対応。cached単価を推測せずunavailableにする。
const proWithoutCachedDiscount = calculateTextUsageCost("openai", "gpt-5.5-pro", {
  inputTokens: 1_000,
  outputTokens: 100,
  cachedInputTokens: 100,
}, pricedAt);
assert.deepEqual(proWithoutCachedDiscount, {
  estimatedCostUsd: null,
  costSource: "unavailable",
});

// Gemini response fixture: cachedContentTokenCount + candidates/thoughts total.
const gemini = calculateTextUsageCost("gemini", "gemini-2.5-flash", {
  inputTokens: 1_000_000,
  outputTokens: 500_000,
  cacheReadInputTokens: 200_000,
}, pricedAt);
assert.equal(gemini.costSource, "computed");
approx(gemini.estimatedCostUsd, 1.496, "gemini cache cost");

const geminiImage = calculateImageUsageCost("gemini-2.5-flash-image", {
  inputTokens: 110_000,
  outputTokens: 21_000,
  textInputTokens: 100_000,
  imageInputTokens: 10_000,
  textOutputTokens: 20_000,
  imageOutputTokens: 1_000,
  imageCount: 1,
});
assert.equal(geminiImage.costSource, "computed");
approx(geminiImage.estimatedCostUsd, 0.113, "gemini image modalities");

const openaiImage = calculateImageUsageCost("gpt-image-2", {
  inputTokens: 150_000,
  outputTokens: 1_000,
  textInputTokens: 100_000,
  imageInputTokens: 50_000,
  cachedImageInputTokens: 10_000,
  imageOutputTokens: 1_000,
  imageCount: 1,
});
assert.equal(openaiImage.costSource, "computed");
approx(openaiImage.estimatedCostUsd, 0.87, "openai image modalities");

const ideogram = calculateImageUsageCost("ideogram-v3", {
  inputTokens: null,
  outputTokens: null,
  imageCount: 2,
});
assert.deepEqual(ideogram, { estimatedCostUsd: 0.06, costSource: "computed" });

const openrouter = calculateImageUsageCost("black-forest-labs/flux.2-pro", {
  inputTokens: null,
  outputTokens: null,
  providerReportedCostUsd: 0.123,
  imageCount: 1,
});
assert.deepEqual(openrouter, { estimatedCostUsd: 0.123, costSource: "provider_reported" });
assert.deepEqual(
  calculateImageUsageCost("black-forest-labs/flux.2-pro", {
    inputTokens: null,
    outputTokens: null,
    imageCount: 1,
  }),
  { estimatedCostUsd: null, costSource: "unavailable" },
);

(async () => {
  let upsertPayload = null;
  let upsertOptions = null;
  const supabase = {
    from(table) {
      assert.equal(table, "ai_usage_events");
      return {
        async upsert(payload, options) {
          upsertPayload = payload;
          upsertOptions = options;
          return { error: null };
        },
      };
    },
  };

  const saved = await recordUsageEvent(supabase, {
    id: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    threadId: null,
    messageId: null,
    provider: "gemini",
    modelId: "gemini-2.5-flash",
    requestType: "novel_check",
    inputTokens: 100,
    outputTokens: 20,
    cacheReadInputTokens: 10,
    estimatedCostUsd: 0.001,
    costSource: "computed",
    status: "completed",
    pricedAt,
  });
  assert.equal(saved, true);
  assert.equal(upsertPayload.user_id, "00000000-0000-4000-8000-000000000002");
  assert.equal(upsertPayload.cache_read_input_tokens, 10);
  assert.equal(upsertPayload.priced_at, pricedAt.toISOString());
  assert.deepEqual(upsertOptions, { onConflict: "id" });

  console.log("ai usage tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
