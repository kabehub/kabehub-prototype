const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2018,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { isOwnedStoragePath } = require("../lib/storage-path-guard.ts");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const userId = "userId";

test("accepts a path owned by the user", () => {
  assert.equal(isOwnedStoragePath("userId/thread/file.png", userId), true);
});

test("rejects another user's prefix", () => {
  assert.equal(isOwnedStoragePath("otherUserId/thread/file.png", userId), false);
});

test("rejects a leading slash", () => {
  assert.equal(isOwnedStoragePath("/userId/thread/file.png", userId), false);
});

test("rejects parent-directory traversal", () => {
  assert.equal(isOwnedStoragePath("userId/../other/file.png", userId), false);
});

test("rejects a backslash mixed into an otherwise matching path", () => {
  // This is the regression case: unlike a fully Windows-style path, the prefix
  // still matches, so the explicit backslash guard is required for rejection.
  assert.equal(isOwnedStoragePath("userId/thread\\file.png", userId), false);
});

test("rejects a fully Windows-style path", () => {
  assert.equal(isOwnedStoragePath("userId\\thread\\file.png", userId), false);
});

test("rejects non-string values and an empty string", () => {
  for (const value of [null, undefined, 123, {}, ""]) {
    assert.equal(isOwnedStoragePath(value, userId), false);
  }
});
