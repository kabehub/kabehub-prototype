const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "@/components/MarkdownRenderer") return { __esModule: true, default: () => null };
  return originalLoad.call(this, request, parent, isMain);
};
installAliasResolver();
installTsLoader({ jsx: true });
const TopicList = require(path.join(__dirname, "..", "components", "ProjectMemoryTopicList.tsx")).default;
const topic = (status = "not_promoted", id = status) => ({ id, topic_key: id, content_md: "Content", revision: 2,
  created_at: "", updated_at: "", promotion: { status, source_revision: null, lore_id: null } });
const nodes = (root) => !root || typeof root !== "object" ? [] : [root, ...React.Children.toArray(root.props?.children).flatMap(nodes)];
const button = (tree, label) => nodes(tree).find((node) => node.type === "button" && node.props.children === label);
const render = (overrides = {}) => TopicList({ topics: [topic()], loading: false, error: null, expandedIds: new Set(),
  onToggleExpanded() {}, canPromote: true, promotingTopicId: null, actionsLocked: false, onDownload() {}, onPromote() {}, ...overrides });

try {
  for (const [status, stateLabel, actionLabel] of [
    ["not_promoted", "未昇格", "Loreに昇格"], ["stale", "更新あり", "Loreに再昇格"], ["current", "昇格済み", "昇格済み"],
  ]) {
    const tree = render({ topics: [topic(status)] });
    assert.ok(nodes(tree).some((node) => node.type === "span" && node.props.children === stateLabel));
    assert.ok(button(tree, actionLabel));
  }
  assert.equal(button(render({ canPromote: false }), "Loreに昇格").props.disabled, true);
  assert.equal(button(render({ topics: [{ ...topic(), content_md: "  " }] }), "Loreに昇格").props.disabled, true);
  assert.equal(button(render({ topics: [topic("current")] }), "昇格済み").props.disabled, true);
  assert.equal(button(render({ actionsLocked: true }), "Loreに昇格").props.disabled, true);
  assert.equal(button(render({ promotingTopicId: "not_promoted" }), "昇格中…").props.disabled, true);
  const locked = render({ actionsLocked: true });
  assert.equal(button(locked, "DL").props.disabled, undefined);
  assert.equal(nodes(locked).find((node) => node.type === "button" && node.props["aria-expanded"] === false).props.disabled, undefined);

  let toggled, downloaded, promoted;
  const first = topic("not_promoted", "first");
  const second = topic("stale", "second");
  const tree = render({ topics: [first, second], expandedIds: new Set(["first"]),
    onToggleExpanded(id) { toggled = id; }, onDownload(value) { downloaded = value; }, onPromote(value) { promoted = value; } });
  assert.equal(nodes(tree).filter((node) => node.props?.content === "Content").length, 1);
  nodes(tree).find((node) => node.type === "button" && node.props["aria-expanded"] === true).props.onClick();
  assert.equal(toggled, "first");
  button(tree, "DL").props.onClick();
  button(tree, "Loreに再昇格").props.onClick();
  assert.equal(downloaded, first);
  assert.equal(promoted, second);
  for (const status of ["current", "stale"]) {
    const promotedTopic = { ...topic(status), promotion: { status, lore_id: "lore/id", source_revision: 1 } };
    const link = nodes(render({ topics: [promotedTopic] })).find((node) => node.type === "a");
    assert.equal(link.props.href, "/memory#lore-lore%2Fid");
  }
  assert.equal(nodes(render({ topics: [{ ...topic("not_promoted"), promotion: { status: "not_promoted", lore_id: "id" } }] })).some((node) => node.type === "a"), false);
  assert.equal(nodes(render({ topics: [topic("current")] })).some((node) => node.type === "a"), false);
  assert.ok(nodes(render({ topics: [], loading: true })).some((node) => node.props?.children === "読み込み中…"));
  assert.ok(nodes(render({ topics: [] })).some((node) => node.props?.children === "Project Memoryのtopicはありません。"));
  assert.ok(!nodes(render({ topics: [], error: "failed" })).some((node) => node.props?.children === "Project Memoryのtopicはありません。"));
  console.log("ok - ProjectMemoryTopicList controlled display");
} finally { Module._load = originalLoad; }
