const assert = require("node:assert/strict");
const { test } = require("node:test");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

installAliasResolver();
installTsLoader({ jsx: true });
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "next/navigation") return { useRouter: () => ({ push() {} }) };
  return originalLoad.call(this, request, parent, isMain);
};
const BranchTree = require("../components/BranchTree.tsx").default;
Module._load = originalLoad;
const { PROVIDER_COLORS } = require("../lib/messageDisplay.ts");
const { generateMessageSummary } = require("../lib/stringUtils.ts");
const { computeTreeLayout } = require("../lib/branchTree.ts");

const node = (overrides = {}, layout = {}) => ({
  id: "m1", x: 1, y: 0, width: 1, depth: 0, isCurrentLane: false, isCommon: true,
  message: { id: "m1", thread_id: "t1", role: "assistant", content: "**要約**を表示", provider: "claude", model_id: "claude-sonnet-5-5", message_number: 7, created_at: "2026-10-21T00:00:00Z", ...overrides },
  ...layout,
});
const render = (nodes, edges = []) => renderToStaticMarkup(React.createElement(BranchTree, { threadId: "t1", nodes, edges }));
const spanWithText = (html, text) => [...html.matchAll(/<span\b([^>]*)>([^<]*)<\/span>/g)].find(match => match[2] === text)?.[1];

test("each provider node displays registry label, provider text color and 3px accent", () => {
  for (const [provider, model_id, providerLabel, modelLabel] of [
    ["claude", "claude-sonnet-5-5", "Claude", "Sonnet 5.5"],
    ["gemini", "gemini-3.8-flash", "Gemini", "3.8 Flash"],
    ["openai", "gpt-4o", "ChatGPT", "GPT-4o"],
  ]) {
    const html = render([node({ provider, model_id })]);
    assert.match(spanWithText(html, providerLabel), new RegExp(`color:${PROVIDER_COLORS[provider].text}`));
    assert.ok(spanWithText(html, modelLabel));
    assert.ok(html.includes(`width:3px;border-radius:7px 0 0 7px;background:${PROVIDER_COLORS[provider].border}`));
    assert.ok(html.includes("要約を表示"));
  }
});

test("user node shows #N · You with human accent and no model", () => {
  const html = render([node({ role: "user", provider: "openai", model_id: "gpt-4o" })]);
  assert.ok(spanWithText(html, "#7"));
  assert.match(spanWithText(html, "You"), /flex-shrink:0;color:#6b21a8/);
  assert.ok(html.includes("background:#e9d5ff"));
  assert.ok(!html.includes("GPT-4o") && !html.includes("ChatGPT"));
  assert.match(html, /title="You\n要約を表示"/);
});

test("missing model ID shows only the provider without a trailing separator", () => {
  const html = render([node({ provider: "gemini", model_id: null })]);
  assert.match(html, /title="Gemini\n要約を表示"/);
  assert.equal((html.match(/>·<\/span>/g) ?? []).length, 1);
  assert.ok(!html.includes("flex:1;overflow:hidden"));
});

test("current lane preserves blue border, background, number and connector alongside provider color", () => {
  const parent = node({}, { id: "parent" });
  const current = node({ provider: "gemini", model_id: "gemini-3.8-flash" }, { id: "current", y: 1, depth: 1, isCurrentLane: true });
  const html = render([parent, current], [{ fromId: "parent", toId: "current" }]);
  const button = html.match(/<button\b[^>]*title="Gemini[^]*?<\/button>/)?.[0];
  assert.ok(button);
  assert.ok(button.includes("border:1px solid #2563eb;background:#eff6ff"));
  assert.match(spanWithText(button, "#7"), /color:#2563eb/);
  assert.match(spanWithText(button, "Gemini"), /color:#166534/);
  assert.ok(button.includes("background:#86efac"));
  assert.match(html, /stroke="#2563eb" stroke-width="2.5"/);
});

test("title contains model label and the existing generated summary", () => {
  const content = "**強調** [リンク](https://example.com) " + "長い文章".repeat(20);
  const summary = generateMessageSummary(content, 42);
  const html = render([node({ content })]);
  assert.ok(html.includes(`title="Claude · Sonnet 5.5\n${summary}"`));
  assert.ok(spanWithText(html, summary));
});

test("long model names truncate only the model span and preserve number/provider", () => {
  const longId = "unknown-very-long-model-name-".repeat(8);
  const html = render([node({ model_id: longId })]);
  for (const text of ["#7", "Claude"]) {
    const attributes = spanWithText(html, text);
    assert.match(attributes, /flex-shrink:0/);
    assert.doesNotMatch(attributes, /overflow|text-overflow/);
  }
  const modelAttributes = spanWithText(html, longId);
  for (const style of ["min-width:0", "flex:1", "overflow:hidden", "text-overflow:ellipsis", "white-space:nowrap"]) assert.ok(modelAttributes.includes(style), style);
  assert.match(html, /display:flex;align-items:center;gap:4px;width:100%;min-width:0/);
});

test("node and column widths change while height, row spacing and padding stay fixed", () => {
  const first = node();
  const second = node({ message_number: 9 }, { id: "m2", x: 2, y: 1, depth: 1 });
  const html = render([first, second]);
  assert.ok(html.includes("left:200px;top:27px;width:208px;height:58px"));
  assert.ok(html.includes("left:448px;top:159px;width:208px;height:58px"));
});

test("image and unknown providers use neutral display and memo stays excluded by tree layout", () => {
  const image = render([node({ provider: "image_gen", model_id: "gpt-image-2" })]);
  assert.ok(spanWithText(image, "画像生成"));
  assert.ok(spanWithText(image, "gpt-image-2"));
  assert.ok(image.includes("background:#d8d8cf"));
  assert.match(spanWithText(image, "画像生成"), /color:#6b6b63/);
  const unknown = render([node({ provider: "unknown", model_id: null })]);
  assert.ok(spanWithText(unknown, "AI"));
  const layout = computeTreeLayout([node().message, node({ id: "memo", provider: "memo" }).message], {});
  assert.equal(layout.nodes.length, 1);
  assert.ok(!render(layout.nodes, layout.edges).includes("メモ"));
});
