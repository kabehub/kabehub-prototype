const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { test } = require("node:test");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

const ID = "12345678-1234-4234-8234-123456789abc";
const CREATED_AT = "2026-10-27T01:02:03.123456+00:00";
const UPDATED_AT = "2026-10-27T02:03:04.654321Z";
const VALID_CURSOR = { likes_count: 12, cursor_at: CREATED_AT, id: ID };
let calls;
let primaryResult;
let enrichmentResults;
let authFailure;

function client(name) {
  return {
    from(table) {
      calls.push({ client: name, table, method: "from", args: [] });
      const query = {};
      for (const method of ["select", "is", "eq", "order", "limit", "ilike", "in", "contains", "or", "lt"]) {
        query[method] = (...args) => {
          calls.push({ client: name, table, method, args });
          return query;
        };
      }
      query.then = (resolve, reject) => {
        calls.push({ client: name, table, method: "execute", args: [] });
        const result = table === "threads" || table === "public_threads_view"
          ? primaryResult
          : enrichmentResults[table] ?? { data: [], error: null };
        return Promise.resolve(result).then(resolve, reject);
      };
      return query;
    },
  };
}

const originalLoad = Module._load;
Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "@/lib/mcp-auth") {
    return {
      serviceRoleClient() {
        calls.push({ method: "serviceRoleClient" });
        return client("admin");
      },
    };
  }
  if (request === "@/lib/supabase/route-auth") {
    return {
      async getOptionalRouteUser() {
        if (authFailure) return { ok: false, response: authFailure };
        return {
          ok: true,
          user: { id: "viewer" },
          supabase: client("user"),
          finalizeJson(body, init) {
            const response = Response.json(body, init);
            response.headers.set("x-test-finalized", "true");
            return response;
          },
        };
      },
    };
  }
  if (request.startsWith("@supabase/")) {
    throw new Error("Real Supabase modules must not load in cursor tests");
  }
  return originalLoad.call(this, request, parent, isMain);
};

installAliasResolver();
installTsLoader();
let GET;
try {
  ({ GET } = require(path.join(__dirname, "..", "app", "api", "explore", "route.ts")));
} finally {
  Module._load = originalLoad;
}

function reset(rows = []) {
  calls = [];
  primaryResult = { data: rows, error: null };
  enrichmentResults = {};
  authFailure = null;
}

function invoke(sort, cursor, params = {}) {
  const url = new URL("https://example.invalid/api/explore");
  if (sort !== undefined) url.searchParams.set("sort", sort);
  if (cursor !== undefined) url.searchParams.set("cursor", cursor);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return GET({ url: url.toString() });
}

function row(overrides = {}) {
  return {
    id: ID,
    title: "Public thread",
    is_public: true,
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
    user_id: "owner",
    genre: "fiction",
    share_token: "share-token",
    tags: ["fallback-tag"],
    likes_count: 12,
    fork_count: 2,
    allow_prompt_fork: true,
    ...overrides,
  };
}

function assertCursorFilter(sort, cursor) {
  const column = sort === "popular" ? "created_at" : "updated_at";
  assert.deepEqual(calls.filter(call => call.method === "or"), [{
    client: "admin",
    table: "threads",
    method: "or",
    args: [[
      `likes_count.lt.${cursor.likes_count}`,
      `and(likes_count.eq.${cursor.likes_count},${column}.lt.${cursor.cursor_at})`,
      `and(likes_count.eq.${cursor.likes_count},${column}.eq.${cursor.cursor_at},id.lt.${cursor.id})`,
    ].join(",")],
  }]);
  assert.deepEqual(calls.filter(call => call.method === "order").map(call => call.args), [
    ["likes_count", { ascending: false, nullsFirst: false }],
    [column, { ascending: false, nullsFirst: false }],
    ["id", { ascending: false }],
  ]);
  assert.ok(calls.some(call => call.method === "is" && call.args[0] === "deleted_at" && call.args[1] === null));
  assert.ok(calls.some(call => call.method === "eq" && call.args[0] === "is_public" && call.args[1] === true));
  assert.ok(calls.some(call => call.method === "limit" && call.args[0] === 21));
  assert.equal(calls.filter(call => call.method === "execute" && call.table === "threads").length, 1);
}

const invalidCursors = [
  ["empty cursor", ""],
  ["malformed JSON", "{"],
  ["raw injection", "x),system_prompt.like.a*"],
  ...[null, false, 12, "text", [], {}, [VALID_CURSOR]].map(value => [
    `wrong JSON shape ${JSON.stringify(value)}`, JSON.stringify(value),
  ]),
  ...["likes_count", "cursor_at", "id"].map(field => {
    const value = { ...VALID_CURSOR };
    delete value[field];
    return [`missing ${field}`, JSON.stringify(value)];
  }),
  ...["12", null, true, [], {}, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1].map(value => [
    `invalid likes_count ${JSON.stringify(value)}`, JSON.stringify({ ...VALID_CURSOR, likes_count: value }),
  ]),
  ["overflowing numeric literal", '{"likes_count":1e309,"cursor_at":"2026-10-27T01:02:03Z","id":"' + ID + '"}'],
  ...["cursor_at", "id"].flatMap(field => [null, 12, true, [], {}].map(value => [
    `wrong ${field} type ${JSON.stringify(value)}`, JSON.stringify({ ...VALID_CURSOR, [field]: value }),
  ])),
  ...[
    "x),system_prompt.like.a*", ",", "(", ")", '"', "'", " ", "\t", "\r", "\n", "\u00a0",
  ].flatMap(payload => ["cursor_at", "id"].map(field => [
    `${field} injection suffix ${JSON.stringify(payload)}`,
    JSON.stringify({ ...VALID_CURSOR, [field]: VALID_CURSOR[field] + payload }),
  ])),
  ...["cursor_at", "id"].map(field => [
    `${field} injection value`, JSON.stringify({ ...VALID_CURSOR, [field]: "x),system_prompt.like.a*" }),
  ]),
  ...[
    "", "2026-10-27", "2026-10-27T01:02:03", "2026-10-27 01:02:03Z",
    "2026-10-27t01:02:03z", "2026-1-27T01:02:03Z", "2026-10-27T1:02:03Z",
    "2026-10-27T01:02:03.Z", "2026-10-27T01:02:03.1234567Z",
    "2026-00-27T01:02:03Z", "2026-13-27T01:02:03Z", "2026-10-00T01:02:03Z",
    "2026-10-32T01:02:03Z", "2026-10-27T24:02:03Z", "2026-10-27T01:60:03Z",
    "2026-10-27T01:02:60Z", "2026-10-27T01:02:03+0900", "2026-10-27T01:02:03+09",
    "2026-10-27T01:02:03+24:00", "2026-10-27T01:02:03+09:60",
    " 2026-10-27T01:02:03Z", "2026-10-27T01:02:03Z\n",
  ].map(value => [
    `invalid timestamp ${JSON.stringify(value)}`, JSON.stringify({ ...VALID_CURSOR, cursor_at: value }),
  ]),
  ...["", "not-a-uuid", ID.replaceAll("-", ""), `{${ID}}`, ID.slice(0, -1), ID + "0", "g" + ID.slice(1), " " + ID].map(value => [
    `invalid UUID ${JSON.stringify(value)}`, JSON.stringify({ ...VALID_CURSOR, id: value }),
  ]),
];

for (const sort of ["popular", "trending"]) {
  for (const [name, cursor] of invalidCursors) {
    test(`${sort}: rejects ${name} before creating or executing a query`, async () => {
      reset();
      const response = await invoke(sort, cursor);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "invalid cursor" });
      assert.equal(response.headers.get("x-test-finalized"), "true");
      assert.deepEqual(calls, []);
    });
  }

  test(`${sort}: absent cursor keeps first-page behavior`, async () => {
    reset();
    const response = await invoke(sort);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [], nextCursor: null, hasMore: false });
    assert.equal(calls.some(call => call.method === "or"), false);
    assert.equal(calls.filter(call => call.method === "execute").length, 1);
  });

  for (const likes_count of [Number.MIN_SAFE_INTEGER, -1, -0, 0, 1, Number.MAX_SAFE_INTEGER]) {
    test(`${sort}: accepts safe integer boundary ${likes_count}`, async () => {
      reset();
      const cursor = { ...VALID_CURSOR, likes_count };
      const response = await invoke(sort, JSON.stringify(cursor));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { items: [], nextCursor: null, hasMore: false });
      assertCursorFilter(sort, cursor);
    });
  }

  for (const cursor_at of [
    "2026-01-01T00:00:00Z", "2026-12-31T23:59:59Z", "2026-10-27T01:02:03.1Z",
    "2026-10-27T01:02:03.123Z", CREATED_AT, UPDATED_AT,
    "2026-10-27T01:02:03.000001-09:30", "2026-10-27T01:02:03+09:00",
    "2026-10-27T01:02:03-00:00",
  ]) {
    test(`${sort}: preserves accepted timestamp ${cursor_at}`, async () => {
      reset();
      const cursor = { ...VALID_CURSOR, cursor_at, id: ID.toUpperCase() };
      const response = await invoke(sort, JSON.stringify(cursor));
      assert.equal(response.status, 200);
      assertCursorFilter(sort, cursor);
    });
  }

  for (const fallback of [false, true]) {
    test(`${sort}: nextCursor round trip preserves microseconds (fallback=${fallback})`, async () => {
      const rows = Array.from({ length: 21 }, (_, index) => row({
        id: `12345678-1234-4234-8234-${String(index).padStart(12, "0")}`,
        ...(fallback ? { updated_at: null, likes_count: null } : {}),
      }));
      reset(rows);
      const first = await invoke(sort);
      assert.equal(first.status, 200);
      const body = await first.json();
      assert.deepEqual(Object.keys(body).sort(), ["hasMore", "items", "nextCursor"]);
      assert.equal(body.items.length, 20);
      assert.equal(body.hasMore, true);
      const cursor = {
        likes_count: fallback ? 0 : 12,
        cursor_at: sort === "popular" || fallback ? CREATED_AT : UPDATED_AT,
        id: rows[19].id,
      };
      assert.equal(body.nextCursor, JSON.stringify(cursor));
      reset();
      const next = await invoke(sort, body.nextCursor);
      assert.equal(next.status, 200);
      assert.deepEqual(await next.json(), { items: [], nextCursor: null, hasMore: false });
      assertCursorFilter(sort, cursor);
    });
  }
}

test("valid cursor preserves search filters, enrichment and item response", async () => {
  reset([row()]);
  enrichmentResults = {
    likes: { data: [{ thread_id: ID, user_id: "viewer" }], error: null },
    messages: { data: [{ thread_id: ID }, { thread_id: ID }], error: null },
    profiles: { data: [{ id: "owner", handle: "writer", display_name: "Writer" }], error: null },
    thread_tags: { data: [{ thread_id: ID, name: "tag" }], error: null },
  };
  const response = await invoke("popular", JSON.stringify(VALID_CURSOR), { q: " title ", tag: "tag", genre: "fiction" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    items: [{
      id: ID, title: "Public thread", genre: "fiction", share_token: "share-token",
      created_at: CREATED_AT, updated_at: UPDATED_AT, allow_prompt_fork: true,
      handle: "writer", display_name: "Writer", tags: ["tag"], message_count: 2,
      fork_count: 2, like_count: 1, liked_by_me: true,
    }],
    nextCursor: null,
    hasMore: false,
  });
  assertCursorFilter("popular", VALID_CURSOR);
  for (const [method, args] of [["ilike", ["title", "%title%"]], ["eq", ["thread_tags.name", "tag"]], ["eq", ["genre", "fiction"]]]) {
    assert.ok(calls.some(call => call.method === method && JSON.stringify(call.args) === JSON.stringify(args)));
  }
});

for (const sort of ["newest", undefined, "unknown"]) {
  test(`newest path (${sort}): retains view, raw .lt cursor and timestamp nextCursor`, async () => {
    reset(Array.from({ length: 21 }, () => row()));
    const cursor = "x),system_prompt.like.a*";
    const response = await invoke(sort, cursor);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ["hasMore", "items", "nextCursor"]);
    assert.equal(body.items.length, 20);
    assert.equal(body.hasMore, true);
    assert.equal(body.nextCursor, CREATED_AT);
    assert.deepEqual(calls.filter(call => call.method === "lt"), [{
      client: "user", table: "public_threads_view", method: "lt", args: ["created_at", cursor],
    }]);
    assert.equal(calls.some(call => call.method === "serviceRoleClient" || call.method === "or"), false);
    assert.equal(calls.filter(call => call.method === "execute" && call.table === "public_threads_view").length, 1);
  });
}

for (const sort of ["popular", "trending", "newest"]) {
  test(`${sort}: query errors expose only a fixed message and log details`, async () => {
    reset();
    const error = { message: "private database query system_prompt.like.a*", code: "private-code" };
    primaryResult = { data: null, error };
    const logged = [];
    const originalError = console.error;
    console.error = (...args) => logged.push(args);
    try {
      const response = await invoke(sort);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: "Failed to fetch threads" });
      assert.equal(response.headers.get("x-test-finalized"), "true");
      assert.deepEqual(logged, [["explore API error:", error]]);
    } finally {
      console.error = originalError;
    }
  });
}

test("auth failure preserves the response before any query", async () => {
  reset();
  authFailure = Response.json({ error: "Unauthorized" }, { status: 401 });
  assert.equal(await invoke("popular", "invalid"), authFailure);
  assert.deepEqual(calls, []);
});
