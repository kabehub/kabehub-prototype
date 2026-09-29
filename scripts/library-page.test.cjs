const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

const originalLoad = Module._load;
const originalFetch = global.fetch;
let state = [], cursor = 0, deps = [], pending = [];
const hooks = {
  ...React,
  useState(initial) {
    const i = cursor++;
    if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
    return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
  },
  useCallback(fn, nextDeps) {
    const i = cursor++;
    if (!state[i] || nextDeps.some((value, position) => value !== state[i].deps[position])) state[i] = { fn, deps: nextDeps };
    return state[i].fn;
  },
  useEffect(fn, nextDeps) {
    const i = cursor++;
    if (!deps[i] || nextDeps.some((value, position) => value !== deps[i][position])) {
      pending.push(() => { deps[i] = nextDeps; fn(); });
    }
  },
};
Module._load = function (request, parent, isMain) {
  if (request === "react") return hooks;
  return originalLoad.call(this, request, parent, isMain);
};
installAliasResolver();
installTsLoader({ jsx: true });
const Page = require(path.join(__dirname, "..", "app", "library", "page.tsx")).default;
const Section = require(path.join(__dirname, "..", "components", "ProjectMemorySection.tsx")).default;
const render = () => { cursor = 0; return Page(); };
const effects = () => { const todo = pending; pending = []; todo.forEach((run) => run()); };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const nodes = (root) => root && typeof root === "object" ? [root, ...React.Children.toArray(root.props?.children).flatMap(nodes)] : [];
const reset = (fetcher) => { state = []; cursor = 0; deps = []; pending = []; global.fetch = fetcher; };

(async () => {
  const calls = [];
  reset(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ projects: [{ id: "z", name: "東京" }, { id: "a", name: "あお" }] });
  });
  let tree = render();
  assert.ok(nodes(tree).some((node) => node.props?.children === "読み込み中…"));
  effects(); await flush();
  tree = render();
  assert.deepEqual(calls, [{ url: "/api/projects", options: { cache: "no-store" } }]);
  assert.deepEqual(nodes(tree).filter((node) => node.type === Section).map((node) => [node.props.projectId, node.props.projectName]),
    [["a", "あお"], ["z", "東京"]]);
  assert.equal(calls.some(({ url }) => url.includes("/memory/topics")), false);
  assert.ok(nodes(tree).some((node) => node.type === "a" && node.props.href === "/"));
  assert.ok(nodes(tree).some((node) => node.type === "a" && node.props.href === "/memory"));

  reset(async () => Response.json({ projects: [] }));
  render(); effects(); await flush();
  assert.ok(nodes(render()).some((node) => node.props?.children === "Projectがありません。"));

  let attempts = 0;
  reset(async () => {
    attempts++;
    return attempts === 1 ? new Response(null, { status: 500 }) : Response.json({ projects: [] });
  });
  render(); effects(); await flush();
  tree = render();
  assert.ok(nodes(tree).some((node) => node.props?.role === "alert"));
  const retry = nodes(tree).find((node) => node.type === "button" && node.props.children === "再読み込み");
  assert.ok(retry);
  retry.props.onClick(); await flush();
  assert.equal(attempts, 2);
  assert.ok(nodes(render()).some((node) => node.props?.children === "Projectがありません。"));
  console.log("ok - library page projects, sorting, empty, error, retry, no topic fetch");
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch;
  Module._load = originalLoad;
});
