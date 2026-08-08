const assert = require("node:assert/strict");
const path = require("node:path");
const {
  installAliasResolver,
  installTsLoader,
} = require("./testBootstrap.cjs");

installTsLoader();
installAliasResolver();

const {
  bestEffortFailed,
  dbCompensationFailed,
  dbOperationFailed,
  dbOperationFailedBestEffort,
  externalApiFailed,
  securityGuardRejected,
} = require(path.join(__dirname, "..", "lib", "logger.ts"));

const pendingTests = [];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

function captureConsole(invoke) {
  const errors = [];
  const warnings = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args) => errors.push(args);
  console.warn = (...args) => warnings.push(args);

  try {
    invoke();
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }

  return { errors, warnings };
}

test("dbOperationFailed logs the allow-listed payload at error level", () => {
  const logs = captureConsole(() => {
    dbOperationFailed({
      route: "chat/branch-edit",
      operation: "apply_branch_edit",
      table: "messages",
      errorCode: "42501",
      errorType: "PostgrestError",
      userId: "u-1",
      token: "secret",
    });
  });

  assert.deepEqual(logs.errors, [
    [
      "[db-operation-failed]",
      {
        route: "chat/branch-edit",
        operation: "apply_branch_edit",
        table: "messages",
        errorCode: "42501",
        errorType: "PostgrestError",
      },
    ],
  ]);
  assert.deepEqual(logs.warnings, []);
});

test("dbOperationFailedBestEffort uses the DB tag at warn level", () => {
  const logs = captureConsole(() => {
    dbOperationFailedBestEffort({
      route: "mcp-auth",
      operation: "update_last_used_at",
      table: "mcp_tokens",
      errorCode: "57014",
      userId: "u-1",
      token: "secret",
    });
  });

  assert.deepEqual(logs.errors, []);
  assert.deepEqual(logs.warnings, [
    [
      "[db-operation-failed]",
      {
        route: "mcp-auth",
        operation: "update_last_used_at",
        table: "mcp_tokens",
        errorCode: "57014",
      },
    ],
  ]);
});

test("dbCompensationFailed uses the compensation tag at error level", () => {
  const logs = captureConsole(() => {
    dbCompensationFailed({
      route: "chat/branch-edit",
      operation: "delete_partial_branch",
      table: "messages",
      errorType: "TypeError",
      userId: "u-1",
      token: "secret",
    });
  });

  assert.deepEqual(logs.errors, [
    [
      "[db-compensation-failed]",
      {
        route: "chat/branch-edit",
        operation: "delete_partial_branch",
        table: "messages",
        errorType: "TypeError",
      },
    ],
  ]);
  assert.deepEqual(logs.warnings, []);
});

test("externalApiFailed logs only allow-listed fields at error level", () => {
  const logs = captureConsole(() => {
    externalApiFailed({
      service: "openai",
      status: 429,
      errorCode: "UPSTREAM_API_ERROR",
      errorType: "TypeError",
      userId: "u-1",
      token: "secret",
    });
  });

  assert.deepEqual(logs.errors, [
    [
      "[external-api-failed]",
      {
        service: "openai",
        status: 429,
        errorCode: "UPSTREAM_API_ERROR",
        errorType: "TypeError",
      },
    ],
  ]);
  assert.deepEqual(logs.warnings, []);
});

test("bestEffortFailed logs only allow-listed fields at warn level", () => {
  const logs = captureConsole(() => {
    bestEffortFailed({
      operation: "rag_search",
      errorType: "AbortError",
      userId: "u-1",
      token: "secret",
    });
  });

  assert.deepEqual(logs.errors, []);
  assert.deepEqual(logs.warnings, [
    [
      "[best-effort-failed]",
      { operation: "rag_search", errorType: "AbortError" },
    ],
  ]);
});

test("securityGuardRejected logs only allow-listed fields at warn level", () => {
  const logs = captureConsole(() => {
    securityGuardRejected({
      operation: "reject_unowned_messages",
      skippedCount: 3,
      userId: "u-1",
      token: "secret",
    });
  });

  assert.deepEqual(logs.errors, []);
  assert.deepEqual(logs.warnings, [
    [
      "[security-guard-rejected]",
      { operation: "reject_unowned_messages", skippedCount: 3 },
    ],
  ]);
});

test("omitted optional fields do not create payload keys", () => {
  const logs = captureConsole(() => {
    dbOperationFailed({ route: "chat", operation: "insert", table: "messages" });
    dbOperationFailedBestEffort({
      route: "mcp-auth",
      operation: "update",
      table: "tokens",
    });
    dbCompensationFailed({
      route: "chat",
      operation: "rollback",
      table: "messages",
    });
    externalApiFailed({ service: "anthropic" });
    bestEffortFailed({ operation: "rag_search" });
    securityGuardRejected({ operation: "ownership_check" });
  });

  assert.deepEqual(Object.keys(logs.errors[0][1]), [
    "route",
    "operation",
    "table",
  ]);
  assert.deepEqual(Object.keys(logs.warnings[0][1]), [
    "route",
    "operation",
    "table",
  ]);
  assert.deepEqual(Object.keys(logs.errors[1][1]), [
    "route",
    "operation",
    "table",
  ]);
  assert.deepEqual(Object.keys(logs.errors[2][1]), ["service"]);
  assert.deepEqual(Object.keys(logs.warnings[1][1]), ["operation"]);
  assert.deepEqual(Object.keys(logs.warnings[2][1]), ["operation"]);
});

test("explicit undefined optional fields do not create payload keys", () => {
  const logs = captureConsole(() => {
    dbOperationFailed({
      route: "chat",
      operation: "insert",
      table: "messages",
      errorCode: undefined,
      errorType: undefined,
    });
    dbOperationFailedBestEffort({
      route: "mcp-auth",
      operation: "update",
      table: "tokens",
      errorCode: undefined,
      errorType: undefined,
    });
    dbCompensationFailed({
      route: "chat",
      operation: "rollback",
      table: "messages",
      errorCode: undefined,
      errorType: undefined,
    });
    externalApiFailed({
      service: "gemini",
      status: undefined,
      errorCode: undefined,
      errorType: undefined,
    });
    bestEffortFailed({ operation: "rag_search", errorType: undefined });
    securityGuardRejected({
      operation: "ownership_check",
      skippedCount: undefined,
    });
  });

  assert.deepEqual(Object.keys(logs.errors[0][1]), [
    "route",
    "operation",
    "table",
  ]);
  assert.deepEqual(Object.keys(logs.warnings[0][1]), [
    "route",
    "operation",
    "table",
  ]);
  assert.deepEqual(Object.keys(logs.errors[1][1]), [
    "route",
    "operation",
    "table",
  ]);
  assert.deepEqual(Object.keys(logs.errors[2][1]), ["service"]);
  assert.deepEqual(Object.keys(logs.warnings[1][1]), ["operation"]);
  assert.deepEqual(Object.keys(logs.warnings[2][1]), ["operation"]);
});

test("securityGuardRejected preserves a skippedCount of zero", () => {
  const logs = captureConsole(() => {
    securityGuardRejected({ operation: "ownership_check", skippedCount: 0 });
  });

  assert.deepEqual(logs.errors, []);
  assert.deepEqual(logs.warnings, [
    [
      "[security-guard-rejected]",
      { operation: "ownership_check", skippedCount: 0 },
    ],
  ]);
  assert.equal(Object.hasOwn(logs.warnings[0][1], "skippedCount"), true);
});

(async () => {
  for (const { name, fn } of pendingTests) {
    await fn();
    console.log(`ok - ${name}`);
  }
  console.log(`passed ${pendingTests.length} tests`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
