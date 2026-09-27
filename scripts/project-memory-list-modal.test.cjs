const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

const originalLoad = Module._load;
const originalFetch = global.fetch;
const originalWindow = global.window;
let state = [];
let cursor = 0;
let effects = [];
let firstRender = true;
let key = "openai-key";
let posts = 0;
let gets = 0;
let releasePost;

const hooks = {
  ...React,
  useState(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
    return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
  },
  useRef(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = { current: initial };
    return state[index];
  },
  useCallback(fn) { cursor++; return fn; },
  useEffect(fn) { cursor++; if (firstRender) effects.push(fn); },
};

Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "react") return hooks;
  if (request === "@/components/MarkdownRenderer") return { __esModule: true, default: () => null };
  if (request === "@/lib/apiKeyStore") return { webApiKeyStore: { async getKey() { return key; } } };
  return originalLoad.call(this, request, parent, isMain);
};
installAliasResolver();
installTsLoader({ jsx: true });
const Modal = require(path.join(__dirname, "..", "components", "ProjectMemoryListModal.tsx")).default;

function render() {
  cursor = 0;
  const tree = Modal({ isOpen: true, projectId: "project-1", projectName: "Project", onCancel() {} });
  firstRender = false;
  return tree;
}

function nodes(root) {
  if (!root || typeof root !== "object") return [];
  const children = React.Children.toArray(root.props?.children);
  return [root, ...children.flatMap(nodes)];
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

(async () => {
  global.window = { addEventListener() {}, removeEventListener() {} };
  const topic = { id: "topic-1", topic_key: "overview", content_md: "Content", revision: 1,
    created_at: "2026-09-09T00:00:00Z", updated_at: "2026-09-09T00:00:00Z",
    promotion: { status: "not_promoted", source_revision: null, lore_id: null } };
  global.fetch = async (_url, init = {}) => {
    if (init.method === "POST") {
      posts++;
      return new Promise((resolve) => { releasePost = () => resolve(Response.json({ created: true, lore_id: "lore-1" })); });
    }
    gets++;
    return Response.json({ topics: [gets > 1 ? { ...topic, promotion: { status: "current", source_revision: 1, lore_id: "lore-1" } } : topic] });
  };

  render();
  for (const effect of effects) effect();
  await flush();
  let tree = render();
  const button = nodes(tree).find((node) => node.type === "button" && node.props.children === "Loreに昇格");
  assert.ok(button);
  assert.equal(button.props.disabled, false);
  button.props.onClick();
  button.props.onClick();
  await flush();
  assert.equal(posts, 1, "rapid clicks must start one embedding request");
  tree = render();
  const pending = nodes(tree).find((node) => node.type === "button" && node.props.children === "昇格中…");
  assert.equal(pending.props.disabled, true);
  releasePost();
  await flush();
  assert.equal(gets, 2, "success refreshes the topic list");
  tree = render();
  const current = nodes(tree).find((node) => node.type === "button" && node.props.children === "昇格済み");
  assert.equal(current.props.disabled, true);

  key = null;
  gets = 0;
  state = []; cursor = 0; effects = []; firstRender = true;
  render();
  for (const effect of effects) effect();
  await flush();
  tree = render();
  const noKeyButton = nodes(tree).find((node) => node.type === "button" && node.props.children === "Loreに昇格");
  assert.equal(noKeyButton.props.disabled, true);
  assert.ok(nodes(tree).some((node) => typeof node.props?.children === "string" && node.props.children.includes("OpenAI APIキーが未設定")));
  console.log("ok - ProjectMemoryListModal blocks rapid promotion clicks and keeps topics visible without a key");
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch;
  global.window = originalWindow;
  Module._load = originalLoad;
});
