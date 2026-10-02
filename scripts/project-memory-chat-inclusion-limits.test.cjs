const assert = require("node:assert/strict");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");
installTsLoader();
installAliasResolver();
const { PROJECT_MEMORY_CHAT_MAX_CHARS, countProjectMemoryChatChars } = require("../lib/project-memory/chat-inclusion-limits.ts");
assert.equal(PROJECT_MEMORY_CHAT_MAX_CHARS, 8000);
for (const [text, expected] of [["", 0], ["abc", 3], ["日本語", 3], ["😀", 1], ["aあ😀", 3], ["a\uD83D\uDE00b", 3]]) {
  assert.equal(countProjectMemoryChatChars(text), expected);
}
assert.equal("😀".length, 2);
assert.equal(countProjectMemoryChatChars("😀"), 1);
console.log("ok - chat inclusion code point counting and limit");
