const assert = require("node:assert/strict");
const test = require("node:test");
const { installTsLoader } = require("./testBootstrap.cjs");
installTsLoader();
const { buildChatLoreSearchPlan, buildChatSearchQueries } = require("../lib/lore/chat-search-plan.ts");
// Expected triggers are independent literals, never imported from production constants.
const words = ["前に", "以前", "覚えて", "覚えてる", "方針", "このプロジェクト", "前回", "過去ログ", "引き継ぎ", "RAG", "KabeHub", "メモリ", "記憶", "これまで", "過去", "続き", "決定", "好み", "設定"];
for (const word of words) {
  test("memory trigger: " + word, () => {
    assert.deepEqual(buildChatLoreSearchPlan({ triggerText: "質問：" + word + "について", isTemporary: false, hasOpenaiKey: true, loreEnabled: false, loreTargetProjectId: null }), { wantsLoreBook: false, wantsMemory: true });
  });
}
for (const userContent of ["", "こんにちは", "前回"]) {
  for (const isTemporary of [false, true]) {
    for (const hasOpenaiKey of [false, true]) {
      for (const loreEnabled of [false, true]) {
        for (const loreTargetProjectId of [null, "project-id"]) {
          test(JSON.stringify({ userContent, isTemporary, hasOpenaiKey, loreEnabled, loreTargetProjectId }), () => {
            assert.deepEqual(buildChatLoreSearchPlan({ triggerText: userContent, isTemporary, hasOpenaiKey, loreEnabled, loreTargetProjectId }), {
              wantsLoreBook: loreEnabled && hasOpenaiKey && loreTargetProjectId !== null,
              wantsMemory: !isTemporary && hasOpenaiKey && userContent === "前回",
            });
          });
        }
      }
    }
  }
}

test("query derivation preserves raw text, fallback and independent attachment query", () => {
  const cases = [
    [{ userContent: " 前回の話 " }, { triggerText: " 前回の話 ", memoryQuery: " 前回の話 ", loreBookQuery: " 前回の話 ", sharedEmbedding: true }],
    [{ userContent: "設定", queryText: "" }, { triggerText: "", memoryQuery: "", loreBookQuery: "設定", sharedEmbedding: false }],
    [{ userContent: "こんにちは\n\n設定・過去", queryText: "こんにちは" }, { triggerText: "こんにちは", memoryQuery: "こんにちは", loreBookQuery: "こんにちは\n\n設定・過去", sharedEmbedding: false }],
    [{ userContent: "前回の方針は？", queryText: "前回の方針は？" }, { triggerText: "前回の方針は？", memoryQuery: "前回の方針は？", loreBookQuery: "前回の方針は？", sharedEmbedding: true }],
    [{ userContent: "設定", queryText: 42 }, { triggerText: "設定", memoryQuery: "設定", loreBookQuery: "設定", sharedEmbedding: true }],
  ];
  for (const [input, expected] of cases) {
    const actual = buildChatSearchQueries({ ...input, maxCodePoints: 2000 });
    assert.deepEqual(actual, expected);
    assert.equal(buildChatLoreSearchPlan({ triggerText: actual.triggerText, isTemporary: false, hasOpenaiKey: true, loreEnabled: false, loreTargetProjectId: null }).wantsMemory, ["設定", "前回の方針は？", " 前回の話 "].includes(expected.triggerText));
  }
});
test("2000 code points: exact limit, overflow, surrogate boundary and full raw trigger", () => {
  for (const text of ["a".repeat(2000), "a".repeat(2001), "a".repeat(1999) + "😀" + "過去", "😀".repeat(2001)]) {
    const actual = buildChatSearchQueries({ userContent: text, maxCodePoints: 2000 });
    assert.equal(actual.triggerText, text);
    assert.equal(actual.memoryQuery, Array.from(text).slice(0, 2000).join(""));
    assert.equal(actual.loreBookQuery, actual.memoryQuery);
    assert.equal(actual.sharedEmbedding, true);
    assert.equal(Array.from(actual.memoryQuery).length, 2000);
  }
  const actual = buildChatSearchQueries({ userContent: "a".repeat(1999) + "😀" + "過去", queryText: "前回", maxCodePoints: 2000 });
  assert.equal(actual.loreBookQuery, "a".repeat(1999) + "😀");
  assert.equal(actual.memoryQuery, "前回");
  assert.equal(actual.sharedEmbedding, false);
  const fallback = buildChatSearchQueries({ userContent: "a".repeat(2000) + "過去", maxCodePoints: 2000 });
  assert.equal(buildChatLoreSearchPlan({ triggerText: fallback.triggerText, isTemporary: false, hasOpenaiKey: true, loreEnabled: false, loreTargetProjectId: null }).wantsMemory, true);
});
