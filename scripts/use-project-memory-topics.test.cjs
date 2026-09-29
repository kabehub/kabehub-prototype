const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

const originalLoad = Module._load;
const originalFetch = global.fetch;
let state = [], cursor = 0, deps = [], cleanups = [], pending = [];
const hooks = {
  ...React,
  useState(initial) {
    const i = cursor++;
    if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
    return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
  },
  useRef(initial) {
    const i = cursor++;
    if (!(i in state)) state[i] = { current: initial };
    return state[i];
  },
  useCallback(fn, nextDeps) {
    const i = cursor++;
    if (!state[i] || nextDeps.some((value, position) => value !== state[i].deps[position])) state[i] = { fn, deps: nextDeps };
    return state[i].fn;
  },
  useEffect(fn, nextDeps) {
    const i = cursor++;
    if (!deps[i] || nextDeps.some((value, position) => value !== deps[i][position])) {
      pending.push(() => { cleanups[i]?.(); deps[i] = nextDeps; cleanups[i] = fn(); });
    }
  },
};
Module._load = function (request, parent, isMain) {
  if (request === "react") return hooks;
  if (request === "@/lib/apiKeyStore") return { webApiKeyStore: { async getKey() { return "key"; } } };
  return originalLoad.call(this, request, parent, isMain);
};
installAliasResolver();
installTsLoader({ jsx: true });
const useTopics = require(path.join(__dirname, "..", "lib", "project-memory", "use-project-memory-topics.ts")).useProjectMemoryTopics;
const topic = (id) => ({ id, topic_key: id, content_md: "Content", revision: 1, created_at: "", updated_at: "",
  promotion: { status: "not_promoted", source_revision: null, lore_id: null } });
const render = (options = {}) => { cursor = 0; return useTopics({ projectId: "A", enabled: true, ...options }); };
const effects = () => { const todo = pending; pending = []; todo.forEach((run) => run()); };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const reset = (fetcher) => { state = []; cursor = 0; deps = []; cleanups = []; pending = []; global.fetch = fetcher; };
const file = (name, content) => ({ name, async text() { return content; } });
const header = (id = "A-topic") => `<!-- kabehub-topic:v1 ${JSON.stringify({ topic_id: id, topic_key: id, revision: 1 })} -->\nNew`;

(async () => {
  let gets = 0;
  reset(async () => { gets++; return Response.json({ topics: [topic("A-topic")] }); });
  render({ keepLoaded: false }); effects(); await flush();
  assert.equal(gets, 1);
  render({ enabled: false, keepLoaded: false }); effects();
  render({ keepLoaded: false }); effects(); await flush();
  assert.equal(gets, 2, "keepLoaded=false refetches on reopening");

  gets = 0;
  reset(async () => { gets++; return Response.json({ topics: [topic("A-topic")] }); });
  render({ keepLoaded: true }); effects(); await flush();
  assert.equal(render({ enabled: false, keepLoaded: true }).topics.length, 1);
  effects(); assert.equal(gets, 1, "disabled does not fetch");
  render({ keepLoaded: true }); effects(); await flush();
  assert.equal(gets, 1, "keepLoaded=true keeps a successful GET");
  assert.equal(render({ keepLoaded: true }).topics.length, 1);

  gets = 0;
  reset(async () => { gets++; return gets === 1 ? new Response(null, { status: 500 }) : Response.json({ topics: [topic("A-topic")] }); });
  render({ keepLoaded: true }); effects(); await flush();
  assert.equal(render({ keepLoaded: true }).topics.length, 0);
  render({ enabled: false, keepLoaded: true }); effects();
  render({ keepLoaded: true }); effects(); await flush();
  assert.equal(gets, 2, "failed GET is not loaded");
  assert.equal(render({ keepLoaded: true }).topics.length, 1);

  gets = 0;
  reset(async () => { gets++; return Response.json(gets === 1 ? { topics: null } : { topics: [topic("A-topic")] }); });
  render({ keepLoaded: true }); effects(); await flush();
  render({ enabled: false, keepLoaded: true }); effects();
  render({ keepLoaded: true }); effects(); await flush();
  assert.equal(gets, 2, "invalid GET body is not loaded");

  gets = 0;
  reset(async (url) => { gets++; return Response.json({ topics: [topic(url.includes("/B/") ? "B-topic" : "A-topic")] }); });
  render({ keepLoaded: true }); effects(); await flush();
  assert.equal(render({ keepLoaded: true }).topics[0].id, "A-topic");
  const firstBRender = render({ projectId: "B", keepLoaded: true });
  assert.deepEqual(firstBRender.topics, [], "old topics must be hidden before B effect");
  effects(); await flush();
  assert.equal(render({ projectId: "B", keepLoaded: true }).topics[0].id, "B-topic");

  let resolveA;
  reset((url) => url.includes("/A/") ? new Promise((resolve) => { resolveA = resolve; }) : Promise.resolve(Response.json({ topics: [topic("B-topic")] })));
  render({ keepLoaded: true }); effects();
  render({ projectId: "B", keepLoaded: true }); effects(); await flush();
  resolveA(Response.json({ topics: [topic("A-topic")] })); await flush();
  assert.equal(render({ projectId: "B", keepLoaded: true }).topics[0].id, "B-topic", "stale response ignored");

  for (const [status, expectedGets] of [[200, 2], [409, 2], [404, 1], [500, 1]]) {
    gets = 0;
    reset(async (_url, init = {}) => {
      if (!init.method) { gets++; return Response.json({ topics: [topic("A-topic")] }); }
      return Response.json({ error: "failed" }, { status });
    });
    render(); effects(); await flush();
    await render().promote(topic("A-topic"));
    assert.equal(gets, expectedGets, `promotion ${status} reload count`);
  }
  for (const [method, status, expectedGets] of [
    ["PATCH", 200, 2], ["PATCH", 409, 2], ["PATCH", 404, 2], ["PATCH", 500, 1],
    ["POST", 201, 2], ["POST", 409, 2], ["POST", 404, 2], ["POST", 500, 1],
  ]) {
    gets = 0;
    reset(async (_url, init = {}) => {
      if (!init.method) { gets++; return Response.json({ topics: [topic("A-topic")] }); }
      assert.equal(init.method, method);
      return new Response(null, { status });
    });
    render(); effects(); await flush();
    await render().selectUploadFile(method === "PATCH" ? file("A-topic.md", header()) : file("new.md", "New"));
    await render().executeUpload();
    assert.equal(gets, expectedGets, `${method} ${status} reload count`);
  }
  console.log("ok - useProjectMemoryTopics cache, request invalidation, and reload conditions");
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch;
  Module._load = originalLoad;
});
