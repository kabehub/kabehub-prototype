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
const topic = (status = "not_promoted", id = status) => ({ id, topic_key: id, content_md: "Content", include_in_chat: false, revision: 2,
  created_at: "", updated_at: "", promotion: { status, source_revision: null, lore_id: null } });
const nodes = (root) => !root || typeof root !== "object" ? [] : [root, ...React.Children.toArray(root.props?.children).flatMap(nodes)];
const button = (tree, label) => nodes(tree).find((node) => node.type === "button" && node.props.children === label);
const render = (overrides = {}) => TopicList({ topics: [topic()], loading: false, error: null, expandedIds: new Set(),
  onToggleExpanded() {}, canPromote: true, canInstructionEdit: true, promotingTopicId: null, actionsLocked: false, chatInclusionTopicId: null, onChatInclusionChange() {}, onDownload() {}, onPromote() {}, onInstructionEdit() {}, ...overrides });

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
  assert.equal(button(render(), "AIで編集").props.disabled, false);
  assert.equal(button(render({ actionsLocked: true }), "AIで編集").props.disabled, true);
  assert.equal(button(render({ canInstructionEdit: false }), "AIで編集").props.disabled, true);
  assert.equal(button(render({ topics: [{ ...topic(), content_md: "" }] }), "AIで編集").props.disabled, false);
  assert.equal(button(render({ promotingTopicId: "not_promoted" }), "昇格中…").props.disabled, true);
  const locked = render({ actionsLocked: true });
  assert.equal(button(locked, "DL").props.disabled, undefined);
  assert.equal(nodes(locked).find((node) => node.type === "button" && node.props["aria-expanded"] === false).props.disabled, undefined);

  let toggled, downloaded, promoted, editing;
  const first = topic("not_promoted", "first");
  const second = topic("stale", "second");
  const tree = render({ topics: [first, second], expandedIds: new Set(["first"]),
    onToggleExpanded(id) { toggled = id; }, onDownload(value) { downloaded = value; }, onPromote(value) { promoted = value; }, onInstructionEdit(value) { editing = value; } });
  assert.equal(nodes(tree).filter((node) => node.props?.content === "Content").length, 1);
  nodes(tree).find((node) => node.type === "button" && node.props["aria-expanded"] === true).props.onClick();
  assert.equal(toggled, "first");
  button(tree, "DL").props.onClick();
  button(tree, "Loreに再昇格").props.onClick();
  button(tree, "AIで編集").props.onClick();
  assert.equal(downloaded, first);
  assert.equal(promoted, second);
  assert.equal(editing, first);
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
  const { PROJECT_MEMORY_CHAT_MAX_CHARS } = require("../lib/project-memory/chat-inclusion-limits.ts");
  const textContent = root => root == null || typeof root === "boolean" ? "" : typeof root !== "object" ? String(root)
    : React.Children.toArray(root.props?.children).map(textContent).join("");
  const checkbox = tree => nodes(tree).find(node => node.type === "input" && node.props.type === "checkbox");
  const maxText = PROJECT_MEMORY_CHAT_MAX_CHARS.toLocaleString("ja-JP");
  assert.ok(textContent(render()).includes(`Memory注入: 0 / ${maxText}字`));
  assert.equal(textContent(render({ topics: [] })).includes("Memory注入:"), false);
  const on = { ...topic(), include_in_chat: true, content_md: "あ😀a" };
  const tooBig = { ...topic("stale", "a"), include_in_chat: true, content_md: "字".repeat(PROJECT_MEMORY_CHAT_MAX_CHARS + 1) };
  const blank = { ...topic("current", "b"), include_in_chat: true, content_md: " \n\t " };
  const usage = render({ topics: [on, blank, tooBig] });
  assert.ok(textContent(usage).includes(`Memory注入: 3 / ${maxText}字`));
  assert.ok(textContent(usage).includes("上限超過または本文が空のため、現在注入されていないtopic: a, b"));
  assert.ok(textContent(usage).includes(`ONのtopicは、${maxText}字の上限内で、このProjectのチャットに次の送信から毎回含まれます。`));
  assert.ok(textContent(usage).includes(`${maxText}字はtopic本文の合計です。`));
  assert.ok(textContent(usage).includes("Lore昇格済みのtopicをONにすると、検索経由で同じ内容が重複して参照される場合があります。"));
  assert.equal(textContent(usage).includes("ONのtopicは、このProjectのチャットに"), false);
  const badges = tree => nodes(tree).filter(n => n.type === "span" && typeof n.props.children === "string"
    && (n.props.children === "チャット注入中" || n.props.children.startsWith("未注入（")));
  const badgeCount = (tree, label) => badges(tree).filter(n => n.props.children === label).length;
  assert.equal(badgeCount(usage, "チャット注入中"), 1);
  assert.equal(badgeCount(usage, "未注入（上限超過）"), 1);
  assert.equal(badgeCount(usage, "未注入（本文が空）"), 1);
  const offOnly = render({ topics: [topic(), { ...tooBig, include_in_chat: false }, { ...blank, include_in_chat: false }] });
  assert.equal(badges(offOnly).length, 0);
  const includedOnly = render({ topics: [on, { ...on, id: "other", topic_key: "other" }] });
  assert.equal(badgeCount(includedOnly, "チャット注入中"), 2);
  assert.equal(badges(includedOnly).filter(n => n.props.children.startsWith("未注入（")).length, 0);
  for (const content_md of ["", " \n\t "]) {
    const emptyOnly = render({ topics: [{ ...on, content_md }] });
    assert.equal(badgeCount(emptyOnly, "未注入（本文が空）"), 1);
    assert.equal(badgeCount(emptyOnly, "チャット注入中"), 0);
  }
  for (const [chars, label] of [[PROJECT_MEMORY_CHAT_MAX_CHARS, "チャット注入中"], [PROJECT_MEMORY_CHAT_MAX_CHARS + 1, "未注入（上限超過）"]]) {
    const boundary = render({ topics: [{ ...on, content_md: "😀".repeat(chars) }] });
    assert.equal(badges(boundary).length, 1);
    assert.equal(badgeCount(boundary, label), 1);
  }
  const earlier = { ...on, id: "z-id", topic_key: "a", content_md: "字".repeat(4_000) };
  const later = { ...on, id: "a-id", topic_key: "z", content_md: "字".repeat(4_001) };
  const combined = render({ topics: [later, earlier] });
  const rows = nodes(combined).filter(n => n.type === "section");
  assert.equal(badgeCount(rows[0], "未注入（上限超過）"), 1);
  assert.equal(badgeCount(rows[0], "チャット注入中"), 0);
  assert.equal(badgeCount(rows[1], "チャット注入中"), 1);
  assert.equal(badgeCount(rows[1], "未注入（上限超過）"), 0);
  const injectedBadge = badges(usage).find(n => n.props.children === "チャット注入中");
  assert.equal(injectedBadge.props.style.background, "#dbeafe");
  assert.equal(injectedBadge.props.style.color, "#1d4ed8");
  for (const badge of badges(usage).filter(n => n.props.children.startsWith("未注入（"))) {
    assert.equal(badge.props.style.background, "#fef3c7");
    assert.equal(badge.props.style.color, "#92400e");
    for (const key of ["padding", "borderRadius", "fontSize"]) {
      assert.equal(badge.props.style[key], injectedBadge.props.style[key]);
    }
  }
  assert.equal(checkbox(render()).props.checked, false);
  assert.equal(checkbox(render()).props.disabled, false);
  assert.equal(checkbox(render({ actionsLocked: true })).props.disabled, true);
  assert.equal(checkbox(render({ chatInclusionTopicId: "other" })).props.disabled, true);
  assert.equal(checkbox(render({ topics: [{ ...topic(), content_md: " \t\n" }] })).props.disabled, true);
  assert.equal(checkbox(render({ topics: [blank] })).props.disabled, false, "ON blank topic may turn OFF");
  assert.equal(checkbox(render({ topics: [on] })).props.checked, true);
  assert.ok(checkbox(render({ topics: [on] })).props["aria-label"].includes(on.topic_key));
  assert.ok(textContent(render({ chatInclusionTopicId: "not_promoted" })).includes("反映中…"));
  let changed;
  checkbox(render({ topics: [on], onChatInclusionChange(t, include) { changed = [t, include]; } })).props.onChange({ currentTarget: { checked: false } });
  assert.deepEqual(changed, [on, false]);
  console.log("ok - topic chat inclusion usage, warnings, notices, toggles and badge");
  console.log("ok - ProjectMemoryTopicList controlled display");
} finally { Module._load = originalLoad; }
