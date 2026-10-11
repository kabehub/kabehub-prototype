const assert = require("node:assert/strict");
const { test } = require("node:test");
const { installTsLoader } = require("./testBootstrap.cjs");
installTsLoader();
const { extractClaudeSettingsText } = require("../lib/extractSettingsResponse.ts");

test("Claude settings text ignores thinking and joins all text blocks in order", () => {
  assert.equal(extractClaudeSettingsText([
    { type: "thinking", thinking: "private", text: "must not use" },
    { type: "text", text: '{"characters":' },
    { type: "text", text: '[]}' },
  ]), '{"characters":[]}');
});

test("Claude settings text returns failure without throwing for invalid content", () => {
  for (const content of [[], [{ type: "thinking", thinking: "private" }], undefined, null, {}, "text",
    [null, 1], [{ type: "text" }], [{ type: "text", text: 42 }]]) {
    assert.equal(extractClaudeSettingsText(content), null);
  }
});
