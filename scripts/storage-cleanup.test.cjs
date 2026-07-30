const assert = require("node:assert/strict");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

installTsLoader();
installAliasResolver();

const {
  collectOwnedStoragePaths,
  listAllObjectPathsUnderPrefix,
  removeStoragePaths,
} = require("../lib/supabase/storage-cleanup.ts");

const pendingTests = [];

function test(name, fn) {
  pendingTests.push(
    Promise.resolve()
      .then(fn)
      .then(() => console.log(`ok - ${name}`))
      .catch((error) => {
        console.error(`not ok - ${name}`);
        throw error;
      })
  );
}

test("collectOwnedStoragePaths deduplicates owned paths and excludes invalid paths", () => {
  const rows = [
    { metadata: { storagePath: "user-1/thread/a.png" } },
    { metadata: { storagePath: "user-1/thread/a.png" } },
    { metadata: { storagePath: "other-user/thread/b.png" } },
    { metadata: { storagePath: "user-1/../other/c.png" } },
    { metadata: { storagePath: 123 } },
    { metadata: null },
    {},
  ];

  assert.deepEqual(collectOwnedStoragePaths(rows, "user-1"), [
    "user-1/thread/a.png",
  ]);
});

test("removeStoragePaths removes at most 1000 paths per call", async () => {
  const calls = [];
  const supabase = {
    storage: {
      from(bucket) {
        assert.equal(bucket, "generated-images");
        return {
          async remove(paths) {
            calls.push(paths);
            return { data: [], error: null };
          },
        };
      },
    },
  };
  const paths = Array.from({ length: 2001 }, (_, index) => `user-1/${index}.png`);

  const result = await removeStoragePaths(supabase, paths);

  assert.deepEqual(calls.map((chunk) => chunk.length), [1000, 1000, 1]);
  assert.deepEqual(result, {
    attemptedCount: 2001,
    succeededCount: 2001,
    failedCount: 0,
    errorCodes: [],
  });
});

test("removeStoragePaths aggregates returned and thrown errors without throwing", async () => {
  let callCount = 0;
  const supabase = {
    storage: {
      from() {
        return {
          async remove() {
            callCount += 1;
            if (callCount === 1) {
              return { data: null, error: { statusCode: "first-error" } };
            }
            throw Object.assign(new Error("second error"), { code: "second-error" });
          },
        };
      },
    },
  };
  const paths = Array.from({ length: 1001 }, (_, index) => `user-1/${index}.png`);

  const result = await removeStoragePaths(supabase, paths);

  assert.deepEqual(result, {
    attemptedCount: 1001,
    succeededCount: 0,
    failedCount: 1001,
    errorCodes: ["first-error", "second-error"],
  });
});

test("listAllObjectPathsUnderPrefix paginates and recursively walks folders", async () => {
  const calls = [];
  const rootPage = Array.from({ length: 1000 }, (_, index) => ({
    name: `${index}.png`,
    id: `file-${index}`,
  }));
  rootPage[999] = { name: "nested", id: null };

  const supabase = {
    storage: {
      from(bucket) {
        assert.equal(bucket, "generated-images");
        return {
          async list(prefix, options) {
            calls.push({ prefix, options });
            if (prefix === "user-1" && options.offset === 0) {
              return { data: rootPage, error: null };
            }
            if (prefix === "user-1/nested") {
              return {
                data: [{ name: "child.png", id: "child-file" }],
                error: null,
              };
            }
            return {
              data: [{ name: "last.png", id: "last-file" }],
              error: null,
            };
          },
        };
      },
    },
  };

  const paths = await listAllObjectPathsUnderPrefix(supabase, "user-1/");

  assert.deepEqual(calls, [
    { prefix: "user-1", options: { limit: 1000, offset: 0 } },
    { prefix: "user-1/nested", options: { limit: 1000, offset: 0 } },
    { prefix: "user-1", options: { limit: 1000, offset: 1000 } },
  ]);
  assert.equal(paths.length, 1001);
  assert.equal(paths.includes("user-1/nested"), false);
  assert.equal(paths.includes("user-1/nested/child.png"), true);
  assert.equal(paths.includes("user-1/last.png"), true);
});

test("listAllObjectPathsUnderPrefix throws when listing fails", async () => {
  const expectedError = new Error("listing failed");
  const supabase = {
    storage: {
      from() {
        return {
          async list() {
            return { data: null, error: expectedError };
          },
        };
      },
    },
  };

  await assert.rejects(
    listAllObjectPathsUnderPrefix(supabase, "user-1"),
    expectedError
  );
});

Promise.all(pendingTests)
  .then(() => console.log(`${pendingTests.length} storage cleanup tests passed`))
  .catch(() => {
    process.exitCode = 1;
  });
