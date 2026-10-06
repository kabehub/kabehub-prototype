const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

const originalLoad = Module._load;
const originalFetch = global.fetch;
let state = [], cursor = 0, deps = [], cleanups = [], pending = [];
let key = "openai-key";
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
  if (request === "@/lib/apiKeyStore") return { webApiKeyStore: { async getKey() { return key; } } };
  if (request === "@/components/MarkdownRenderer") return { __esModule: true, default: () => null };
  return originalLoad.call(this, request, parent, isMain);
};
installAliasResolver();
installTsLoader({ jsx: true });
const Section = require(path.join(__dirname, "..", "components", "ProjectMemorySection.tsx")).default;
const TopicList = require(path.join(__dirname, "..", "components", "ProjectMemoryTopicList.tsx")).default;
const UploadConfirm = require(path.join(__dirname, "..", "components", "ProjectMemoryUploadConfirm.tsx")).default;
const InstructionEditModal = require(path.join(__dirname, "..", "components", "ProjectMemoryInstructionEditModal.tsx")).default;
const DeleteConfirm = require('../components/ProjectMemoryDeleteConfirmModal.tsx').default;
const topic = { id: "topic-1", topic_key: "overview", content_md: "Content", include_in_chat: false, revision: 1, created_at: "", updated_at: "",
  promotion: { status: "not_promoted", source_revision: null, lore_id: null } };
const render = () => { cursor = 0; return Section({ projectId: "project-1", projectName: "Project" }); };
const effects = () => { const todo = pending; pending = []; todo.forEach((run) => run()); };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const nodes = (root) => root && typeof root === "object" ? [root, ...React.Children.toArray(root.props?.children).flatMap(nodes)] : [];
const find = (root, type, label) => nodes(root).find((node) => node.type === type && (label === undefined || node.props.children === label));
const reset = (fetcher) => { state = []; cursor = 0; deps = []; cleanups = []; pending = []; global.fetch = fetcher; };

(async () => {
  let gets = 0;
  reset(async () => { gets++; return Response.json({ topics: [topic] }); });
  let tree = render(); effects();
  assert.equal(gets, 0, "collapsed section does not fetch");
  let header = find(tree, "button");
  assert.equal(header.props["aria-expanded"], false);
  assert.equal(find(tree, TopicList), undefined);
  assert.equal(find(tree, "button", "ファイルをアップロード"), undefined);
  header.props.onClick();
  tree = render(); effects(); await flush();
  assert.equal(gets, 1);
  tree = render();
  header = find(tree, "button");
  assert.equal(header.props["aria-expanded"], true);
  assert.ok(find(tree, TopicList));
  assert.ok(find(tree, UploadConfirm));
  assert.ok(find(tree, InstructionEditModal));
  assert.ok(find(tree, "button", "ファイルをアップロード"));
  assert.equal(find(tree, TopicList).props.topics[0].id, topic.id);
  const list = find(tree, TopicList);
  assert.equal(list.props.canInstructionEdit, true);
  list.props.onInstructionEdit(topic);
  tree = render();
  assert.ok(find(tree, InstructionEditModal).props.edit);
  assert.equal(find(tree, "button").props.disabled, true, "instruction edit locks header");
  assert.equal(find(tree, TopicList).props.actionsLocked, true);
  find(tree, InstructionEditModal).props.onClose();
  list.props.onToggleExpanded(topic.id);
  assert.equal(find(render(), TopicList).props.expandedIds.has(topic.id), true);
  find(render(), "button").props.onClick();
  tree = render(); effects();
  assert.equal(find(tree, TopicList), undefined);
  assert.equal(find(tree, "button", "ファイルをアップロード"), undefined);
  find(tree, "button").props.onClick();
  render(); effects(); await flush();
  assert.equal(gets, 1, "keepLoaded reuses topics on reopening");

  tree = render();
  const input = find(tree, "input");
  const selected = { value: "chosen", files: [{ name: "new.md", async text() { assert.equal(selected.value, ""); return "New topic"; } }] };
  await input.props.onChange({ currentTarget: selected });
  tree = render();
  assert.equal(find(tree, "button").props.disabled, true, "confirmation locks header");
  assert.equal(find(tree, "button", "ファイルをアップロード").props.disabled, true);
  assert.equal(find(tree, UploadConfirm).props.confirm.kind, "create");
  find(tree, UploadConfirm).props.onCancel();

  let releaseUpload;
  reset(async (_url, init = {}) => init.method === "POST"
    ? new Promise((resolve) => { releaseUpload = () => resolve(new Response(null, { status: 201 })); })
    : Response.json({ topics: [topic] }));
  render(); effects(); await flush();
  find(render(), "button").props.onClick(); render(); effects(); await flush();
  const uploadInput = find(render(), "input");
  await uploadInput.props.onChange({ currentTarget: { value: "chosen", files: [{ name: "new.md", async text() { return "New"; } }] } });
  find(render(), UploadConfirm).props.onExecute();
  await flush();
  tree = render();
  assert.equal(find(tree, "button").props.disabled, true, "upload locks header");
  assert.equal(find(tree, "button", "ファイルをアップロード").props.disabled, true);
  releaseUpload(); await flush();

  let releasePromotion;
  reset(async (_url, init = {}) => init.method === "POST"
    ? new Promise((resolve) => { releasePromotion = () => resolve(Response.json({ lore_id: "lore-1" })); })
    : Response.json({ topics: [topic] }));
  render(); effects(); await flush();
  find(render(), "button").props.onClick(); render(); effects(); await flush();
  find(render(), TopicList).props.onPromote(topic);
  await flush();
  tree = render();
  assert.equal(find(tree, "button").props.disabled, true, "promotion locks header");
  assert.equal(find(tree, "button", "ファイルをアップロード").props.disabled, true);
  releasePromotion(); await flush();

  let finishInclusion;
  let inclusionGets = 0, inclusionPatches = 0;
  reset(async (url, init = {}) => {
    if (init.method) {
      assert.equal(url, "/api/projects/project-1/memory/topics/topic-1/chat-inclusion");
      assert.equal(init.method, "PATCH");
      assert.deepEqual(JSON.parse(init.body), { include: true });
      inclusionPatches++;
      return new Promise(resolve => { finishInclusion = () => resolve(Response.json({ topic: { id: topic.id, include_in_chat: true }, included_chars: 7 })); });
    }
    inclusionGets++;
    return Response.json({ topics: [{ ...topic, include_in_chat: inclusionGets > 1 }] });
  });
  render(); effects();
  find(render(), "button").props.onClick(); render(); effects(); await flush();
  const inclusionList = find(render(), TopicList);
  assert.equal(inclusionList.props.chatInclusionTopicId, null);
  inclusionList.props.onChatInclusionChange(topic, true);
  inclusionList.props.onChatInclusionChange(topic, true);
  tree = render();
  assert.equal(find(tree, TopicList).props.chatInclusionTopicId, topic.id);
  assert.equal(find(tree, TopicList).props.actionsLocked, true);
  assert.equal(find(tree, "button").props.disabled, true);
  assert.equal(find(tree, "button", "ファイルをアップロード").props.disabled, true);
  assert.equal(inclusionPatches, 1);
  finishInclusion(); await flush();
  assert.equal(inclusionGets, 2);
  assert.equal(find(render(), TopicList).props.topics[0].include_in_chat, true);
  assert.equal(find(render(), TopicList).props.chatInclusionTopicId, null);
  console.log("ok - library section forwards toggles, locks actions and reloads inclusion");

  let deleted=false,deleteRequests=0;
  reset(async(url,init={})=>{
    if(init.method){assert.ok(url.endsWith('/bulk-delete'));deleteRequests++;assert.deepEqual(JSON.parse(init.body),{topics:[{id:topic.id,expected_revision:1}]});deleted=true;return Response.json({deleted_count:1});}
    return Response.json({topics:deleted?[]:[topic]});
  });
  render();effects();find(render(),'button').props.onClick();render();effects();await flush();
  find(render(),TopicList).props.onStartSelection();tree=render();
  assert.equal(find(tree,TopicList).props.actionsLocked,true);assert.equal(find(tree,TopicList).props.selectionLocked,false);
  assert.equal(find(tree,'button').props.disabled,false,'selection allows collapsing library section');
  assert.equal(find(tree,'button','ファイルをアップロード').props.disabled,true);
  find(tree,TopicList).props.onToggleSelected(topic.id);find(render(),TopicList).props.onDeleteSelected();
  assert.equal(find(render(),DeleteConfirm).props.confirm[0].chars,7);
  assert.equal(find(render(),'button').props.disabled,true);
  find(render(),DeleteConfirm).props.onConfirm();await flush();
  assert.equal(deleteRequests,1);assert.equal(find(render(),DeleteConfirm).props.confirm,null);
  assert.equal(find(render(),TopicList).props.selectionMode,false);assert.deepEqual(find(render(),TopicList).props.topics,[]);

  key = null;
  reset(async () => new Response(null, { status: 500 }));
  render(); effects(); await flush();
  find(render(), "button").props.onClick(); render(); effects(); await flush();
  tree = render();
  assert.ok(nodes(tree).some((node) => node.props?.children === "OpenAI APIキーが未設定のため、Loreへの昇格・AI編集はできません。"));
  assert.ok(nodes(tree).some((node) => node.props?.role === "alert" && node.props.children === "Project Memoryを読み込めませんでした"));
  console.log("ok - ProjectMemorySection lazy load, keepLoaded, content, action locks, warnings");
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch;
  Module._load = originalLoad;
});
