const assert = require("node:assert/strict");
const { installTsLoader } = require("./testBootstrap.cjs");

installTsLoader();

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
