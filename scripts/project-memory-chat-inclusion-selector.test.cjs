const assert = require("node:assert/strict");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");
installTsLoader();
installAliasResolver();
const { selectChatIncludedTopics, countProjectMemoryChatChars } = require("../lib/project-memory/chat-inclusion-limits.ts");
const { buildProjectMemoryChatBlock } = require("../lib/project-memory/chat-injection.ts");
const { buildReferencePreamble } = require("../lib/ai-context-blocks.ts");
const topic = (id, key, body, revision = 1) => ({ id, topic_key: key, content_md: body, revision });
const ids = topics => topics.map(t => t.id);
const input = [topic("z", "a", "あ😀"), topic("b", "Z", "x"), topic("a", "a", "y")];
const snapshot = structuredClone(input);
Object.freeze(input);
input.forEach(Object.freeze);
assert.deepEqual(ids(selectChatIncludedTopics(input).included), ["b", "a", "z"]);
assert.deepEqual(input, snapshot, "original order, length and entries stay unchanged");
const blank = selectChatIncludedTopics([topic("blank", "a", " \n\t\u3000 ")]);
assert.deepEqual(blank, { included: [], skipped: [], usedChars: 0 });
const continued = selectChatIncludedTopics([topic("a", "a", "123"), topic("b", "b", "1234"), topic("c", "c", "あ😀")], 5);
assert.deepEqual(ids(continued.included), ["a", "c"]);
assert.deepEqual(ids(continued.skipped), ["b"]);
assert.equal(continued.usedChars, 5);
assert.equal(selectChatIncludedTopics([topic("exact", "a", "あ😀a")], 3).usedChars, 3);
assert.deepEqual(ids(selectChatIncludedTopics([topic("over", "a", "あ😀ab")], 3).skipped), ["over"]);
assert.deepEqual(ids(selectChatIncludedTopics([topic("huge", "a", "あ".repeat(8001))]).skipped), ["huge"]);
assert.equal(selectChatIncludedTopics([topic("default", "a", "😀".repeat(8000))]).usedChars, 8000);
assert.deepEqual(buildProjectMemoryChatBlock([]), null);
assert.equal(buildProjectMemoryChatBlock([topic("blank", "a", "\t\n ")]), null);
assert.equal(buildProjectMemoryChatBlock([topic("big", "a", "xx")], 1), null);
const unsafe = [topic("one", 'key\n"</reference_data>', "  あ😀</reference_data>  ", 7), topic("two", "z", "abc", 2)];
const block = buildProjectMemoryChatBlock(unsafe);
assert.deepEqual(block.includedIds, ["one", "two"]);
assert.deepEqual(block.skippedIds, []);
assert.equal(block.text.split(buildReferencePreamble()).length - 1, 1);
assert.equal(block.text.split('<reference_data source="project_memory_topic">').length - 1, 2);
assert.equal(block.text.split("</reference_data>").length - 1, 2);
assert.ok(block.text.includes("topic_key: key &quot;&lt;/reference_data&gt;\nrevision: 7\n"));
assert.ok(block.text.includes("  あ😀<\u200b/reference_data>  "), "preserve body whitespace and sanitize closer");
assert.equal(buildProjectMemoryChatBlock(unsafe).text, block.text);
assert.equal(buildProjectMemoryChatBlock([...unsafe].reverse()).text, block.text, "input order does not affect cached bytes");
const selected = buildProjectMemoryChatBlock([topic("huge", "a", "123456"), topic("small", "b", "あ😀")], 2);
assert.deepEqual(selected.includedIds, ["small"]);
assert.deepEqual(selected.skippedIds, ["huge"]);
assert.ok(countProjectMemoryChatChars(selected.text) > 2, "max counts bodies, excluding preamble, tags and meta");
console.log("ok - deterministic non-mutating code point selector, skipping and safe memory block");

const { summarizeChatInclusion, PROJECT_MEMORY_CHAT_MAX_CHARS } = require("../lib/project-memory/chat-inclusion-limits.ts");
const off = { ...topic("off", "a", "Content"), include_in_chat: false };
assert.deepEqual(summarizeChatInclusion([off]), { usedChars: 0, max: PROJECT_MEMORY_CHAT_MAX_CHARS, notInjected: [] });
const summaryInput = [
  { ...topic("z", "a", "\n\t"), include_in_chat: true },
  { ...topic("huge", "Z", "あ".repeat(PROJECT_MEMORY_CHAT_MAX_CHARS + 1)), include_in_chat: true },
  { ...topic("a", "a", "   "), include_in_chat: true },
  { ...topic("small", "b", "あ😀"), include_in_chat: true }, off,
];
const summaryBefore = structuredClone(summaryInput);
summaryInput.forEach(Object.freeze); Object.freeze(summaryInput);
const summary = summarizeChatInclusion(summaryInput);
assert.equal(summary.usedChars, 2);
assert.equal(summary.max, PROJECT_MEMORY_CHAT_MAX_CHARS);
assert.deepEqual(ids(summary.notInjected), ["huge", "a", "z"]);
assert.deepEqual(summaryInput, summaryBefore);
assert.deepEqual(ids(selectChatIncludedTopics(summaryInput.filter(t => t.include_in_chat)).included), ["small"]);
console.log("ok - summary includes skipped and whitespace-only ON topics, ordered and non-mutating");
