const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const React = require("react");
const { installTsLoader } = require("./testBootstrap.cjs");
let state = [], cursor = 0, deps = [], cleanups = [], pending = new Map(), requests = [];
const hooks = { ...React,
  useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
  useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
  useEffect(fn, nextDeps) { const i = cursor++; if (!deps[i] || nextDeps.some((value, n) => value !== deps[i][n])) pending.set(i, () => { cleanups[i]?.(); deps[i] = nextDeps; cleanups[i] = fn(); }); },
};
const load = Module._load;
Module._load = function(request, parent, main) { if (request === "react") return hooks; return load.call(this, request, parent, main); };
installTsLoader();
const { useProjectMemorySummary } = require("../lib/project-memory/use-project-memory-summary.ts");
Module._load = load;
const topic = { id: "topic", topic_key: "overview", content_md: "body", include_in_chat: true, promotion: { status: "current" } };
const render = (projectId = "A", refreshToken = 0) => { cursor = 0; return useProjectMemorySummary({ projectId, refreshToken }); };
const effects = () => { const jobs = pending; pending = new Map(); jobs.forEach(run => run()); };
const flush = () => new Promise(resolve => setImmediate(resolve));
function reset() {
  cleanups.forEach(fn => fn?.()); state = []; deps = []; cleanups = []; pending = new Map(); requests = [];
  global.fetch = (url, options) => new Promise((resolve, reject) => requests.push({ url, signal: options.signal, resolve, reject }));
}
const initial = { topics: null, loading: true, error: null };

test("summary hook distinguishes pre-effect loading, successful arrays, empty arrays, errors and null Project", async () => {
  const original = global.fetch;
  try {
    reset(); assert.deepEqual(render(), initial); assert.equal(requests.length, 0);
    effects(); assert.equal(requests.length, 1); requests[0].resolve(Response.json({ topics: [topic] })); await flush();
    assert.deepEqual(render(), { topics: [topic], loading: false, error: null });
    reset(); render(); effects(); requests[0].resolve(Response.json({ topics: [] })); await flush();
    assert.deepEqual(render(), { topics: [], loading: false, error: null });
    reset(); render(); effects(); requests[0].reject(new Error("failed")); await flush();
    assert.equal(render().topics, null); assert.equal(render().loading, false); assert.match(render().error, /読み込めません/);
    assert.deepEqual(render(null), { topics: null, loading: false, error: null }); effects();
    assert.equal(requests[0].signal.aborted, true);
    reset(); assert.deepEqual(render(null), { topics: null, loading: false, error: null }); effects(); assert.equal(requests.length, 0);
  } finally { cleanups.forEach(fn => fn?.()); global.fetch = original; }
});

test("Project switches hide old topics and old errors on the first render before effects", async () => {
  const original = global.fetch;
  try {
    for (const failed of [false, true]) {
      reset(); render(); effects();
      if (failed) requests[0].reject(new Error("failed A"));
      else requests[0].resolve(Response.json({ topics: [topic] }));
      await flush(); render();
      assert.deepEqual(render("B"), initial);
      effects(); assert.equal(requests[0].signal.aborted, true);
      requests[1].resolve(Response.json({ topics: [] })); await flush();
      assert.deepEqual(render("B"), { topics: [], loading: false, error: null });
    }
  } finally { cleanups.forEach(fn => fn?.()); global.fetch = original; }
});

test("refresh keeps previous data while loading and discards it when the refresh fails", async () => {
  const original = global.fetch;
  try {
    reset(); render(); effects(); requests[0].resolve(Response.json({ topics: [topic] })); await flush();
    assert.deepEqual(render("A", 1), { topics: [topic], loading: true, error: null });
    effects(); assert.equal(requests.length, 2);
    assert.deepEqual(render("A", 1), { topics: [topic], loading: true, error: null });
    requests[1].reject(new Error("refresh failed")); await flush();
    assert.equal(render("A", 1).topics, null); assert.equal(render("A", 1).loading, false); assert.ok(render("A", 1).error);
    assert.deepEqual(render("A", 2), initial); effects();
    requests[2].resolve(Response.json({ topics: [] })); await flush();
    assert.deepEqual(render("A", 2), { topics: [], loading: false, error: null });
  } finally { cleanups.forEach(fn => fn?.()); global.fetch = original; }
});

test("old success and failure responses are discarded after Project and refresh changes, including before effects", async () => {
  const original = global.fetch;
  try {
    for (const next of [["B", 0], ["A", 1]]) {
      for (const failed of [false, true]) {
        reset(); render(); effects(); assert.deepEqual(render(...next), initial);
        if (failed) requests[0].reject(new Error("old failed"));
        else requests[0].resolve(Response.json({ topics: [topic] }));
        await flush(); assert.deepEqual(render(...next), initial);
        effects(); requests[1].resolve(Response.json({ topics: [] })); await flush();
        assert.deepEqual(render(...next), { topics: [], loading: false, error: null });
      }
      reset(); render(); effects(); render(...next); effects();
      requests[1].resolve(Response.json({ topics: [] })); await flush();
      requests[0].resolve(Response.json({ topics: [topic] })); await flush();
      assert.deepEqual(render(...next), { topics: [], loading: false, error: null });
    }
  } finally { cleanups.forEach(fn => fn?.()); global.fetch = original; }
});

test("unmount aborts the request and ignores an eventual response even if transport ignores abort", async () => {
  const original = global.fetch;
  try {
    reset(); render(); effects(); const before = state[0]; cleanups.forEach(fn => fn?.());
    assert.equal(requests[0].signal.aborted, true);
    requests[0].resolve(Response.json({ topics: [topic] })); await flush();
    assert.equal(state[0], before);
  } finally { global.fetch = original; }
});
