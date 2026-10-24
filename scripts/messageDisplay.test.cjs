const assert = require("node:assert/strict");
const { test } = require("node:test");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

installAliasResolver();
installTsLoader({ jsx: true });
const { MODEL_REGISTRY } = require("../lib/modelRegistry.ts");
const { getMessageDisplayInfo, getModelDisplayLabel, PROVIDER_COLORS, PROVIDER_LABELS } = require("../lib/messageDisplay.ts");

// Keep rendering tests independent of Markdown, API clients and model-picker UI.
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.endsWith("/MarkdownRenderer")) return { __esModule: true, default: ({ content }) => React.createElement("p", null, content) };
  if (request === "./ChatInput") return { MODEL_CONFIG: {}, loadModel() {} };
  if (request.endsWith("/supabase/client")) return { supabase: {} };
  if (request.endsWith("/api-client")) return { webApiClient: {} };
  if (request.endsWith("/components/Toast")) return { useToast: () => ({ showToast() {} }) };
  return originalLoad.call(this, request, parent, isMain);
};
const arena = require("../components/ArenaTimeline.tsx");
const { default: MessageBubble, BranchBubble } = require("../components/MessageBubble.tsx");
Module._load = originalLoad;

const message = (overrides = {}) => ({
  id: "m1", thread_id: "t1", role: "assistant", content: "reply",
  created_at: "2026-10-21T00:00:00Z", ...overrides,
});
const neutral = { bg: "#f6f6f2", border: "#d8d8cf", text: "#6b6b63" };

test("user role overrides provider, model and fallback with You and human color", () => {
  assert.deepEqual(getMessageDisplayInfo(message({ role: "user", provider: "openai", model_id: "gpt-4o" }), "claude"), {
    providerLabel: "You", modelLabel: null, colorKey: "human", color: PROVIDER_COLORS.human,
  });
});

for (const [provider, model_id, providerLabel, modelLabel] of [
  ["claude", "claude-sonnet-5-5", "Claude", "Sonnet 5.5"],
  ["gemini", "gemini-3.8-flash", "Gemini", "3.8 Flash"],
  ["openai", "gpt-4o", "ChatGPT", "GPT-4o"],
]) {
  test(`${provider} returns provider name, registry label and original color`, () => {
    assert.deepEqual(getMessageDisplayInfo(message({ provider, model_id })), {
      providerLabel, modelLabel, colorKey: provider, color: PROVIDER_COLORS[provider],
    });
  });
}

test("null and empty model IDs display only the provider", () => {
  for (const model_id of [null, "", undefined]) {
    const info = getMessageDisplayInfo(message({ provider: "openai", model_id }));
    assert.equal(info.providerLabel, "ChatGPT");
    assert.equal(info.modelLabel, null);
  }
});

test("missing, unknown and invalid providers safely use AI and neutral color", () => {
  for (const provider of [undefined, null, "unknown", "invalid", "", "human", "__proto__"]) {
    const info = getMessageDisplayInfo(message({ provider, model_id: null }));
    assert.equal(info.providerLabel, "AI");
    assert.equal(info.modelLabel, null);
    assert.equal(info.colorKey, "neutral");
    assert.deepEqual(info.color, neutral);
  }
  assert.equal(getMessageDisplayInfo(message({ provider: "unknown", model_id: "gpt-4o" })).modelLabel, "GPT-4o");
});

test("fallback provider is used only for nullish message providers", () => {
  for (const provider of [undefined, null]) {
    assert.equal(getMessageDisplayInfo(message({ provider }), "gemini").providerLabel, "Gemini");
  }
  assert.equal(getMessageDisplayInfo(message({ provider: "claude" }), "openai").providerLabel, "Claude");
  assert.equal(getMessageDisplayInfo(message({ provider: "unknown" }), "openai").providerLabel, "AI");
});

test("image generation uses its label and neutral color", () => {
  const info = getMessageDisplayInfo(message({ provider: "image_gen", model_id: "gpt-image-2.5-sunburst" }));
  assert.equal(info.providerLabel, "画像生成");
  assert.equal(info.modelLabel, "GPT Image 2.5");
  assert.deepEqual(info.color, neutral);
});

test("hidden image placeholders display the original ID including legacy prefix", () => {
  for (const id of ["gpt-image-2", "gemini-3.1-flash-image", "gemini-3-pro-image", "openai/gpt-image-2"]) {
    const info = getMessageDisplayInfo(message({ provider: "image_gen", model_id: id }));
    assert.equal(info.modelLabel, id);
    assert.deepEqual(info.color, neutral);
  }
});

test("memo ignores model ID and safely returns neutral color", () => {
  const info = getMessageDisplayInfo(message({ provider: "memo", model_id: "gpt-4o" }));
  assert.equal(info.providerLabel, "メモ");
  assert.equal(info.modelLabel, null);
  assert.deepEqual(info.color, neutral);
});

test("deprecated text models retain their registry labels", () => {
  assert.equal(getModelDisplayLabel("gemini-3.5-flash"), "3.5 Flash");
  assert.equal(getModelDisplayLabel("gemini-3.7-flash"), "3.7 Flash");
});

test("hidden text models resolve labels without filtering by status", () => {
  // No hidden text entry currently exists; provide one without changing the registry source.
  const entry = { ...MODEL_REGISTRY.find(model => model.kind === "text"), id: "hidden-text-fixture", status: "hidden", label: "Hidden text label" };
  MODEL_REGISTRY.push(entry);
  try {
    assert.equal(getModelDisplayLabel(entry.id), entry.label);
  } finally {
    MODEL_REGISTRY.pop();
  }
});

test("unknown model IDs preserve the original spelling and prefix", () => {
  assert.equal(getModelDisplayLabel("unknown-model"), "unknown-model");
  assert.equal(getModelDisplayLabel("openai/Unknown-Model"), "openai/Unknown-Model");
});

test("legacy provider prefixes normalize before label lookup", () => {
  for (const [id, label] of [["gemini/gemini-3.8-flash", "3.8 Flash"], ["openai/gpt-4o", "GPT-4o"], ["claude/claude-sonnet-5-5", "Sonnet 5.5"]]) {
    assert.equal(getModelDisplayLabel(id), label);
  }
});

test("mismatched provider and model retain the provider and independently resolve the model", () => {
  const info = getMessageDisplayInfo(message({ provider: "claude", model_id: "gpt-4o" }));
  assert.equal(info.providerLabel, "Claude");
  assert.equal(info.modelLabel, "GPT-4o");
  assert.deepEqual(info.color, PROVIDER_COLORS.claude);
});

test("Arena retains slash separator, provider-only and unknown model behavior", () => {
  assert.equal(arena.getArenaMessageLabel(message({ model_id: "gpt-4o" }), "ChatGPT"), "ChatGPT / GPT-4o");
  for (const model_id of [null, "", undefined]) assert.equal(arena.getArenaMessageLabel(message({ model_id }), "Gemini"), "Gemini");
  assert.equal(arena.getArenaMessageLabel(message({ model_id: "unknown-model" }), "Claude"), "Claude / unknown-model");
});

test("Arena intentionally resolves legacy IDs for timeline and Markdown export labels", () => {
  assert.equal(arena.getArenaMessageLabel(message({ model_id: "gemini/gemini-3.8-flash" }), "Gemini"), "Gemini / 3.8 Flash");
});

test("Arena re-exports the canonical labels and colors and preserves あなた", () => {
  assert.strictEqual(arena.PROVIDER_LABELS, PROVIDER_LABELS);
  assert.strictEqual(arena.PROVIDER_COLORS, PROVIDER_COLORS);
  assert.equal(arena.PROVIDER_LABELS.human, "あなた");
  assert.deepEqual(PROVIDER_COLORS, {
    claude: { bg: "#f0f4ff", border: "#a5b4fc", text: "#3730a3" },
    gemini: { bg: "#f0fdf4", border: "#86efac", text: "#166534" },
    openai: { bg: "#fff7ed", border: "#fdba74", text: "#9a3412" },
    human: { bg: "#fdf4ff", border: "#e9d5ff", text: "#6b21a8" },
  });
});

test("MessageBubble renders provider, number, model label in order with prop fallback", () => {
  const render = (msg, provider) => renderToStaticMarkup(React.createElement(MessageBubble, { message: message(msg), provider, messageNumber: 7, apiKeyStore: {} }));
  assert.ok(render({ model_id: "gpt-4o" }, "openai").includes("ChatGPT · #7 · GPT-4o"));
  assert.ok(render({ provider: "claude", model_id: "claude-sonnet-5-5" }, "openai").includes("Claude · #7 · Sonnet 5.5"));
  assert.ok(render({ provider: "openai", model_id: null }).includes("ChatGPT · #7"));
  assert.ok(render({ provider: "unknown" }).includes("AI · #7"));
});

test("MessageBubble preserves user, memo and image generation headings", () => {
  for (const [msg, label] of [
    [{ role: "user", provider: "openai", model_id: "gpt-4o" }, "You · #7"],
    [{ provider: "memo" }, "📝 Memo"],
    [{ provider: "image_gen", model_id: "gpt-image-2.5-sunburst" }, "🖼️ 画像生成 · #7 · GPT Image 2.5"],
  ]) {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, { message: message(msg), messageNumber: 7, apiKeyStore: {} }));
    assert.ok(html.includes(label), label);
  }
});

test("discarded branch heading displays the resolved model label", () => {
  const html = renderToStaticMarkup(React.createElement(BranchBubble, { messages: [message({ provider: "gemini", model_id: "gemini/gemini-3.8-flash" })] }));
  assert.ok(html.includes("Gemini") && html.includes(" · 3.8 Flash"));
  assert.ok(!html.includes("gemini/gemini-3.8-flash"));
});
