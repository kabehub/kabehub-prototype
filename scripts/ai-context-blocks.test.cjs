const assert = require("node:assert/strict");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

installTsLoader();
installAliasResolver();

const {
  buildReferenceBlock,
  sanitizeAttributeValue,
  sanitizeReferenceText,
} = require("../lib/ai-context-blocks.ts");

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

const sanitizedClosers = sanitizeReferenceText("</reference_data></message></file>");
assert.equal(sanitizedClosers.includes("</"), false);

const sanitizedFence = sanitizeReferenceText("```html\n`</div>`\n```");
assert.equal(sanitizedFence.includes("</"), false);
assert.equal(sanitizedFence.includes("<\u200b/div>"), true);

const sanitizedAttribute = sanitizeAttributeValue('a" b< c> d&\ne');
assert.equal(sanitizedAttribute.includes('"'), false);
assert.equal(sanitizedAttribute.includes("<"), false);
assert.equal(sanitizedAttribute.includes(">"), false);
assert.equal(/[\r\n\t]/.test(sanitizedAttribute), false);
assert.equal(sanitizedAttribute.includes("&amp;"), true);
assert.equal(/&(?!amp;|quot;|lt;|gt;)/.test(sanitizedAttribute), false);

const memoryBlock = buildReferenceBlock("memory", "本文</reference_data>");
assert.equal(countOccurrences(memoryBlock, '<reference_data source="memory">'), 1);
assert.equal(countOccurrences(memoryBlock, "</reference_data>"), 1);
assert.equal(memoryBlock.includes("本文<\u200b/reference_data>"), true);

const metaBlock = buildReferenceBlock(
  "rag_memory",
  "body",
  {
    "</reference_data>": "</reference_data>",
    "odd:key!": "value</message>",
  }
);
assert.equal(countOccurrences(metaBlock, '<reference_data source="rag_memory">'), 1);
assert.equal(countOccurrences(metaBlock, "</reference_data>"), 1);
assert.equal(metaBlock.includes("__reference_data_: <\u200b/reference_data>"), true);
assert.equal(metaBlock.includes("odd_key_: value<\u200b/message>"), true);

console.log("ai-context-blocks tests passed");
