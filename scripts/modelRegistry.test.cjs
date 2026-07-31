const assert = require("node:assert/strict");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

installTsLoader({ jsx: true });
installAliasResolver();

const registry = require("../lib/modelRegistry.ts");
const legacyPricing = require("../lib/pricing.ts");

const expectedLegacyModelConfig = {
  claude: {
    label: "Claude",
    models: [
      { id: "claude-fable-5", label: "Fable 5", badge: "最高精度" },
      { id: "claude-sonnet-5", label: "Sonnet 5", badge: "新標準" },
      { id: "claude-opus-5", label: "Opus 5", badge: "最高精度" },
      { id: "claude-opus-4-8", label: "Opus 4.8", badge: "高精度" },
      { id: "claude-opus-4-7", label: "Opus 4.7", badge: "高精度" },
      { id: "claude-opus-4-6", label: "Opus 4.6", badge: "高精度" },
      { id: "claude-sonnet-4-5", label: "Sonnet 4.5", badge: "標準" },
      { id: "claude-sonnet-4-6", label: "Sonnet 4.6", badge: "高性能" },
      { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", badge: "軽量・爆速" },
    ],
    defaultModel: "claude-sonnet-5",
    lsKey: "kabehub_claude_model",
  },
  gemini: {
    label: "Gemini",
    models: [
      { id: "gemini-2.5-flash", label: "2.5 Flash", badge: "標準" },
      { id: "gemini-2.5-pro", label: "2.5 Pro", badge: "高性能" },
      { id: "gemini-3.5-flash", label: "3.5 Flash", badge: "高性能" },
      { id: "gemini-3.1-flash-lite", label: "3.1 Flash Lite", badge: "軽量・爆速" },
      { id: "gemini-3.6-flash", label: "3.6 Flash", badge: "高性能" },
      { id: "gemini-3.5-flash-lite", label: "3.5 Flash Lite", badge: "軽量・爆速" },
    ],
    defaultModel: "gemini-2.5-flash",
    lsKey: "kabehub_gemini_model",
  },
  openai: {
    label: "ChatGPT",
    models: [
      { id: "gpt-4o", label: "GPT-4o", badge: "旧世代" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini", badge: "標準" },
      { id: "gpt-5.4", label: "GPT-5.4", badge: "高性能" },
      { id: "gpt-5.5", label: "GPT-5.5", badge: "最高精度" },
      { id: "gpt-5.5-pro", label: "GPT-5.5 Pro", badge: "最上位" },
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", badge: "最高精度" },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", badge: "高性能" },
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", badge: "軽量・爆速" },
    ],
    defaultModel: "gpt-5.4-mini",
    lsKey: "kabehub_openai_model",
  },
  image_gen: {
    label: "画像生成",
    models: [
      { id: "gpt-image-2", label: "GPT Image 2", badge: "OpenAI" },
      { id: "gemini-2.5-flash-image", label: "Gemini Image", badge: "Google" },
      { id: "ideogram-v3", label: "Ideogram V3", badge: "Ideogram" },
      { id: "black-forest-labs/flux.2-pro", label: "Flux 2 Pro", badge: "OpenRouter" },
    ],
    defaultModel: "gpt-image-2",
    lsKey: "kabehub_image_provider",
  },
};

assert.deepEqual(registry.buildLegacyModelConfig(), expectedLegacyModelConfig);

const representativeIds = [
  "gpt-4o", "gemini-2.5-pro", "ideogram-v3", "black-forest-labs/flux.2-pro",
  "gpt-5.4-mini-preview", "gpt-5-mini-2026", "claude-haiku-3.5-turbo",
  "gemini/gemini-2.5-flash", "openai/GPT-4O-MINI", "OpenAI/gpt-4o-mini", "unknown-model-xyz",
];
// T6以降は lib/pricing.ts がregistryをre-exportするため、この突き合わせは
// 公開窓口と実体が同じ結果を返すことだけを確認するトートロジーとなる。
for (const id of representativeIds) {
  assert.deepEqual(registry.getPricing(id), legacyPricing.getPricing(id), id);
}
// 意図的差分（S24 T6で確定・案B採用）:
// 旧 lib/pricing.ts（T1時点までの独自実装）は専用エントリがなく、前方一致で
// gemini-2.5-flash の単価($0.30/$2.50)に誤ってヒットしていた。
// T6以降は本registryのre-exportなので、pricing:[] の完全一致でnullに終端する。
assert.equal(registry.getPricing("gemini-2.5-flash-image"), null);

const expectedImagePageModels = [
  { id: "gemini-2.5-flash-image", label: "2.5 Flash Image", badge: "既存" },
  { id: "gemini-3.1-flash-image", label: "3.1 Flash Image", badge: "新" },
  { id: "gemini-3-pro-image", label: "3 Pro Image", badge: "高性能" },
];
assert.deepEqual(registry.getImagePageModels("gemini"), expectedImagePageModels);
assert.deepEqual(registry.getImagePageModels("openai"), []);
assert.deepEqual(
  registry.MODEL_REGISTRY
    .filter((model) => model.imagePage !== undefined)
    .map((model) => ({ id: model.id, imagePage: model.imagePage })),
  expectedImagePageModels.map(({ id, label, badge }) => ({
    id,
    imagePage: { label, badge },
  }))
);
assert.ok(
  registry.getImagePageModels("gemini")
    .some((model) => model.id === registry.getDefaultImageModel("gemini"))
);
assert.equal(registry.IMAGE_PAGE_CONFIG.defaultGeminiModelId, "gemini-2.5-flash-image");
assert.ok(
  registry.getImagePageModels("gemini")
    .some((model) => model.id === registry.IMAGE_PAGE_CONFIG.defaultGeminiModelId)
);
for (const modelId of ["gemini-3.1-flash-image", "gemini-3-pro-image"]) {
  assert.equal(registry.MODEL_REGISTRY.find((model) => model.id === modelId).status, "hidden");
}

const expectedNovelCheckModels = [
  { id: "gemini-2.5-flash", label: "2.5 Flash", estimatedInputPerMTok: 0.075 },
  { id: "gemini-2.5-pro", label: "2.5 Pro", estimatedInputPerMTok: 1.25 },
];
assert.deepEqual(registry.getNovelCheckModels(), expectedNovelCheckModels);
assert.deepEqual(
  registry.MODEL_REGISTRY
    .filter((model) => model.features?.novelCheck !== undefined)
    .map((model) => ({ id: model.id, ...model.features.novelCheck })),
  expectedNovelCheckModels
);
assert.ok(
  registry.getNovelCheckModels()
    .some((model) => model.id === registry.NOVEL_CHECK_CONFIG.defaultModelId)
);
for (const model of expectedNovelCheckModels) {
  assert.equal(registry.isAllowedNovelCheckModel(model.id), true, model.id);
}
for (const modelId of ["gemini-3.5-flash", "gpt-5.4-mini", "unknown-model"]) {
  assert.equal(registry.isAllowedNovelCheckModel(modelId), false, modelId);
}
assert.deepEqual(registry.getPricing("gemini-2.5-flash"), {
  inputPerMTok: 0.3,
  outputPerMTok: 2.5,
});

for (const model of registry.MODEL_REGISTRY) {
  // 画像モデルはchat surfaceを持たず、この不変条件の対象外。
  if (model.kind === "text" && model.surfaces.chat) assert.ok(model.pricing.length > 0, model.id);
}

for (const provider of ["claude", "gemini", "openai"]) {
  const cfg = registry.PROVIDER_CONFIG[provider];
  for (const [surface, id] of [["ui", cfg.uiDefaultModelId], ["chat", cfg.chatFallbackModelId], ["arena", cfg.arenaFallbackModelId]]) {
    const allowedSurface = surface === "ui" ? "chat" : surface;
    assert.equal(registry.isAllowedModel(provider, id, allowedSurface), true, `${provider}/${surface}`);
    assert.equal(registry.MODEL_REGISTRY.find((model) => model.id === id).status, "active");
  }
}

assert.equal(registry.PROVIDER_CONFIG.claude.uiDefaultModelId, "claude-sonnet-5");
assert.equal(registry.PROVIDER_CONFIG.claude.chatFallbackModelId, "claude-sonnet-5");
assert.equal(registry.PROVIDER_CONFIG.claude.arenaFallbackModelId, "claude-sonnet-5");

for (const modelId of ["claude-opus-5", "claude-sonnet-5", "claude-fable-5"]) {
  assert.deepEqual(
    registry.resolveClaudeRequestOverrides(modelId, false),
    { max_tokens: 16000 },
    `${modelId}/off`
  );
  assert.deepEqual(
    registry.resolveClaudeRequestOverrides(modelId, true),
    { max_tokens: 16000 },
    `${modelId}/on`
  );
}

for (const modelId of ["claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6"]) {
  assert.deepEqual(
    registry.resolveClaudeRequestOverrides(modelId, false),
    { max_tokens: 8192 },
    `${modelId}/off`
  );
  assert.deepEqual(
    registry.resolveClaudeRequestOverrides(modelId, true),
    { thinking: { type: "adaptive", display: "summarized" }, max_tokens: 16000 },
    `${modelId}/on`
  );
}

for (const modelId of ["claude-sonnet-4-5", "claude-haiku-4-5-20251001"]) {
  assert.deepEqual(
    registry.resolveClaudeRequestOverrides(modelId, false),
    { max_tokens: 8192 },
    `${modelId}/off`
  );
  assert.deepEqual(
    registry.resolveClaudeRequestOverrides(modelId, true),
    { thinking: { type: "enabled", budget_tokens: 10000 }, max_tokens: 16000 },
    `${modelId}/on`
  );
}

const ids = registry.MODEL_REGISTRY.map((model) => model.id);
assert.equal(new Set(ids).size, ids.length);

const intro = new Date("2026-08-31T23:59:59.999Z");
const regular = new Date("2026-09-01T00:00:00.000Z");
const later = new Date("2026-10-01T00:00:00.000Z");
assert.deepEqual(registry.getPricing("claude-sonnet-5", intro), { inputPerMTok: 2, outputPerMTok: 10 });
assert.deepEqual(registry.getPricing("claude-sonnet-5", regular), { inputPerMTok: 3, outputPerMTok: 15 });
assert.deepEqual(registry.getPricing("claude-sonnet-5", later), { inputPerMTok: 3, outputPerMTok: 15 });
assert.deepEqual(registry.getPricing("claude-sonnet-5-20260615", intro), { inputPerMTok: 2, outputPerMTok: 10 });
assert.deepEqual(registry.getPricing("claude-sonnet-5-20260615", regular), { inputPerMTok: 3, outputPerMTok: 15 });
assert.equal(registry.getPricing("gemini/gemini-2.5-flash-image"), null);
assert.deepEqual(registry.getPricing("claude-opus-4-8"), { inputPerMTok: 5, outputPerMTok: 25 });

const newModels = [
  ["openai", "gpt-5.6-sol", { inputPerMTok: 5, outputPerMTok: 30 }],
  ["openai", "gpt-5.6-terra", { inputPerMTok: 2.5, outputPerMTok: 15 }],
  ["openai", "gpt-5.6-luna", { inputPerMTok: 1, outputPerMTok: 6 }],
  ["gemini", "gemini-3.6-flash", { inputPerMTok: 1.5, outputPerMTok: 7.5 }],
  ["gemini", "gemini-3.5-flash-lite", { inputPerMTok: 0.3, outputPerMTok: 2.5 }],
];
for (const [provider, modelId, pricing] of newModels) {
  assert.equal(registry.isAllowedModel(provider, modelId, "chat"), true, `${modelId}/chat`);
  assert.equal(registry.isAllowedModel(provider, modelId, "arena"), true, `${modelId}/arena`);
  assert.deepEqual(registry.getPricing(modelId), pricing, `${modelId}/pricing`);
}

for (const surface of ["chat", "arena"]) {
  const defaults = registry.buildDefaultModels(surface);
  for (const provider of ["claude", "gemini", "openai"]) {
    assert.equal(
      defaults[provider],
      registry.getDefaultModel(provider, surface),
      `${provider}/${surface}`
    );
  }
}

for (const surface of ["chat", "arena"]) {
  const guards = registry.createModelGuards(surface);
  for (const model of registry.MODEL_REGISTRY) {
    if (model.kind !== "text") continue;
    const expected = { claude: "isClaudeModel", gemini: "isGeminiModel", openai: "isOpenAIModel" }[model.provider];
    assert.equal(
      guards[expected](model.id),
      registry.isAllowedModel(model.provider, model.id, surface),
      `${expected}/${model.id}/${surface}`
    );
  }
  assert.equal(guards.isClaudeModel("unknown-model"), false);
  assert.equal(guards.isGeminiModel("unknown-model"), false);
  assert.equal(guards.isOpenAIModel("unknown-model"), false);
}

console.log("modelRegistry tests passed");
