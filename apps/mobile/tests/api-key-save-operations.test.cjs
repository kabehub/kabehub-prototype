const assert = require("node:assert/strict");
const test = require("node:test");

const { sourcePath } = require("./testModules.cjs");

const { buildApiKeySaveOperations } = require(
  sourcePath("lib/apiKeySaveOperations.ts")
);

function field(overrides = {}) {
  return {
    status: "missing",
    initialValue: "",
    value: "",
    dirty: false,
    ...overrides,
  };
}

function fields(overrides = {}) {
  return {
    claude: field(),
    gemini: field(),
    openai: field(),
    ideogram: field(),
    openrouter: field(),
    ...overrides,
  };
}

test("an unedited load error generates no operation", () => {
  const operations = buildApiKeySaveOperations(
    fields({ gemini: field({ status: "error", dirty: false }) })
  );

  assert.deepEqual(operations, []);
});

test("an edited load error with a value generates set", () => {
  const operations = buildApiKeySaveOperations(
    fields({
      gemini: field({
        status: "error",
        value: "gemini-secret",
        dirty: true,
      }),
    })
  );

  assert.deepEqual(operations, [
    { provider: "gemini", kind: "set", value: "gemini-secret" },
  ]);
});

test("changing a loaded value generates set", () => {
  const operations = buildApiKeySaveOperations(
    fields({
      claude: field({
        status: "loaded",
        initialValue: "old-secret",
        value: "new-secret",
        dirty: true,
      }),
    })
  );

  assert.deepEqual(operations, [
    { provider: "claude", kind: "set", value: "new-secret" },
  ]);
});

test("clearing an edited loaded value generates remove", () => {
  const operations = buildApiKeySaveOperations(
    fields({
      openai: field({
        status: "loaded",
        initialValue: "openai-secret",
        value: "",
        dirty: true,
      }),
    })
  );

  assert.deepEqual(operations, [{ provider: "openai", kind: "remove" }]);
});

test("a dirty whitespace-only value generates remove", () => {
  const operations = buildApiKeySaveOperations(
    fields({ openai: field({ value: "   ", dirty: true }) })
  );

  assert.deepEqual(operations, [{ provider: "openai", kind: "remove" }]);
});

test("a dirty value with surrounding whitespace generates set with the trimmed value", () => {
  const operations = buildApiKeySaveOperations(
    fields({ openai: field({ value: "  sk-xxxx  ", dirty: true }) })
  );

  assert.deepEqual(operations, [
    { provider: "openai", kind: "set", value: "sk-xxxx" },
  ]);
});

test("an unedited missing value generates no operation", () => {
  const operations = buildApiKeySaveOperations(
    fields({ ideogram: field({ status: "missing", dirty: false }) })
  );

  assert.deepEqual(operations, []);
});

test("mixed fields save only dirty Claude and never the unedited Gemini error", () => {
  const operations = buildApiKeySaveOperations(
    fields({
      claude: field({
        status: "loaded",
        initialValue: "old-claude-secret",
        value: "new-claude-secret",
        dirty: true,
      }),
      gemini: field({
        status: "error",
        initialValue: "",
        value: "",
        dirty: false,
      }),
    })
  );

  assert.deepEqual(operations, [
    { provider: "claude", kind: "set", value: "new-claude-secret" },
  ]);
  assert.equal(
    operations.filter((operation) => operation.provider === "gemini").length,
    0
  );
});
