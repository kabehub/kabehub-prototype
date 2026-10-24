const assert = require("node:assert/strict");
const { test, beforeEach, afterEach } = require("node:test");
const Module = require("node:module");
const fs = require("node:fs");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");
const { database, row } = require("./thread-trash-test-helpers.cjs");

let db, adminCalls, purgeCalls, purgeResult, adminFactory, lookupResult, now, logs;
const originalLoad = Module._load;
Module._load = function (request, parent, main) {
  if (request === "@/lib/supabase/admin") return {
    createAdminSupabaseClient() { adminCalls++; return adminFactory(); },
  };
  if (request === "@/lib/threads/purge") return {
    async purgeThread(input) { purgeCalls.push(input); return purgeResult(input); },
  };
  return originalLoad.call(this, request, parent, main);
};
installTsLoader();
installAliasResolver();
const route = require("../app/api/cron/thread-trash-purge/route.ts");
Module._load = originalLoad;

const envNames = ["CRON_SECRET", "THREAD_TRASH_PURGE_DRY_RUN", "SUPABASE_SERVICE_ROLE_KEY"];
let savedEnv;
const storage = (failedCount = 0, errorCodes = []) => ({
  attemptedCount: failedCount, succeededCount: 0, failedCount, errorCodes,
});
const deleted = () => ({ outcome: "deleted", storage: storage() });
const candidate = id => ({ id, user_id: "private-owner", title: "private-title", content: "private-body" });
const request = (authorization = `Bearer ${process.env.CRON_SECRET}`) => ({
  headers: new Headers(authorization === null ? {} : { authorization }),
});
const invoke = async req => {
  const response = await route.GET(req ?? request());
  return { status: response.status, body: await response.json() };
};
const totals = overrides => ({
  mode: "delete", attemptedCount: 0, deletedCount: 0, notFoundCount: 0,
  errorCount: 0, storageFailedCount: 0, limitReached: false,
  timeBudgetReached: false, errorCodes: [], ...overrides,
});
function assertPrivate(body) {
  const output = JSON.stringify({ body, logs });
  for (const value of [process.env.CRON_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY,
    "private-owner", "private-title", "private-body"]) {
    if (value) assert.equal(output.includes(value), false, "response/logs must omit private values");
  }
}

beforeEach(t => {
  savedEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  process.env.CRON_SECRET = "cron-credential-sentinel";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-credential-sentinel";
  delete process.env.THREAD_TRASH_PURGE_DRY_RUN;
  adminCalls = 0; purgeCalls = []; now = 0; logs = [];
  lookupResult = row([]);
  db = database(q => {
    assert.equal(q.operation, "rpc");
    assert.equal(q.table, "list_expired_trashed_threads");
    assert.deepEqual(q.args, { p_limit: 51 });
    return typeof lookupResult === "function" ? lookupResult() : lookupResult;
  });
  adminFactory = () => db;
  purgeResult = deleted;
  t.mock.method(Date, "now", () => now);
  for (const level of ["info", "warn", "error"]) {
    t.mock.method(console, level, (...args) => logs.push({ level, args }));
  }
});
afterEach(() => {
  for (const name of envNames) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

test("Cron exposes GET with the required runtime and duration", () => {
  assert.equal(route.runtime, "nodejs");
  assert.equal(route.dynamic, "force-dynamic");
  assert.equal(route.maxDuration, 60);
  assert.equal(typeof route.GET, "function");
});

test("missing secret returns 500 before admin creation or lookup", async () => {
  delete process.env.CRON_SECRET;
  const result = await invoke(request(null));
  assert.deepEqual(result, { status: 500, body: { error: "Cron is not configured" } });
  assert.equal(adminCalls, 0); assert.equal(db.calls.length, 0); assert.equal(purgeCalls.length, 0);
  assertPrivate(result.body);
});

for (const header of [null, "Bearer wrong", "Basic wrong"]) {
  test(`unauthorized header ${header === null ? "absent" : header.split(" ")[0]} is rejected before admin creation`, async () => {
    const result = await invoke(request(header));
    assert.deepEqual(result, { status: 401, body: { error: "Unauthorized" } });
    assert.equal(adminCalls, 0); assert.equal(db.calls.length, 0); assert.equal(purgeCalls.length, 0);
    assertPrivate(result.body);
  });
}

for (const value of [undefined, "true", "False", "FALSE", "", " false "]) {
  test(`dry-run for ${value === undefined ? "unset" : JSON.stringify(value)} only lists candidates`, async () => {
    if (value !== undefined) process.env.THREAD_TRASH_PURGE_DRY_RUN = value;
    lookupResult = row([candidate("old-thread"), candidate("next-thread")]);
    const result = await invoke();
    assert.deepEqual(result, { status: 200, body: { mode: "dry_run", candidateCount: 2, limitReached: false } });
    assert.equal(adminCalls, 1); assert.equal(db.calls.length, 1); assert.equal(purgeCalls.length, 0);
    assert.deepEqual(logs.filter(log => log.args[1].threadId).map(log => log.args[1]),
      [{ threadId: "old-thread" }, { threadId: "next-thread" }]);
    assertPrivate(result.body);
  });
}

test("dry-run selects 50 of 51 candidates, signals the limit and omits the extra ID", async () => {
  lookupResult = row(Array.from({ length: 51 }, (_, i) => candidate(`thread-${i}`)));
  const result = await invoke();
  assert.deepEqual(result.body, { mode: "dry_run", candidateCount: 50, limitReached: true });
  assert.equal(purgeCalls.length, 0);
  assert.equal(logs.filter(log => log.args[1].threadId).length, 50);
  assert.equal(JSON.stringify(logs).includes('"thread-50"'), false);
});

test("exact false purges sequentially in RPC order with the service client", async () => {
  process.env.THREAD_TRASH_PURGE_DRY_RUN = "false";
  lookupResult = row([candidate("z-oldest"), candidate("a-later")]);
  let active = 0;
  purgeResult = async input => {
    assert.equal(active++, 0, "purges must not overlap");
    assert.equal(input.mode, "cron"); assert.equal(input.serviceClient, db);
    assert.deepEqual(Object.keys(input).sort(), ["mode", "serviceClient", "threadId"]);
    await Promise.resolve(); active--;
    return deleted();
  };
  const result = await invoke();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, totals({ attemptedCount: 2, deletedCount: 2 }));
  assert.deepEqual(purgeCalls.map(call => call.threadId), ["z-oldest", "a-later"]);
  assertPrivate(result.body);
});

test("delete mode processes only 50 of 51 candidates and requests p_limit 51", async () => {
  process.env.THREAD_TRASH_PURGE_DRY_RUN = "false";
  lookupResult = row(Array.from({ length: 51 }, (_, i) => candidate(`thread-${i}`)));
  const result = await invoke();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, totals({ attemptedCount: 50, deletedCount: 50, limitReached: true }));
  assert.deepEqual(purgeCalls.map(call => call.threadId), Array.from({ length: 50 }, (_, i) => `thread-${i}`));
  assert.deepEqual(db.calls[0].args, { p_limit: 51 });
});

test("an error outcome does not stop the next candidate and returns 500", async () => {
  process.env.THREAD_TRASH_PURGE_DRY_RUN = "false";
  lookupResult = row([candidate("failed-thread"), candidate("deleted-thread")]);
  purgeResult = input => input.threadId === "failed-thread"
    ? { outcome: "error", storage: storage(), errorCode: "XX000" } : deleted();
  const result = await invoke();
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, totals({ attemptedCount: 2, deletedCount: 1, errorCount: 1, errorCodes: ["XX000"] }));
  assert.deepEqual(logs.filter(log => log.level === "error").map(log => log.args[1]),
    [{ threadId: "failed-thread", errorCode: "XX000" }]);
});

test("a thrown purge is isolated and never logs exception contents", async () => {
  process.env.THREAD_TRASH_PURGE_DRY_RUN = "false";
  lookupResult = row([candidate("failed-thread"), candidate("deleted-thread")]);
  purgeResult = input => {
    if (input.threadId === "failed-thread") throw new Error(process.env.SUPABASE_SERVICE_ROLE_KEY);
    return deleted();
  };
  const result = await invoke();
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, totals({ attemptedCount: 2, deletedCount: 1, errorCount: 1, errorCodes: ["PURGE_EXCEPTION"] }));
  assertPrivate(result.body);
});

test("not_found is a normal competing deletion and returns 200", async () => {
  process.env.THREAD_TRASH_PURGE_DRY_RUN = "false";
  lookupResult = row([candidate("gone-thread")]);
  purgeResult = () => ({ outcome: "not_found", storage: storage() });
  const result = await invoke();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, totals({ attemptedCount: 1, notFoundCount: 1 }));
});

test("Storage failures sum object counts, warn and retain HTTP 200", async () => {
  process.env.THREAD_TRASH_PURGE_DRY_RUN = "false";
  lookupResult = row([candidate("first"), candidate("second")]);
  purgeResult = () => ({ outcome: "deleted", storage: storage(3, ["STORAGE_FAILED", "STORAGE_FAILED"]) });
  const result = await invoke();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, totals({ attemptedCount: 2, deletedCount: 2, storageFailedCount: 6, errorCodes: ["STORAGE_FAILED"] }));
  assert.deepEqual(logs.filter(log => log.level === "warn").map(log => log.args[1]),
    [{ threadId: "first", errorCode: "STORAGE_FAILED" }, { threadId: "second", errorCode: "STORAGE_FAILED" }]);
});

test("error codes are deduplicated across DB and Storage failures with unknown fallback", async () => {
  process.env.THREAD_TRASH_PURGE_DRY_RUN = "false";
  lookupResult = row([candidate("a"), candidate("b"), candidate("c"), candidate("d")]);
  purgeResult = input => input.threadId === "d"
    ? { outcome: "deleted", storage: storage(1, ["XX000"]) }
    : { outcome: "error", storage: storage(), ...(input.threadId === "c" ? {} : { errorCode: "XX000" }) };
  const result = await invoke();
  assert.equal(result.status, 500);
  assert.deepEqual(result.body.errorCodes, ["XX000", "unknown"]);
  assert.equal(result.body.errorCount, 3); assert.equal(result.body.storageFailedCount, 1);
});

test("Storage failure without codes emits an unknown warning", async () => {
  process.env.THREAD_TRASH_PURGE_DRY_RUN = "false";
  lookupResult = row([candidate("first")]);
  purgeResult = () => ({ outcome: "deleted", storage: storage(1) });
  const result = await invoke();
  assert.equal(result.status, 200); assert.deepEqual(result.body.errorCodes, ["unknown"]);
  assert.equal(logs.filter(log => log.level === "warn").length, 1);
});

test("after 40 seconds, no new candidate starts and prior work is counted", async () => {
  process.env.THREAD_TRASH_PURGE_DRY_RUN = "false";
  lookupResult = row([candidate("first"), candidate("later")]);
  purgeResult = () => { now = 40_001; return deleted(); };
  const result = await invoke();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, totals({ attemptedCount: 1, deletedCount: 1, timeBudgetReached: true }));
  assert.deepEqual(purgeCalls.map(call => call.threadId), ["first"]);
});

test("exactly 40 seconds still permits starting a candidate", async () => {
  process.env.THREAD_TRASH_PURGE_DRY_RUN = "false";
  lookupResult = row([candidate("first"), candidate("second")]);
  purgeResult = () => { now = 40_000; return deleted(); };
  const result = await invoke();
  assert.equal(result.body.attemptedCount, 2); assert.equal(result.body.timeBudgetReached, false);
});

test("lookup time is part of the budget, so slow lookup can prevent all purges", async () => {
  process.env.THREAD_TRASH_PURGE_DRY_RUN = "false";
  lookupResult = () => { now = 40_001; return row([candidate("first")]); };
  const result = await invoke();
  assert.deepEqual(result.body, totals({ timeBudgetReached: true }));
  assert.equal(purgeCalls.length, 0);
});

for (const data of [[], null]) {
  test(`empty ${data === null ? "null" : "array"} lookup succeeds without purge`, async () => {
    process.env.THREAD_TRASH_PURGE_DRY_RUN = "false";
    lookupResult = row(data);
    const result = await invoke();
    assert.deepEqual(result, { status: 200, body: totals() });
    assert.equal(purgeCalls.length, 0);
  });
}

test("candidate RPC error returns 500 without purge or raw error text", async () => {
  lookupResult = row(null, { code: "XX000", message: process.env.SUPABASE_SERVICE_ROLE_KEY });
  const result = await invoke();
  assert.deepEqual(result, { status: 500, body: { error: "candidate lookup failed" } });
  assert.equal(purgeCalls.length, 0); assertPrivate(result.body);
});

test("candidate RPC exception returns 500 without leaking credentials", async () => {
  lookupResult = () => { throw new Error(process.env.CRON_SECRET); };
  const result = await invoke();
  assert.equal(result.status, 500); assert.equal(purgeCalls.length, 0); assertPrivate(result.body);
});

test("admin factory exception returns 500 without leaking credentials or querying DB", async () => {
  adminFactory = () => { throw new Error(process.env.SUPABASE_SERVICE_ROLE_KEY); };
  const result = await invoke();
  assert.deepEqual(result, { status: 500, body: { error: "Admin client initialization failed" } });
  assert.equal(db.calls.length, 0); assert.equal(purgeCalls.length, 0); assertPrivate(result.body);
});

test("start and finish logs carry JSON values and aggregate counts under the Cron prefix", async () => {
  process.env.THREAD_TRASH_PURGE_DRY_RUN = "false";
  lookupResult = row([candidate("first")]);
  const result = await invoke();
  assert.deepEqual(logs[0], { level: "info", args: ["[thread-trash-purge-cron]", { event: "start", mode: "delete", candidateCount: 1 }] });
  assert.deepEqual(logs.at(-1).args[1], { event: "finish", ...result.body });
  for (const log of logs) {
    assert.equal(log.args[0], "[thread-trash-purge-cron]");
    assert.deepEqual(JSON.parse(JSON.stringify(log.args[1])), log.args[1]);
  }
  assertPrivate(result.body);
});

test("Vercel schedules the new Cron and preserves the existing Storage Cron", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  assert.deepEqual(config.crons, [
    { path: "/api/cron/storage-cleanup", schedule: "0 18 * * *" },
    { path: "/api/cron/thread-trash-purge", schedule: "0 17 * * *" },
  ]);
});
