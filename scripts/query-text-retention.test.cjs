const assert = require("node:assert/strict");
const test = require("node:test");
require("./testBootstrap.cjs").installTsLoader();
const { createQueryTextRetention } = require("../lib/queryTextRetention.ts");
const { buildMessageWithTextFiles } = require("../lib/attachmentContent.ts");
const files = [{ name: "a.md", content: "前回の話\r\n```" }];

test("retention remembers raw input, permits empty input and forgets explicitly", () => {
  const store = createQueryTextRetention();
  for (const query of ["raw ", "", " \n"]) {
    const message = { id: "u", content: buildMessageWithTextFiles(query, files).content };
    store.remember(message.id, query, message.content);
    assert.equal(store.get(message), query);
    store.forget(message.id);
    assert.equal(store.get(message), null);
  }
});

test("retention rejects unknown IDs, changed content, invalid fences and attachment-free input", () => {
  const store = createQueryTextRetention();
  const message = { id: "u", content: buildMessageWithTextFiles("raw", files).content };
  assert.equal(store.get(message), null);
  store.remember(message.id, "raw", message.content);
  assert.equal(store.get({ ...message, content: message.content + " masked" }), null);
  for (const content of ["raw\n\nno fence", "other\n\n```text\nx\n```", "raw\n\n```text\nx", "raw", ""]) {
    const query = content === "" ? "" : "raw";
    store.remember(message.id, query, content);
    assert.equal(store.get({ id: message.id, content }), null);
  }
  // An attachment-free overwrite also removes an earlier entry for this ID.
  assert.equal(store.get(message), null);
});

test("factory instances are independent, including page reload", () => {
  const a = createQueryTextRetention();
  const b = createQueryTextRetention();
  const message = { id: "u", content: buildMessageWithTextFiles("raw", files).content };
  a.remember(message.id, "raw", message.content);
  assert.equal(a.get(message), "raw");
  assert.equal(b.get(message), null);
  b.forget(message.id);
  assert.equal(a.get(message), "raw");
});
