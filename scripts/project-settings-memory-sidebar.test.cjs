const assert = require("node:assert/strict");
const { test } = require("node:test");
const Module = require("node:module");
const React = require("react");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

const projectId = "11111111-1111-4111-8111-111111111111";
let state = [], cursor = 0, mounting = false, pendingEffects = [], modalProps = {}, memoryProps = null;
let consolidationResult = [], consolidationCalls = [], toasts = [], auto = {}, generateCalls = 0;
const hooks = { ...React,
  useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
  useRef(initial) { return { current: initial }; },
  useEffect(fn) { if (mounting) pendingEffects.push(fn); },
  useCallback(fn) { return fn; }, useMemo(fn) { return fn(); },
};
const modalNames = ["ProjectMemoryListModal", "ProjectMemoryConsolidationModal", "ProjectMemoryBootstrapModal", "ProjectDeleteConfirmModal"];
const load = Module._load;
Module._load = function(request, parent, main) {
  if (request === "react") return hooks;
  if (request === "@/lib/project-memory/use-auto-summary") return { useAutoSummary() { return auto; } };
  if (request === "@/components/Toast") return { useToast() { return { showToast(...args) { toasts.push(args); } }; } };
  if (request === "@/lib/apiKeyStore") return { webApiKeyStore: { async getKey() { return "key"; } } };
  if (request === "@/lib/project-memory/consolidation-client") return {
    async applyProjectMemoryConsolidation(...args) { consolidationCalls.push(args); return consolidationResult; },
  };
  if (request === "@/components/ProjectMemoryTab") return { __esModule: true, default: props => {
    memoryProps = props; return React.createElement("mock-memory-tab", props);
  } };
  for (const name of modalNames) {
    if (request === "@/components/" + name) return { __esModule: true, default: props => {
      modalProps[name] = props; return null;
    } };
  }
  return load.call(this, request, parent, main);
};
installAliasResolver(); installTsLoader({ jsx: true });
const Sidebar = require("../components/Sidebar.tsx").default;
Module._load = load;

const props = {
  threads: [{ id: "thread", title: "Thread", created_at: "2026-10-03T00:00:00Z", project_id: projectId }],
  activeThreadId: null, onSelectThread() {}, onNewThread() {}, onDeleteThread() {}, onSearch() {},
  isSearching: false, user: { id: "user", email: "user@example.com" }, onLogout() {},
  async onUpdateFolder() { return null; }, onNewThreadInFolder() {}, async onRefreshThreads() {},
};
const preview = { run_id: "run", model: "model", prompt_version: 1, considered_topics: [], topics: [{ topic_id: "topic" }] };
const flush = () => new Promise(resolve => setImmediate(resolve));
function text(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return React.isValidElement(value) ? text(value.props.children) : "";
}
function collect(value, result) {
  if (Array.isArray(value)) return value.forEach(child => collect(child, result));
  if (!React.isValidElement(value)) return;
  if (typeof value.type === "function") return collect(value.type(value.props), result);
  result.push(value); collect(value.props.children, result);
}
function render() {
  cursor = 0; mounting = state.length === 0; memoryProps = null; modalProps = {};
  const nodes = []; collect(Sidebar(props), nodes); mounting = false; return nodes;
}
function button(nodes, label) {
  const matches = nodes.filter(node => node.type === "button" && text(node) === label);
  assert.equal(matches.length, 1, label); return matches[0];
}
async function setup() {
  state = []; pendingEffects = []; consolidationCalls = []; toasts = []; generateCalls = 0;
  auto = {
    buttonLabel: "会話からMemoryを作る", canGenerate: true, error: null, generating: false,
    preview: null, isApplying: false, results: null,
    async generate() { generateCalls++; }, async apply() {}, close() {},
  };
  global.fetch = async (url) => {
    if (url === "/api/projects") return Response.json({ projects: [{ id: projectId, name: "Project" }] });
    if (url === "/api/stats?period=today") return Response.json({ sends: 0, total_tokens: 0 });
    if (url === "/api/project-settings") return Response.json([]);
    if (url.startsWith("/api/project-settings?")) return Response.json({ system_prompt: "prompt", folder_type: null, pinned_github_files: [] });
    if (url.endsWith("/memory/consolidate/preview")) return Response.json(preview);
    throw new Error("unexpected fetch: " + url);
  };
  render(); pendingEffects.forEach(effect => effect()); await flush();
  const nodes = render();
  nodes.find(node => node.props.title === "フォルダのシステムプロンプトを設定").props.onClick({ stopPropagation() {} });
  await flush(); return render();
}
function selectMemory(nodes) { button(nodes, "Memory").props.onClick(); return render(); }

test("Sidebar lazy mounts only the Memory tab and closing its list increments refresh unconditionally", async () => {
  const original = global.fetch;
  try {
    let nodes = await setup(); assert.equal(memoryProps, null);
    assert.equal(nodes.filter(node => node.props.role === "tabpanel").length, 3);
    button(nodes, "参照").props.onClick(); nodes = render(); assert.equal(memoryProps, null);
    nodes = selectMemory(nodes); assert.equal(memoryProps.refreshToken, 0);
    assert.equal(memoryProps.projectId, projectId);
    memoryProps.autoSummary.onGenerate(); assert.equal(generateCalls, 1);
    memoryProps.list.onOpen(); render(); assert.equal(modalProps.ProjectMemoryListModal.isOpen, true);
    modalProps.ProjectMemoryListModal.onCancel(); render();
    assert.equal(memoryProps.refreshToken, 1); assert.equal(modalProps.ProjectMemoryListModal.isOpen, false);
    modalProps.ProjectMemoryListModal.onCancel(); render(); assert.equal(memoryProps.refreshToken, 2);
    button(nodes, "指示").props.onClick(); nodes = render(); assert.equal(memoryProps, null);
    assert.equal(nodes.find(node => node.props.id === "project-settings-panel-memory").props.hidden, true);
  } finally { global.fetch = original; }
});

test("Sidebar preserves both placeholder texts apart from the removed suffix and keeps one save hint outside the panels", async () => {
  const original = global.fetch;
  try {
    let nodes = await setup();
    const plain = "例：このフォルダの会話では、あなたは厳格なコードレビュアーとして振る舞ってください。";
    const novel = "例：あなたは優秀な小説の共同執筆者です。世界観・登場人物・文体の一貫性を保ちながら、指示された内容を執筆してください。";
    assert.equal(nodes.find(node => node.type === "textarea").props.placeholder, plain);
    const toggle = nodes.find(node => node.type === "button" && node.props.style?.width === "40px" && node.props.style?.height === "22px");
    assert.ok(toggle); toggle.props.onClick(); nodes = render();
    const input = nodes.find(node => node.type === "textarea");
    assert.equal(input.props.placeholder, novel); assert.equal(input.props.style.minHeight, "260px");
    for (const label of ["指示", "参照", "Memory"]) {
      button(nodes, label).props.onClick(); nodes = render();
      const hint = label === "Memory" ? "このタブの操作はすぐに反映されます（『保存』は不要）" : "この内容は下の『保存』で反映されます";
      const hints = nodes.filter(node => node.type === "div" && text(node) === hint);
      assert.equal(hints.length, 1); assert.equal(hints[0].props.style.fontSize, "11px");
      assert.equal(hints[0].props.style.color, "var(--ink-faint)");
      for (const panel of nodes.filter(node => node.props.role === "tabpanel")) assert.equal(text(panel).includes(hint), false);
    }
  } finally { global.fetch = original; }
});

test("Sidebar increments refresh for mixed and all-failed consolidation results, preserving result and toast behavior", async () => {
  const original = global.fetch;
  try {
    for (const statuses of [["applied", "conflict", "failed"], ["failed", "failed"]]) {
      const nodes = await setup(); selectMemory(nodes);
      const before = memoryProps.refreshToken;
      await memoryProps.consolidation.onOpen(); render();
      consolidationResult = statuses.map((status, index) => ({ topic_id: "topic-" + index, status }));
      const selected = ["topic-0", "topic-1"];
      const result = await modalProps.ProjectMemoryConsolidationModal.onApply(selected);
      assert.equal(result, undefined, "existing handler return value"); render();
      assert.equal(memoryProps.refreshToken, before + 1);
      assert.equal(modalProps.ProjectMemoryConsolidationModal.results, consolidationResult);
      assert.deepEqual(consolidationCalls, [[projectId, preview, selected]]);
      assert.deepEqual(toasts.at(-1), statuses[0] === "applied" ? ["1件更新、1件競合、1件失敗", "error"] : ["0件更新、0件競合、2件失敗", "error"]);
      assert.equal(modalProps.ProjectMemoryConsolidationModal.isApplying, false);
    }
  } finally { global.fetch = original; }
});

test("Sidebar auto-summary wrapper preserves arguments and return value, refreshing only after completion or rejection", async () => {
  const original = global.fetch;
  try {
    for (const rejected of [false, true]) {
      const nodes = await setup(); selectMemory(nodes);
      let resolve, reject, received;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      auto.preview = { run_id: "auto-run" };
      auto.apply = (...args) => { received = args; return promise; };
      render(); const before = memoryProps.refreshToken;
      const args = [["overview", "principles"]];
      const running = modalProps.ProjectMemoryBootstrapModal.onApply(...args);
      assert.equal(received[0], args[0], "argument identity must pass through");
      assert.deepEqual(received, args);
      render(); assert.equal(memoryProps.refreshToken, before, "pending Promise must not refresh");
      if (rejected) {
        const failure = new Error("apply rejection"); const check = assert.rejects(running, error => error === failure);
        reject(failure); await check;
      } else {
        const result = { marker: "unchanged return identity" }; resolve(result);
        assert.equal(await running, result);
      }
      render(); assert.equal(memoryProps.refreshToken, before + 1);
    }
  } finally { global.fetch = original; }
});
