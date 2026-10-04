const assert = require("node:assert/strict");
const test = require("node:test");
const {
  installAliasResolver,
  installTsLoader,
} = require("./testBootstrap.cjs");

installTsLoader();
installAliasResolver();

const {
  CHAT_LORE_SEARCH_POLICY,
} = require("../lib/lore/types.ts");

test("CHAT_LORE_SEARCH_POLICY preserves distinct search policies", () => {
  assert.deepEqual(CHAT_LORE_SEARCH_POLICY, {
    query: { maxCodePoints: 2_000 },
    combined: {
      timeoutMs: 3_000,
    },
    loreBook: {
      topK: 3,
    },
    memory: {
      topK: 5,
      matchThreshold: 0.3,
    },
  });
});
