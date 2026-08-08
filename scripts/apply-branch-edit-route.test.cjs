const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

globalThis.AsyncLocalStorage = require("node:async_hooks").AsyncLocalStorage;

let rpcResult = { data: null, error: null };
let activeMessagesResult = { data: [], error: null };
let rpcCalls = [];
let fromCalls = [];
let uuidCounter = 0;

function createQuery(result) {
  const query = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    not() {
      return query;
    },
    lt() {
      return query;
    },
    order() {
      return query;
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return query;
}

const supabase = {
  auth: {
    async getUser() {
      return { data: { user: { id: "user-1" } }, error: null };
    },
  },
  from(table) {
    fromCalls.push(table);
    if (table === "threads") {
      return createQuery({
        data: { folder_name: null, user_id: "user-1" },
        error: null,
      });
    }
    if (table === "messages") return createQuery(activeMessagesResult);
    throw new Error(`unexpected table access: ${table}`);
  },
  rpc(name, args) {
    rpcCalls.push({ name, args });
    return {
      single() {
        return Promise.resolve(rpcResult);
      },
    };
  },
};

const originalLoad = Module._load;
Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "@/lib/supabase/route-handler") {
    return {
      createRouteHandlerSupabaseClient() {
        return supabase;
      },
    };
  }
  if (request === "@/lib/rate-limit") {
    return {
      async checkChatRateLimit() {
        return { allowed: true, limit: 10, remaining: 9, resetAt: Date.now() + 60_000 };
      },
    };
  }
  if (request === "uuid") {
    return { v4: () => `uuid-${++uuidCounter}` };
  }
  return originalLoad.call(this, request, parent, isMain);
};

installTsLoader();
installAliasResolver();

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

const { NextRequest } = require("next/server");
const chat = require(path.join(__dirname, "..", "app", "api", "chat", "route.ts"));

const pendingTests = [];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

function resetMocks(options = {}) {
  rpcResult = options.rpcResult ?? {
    data: {
      new_branch_root_id: "base-user-1",
      new_branch_index: 2,
      new_message_number: 8,
    },
    error: null,
  };
  activeMessagesResult = options.activeMessagesResult ?? { data: [], error: null };
  rpcCalls = [];
  fromCalls = [];
  uuidCounter = 0;
}

function requestFor() {
  return new NextRequest("https://www.kabehub.com/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      threadId: "thread-1",
      userContent: "edited content",
      provider: "claude",
      isMemo: true,
      branchEdit: { baseUserMessageId: "base-user-1" },
    }),
  });
}

async function invoke() {
  return chat.POST(requestFor());
}

test("a successful branch edit uses exactly one RPC", async () => {
  resetMocks({
    activeMessagesResult: {
      data: [{ role: "assistant", content: "previous", provider: "claude" }],
      error: null,
    },
  });

  const response = await invoke();

  assert.equal(response.status, 200);
  assert.deepEqual(rpcCalls, [
    {
      name: "apply_branch_edit",
      args: {
        p_user_id: "user-1",
        p_thread_id: "thread-1",
        p_base_user_message_id: "base-user-1",
        p_new_message_id: "uuid-1",
        p_content: "edited content",
      },
    },
  ]);
  assert.deepEqual(fromCalls, ["threads", "messages"]);
});

for (const { code, rawMessage, expectedStatus, expectedError } of [
  {
    code: "42501",
    rawMessage: "Unauthorized: raw database detail",
    expectedStatus: 403,
    expectedError: "Forbidden",
  },
  {
    code: "P0001",
    rawMessage: "base user message not found: raw database detail",
    expectedStatus: 400,
    expectedError: "Invalid branch edit request",
  },
  {
    code: "XX000",
    rawMessage: "internal invariant: raw database detail",
    expectedStatus: 500,
    expectedError: "Failed to apply branch edit",
  },
]) {
  test(`${code} is mapped to a fixed response and a metadata-only log`, async () => {
    resetMocks({ rpcResult: { data: null, error: { code, message: rawMessage } } });
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args);

    let response;
    try {
      response = await invoke();
    } finally {
      console.error = originalError;
    }

    assert.equal(response.status, expectedStatus);
    const body = await response.json();
    assert.deepEqual(body, { error: expectedError });
    assert.equal(JSON.stringify(body).includes(rawMessage), false);
    assert.deepEqual(errors, [
      [
        "[db-operation-failed]",
        {
          route: "chat/branch-edit",
          operation: "apply_branch_edit",
          table: "messages",
          errorCode: code,
        },
      ],
    ]);
    assert.equal(JSON.stringify(errors).includes(rawMessage), false);
    assert.equal(rpcCalls.length, 1);
    assert.deepEqual(fromCalls, ["threads"]);
  });
}

test("a post-commit active messages failure returns a fixed response without raw detail", async () => {
  const rawMessage = "select failed: raw database detail";
  resetMocks({
    activeMessagesResult: {
      data: null,
      error: { code: "57014", message: rawMessage },
    },
  });
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);

  let response;
  try {
    response = await invoke();
  } finally {
    console.error = originalError;
  }

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.deepEqual(body, { error: "Failed to load branch edit context" });
  assert.equal(JSON.stringify(body).includes(rawMessage), false);
  assert.deepEqual(errors, [
    [
      "[db-operation-failed]",
      {
        route: "chat/branch-edit",
        operation: "load_active_messages",
        table: "messages",
        errorCode: "57014",
      },
    ],
  ]);
  assert.equal(JSON.stringify(errors).includes(rawMessage), false);
  assert.equal(rpcCalls.length, 1);
  assert.deepEqual(fromCalls, ["threads", "messages"]);
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
