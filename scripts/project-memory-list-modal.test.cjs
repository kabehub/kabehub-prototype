const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

const originalLoad = Module._load;
const originalFetch = global.fetch;
const originalWindow = global.window;
const originalDocument = global.document;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
let state = [];
let cursor = 0;
let effects = [];
let effectDeps = [];
let effectCleanups = [];
let firstRender = true;
let key = "openai-key";
let posts = 0;
let gets = 0;
let releasePost;
let onEscape;

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
  useCallback(fn, deps) {
    const index = cursor++;
    if (!state[index] || !deps || deps.some((value, position) => value !== state[index].deps?.[position])) {
      state[index] = { fn, deps };
    }
    return state[index].fn;
  },
  useEffect(fn, deps) {
    const index = cursor++;
    if (firstRender) {
      effectDeps[index] = deps;
      effects.push(() => { effectCleanups[index] = fn(); });
    } else if (!deps || deps.some((value, position) => value !== effectDeps[index]?.[position])) {
      effectCleanups[index]?.();
      effectDeps[index] = deps;
      effectCleanups[index] = fn();
    }
  },
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
const ProjectMemoryTopicList = require(path.join(__dirname, "..", "components", "ProjectMemoryTopicList.tsx")).default;
const ProjectMemoryUploadConfirm = require(path.join(__dirname, "..", "components", "ProjectMemoryUploadConfirm.tsx")).default;

function render() {
  cursor = 0;
  const tree = Modal({ isOpen: true, projectId: "project-1", projectName: "Project", onCancel() {} });
  firstRender = false;
  return tree;
}

function nodes(root) {
  if (!root || typeof root !== "object") return [];
  if (root.type === ProjectMemoryTopicList || root.type === ProjectMemoryUploadConfirm) return nodes(root.type(root.props));
  const children = React.Children.toArray(root.props?.children);
  return [root, ...children.flatMap(nodes)];
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

(async () => {
  global.window = { addEventListener(_name, handler) { onEscape = handler; }, removeEventListener() { onEscape = null; } };
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
  assert.equal(nodes(tree).find((node) => node.type === "button" && node.props.children === "ファイルをアップロード").props.disabled, true);
  releasePost();
  await flush();
  assert.equal(gets, 2, "success refreshes the topic list");
  tree = render();
  const current = nodes(tree).find((node) => node.type === "button" && node.props.children === "昇格済み");
  assert.equal(current.props.disabled, true);

  key = null;
  gets = 0;
  state = []; cursor = 0; effects = []; effectDeps = []; effectCleanups = []; firstRender = true;
  render();
  for (const effect of effects) effect();
  await flush();
  tree = render();
  const noKeyButton = nodes(tree).find((node) => node.type === "button" && node.props.children === "Loreに昇格");
  assert.equal(noKeyButton.props.disabled, true);
  assert.ok(nodes(tree).some((node) => typeof node.props?.children === "string" && node.props.children.includes("OpenAI APIキーが未設定")));
  key = "openai-key";
  const findButton = (root, label) => nodes(root).find((node) => node.type === "button" && node.props.children === label);
  const uploadInput = (root) => nodes(root).find((node) => node.type === "input" && node.props.type === "file");
  const alert = (root) => nodes(root).find((node) => node.props?.role === "alert")?.props.children;
  const setup = async (handler, onCancel = () => {}) => {
    state = []; cursor = 0; effects = []; effectDeps = []; effectCleanups = []; firstRender = true;
    global.fetch = handler;
    render();
    for (const effect of effects) effect();
    await flush();
    return () => {
      cursor = 0;
      return Modal({ isOpen: true, projectId: "project-1", projectName: "Project", onCancel });
    };
  };
  const choose = async (root, name, content) => {
    const input = { files: [{ name, text: async () => { assert.equal(input.value, "", "input resets before file.text"); return content; } }], value: "selected" };
    await uploadInput(root).props.onChange({ currentTarget: input });
    assert.equal(input.value, "", "file input resets before text read");
  };
  const header = (overrides = {}) => `<!-- kabehub-topic:v1 ${JSON.stringify({ topic_id: topic.id, topic_key: topic.topic_key, revision: topic.revision, ...overrides })} -->\nUploaded\r\ncontent`;

  let downloadedBlob;
  let downloadedAnchor;
  let revoked;
  URL.createObjectURL = (blob) => { downloadedBlob = blob; return "blob:topic"; };
  URL.revokeObjectURL = (url) => { revoked = url; };
  global.document = { createElement() { downloadedAnchor = { click() { this.clicked = true; } }; return downloadedAnchor; } };
  let view = await setup(async () => Response.json({ topics: [topic] }));
  tree = view();
  findButton(tree, "DL").props.onClick();
  const { encodeTopicFile } = require(path.join(__dirname, "..", "lib", "project-memory", "topic-file.ts"));
  assert.equal(await downloadedBlob.text(), encodeTopicFile(topic));
  assert.equal(downloadedAnchor.download, "overview.md");
  assert.equal(downloadedAnchor.clicked, true);
  assert.equal(revoked, "blob:topic");

  const requests = [];
  let getsForUpload = 0;
  view = await setup(async (_url, init = {}) => {
    if (!init.method) { getsForUpload++; return Response.json({ topics: [topic] }); }
    requests.push(init);
    return new Response(null, { status: 200 });
  });
  await choose(view(), "overview.md", header({ revision: 4 }));
  tree = view();
  assert.ok(nodes(tree).some((node) => node.props?.role === "alertdialog"));
  assert.equal(findButton(tree, "Loreに昇格").props.disabled, true);
  assert.equal(findButton(tree, "ファイルをアップロード").props.disabled, true);
  let closes = 0;
  // The backdrop and close button use the same pending-confirm guard.
  assert.equal(nodes(tree).find((node) => node.type === "div" && node.props.style?.zIndex === 1100).props.onClick(), undefined);
  findButton(tree, "実行").props.onClick();
  await flush();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "PATCH");
  assert.deepEqual(JSON.parse(requests[0].body), { expected_revision: 4, edit_kind: "full", new_content_md: "Uploaded\r\ncontent", source_refs: [] });
  assert.equal(getsForUpload, 2);

  const createRequests = [];
  view = await setup(async (_url, init = {}) => {
    if (!init.method) return Response.json({ topics: [topic] });
    createRequests.push(init);
    return new Response(null, { status: 201 });
  });
  await choose(view(), "ignored.md", header({ topic_id: "new-id", topic_key: "new-topic" }));
  findButton(view(), "実行").props.onClick();
  await flush();
  assert.equal(createRequests[0].method, "POST");
  assert.deepEqual(JSON.parse(createRequests[0].body), { topic_key: "new-topic", content_md: "Uploaded\r\ncontent", source_refs: [] });
  await choose(view(), "fresh.md", "plain\r\nbody");
  findButton(view(), "実行").props.onClick();
  await flush();
  assert.deepEqual(JSON.parse(createRequests[1].body), { topic_key: "fresh", content_md: "plain\r\nbody", source_refs: [] });

  view = await setup(async () => Response.json({ topics: [topic] }));
  await choose(view(), "overview.md", "plain");
  assert.match(alert(view()), /編集元revisionが不明/);
  assert.equal(findButton(view(), "実行"), undefined);
  await choose(view(), "overview.md", header({ topic_id: "other-id" }));
  assert.match(alert(view()), /別のtopicからダウンロードされたファイル/);
  assert.equal(findButton(view(), "実行"), undefined);
  await choose(view(), "overview.md", header({ topic_key: "wrong" }));
  assert.match(alert(view()), /ファイルのヘッダーが壊れています/);
  const failingInput = { files: [{ name: "overview.md", text: async () => { assert.equal(failingInput.value, ""); throw new Error("read failed"); } }], value: "selected" };
  await uploadInput(view()).props.onChange({ currentTarget: failingInput });
  assert.equal(failingInput.value, "");
  assert.equal(alert(view()), "ファイルの読み込みに失敗しました。");

  for (const [method, status, expected] of [
    ["PATCH", 409, "アップロード元から内容が変更されています。"],
    ["PATCH", 404, "対象のtopicが見つかりませんでした。"],
    ["POST", 409, "同名のtopicが既に作成されています。"],
    ["POST", 404, "Projectが見つかりませんでした。"],
  ]) {
    let refreshed = 0;
    view = await setup(async (_url, init = {}) => {
      if (!init.method) { refreshed++; return Response.json({ topics: [topic] }); }
      return new Response(null, { status });
    });
    await choose(view(), method === "PATCH" ? "overview.md" : "new.md", method === "PATCH" ? header() : "new content");
    findButton(view(), "実行").props.onClick();
    await flush();
    assert.equal(refreshed, 2, `${method} ${status} refreshes topics`);
    assert.ok(alert(view()).startsWith(expected));
  }

  let releaseUpload;
  let uploadCalls = 0;
  view = await setup(async (_url, init = {}) => {
    if (!init.method) return Response.json({ topics: [topic] });
    uploadCalls++;
    return new Promise((resolve) => { releaseUpload = () => resolve(new Response(null, { status: 200 })); });
  }, () => { closes++; });
  await choose(view(), "overview.md", header());
  tree = view();
  onEscape?.({ key: "Escape" });
  nodes(tree).find((node) => node.type === "div" && node.props.style?.zIndex === 1100).props.onClick();
  findButton(tree, "閉じる").props.onClick();
  assert.equal(closes, 0);
  findButton(tree, "実行").props.onClick();
  findButton(tree, "実行").props.onClick();
  await flush();
  assert.equal(uploadCalls, 1);
  tree = view();
  assert.equal(findButton(tree, "ファイルをアップロード").props.disabled, true);
  assert.equal(findButton(tree, "Loreに昇格").props.disabled, true);
  onEscape?.({ key: "Escape" });
  nodes(tree).find((node) => node.type === "div" && node.props.style?.zIndex === 1100).props.onClick();
  assert.equal(closes, 0);
  releaseUpload();
  await flush();
  assert.equal(findButton(view(), "実行"), undefined);
  console.log("ok - ProjectMemoryListModal upload/download and promotion guards");
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch;
  global.window = originalWindow;
  global.document = originalDocument;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  Module._load = originalLoad;
});
