const assert = require("node:assert/strict");
const test = require("node:test");
const { installTsLoader } = require("./testBootstrap.cjs");
installTsLoader();
const { buildMessageWithTextFiles } = require("../lib/attachmentContent.ts");
test("attachment content keeps legacy literal bytes and raw queryText", () => {
  const cases = [
    [" 前回の話 ", [], " 前回の話 "],
    ["", [], ""],
    [" \n", [], " \n"],
    [" 前回の話 ", [{ name: "data.CSV", content: "a,b\r\n1,2" }], " 前回の話 \n\n\x60\x60\x60csv\na,b\r\n1,2\n\x60\x60\x60"],
    ["", [{ name: "notes.MD", content: "# 設定" }], "\x60\x60\x60markdown\n# 設定\n\x60\x60\x60"],
    [" \n", [{ name: "file", content: "過去😀" }, { name: "x.json", content: "{}" }], "\x60\x60\x60text\n過去😀\n\x60\x60\x60\n\n\x60\x60\x60text\n{}\n\x60\x60\x60"],
  ];
  for (const [value, files, expected] of cases) {
    const result = buildMessageWithTextFiles(value, files);
    assert.deepEqual(Buffer.from(result.content), Buffer.from(expected));
    assert.equal(result.queryText, value);
    if (!files.length) assert.equal(result.content, value);
  }
});

const { splitMessageContent, replaceQueryText } = require("../lib/attachmentContent.ts");
const attachmentSets = [
  [],
  [{ name: "x.csv", content: "a,b\r\n1,2" }],
  [{ name: "x.csv", content: "a,b" }, { name: "y.md", content: "# 見出し\n```" }, { name: "z.txt", content: "text😀\r\n" }],
];
for (const original of ["raw", "", " \n\t", "raw\n\nmore", "```text\nuser fence\n```", " \nraw "]) {
  test(`split/replace round trips literal attachment bytes for ${JSON.stringify(original)}`, () => {
    for (const files of attachmentSets) {
      const built = buildMessageWithTextFiles(original, files);
      const blocks = files.length ? buildMessageWithTextFiles("", files).content : "";
      assert.deepEqual(splitMessageContent(built.content, original), { attachmentBlocks: blocks });
      for (const edited of ["edited", "", " \n\t", "  edited \n", "```\n\nnew"]) {
        const result = replaceQueryText(built.content, original, edited);
        const expected = buildMessageWithTextFiles(edited, files);
        assert.deepEqual(result, expected);
        assert.deepEqual(Buffer.from(result.content), Buffer.from(expected.content));
        assert.deepEqual(splitMessageContent(result.content, edited), { attachmentBlocks: blocks });
      }
    }
  });
}
test("split and replace fail closed for mismatched prefix and non-fenced attachment blocks", () => {
  for (const [content, query] of [
    ["other\n\n```text\nx\n```", "raw"],
    ["raw\n\ntext", "raw"],
    ["raw\n\n```text\nx", "raw"],
    ["raw\n\ntext```", "raw"],
    ["not fenced", ""],
    ["not fenced", " \n"],
  ]) {
    assert.equal(splitMessageContent(content, query), null);
    assert.equal(replaceQueryText(content, query, "edit"), null);
  }
});
