const assert = require("node:assert/strict");
const { test } = require("node:test");
const { installTsLoader } = require("./testBootstrap.cjs");
installTsLoader();
const { summarizeProjectMemory } = require("../lib/project-memory/summary.ts");

function topic(overrides = {}) {
  return { id: "topic", topic_key: "overview", content_md: "body", include_in_chat: false,
    promotion: { status: "not_promoted" }, ...overrides };
}

test("empty topics report standard 0/4 and zero counts", () => {
  assert.deepEqual(summarizeProjectMemory([]), {
    standardCreated: 0, standardTotal: 4, chatOnCount: 0, chatInjectedCount: 0,
    chatUsedChars: 0, chatMaxChars: 8000, loreRegisteredCount: 0, loreStaleCount: 0,
    notInjectedNotPromotedCount: 0,
  });
});
test("standard count excludes custom keys and counts the intersection once per key", () => {
  const summary = summarizeProjectMemory([
    topic(), topic({ id: "duplicate-key" }), topic({ id: "custom", topic_key: "custom" }),
    ...["current-work", "principles", "references"].map(key => topic({ id: key, topic_key: key })),
  ]);
  assert.equal(summary.standardCreated, 4);
  assert.equal(summarizeProjectMemory([topic({ topic_key: "custom" })]).standardCreated, 0);
});
test("ON not_promoted topic exceeding 8000 chars counts as not injected and not promoted", () => {
  const summary = summarizeProjectMemory([topic({ include_in_chat: true, content_md: "x".repeat(8001) })]);
  assert.equal(summary.chatOnCount, 1);
  assert.equal(summary.chatInjectedCount, 0);
  assert.equal(summary.chatUsedChars, 0);
  assert.equal(summary.notInjectedNotPromotedCount, 1);
});
test("stale non-injected topic counts as Lore registered with updates, never as Lore unregistered", () => {
  const summary = summarizeProjectMemory([topic({ promotion: { status: "stale" } })]);
  assert.equal(summary.loreRegisteredCount, 1);
  assert.equal(summary.loreStaleCount, 1);
  assert.equal(summary.chatInjectedCount, 0);
  assert.equal(summary.notInjectedNotPromotedCount, 0);
});
test("empty and whitespace ON topics are excluded from current injection", () => {
  const summary = summarizeProjectMemory([topic({ include_in_chat: true, content_md: "" }),
    topic({ id: "whitespace", include_in_chat: true, content_md: " \n\t" })]);
  assert.equal(summary.chatOnCount, 2);
  assert.equal(summary.chatInjectedCount, 0);
  assert.equal(summary.notInjectedNotPromotedCount, 2);
});
test("ON plus current plus nonempty content within budget counts as currently injected", () => {
  const onCurrentNonemptyWithinBudget = topic({ include_in_chat: true, content_md: "😀".repeat(8000), promotion: { status: "current" } });
  const summary = summarizeProjectMemory([onCurrentNonemptyWithinBudget]);
  assert.equal(summary.chatInjectedCount, 1);
  assert.equal(summary.chatUsedChars, 8000);
  assert.equal(summary.loreRegisteredCount, 1);
  assert.equal(summary.notInjectedNotPromotedCount, 0);
});
test("OFF plus current counts as Lore registered, excluded from current injection", () => {
  const summary = summarizeProjectMemory([topic({ include_in_chat: false, promotion: { status: "current" } })]);
  assert.equal(summary.chatOnCount, 0);
  assert.equal(summary.chatInjectedCount, 0);
  assert.equal(summary.loreRegisteredCount, 1);
  assert.equal(summary.notInjectedNotPromotedCount, 0);
});
test("combined budget skips an overflowing ON topic and includes later fitting content", () => {
  const topics = [
    topic({ id: "a", topic_key: "a", include_in_chat: true, content_md: "a".repeat(7000) }),
    topic({ id: "b", topic_key: "b", include_in_chat: true, content_md: "b".repeat(1001) }),
    topic({ id: "c", topic_key: "c", include_in_chat: true, content_md: "c".repeat(1000) }),
  ];
  const snapshot = JSON.stringify(topics);
  const summary = summarizeProjectMemory(topics.reverse());
  assert.equal(summary.chatOnCount, 3);
  assert.equal(summary.chatInjectedCount, 2);
  assert.equal(summary.chatUsedChars, 8000);
  assert.equal(summary.notInjectedNotPromotedCount, 1);
  assert.equal(JSON.stringify(topics.reverse()), snapshot, "summary must not mutate topics");
});
