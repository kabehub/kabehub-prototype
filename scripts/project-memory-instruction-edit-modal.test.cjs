const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");
let effect;
const Diff = () => null;
const originalLoad = Module._load;
const originalWindow = global.window;
Module._load = function (request, parent, isMain) {
  if (request === "react") return { ...React, useEffect(fn) { effect = fn; } };
  if (request === "@/components/ProjectMemoryDiffView") return { __esModule: true, default: Diff };
  return originalLoad.call(this, request, parent, isMain);
};
installAliasResolver(); installTsLoader({ jsx: true });
const Modal = require(path.join(__dirname, "../components/ProjectMemoryInstructionEditModal.tsx")).default;
const { MAX_INSTRUCTION_CHARS } = require(path.join(__dirname,
  "../lib/project-memory/instruction-edit-limits.ts"));
const preview = { result: "proposal", run_id: "run", model: "model", prompt_version: 1,
  topic_id: "topic", topic_key: "overview", revision: 4, updated_at: "timestamp",
  old_content_md: "before", new_content_md: "after", summary: "summary" };
const base = { topicId: "topic", topicKey: "overview", topicRevision: 3,
  promotionStatus: "not_promoted", phase: "input", instruction: "", preview: null,
  notice: null, doneStatus: null };
const calls = [];
const props = { onInstructionChange(value) { calls.push(["change", value]); },
  onGenerate(value) { calls.push(["generate", value]); },
  onCancelGeneration() { calls.push(["cancel"]); }, onBackToInput() { calls.push(["back"]); },
  onApply() { calls.push(["apply"]); }, onClose() { calls.push(["close"]); } };
const nodes = (root) => root && typeof root === "object" ? [root, ...React.Children.toArray(root.props?.children).flatMap(nodes)] : [];
const button = (tree, label) => nodes(tree).find((node) => node.type === "button" && node.props.children === label);
const text = (tree) => nodes(tree).map((node) => React.Children.toArray(node.props?.children)
  .filter((child) => typeof child === "string" || typeof child === "number").join("")).join(" ");
function render(edit) { effect = null; return Modal({ ...props, edit }); }
function escape() { const cleanup = effect(); global.window.handler({ key: "Escape" }); cleanup?.(); }
global.window = { addEventListener(_name, handler) { this.handler = handler; }, removeEventListener() {} };

try {
  assert.equal(render(null), null);
  let tree = render(base);
  assert.match(text(tree), /rev\.3/);
  const textarea = nodes(tree).find((node) => node.type === "textarea");
  assert.equal(textarea.props.maxLength, MAX_INSTRUCTION_CHARS);
  assert.equal(button(tree, "生成").props.disabled, true);
  textarea.props.onChange({ currentTarget: { value: "rewrite" } });
  assert.deepEqual(calls.pop(), ["change", "rewrite"]);
  tree = render({ ...base, instruction: "   " });
  assert.equal(button(tree, "生成").props.disabled, true);
  tree = render({ ...base, instruction: "rewrite" });
  assert.equal(button(tree, "生成").props.disabled, false);
  button(tree, "生成").props.onClick();
  assert.deepEqual(calls.pop(), ["generate", "rewrite"]);
  tree = render({ ...base, phase: "generating", instruction: "rewrite" });
  assert.equal(nodes(tree).find((node) => node.type === "textarea").props.disabled, true);
  assert.equal(button(tree, "生成中…").props.disabled, true);
  escape(); assert.deepEqual(calls.pop(), ["cancel"]);
  nodes(tree).find((node) => node.type === "div" && node.props.style?.zIndex === 1200).props.onClick();
  assert.deepEqual(calls.pop(), ["cancel"]);

  tree = render({ ...base, phase: "preview", preview, promotionStatus: "current" });
  assert.match(text(tree), /rev\.4/);
  assert.match(text(tree), /summary/);
  assert.match(text(tree), /Lore側は『更新あり』/);
  const diff = nodes(tree).find((node) => node.type === Diff);
  assert.deepEqual(diff.props, { oldText: "before", newText: "after" });
  button(tree, "適用").props.onClick(); assert.deepEqual(calls.pop(), ["apply"]);
  button(tree, "指示を書き直す").props.onClick(); assert.deepEqual(calls.pop(), ["back"]);
  tree = render({ ...base, phase: "preview", preview });
  assert.doesNotMatch(text(tree), /Lore側は『更新あり』/);
  tree = render({ ...base, phase: "applying", preview });
  assert.match(text(tree), /rev\.4/);
  assert.equal(button(tree, "適用中…").props.disabled, true);
  assert.equal(button(tree, "指示を書き直す").props.disabled, true);
  const before = calls.length;
  escape();
  nodes(tree).find((node) => node.type === "div" && node.props.style?.zIndex === 1200).props.onClick();
  assert.equal(calls.length, before);

  for (const [status, expected] of [["applied", "適用しました"], ["conflict", "失効しました"],
    ["not_found", "見つからないため"]]) {
    tree = render({ ...base, phase: "done", doneStatus: status });
    assert.match(text(tree), new RegExp(expected));
    assert.equal(button(tree, "適用"), undefined);
    assert.ok(button(tree, "閉じる"));
  }
  tree = render({ ...base, notice: "message" });
  assert.equal(nodes(tree).find((node) => node.props?.role === "alert").props.children, "message");
  escape(); assert.deepEqual(calls.pop(), ["close"]);
  console.log("ok - instruction edit modal phases, revision, diff, warnings, and dismissal");
} finally { Module._load = originalLoad; global.window = originalWindow; }
