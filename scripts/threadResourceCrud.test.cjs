const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

globalThis.AsyncLocalStorage =
  require("node:async_hooks").AsyncLocalStorage;

let currentUser = null;
let currentAuthError = null;
let setRefreshedCookie = false;
let databaseResult = { data: null, error: null };
let queryRecords = [];

function createQuery(table) {
  const record = { table, calls: [] };
  queryRecords.push(record);

  const query = {
    select(...args) {
      record.calls.push({ method: "select", args });
      return query;
    },
    eq(...args) {
      record.calls.push({ method: "eq", args });
      return query;
    },
    order(...args) {
      record.calls.push({ method: "order", args });
      return query;
    },
    insert(...args) {
      record.calls.push({ method: "insert", args });
      return query;
    },
    delete(...args) {
      record.calls.push({ method: "delete", args });
      return query;
    },
    update(...args) {
      record.calls.push({ method: "update", args });
      return query;
    },
    single(...args) {
      record.calls.push({ method: "single", args });
      return query;
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(databaseResult).then(onFulfilled, onRejected);
    },
  };
  return query;
}

const originalLoad = Module._load;
Module._load = function loadWithSupabaseMock(request, parent, isMain) {
  if (request === "@supabase/ssr") {
    return {
      createServerClient(_url, _key, options) {
        return {
          auth: {
            async getUser() {
              if (setRefreshedCookie) {
                options.cookies.setAll([
                  {
                    name: "sb-refresh",
                    value: "updated",
                    options: { path: "/", httpOnly: true },
                  },
                ]);
              }
              return {
                data: { user: currentUser },
                error: currentAuthError,
              };
            },
          },
          from(table) {
            return createQuery(table);
          },
        };
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(
  request,
  parent,
  isMain,
  options
) {
  if (request.startsWith("@/")) {
    request = path.join(__dirname, "..", request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

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

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

const { NextRequest } = require("next/server");
const notes = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "threads",
  "[id]",
  "notes",
  "route.ts"
));
const messageNotes = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "threads",
  "[id]",
  "message-notes",
  "route.ts"
));
const drafts = require(path.join(
  __dirname,
  "..",
  "app",
  "api",
  "threads",
  "[id]",
  "drafts",
  "route.ts"
));

const pendingTests = [];

function test(name, fn) {
  pendingTests.push({ name, fn });
}

function resetMocks(options = {}) {
  currentUser = options.user ?? null;
  currentAuthError = options.authError ?? null;
  setRefreshedCookie = options.setRefreshedCookie ?? false;
  databaseResult = options.databaseResult ?? { data: null, error: null };
  queryRecords = [];
}

function requestFor(resource, method, body) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new NextRequest(
    `https://www.kabehub.com/api/threads/thread-1/${resource}`,
    init
  );
}

function invokeThreadHandler(handler, resource, method, body) {
  return handler(
    requestFor(resource, method, body),
    { params: Promise.resolve({ id: "thread-1" }) }
  );
}

function invokeHandler(handler, resource, method, body) {
  return handler(requestFor(resource, method, body));
}

function assertRefreshedCookie(response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /sb-refresh=updated/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Path=\//i);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
}

function findCalls(record, method) {
  return record.calls
    .filter((call) => call.method === method)
    .map((call) => call.args);
}

test("401 is returned when no authenticated user exists", async () => {
  resetMocks();

  const response = await invokeThreadHandler(notes.GET, "notes", "GET");

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.equal(queryRecords.length, 0);
});

test("401 is returned when Supabase reports an auth error", async () => {
  resetMocks({
    user: { id: "user-1" },
    authError: { message: "invalid session" },
  });

  const response = await invokeThreadHandler(
    messageNotes.POST,
    "message-notes",
    "POST",
    { messageId: "message-1", content: "note" }
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.equal(queryRecords.length, 0);
});

test("draft POST returns 400 for empty content before querying Supabase", async () => {
  resetMocks({ user: { id: "user-1" } });

  const response = await invokeThreadHandler(
    drafts.POST,
    "drafts",
    "POST",
    { content: "   " }
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Content is required" });
  assert.equal(queryRecords.length, 0);
});

test("query errors are returned as 500 responses", async () => {
  resetMocks({
    user: { id: "user-1" },
    databaseResult: {
      data: null,
      error: { message: "notes query failed" },
    },
  });

  const response = await invokeThreadHandler(notes.GET, "notes", "GET");

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "notes query failed" });
});

test("GET uses each route's table, ordering, and user-filter configuration", async () => {
  const cases = [
    {
      route: notes,
      resource: "notes",
      table: "thread_notes",
      ascending: true,
      expectedEq: [["thread_id", "thread-1"]],
    },
    {
      route: messageNotes,
      resource: "message-notes",
      table: "message_notes",
      ascending: true,
      expectedEq: [["thread_id", "thread-1"]],
    },
    {
      route: drafts,
      resource: "drafts",
      table: "drafts",
      ascending: false,
      expectedEq: [
        ["thread_id", "thread-1"],
        ["user_id", "user-1"],
      ],
    },
  ];

  for (const entry of cases) {
    const rows = [{ id: `${entry.resource}-1` }];
    resetMocks({
      user: { id: "user-1" },
      setRefreshedCookie: entry.resource === "drafts",
      databaseResult: { data: rows, error: null },
    });

    const response = await invokeThreadHandler(
      entry.route.GET,
      entry.resource,
      "GET"
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), rows);
    assert.equal(queryRecords.length, 1);
    assert.equal(queryRecords[0].table, entry.table);
    assert.deepEqual(findCalls(queryRecords[0], "eq"), entry.expectedEq);
    assert.deepEqual(findCalls(queryRecords[0], "order"), [
      ["created_at", { ascending: entry.ascending }],
    ]);

    if (entry.resource === "drafts") {
      assertRefreshedCookie(response);
    } else {
      assert.equal(response.headers.get("cache-control"), null);
    }
  }
});

test("POST builds the expected payload for notes and message notes", async () => {
  const cases = [
    {
      route: notes,
      resource: "notes",
      body: { content: "thread note" },
      table: "thread_notes",
      expectedPayload: {
        thread_id: "thread-1",
        content: "thread note",
        user_id: "user-1",
      },
    },
    {
      route: messageNotes,
      resource: "message-notes",
      body: { messageId: "message-1", content: "message note" },
      table: "message_notes",
      expectedPayload: {
        message_id: "message-1",
        thread_id: "thread-1",
        content: "message note",
        user_id: "user-1",
      },
    },
  ];

  for (const entry of cases) {
    const saved = { id: `${entry.resource}-1`, ...entry.expectedPayload };
    resetMocks({
      user: { id: "user-1" },
      databaseResult: { data: saved, error: null },
    });

    const response = await invokeThreadHandler(
      entry.route.POST,
      entry.resource,
      "POST",
      entry.body
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), saved);
    assert.equal(queryRecords[0].table, entry.table);
    assert.deepEqual(findCalls(queryRecords[0], "insert"), [
      [entry.expectedPayload],
    ]);
  }
});

test("draft POST trims content and supplies a generated id", async () => {
  const saved = { id: "saved-draft" };
  resetMocks({
    user: { id: "user-1" },
    databaseResult: { data: saved, error: null },
  });

  const response = await invokeThreadHandler(
    drafts.POST,
    "drafts",
    "POST",
    { content: "  draft text  " }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), saved);
  const [[payload]] = findCalls(queryRecords[0], "insert");
  assert.equal(queryRecords[0].table, "drafts");
  assert.match(
    payload.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
  assert.deepEqual(
    {
      thread_id: payload.thread_id,
      user_id: payload.user_id,
      content: payload.content,
    },
    {
      thread_id: "thread-1",
      user_id: "user-1",
      content: "draft text",
    }
  );
});

test("DELETE scopes removal to the resource id and authenticated user", async () => {
  resetMocks({
    user: { id: "user-1" },
    databaseResult: { data: null, error: null },
  });

  const response = await invokeHandler(
    messageNotes.DELETE,
    "message-notes",
    "DELETE",
    { id: "note-1" }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(queryRecords[0].table, "message_notes");
  assert.deepEqual(findCalls(queryRecords[0], "delete"), [[]]);
  assert.deepEqual(findCalls(queryRecords[0], "eq"), [
    ["id", "note-1"],
    ["user_id", "user-1"],
  ]);
});

test("notes PATCH scopes updates to the user and uses shared finalizers", async () => {
  const saved = { id: "note-1", content: "updated" };
  resetMocks({
    user: { id: "user-1" },
    setRefreshedCookie: true,
    databaseResult: { data: saved, error: null },
  });

  const response = await invokeHandler(
    notes.PATCH,
    "notes",
    "PATCH",
    { id: "note-1", content: "updated" }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), saved);
  assert.equal(queryRecords[0].table, "thread_notes");
  assert.deepEqual(findCalls(queryRecords[0], "eq"), [
    ["id", "note-1"],
    ["user_id", "user-1"],
  ]);
  const [[updatePayload]] = findCalls(queryRecords[0], "update");
  assert.equal(updatePayload.content, "updated");
  assert.equal(
    new Date(updatePayload.updated_at).toISOString(),
    updatePayload.updated_at
  );
  assertRefreshedCookie(response);
});

(async () => {
  for (const { name, fn } of pendingTests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (error) {
      console.error(`not ok - ${name}`);
      throw error;
    }
  }

  console.log(`${pendingTests.length} thread resource CRUD tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
