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
