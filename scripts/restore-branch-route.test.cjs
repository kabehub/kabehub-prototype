const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;

let rpcResult = { data: null, error: null };
let rpcCalls = [];

const originalLoad = Module._load;
Module._load = function loadWithSupabaseMock(request, parent, isMain) {
  if (request === "@supabase/ssr") {
    return {
      createServerClient() {
        return {
          auth: {
            async getUser() {
              return {
                data: { user: { id: "user-1" } },
                error: null,
              };
            },
          },
          async rpc(name, args) {
            rpcCalls.push({ name, args });
            return rpcResult;
          },
          from() {
            throw new Error("direct table access was not expected");
          },
        };
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

installTsLoader();
installAliasResolver();

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

const { NextRequest } = require("next/server");
const restoreBranch = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "threads",
  "[id]",
  "messages",
  "restore-branch",
  "route.ts",
));

const pendingTests = [];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

function resetRpc(result = { data: null, error: null }) {
  rpcResult = result;
  rpcCalls = [];
}

function requestFor(body) {
  return new NextRequest(
    "https://www.kabehub.com/api/threads/thread-1/messages/restore-branch",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function invoke(body) {
  return restoreBranch.PATCH(requestFor(body), {
    params: Promise.resolve({ id: "thread-1" }),
  });
}

test("a valid request uses exactly one RPC and preserves the success response", async () => {
  resetRpc();

  const response = await invoke({ branchRootId: "root-1", branchIndex: 2 });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(rpcCalls, [
    {
      name: "restore_message_branch",
      args: {
        p_user_id: "user-1",
        p_thread_id: "thread-1",
        p_branch_root_id: "root-1",
        p_branch_index: 2,
      },
    },
  ]);
});

for (const [label, body] of [
  ["missing root", { branchIndex: 0 }],
  ["non-string root", { branchRootId: 1, branchIndex: 0 }],
  ["missing index", { branchRootId: "root-1" }],
  ["string index", { branchRootId: "root-1", branchIndex: "1" }],
  ["fractional index", { branchRootId: "root-1", branchIndex: 1.5 }],
  ["negative index", { branchRootId: "root-1", branchIndex: -1 }],
]) {
  test(`${label} is rejected with 400 before the RPC`, async () => {
    resetRpc();

    const response = await invoke(body);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "branchRootId and a non-negative integer branchIndex are required",
    });
    assert.deepEqual(rpcCalls, []);
  });
}

for (const { code, rawMessage, expectedStatus, expectedError } of [
  {
    code: "P0001",
    rawMessage: "target branch not found for given branchRootId/branchIndex",
    expectedStatus: 400,
    expectedError: "Invalid branch restore request",
  },
  {
    code: "42501",
    rawMessage: "Unauthorized",
    expectedStatus: 403,
    expectedError: "Forbidden",
  },
  {
    code: "XX000",
    rawMessage: "invariant violation: internal database detail",
    expectedStatus: 500,
    expectedError: "Failed to restore branch",
  },
]) {
  test(`${code} is mapped to a fixed response and a metadata-only log`, async () => {
    resetRpc({ data: null, error: { code, message: rawMessage } });
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args);

    let response;
    try {
      response = await invoke({ branchRootId: "root-1", branchIndex: 0 });
    } finally {
      console.error = originalError;
    }

    assert.equal(response.status, expectedStatus);
    const body = await response.json();
    assert.deepEqual(body, { error: expectedError });
    assert.doesNotMatch(JSON.stringify(body), new RegExp(rawMessage));
    assert.deepEqual(errors, [
      [
        "[db-operation-failed]",
        {
          route: "threads-messages-restore-branch",
          operation: "restore_message_branch",
          table: "messages",
          errorCode: code,
        },
      ],
    ]);
    assert.doesNotMatch(JSON.stringify(errors), new RegExp(rawMessage));
  });
}

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
