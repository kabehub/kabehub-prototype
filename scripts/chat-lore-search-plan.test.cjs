const assert = require("node:assert/strict");
const test = require("node:test");
const { installTsLoader } = require("./testBootstrap.cjs");
installTsLoader();
const { buildChatLoreSearchPlan } = require("../lib/lore/chat-search-plan.ts");
// Expected triggers are independent literals, never imported from production constants.
const words = ["前に", "以前", "覚えて", "覚えてる", "方針", "このプロジェクト", "前回", "過去ログ", "引き継ぎ", "RAG", "KabeHub", "メモリ", "記憶", "これまで", "過去", "続き", "決定", "好み", "設定"];
for (const word of words) {
  test("memory trigger: " + word, () => {
    assert.deepEqual(buildChatLoreSearchPlan({ userContent: "質問：" + word + "について", isTemporary: false, hasOpenaiKey: true, loreEnabled: false, loreTargetProjectId: null }), { wantsLoreBook: false, wantsMemory: true });
  });
}
for (const userContent of ["", "こんにちは", "前回"]) {
  for (const isTemporary of [false, true]) {
    for (const hasOpenaiKey of [false, true]) {
      for (const loreEnabled of [false, true]) {
        for (const loreTargetProjectId of [null, "project-id"]) {
          test(JSON.stringify({ userContent, isTemporary, hasOpenaiKey, loreEnabled, loreTargetProjectId }), () => {
            assert.deepEqual(buildChatLoreSearchPlan({ userContent, isTemporary, hasOpenaiKey, loreEnabled, loreTargetProjectId }), {
              wantsLoreBook: loreEnabled && hasOpenaiKey && loreTargetProjectId !== null,
              wantsMemory: !isTemporary && hasOpenaiKey && userContent === "前回",
            });
          });
        }
      }
    }
  }
}
