const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");

const rootDir = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(rootDir, request.slice(2));
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
function compile(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
}
require.extensions[".ts"] = compile;
require.extensions[".tsx"] = compile;

const registry = require("../lib/modelRegistry.ts");
const legacyPricing = require("../lib/pricing.ts");
const { MODEL_CONFIG } = require("../components/ChatInput.tsx");

assert.deepEqual(registry.buildLegacyModelConfig(), MODEL_CONFIG);

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

console.log("modelRegistry tests passed");
