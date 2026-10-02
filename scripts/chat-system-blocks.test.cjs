const assert = require("node:assert/strict");
require("./testBootstrap.cjs").installTsLoader();
const { buildClaudeSystemBlocks: build, buildCombinedSystemPrompt: combine } = require("../lib/chat-system-blocks.ts");
const cache = { type: "ephemeral" };
const block = (text, cached = false) => ({ type: "text", text, ...(cached ? { cache_control: cache } : {}) });
assert.deepEqual(build({ stable: " stable ", cached: [] }), [block("stable", true)]);
assert.deepEqual(build({ stable: "stable", cached: [], dynamic: "dynamic" }), [block("stable", true), block("dynamic")]);
assert.deepEqual(build({ stable: " stable ", cached: [{ label: "pin", text: " pinned " }], dynamic: " dynamic " }), [block("stable", true), block("pinned", true), block("dynamic")]);
assert.deepEqual(build({ stable: " ", cached: [{ label: "empty", text: "" }, { label: "blank", text: " \n" }], dynamic: " " }), []);
for (const stable of ["stable", "", " "]) {
  for (let count = 0; count <= 8; count++) {
    const input = { stable, cached: Array.from({ length: count }, (_, i) => ({ label: String(i), text: "cache" + i })).flatMap(b => [b, { label: "empty", text: " " }]), dynamic: "dynamic" };
    const result = build(input);
    assert.equal(JSON.stringify(result), JSON.stringify(build(input)));
    const marked = result.filter(b => b.cache_control).map(b => b.text);
    const expected = stable.trim() ? ["stable", ...Array.from({ length: Math.min(count - 1, 1) }, (_, i) => "cache" + i), ...(count ? ["cache" + (count - 1)] : [])] : [...Array.from({ length: Math.min(count - 1, 2) }, (_, i) => "cache" + i), ...(count ? ["cache" + (count - 1)] : [])];
    assert.deepEqual(marked, [...new Set(expected)]);
    assert.ok(marked.length <= 3);
    assert.equal(result.at(-1).cache_control, undefined);
  }
}
// Reproduce the old append rules, including leading newlines from reference blocks.
for (const stable of ["stable", "", " stable\r\n"]) {
  for (const pre of ["", "participant", "\n\npreamble\n\nLore\n\nMemory\n\nparticipant", " "]) {
    for (const pinned of ["", "Pinned\r\n本文 "]) {
      for (const discovery of ["", "discovery"]) {
        for (const rag of ["", "\n\nRAG"]) {
          let old = pre;
          if (pinned) old = old ? old + "\n\n" + pinned : pinned;
          if (discovery) old = old ? old + "\n\n" + discovery : discovery;
          old += rag;
          const expected = old ? stable + "\n\n" + old : stable;
          const post = (discovery ? ((pre || pinned) ? "\n\n" : "") + discovery : "") + rag;
          const actual = combine({ stable, cached: pinned ? [{ label: "pin", text: pinned }] : [], pre, post });
          assert.deepEqual(Buffer.from(actual), Buffer.from(expected));
        }
      }
    }
  }
}
console.log("passed chat system blocks tests");
