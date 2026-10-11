const assert = require("node:assert/strict");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

installTsLoader();
installAliasResolver();

const {
  calculateImageUsageCost,
  calculateTextUsageCost,
  getPricingPromptTokens,
  recordUsageEvent,
} = require("../lib/aiUsage.ts");

function approx(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${label}: ${actual} !== ${expected}`);
}

const pricedAt = new Date("2026-08-15T00:00:00.000Z");

// Tier selection uses Claude's full prompt; other providers already include cache tokens.
const combinedUsage = { inputTokens: 10_000, cacheCreationInputTokens: 40_000, cacheReadInputTokens: 50_001 };
assert.equal(getPricingPromptTokens("claude", combinedUsage), 100_001);
assert.equal(getPricingPromptTokens("claude", { inputTokens: 10_000 }), 10_000);
assert.equal(getPricingPromptTokens("claude", { inputTokens: -1, cacheCreationInputTokens: 100, cacheReadInputTokens: -2 }), 100);
assert.equal(getPricingPromptTokens("claude", { inputTokens: 10, cacheCreationInputTokens: null, cacheReadInputTokens: null }), 10);
for (const provider of ["claude", "gemini", "openai"]) {
  for (const inputTokens of [null, undefined]) {
    assert.equal(getPricingPromptTokens(provider, { ...combinedUsage, inputTokens }), undefined);
  }
}
for (const provider of ["gemini", "openai"]) {
  assert.equal(getPricingPromptTokens(provider, combinedUsage), 10_000);
  assert.equal(getPricingPromptTokens(provider, { ...combinedUsage, inputTokens: -1 }), -1);
}

// Test-only model: exercise real getPricing without changing registry source files.
const { MODEL_REGISTRY } = require("../lib/modelRegistry.ts");
const tierFixture = {
  kind: "text", id: "claude-usage-tier-fixture", provider: "claude",
  label: "Usage tier fixture", badge: "", status: "active",
  surfaces: { chat: true, arena: false }, thinking: { control: "unsupported" },
  pricing: [{ tiers: [
    { inputPerMTok: 0.1, outputPerMTok: 0.5, cachedInputPerMTok: 0.01 },
    { promptTokensAbove: 100_000, inputPerMTok: 0.5, outputPerMTok: 2.5, cachedInputPerMTok: 0.02 },
  ] }],
};
MODEL_REGISTRY.push(tierFixture);
try {
  const cases = [
    ["100K stays on base tier", { inputTokens: 10_000, cacheReadInputTokens: 90_000 }, 0.0024],
    ["100K+1 uses high tier cache rate", { inputTokens: 10_000, cacheReadInputTokens: 90_001 }, 0.00930002],
    ["creation crosses boundary", { inputTokens: 1_000, cacheCreationInputTokens: 100_000 }, 0.0655],
    ["creation and read cross boundary", combinedUsage, 0.03350002],
  ];
  for (const [label, usage, expected] of cases) {
    const result = calculateTextUsageCost("claude", tierFixture.id, { outputTokens: 1_000, ...usage }, pricedAt);
    assert.equal(result.costSource, "computed", label);
    approx(result.estimatedCostUsd, expected, label);
  }
  // Missing input still selects the base tier even when cache alone exceeds 100K.
  for (const inputTokens of [null, undefined]) {
    const result = calculateTextUsageCost("claude", tierFixture.id, {
      inputTokens, outputTokens: 0, cacheReadInputTokens: 100_001,
    }, pricedAt);
    assert.equal(result.costSource, "computed");
    approx(result.estimatedCostUsd, 0.00100001, "missing input uses base tier");
    assert.deepEqual(calculateTextUsageCost("claude", tierFixture.id, {
      inputTokens, outputTokens: null,
    }, pricedAt), { estimatedCostUsd: null, costSource: "unavailable" });
  }
  // Passing other providers proves their tier still uses inputTokens alone.
  for (const [provider, usage, expected] of [
    ["gemini", { inputTokens: 100_000, cacheReadInputTokens: 90_000 }, 0.0024],
    ["openai", { inputTokens: 100_000, cachedInputTokens: 90_000, cacheReadInputTokens: 90_000, cacheCreationInputTokens: 40_000 }, 0.0024],
  ]) {
    const result = calculateTextUsageCost(provider, tierFixture.id, { outputTokens: 1_000, ...usage }, pricedAt);
    assert.equal(result.costSource, "computed");
    approx(result.estimatedCostUsd, expected, `${provider} keeps input-only tier`);
  }
  // Removing only the fixture's explicit rate must retain the 0.1x fallback.
  delete tierFixture.pricing[0].tiers[1].cachedInputPerMTok;
  const fallback = calculateTextUsageCost("claude", tierFixture.id, {
    inputTokens: 10_000, outputTokens: 1_000, cacheReadInputTokens: 90_001,
  }, pricedAt);
  assert.equal(fallback.costSource, "computed");
  approx(fallback.estimatedCostUsd, 0.01200005, "high tier fallback cache read multiplier");
} finally {
  MODEL_REGISTRY.splice(MODEL_REGISTRY.indexOf(tierFixture), 1);
}
assert.ok(!MODEL_REGISTRY.includes(tierFixture));

// Real Haiku 5.5 tiers must agree with the Phase 1B prompt-token helper.
for (const [label, usage, promptTokens, expectedCacheRate, expectedCost] of [
  ["100K", { inputTokens: 10_000, cacheReadInputTokens: 90_000 }, 100_000, 0.01, 0.0024],
  ["100K+1", { inputTokens: 10_000, cacheReadInputTokens: 90_001 }, 100_001, 0.05, 0.01200005],
  ["creation", { inputTokens: 1_000, cacheCreationInputTokens: 100_000 }, 101_000, 0.05, 0.0655],
  ["creation and read", combinedUsage, 100_001, 0.05, 0.03500005],
]) {
  const { getPricing } = require("../lib/modelRegistry.ts");
  assert.equal(getPricingPromptTokens("claude", usage), promptTokens, label);
  const tier = getPricing("claude-haiku-5-5", pricedAt, promptTokens);
  assert.equal(tier.cachedInputPerMTok, expectedCacheRate, label);
  assert.equal(tier.inputPerMTok, promptTokens > 100_000 ? 0.5 : 0.1, label);
  const result = calculateTextUsageCost("claude", "claude-haiku-5-5", { ...usage, outputTokens: 1_000 }, pricedAt);
  assert.equal(result.costSource, "computed", label);
  approx(result.estimatedCostUsd, expectedCost, `haiku-5-5/${label}`);
}

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

const openaiSunburstImage = calculateImageUsageCost("gpt-image-2.5-sunburst", {
  inputTokens: 150_000,
  outputTokens: 1_000,
  textInputTokens: 100_000,
  imageInputTokens: 50_000,
  cachedImageInputTokens: 10_000,
  imageOutputTokens: 1_000,
  imageCount: 1,
});
assert.equal(openaiSunburstImage.costSource, "computed");
approx(openaiSunburstImage.estimatedCostUsd, 0.87, "openai sunburst image modalities");

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
