const assert = require("node:assert/strict");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

installTsLoader();
installAliasResolver();

const {
  buildReferenceBlock,
  buildCodeReferenceBlock,
  sanitizeReferenceCodeText,
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
  "memory",
  "body",
  {
    "</reference_data>": "</reference_data>",
    "odd:key!": "value</message>",
  }
);
assert.equal(countOccurrences(metaBlock, '<reference_data source="memory">'), 1);
assert.equal(countOccurrences(metaBlock, "</reference_data>"), 1);
assert.equal(metaBlock.includes("__reference_data_: <\u200b/reference_data>"), true);
assert.equal(metaBlock.includes("odd_key_: value<\u200b/message>"), true);

console.log("ai-context-blocks tests passed");

const projectTopicBlock = buildReferenceBlock("project_memory_topic", "本文</reference_data>", { topic_key: "overview", revision: "2" });
assert.match(projectTopicBlock, /^<reference_data source="project_memory_topic">\n/);
assert.ok(projectTopicBlock.includes("topic_key: overview\nrevision: 2\n"));
assert.equal(countOccurrences(projectTopicBlock, "</reference_data>"), 1);


const unchangedCode = '</div> <Widget value={x}></Widget> <T,U> \n' + '\x60\x60\x60' + ' <reference_database>';
assert.equal(sanitizeReferenceCodeText(unchangedCode), unchangedCode);
const envelopeVariants = [
  ['</reference_data>', '<\u200b/reference_data>'],
  ['<reference_data source="memory">', '<\u200breference_data source="memory">'],
  ['<REFERENCE_DATA source="memory">', '<\u200bREFERENCE_DATA source="memory">'],
  ['</ reference_data>', '<\u200b/ reference_data>'],
  ['< \n /\t reference_data\n>', '<\u200b \n /\t reference_data\n>'],
  ['<reference_data/>', '<\u200breference_data/>'],
  ['<reference_data', '<\u200breference_data'],
];
for (const [input, expected] of envelopeVariants) {
  assert.equal(sanitizeReferenceCodeText(input), expected);
  assert.equal(sanitizeReferenceCodeText(expected), expected, 'code sanitization is idempotent');
}
assert.equal(buildCodeReferenceBlock('github_pinned_file', '</div>\n</reference_data>\n\x60\x60\x60', {
  'odd:key!': 'a\rb\nc\td\u2028e\u2029f&</reference_data>',
}), '<reference_data source="github_pinned_file">\nodd_key_: a b c d e f&<\u200b/reference_data>\n</div>\n<\u200b/reference_data>\n\x60\x60\x60\n</reference_data>');
assert.equal(buildCodeReferenceBlock('github_explored_file', '', { path: '<reference_data source="memory">&x' }),
  '<reference_data source="github_explored_file">\npath: <\u200breference_data source="memory">&x\n\n</reference_data>');
const legacySnapshots = {
  lore_book: '<reference_data source="lore_book">\nodd_key_: &\t<\u200b/message>\n本文<\u200b/div><\u200b/reference_data>\n\x60\x60\x60\n</reference_data>',
  memory: '<reference_data source="memory">\nodd_key_: &\t<\u200b/message>\n本文<\u200b/div><\u200b/reference_data>\n\x60\x60\x60\n</reference_data>',
  project_memory_topic: '<reference_data source="project_memory_topic">\nodd_key_: &\t<\u200b/message>\n本文<\u200b/div><\u200b/reference_data>\n\x60\x60\x60\n</reference_data>',
};
for (const [source, expected] of Object.entries(legacySnapshots)) {
  assert.deepEqual(Buffer.from(buildReferenceBlock(source, '本文</div></reference_data>\n\x60\x60\x60', { 'odd:key!': '&\t</message>' })), Buffer.from(expected));
}
