const assert = require("node:assert/strict");
const { test } = require("node:test");
const Module = require("node:module");
const React = require("react");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");
let summaryState = { topics: null, loading: true, error: null };
let hookArgs;
const load = Module._load;
Module._load = function(request, parent, main) {
  if (request === "@/lib/project-memory/use-project-memory-summary") return {
    useProjectMemorySummary(args) { hookArgs = args; return summaryState; },
  };
  return load.call(this, request, parent, main);
};
installAliasResolver(); installTsLoader({ jsx: true });
const ProjectMemoryTab = require("../components/ProjectMemoryTab.tsx").default;
Module._load = load;
function text(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return React.isValidElement(value) ? text(value.props.children) : "";
}
function collect(value, result = []) {
  if (Array.isArray(value)) value.forEach(child => collect(child, result));
  else if (React.isValidElement(value)) { result.push(value); collect(value.props.children, result); }
  return result;
}
const topic = (key, overrides = {}) => ({ id: key, topic_key: key, content_md: "body", include_in_chat: false, promotion: { status: "not_promoted" }, ...overrides });
function render(overrides = {}) {
  const calls = [];
  const props = {
    projectId: "A", refreshToken: 7,
    autoSummary: { buttonLabel: "会話からMemoryを作る", canGenerate: true, error: null, generating: false, onGenerate() { calls.push("generate"); } },
    consolidation: { loading: false, onOpen() { calls.push("consolidation"); } },
    list: { onOpen() { calls.push("list"); } }, ...overrides,
  };
  const tree = ProjectMemoryTab(props);
  const buttons = collect(tree).filter(node => node.type === "button");
  assert.equal(buttons.length, 3);
  const listButton = buttons.find(button => text(button) === "Project Memory一覧");
  assert.ok(listButton);
  assert.equal(listButton.props.disabled, !props.projectId);
  assert.deepEqual(hookArgs, { projectId: props.projectId, refreshToken: 7 });
  const description = collect(tree).find(node => node.type === "div" && text(node).startsWith("会話から自動要約"));
  assert.ok(description);
  assert.doesNotMatch(text(description), /常に|必ず/);
  return { tree, buttons, listButton, calls, props };
}
function assertPrimary(buttons, label) {
  assert.deepEqual(buttons.filter(button => button.props.style.background === "#7c3aed").map(text), label ? [label] : []);
  for (const button of buttons) {
    assert.equal(button.props.style.border, "1px solid #7c3aed");
    if (text(button) === label) assert.equal(button.props.style.color, "white");
  }
}
test("Memory tab initial loading uses secondary buttons and keeps the list available", () => {
  summaryState = { topics: null, loading: true, error: null };
  const { tree, buttons, listButton, calls } = render();
  assert.match(text(tree), /読み込み中…/); assert.doesNotMatch(text(tree), /標準 \d/);
  assertPrimary(buttons, null); listButton.props.onClick(); assert.deepEqual(calls, ["list"]);
});
test("Memory tab successful empty and incomplete standard topics prioritize available auto summary", () => {
  for (const topics of [[], [topic("overview"), topic("custom")]]) {
    summaryState = { topics, loading: false, error: null };
    const { tree, buttons, listButton } = render();
    assert.ok(text(tree).includes(topics.length === 0 ? "標準 0/4 作成" : "標準 1/4 作成"));
    assertPrimary(buttons, "会話からMemoryを作る"); assert.equal(listButton.props.disabled, false);
  }
});
test("Memory tab full standard topics and unavailable auto summary prioritize the list", () => {
  summaryState = { topics: ["overview", "current-work", "principles", "references"].map(key => topic(key)), loading: false, error: null };
  let view = render(); assert.match(text(view.tree), /標準 4\/4 作成/); assertPrimary(view.buttons, "Project Memory一覧");
  summaryState = { topics: [], loading: false, error: null };
  view = render({ autoSummary: { ...view.props.autoSummary, canGenerate: false } });
  assertPrimary(view.buttons, "Project Memory一覧"); assert.equal(view.buttons[0].props.disabled, true);
});
test("Memory tab failed summary keeps the list primary and usable", () => {
  summaryState = { topics: null, loading: false, error: "failed" };
  const { tree, buttons, listButton, calls } = render();
  assert.match(text(tree), /サマリを読み込めませんでした/); assert.doesNotMatch(text(tree), /標準 \d/);
  assertPrimary(buttons, "Project Memory一覧"); listButton.props.onClick(); assert.deepEqual(calls, ["list"]);
});
test("Memory tab distinguishes ON, current injection and Lore registration with exact summary labels", () => {
  summaryState = { topics: [
    topic("a", { include_in_chat: true, content_md: "a".repeat(7000), promotion: { status: "current" } }),
    topic("b", { include_in_chat: true, content_md: "b".repeat(1001) }),
    topic("c", { promotion: { status: "stale" } }),
    topic("d", { include_in_chat: true, content_md: "" }),
  ], loading: false, error: null };
  const { tree } = render(); const content = text(tree);
  assert.ok(content.includes("チャット注入ON 3件／現在注入 1件（7,000 / 8,000字）"));
  assert.ok(content.includes("Lore登録済み 2件（更新あり 1件）"));
  assert.ok(content.includes("チャット未注入・Lore未登録 2件"));
  assert.ok(content.includes("注入ONでも上限超過・空本文のtopicは現在注入に数えません。Lore登録済みは検索対象になりますが、会話ごとに必ず参照されるわけではありません。"));
});
test("Memory tab forwards existing handlers, labels, titles and disabled conditions", () => {
  summaryState = { topics: [], loading: false, error: null };
  let view = render(); view.buttons.forEach(button => button.props.onClick());
  assert.deepEqual(view.calls, ["generate", "consolidation", "list"]);
  for (const [canGenerate, generating, consolidationLoading, projectId] of [
    [false, false, false, "A"], [true, true, false, "A"], [true, false, true, "A"], [false, false, false, null],
  ]) {
    view = render({ projectId,
      autoSummary: { ...view.props.autoSummary, canGenerate, generating, error: "auto error", buttonLabel: generating ? "生成中…" : "不足分を会話から作る" },
      consolidation: { ...view.props.consolidation, loading: consolidationLoading },
    });
    assert.equal(view.buttons[0].props.disabled, !canGenerate || consolidationLoading);
    assert.equal(view.buttons[0].props.title, "auto error");
    assert.equal(text(view.buttons[0]), generating ? "生成中…" : "不足分を会話から作る");
    assert.equal(view.buttons[1].props.disabled, !projectId || consolidationLoading || generating);
    assert.equal(text(view.buttons[1]), consolidationLoading ? "整理案を生成中…" : "Project Memoryを整理");
  }
});


test("Memory tab incomplete standards prioritize the list while consolidation disables auto summary", () => {
  summaryState = { topics: [topic("overview")], loading: false, error: null };
  const view = render({ consolidation: { loading: true, onOpen() {} } });
  assert.equal(view.props.autoSummary.canGenerate, true);
  assert.equal(view.buttons[0].props.disabled, true);
  assert.equal(view.buttons[0].props.style.background, "white");
  assert.equal(view.listButton.props.disabled, false);
  assertPrimary(view.buttons, "Project Memory一覧");
});

test("Memory tab incomplete standards prioritize auto summary when consolidation finishes", () => {
  summaryState = { topics: [topic("overview")], loading: false, error: null };
  const view = render({ consolidation: { loading: false, onOpen() {} } });
  assert.equal(view.props.autoSummary.canGenerate, true);
  assert.equal(view.buttons[0].props.disabled, false);
  assert.equal(view.listButton.props.style.background, "white");
  assertPrimary(view.buttons, "会話からMemoryを作る");
});

test("Memory tab explicit disabled prop keeps auto summary secondary and the list primary", () => {
  summaryState = { topics: [topic("overview")], loading: false, error: null };
  const view = render({ disabled: true });
  assert.equal(view.props.autoSummary.canGenerate, true);
  assert.equal(view.props.consolidation.loading, false);
  assert.equal(view.buttons[0].props.disabled, true);
  assert.equal(view.buttons[0].props.style.background, "white");
  assert.equal(view.listButton.props.disabled, false);
  assertPrimary(view.buttons, "Project Memory一覧");
});
