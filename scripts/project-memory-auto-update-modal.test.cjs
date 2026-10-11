const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const React = require("react");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");
let state = [], cursor = 0, deps = [], cleanups = [], pending = [], requests = [], keys = new Map();
const hooks = { ...React,
  useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
  useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
  useEffect(fn, d) { const i = cursor++; if (!deps[i] || d.some((value, n) => value !== deps[i][n])) pending.push(() => { cleanups[i]?.(); deps[i] = d; cleanups[i] = fn(); }); },
};
const load = Module._load;
Module._load = function(request, parent, main) {
  if (request === "react") return hooks;
  if (request === "@/components/ProjectMemoryDiffView") return { __esModule: true, default: () => null };
  if (request === "@/lib/project-memory/summary-client") return { fetchProjectMemorySummaryTopics(projectId, signal) {
    let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; });
    requests.push({ projectId, signal, resolve, reject }); return promise;
  } };
  return load.call(this, request, parent, main);
};
installAliasResolver(); installTsLoader({ jsx: true });
const { default: Modal, updateResultLabel } = require("../components/ProjectMemoryAutoUpdateModal.tsx");
Module._load = load;
const originalWindow = global.window;
global.window = { addEventListener(name, fn) { keys.set(name, fn); }, removeEventListener(name, fn) { if (keys.get(name) === fn) keys.delete(name); } };
function unmount() { cleanups.forEach(fn => fn?.()); cleanups = []; }
after(() => { unmount(); global.window = originalWindow; });
const flush = () => new Promise(resolve => setImmediate(resolve));
const effects = () => { const jobs = pending; pending = []; jobs.forEach(run => run()); };
const proposal = (key, n) => ({ topic_id: key, topic_key: key, origin: "auto_summary", base_revision: n, current_content_md: "old", proposed_content_md: "new", reason: "new evidence" });
const preview = { result: "preview", run_id: "run", proposals: [proposal("overview", 1), proposal("principles", 2)], stats: { user_messages_available: 5, user_messages_included: 3 }, excluded_topics: [
  { topic_key: "current-work", reason: "no_baseline" }, { topic_key: "references", reason: "no_auto_summary_history" },
  { topic_key: "custom1", reason: "provenance_mismatch" }, { topic_key: "custom2", reason: "empty_topic" },
] };
let props, calls;
function reset() {
  unmount(); state = []; deps = []; pending = []; requests = []; keys.clear(); calls = [];
  props = { isOpen: true, projectId: "A", projectName: "Project", preview, isApplying: false, results: null,
    onApply(ids) { calls.push(["apply", ids]); }, onSkipAll() { calls.push(["skip"]); }, onCancel() { calls.push(["close"]); } };
}
function text(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return React.isValidElement(value) ? text(value.props.children) : "";
}
function collect(value, nodes = []) {
  if (Array.isArray(value)) value.forEach(child => collect(child, nodes));
  else if (React.isValidElement(value)) { nodes.push(value); collect(value.props.children, nodes); }
  return nodes;
}
function render(change = {}) { Object.assign(props, change); cursor = 0; const tree = Modal(props); return { tree, nodes: collect(tree), text: text(tree) }; }
function button(view, label) { const found = view.nodes.find(node => node.type === "button" && text(node) === label); assert.ok(found, label); return found; }
function checks(view) { return view.nodes.filter(node => node.type === "input"); }
async function ready(topics = []) { render(); effects(); requests.at(-1).resolve(topics); await flush(); return render(); }
const topic = (id, status = "not_promoted", content = "old") => ({ id, topic_key: id, content_md: content, include_in_chat: true, promotion: { status } });

test("preview displays metadata, all selected diffs and warning GET locks apply and skip confirmation", async () => {
  reset(); let view = render(); effects(); view = render();
  assert.match(view.text, /新規user発言 5件中 3件を使用/); assert.match(view.text, /AIの返答は含みません/);
  assert.match(view.text, /出自: auto_summary/); assert.match(view.text, /rev.1/); assert.match(view.text, /確認位置を記録/);
  assert.ok(checks(view).every(node => node.props.checked));
  assert.equal(button(view, "選択した2件を適用").props.disabled, true);
  assert.equal(button(view, "すべて見送る").props.disabled, true);
  button(view, "選択した2件を適用").props.onClick(); assert.deepEqual(calls, []);
  for (const label of ["基準となる履歴がありません", "自動要約の履歴がありません", "履歴の整合性を確認できず除外しました", "本文が空です"]) assert.ok(view.text.includes(label));
  requests[0].resolve([]); await flush(); view = render();
  checks(view).forEach(node => node.props.onChange()); view = render();
  // Each event belongs to a render, as in React.
  checks(view).filter(node => node.props.checked).forEach(node => node.props.onChange()); view = render();
  assert.equal(button(view, "選択した0件を適用").props.disabled, true);
});
test("GET failure shows unavailable warning while allowing apply", async () => {
  reset(); render(); effects(); requests[0].reject(Error("offline")); await flush(); const view = render();
  assert.match(view.text, /注入量の警告を確認できませんでした/);
  assert.equal(button(view, "選択した2件を適用").props.disabled, false);
  button(view, "選択した2件を適用").props.onClick(); assert.deepEqual(calls, [["apply", ["overview", "principles"]]]);
});
test("stale GET results after close, project switch, run switch and unmount are ignored and aborted", async () => {
  for (const change of [{ isOpen: false }, { projectId: "B" }, { preview: { ...preview, run_id: "run2" } }, null]) {
    reset(); render(); effects(); const old = requests[0];
    if (change) { render(change); effects(); } else unmount();
    assert.equal(old.signal.aborted, true);
    old.resolve([topic("overview", "current")]); await flush();
    if (change?.isOpen === false) { render({ isOpen: true }); effects(); }
    if (change) { const view = render(); assert.doesNotMatch(view.text, /Loreに昇格済み/); assert.equal(button(view, "選択した2件を適用").props.disabled, true); }
  }
});
test("project identity rejects old GET even before effect cleanup", async () => {
  reset(); render(); effects(); const old = requests[0]; render({ projectId: "B" });
  old.resolve([topic("overview", "current")]); await flush(); const view = render();
  assert.doesNotMatch(view.text, /Loreに昇格済み/); assert.equal(button(view, "選択した2件を適用").props.disabled, true); effects();
});
test("warning uses existing calculator and selected Lore current/stale warnings track checkbox changes", async () => {
  reset(); props.preview = { ...preview, proposals: [{ ...preview.proposals[0], proposed_content_md: "x".repeat(7100) }, preview.proposals[1]] };
  let view = await ready([topic("overview", "current"), topic("principles", "stale"), topic("references", "not_promoted", "y".repeat(1000))]);
  assert.match(view.text, /7,000字を超えます/); assert.match(view.text, /references: 新たにチャット注入されなくなります/);
  assert.match(view.text, /Loreに昇格済み/); assert.match(view.text, /Loreはすでに『更新あり』/);
  assert.equal(button(view, "選択した2件を適用").props.disabled, false);
  checks(view)[0].props.onChange(); view = render(); assert.doesNotMatch(view.text, /7,000字を超えます|Loreに昇格済み|新たにチャット注入/);
  checks(view)[1].props.onChange(); view = render(); assert.doesNotMatch(view.text, /Loreはすでに/);
});
test("skip all requires confirmation and locks other operations during confirmation and applying", async () => {
  reset(); let view = await ready(); button(view, "すべて見送る").props.onClick(); view = render(); effects();
  assert.deepEqual(calls, []); assert.match(view.text, /次回は原則として再提案されません/);
  assert.equal(button(view, "閉じる（何も消費しません）").props.disabled, true); assert.ok(checks(view).every(node => node.props.disabled));
  assert.equal(keys.has("keydown"), false); assert.equal(view.nodes.some(node => node.type === "button" && text(node).startsWith("選択した")), false);
  button(view, "確認を取り消す").props.onClick(); view = render(); effects();
  button(view, "すべて見送る").props.onClick(); view = render();
  button(view, "見送りを確定").props.onClick(); assert.deepEqual(calls, [["skip"]]);
  view = render({ isApplying: true }); effects(); assert.equal(button(view, "記録中…").props.disabled, true);
  assert.equal(button(view, "確認を取り消す").props.disabled, true);
  view = render({ isApplying: false, results: [{ topic_id: "overview", topic_key: "overview", status: "skipped", checkpoint: "ok" }] }); effects();
  assert.equal(button(view, "閉じる").props.disabled, false); assert.equal(keys.has("keydown"), true);
});
test("close, Escape and backdrop call only close; applying disables all dismissal paths", async () => {
  reset(); let view = await ready(); effects();
  button(view, "閉じる（何も消費しません）").props.onClick(); keys.get("keydown")({ key: "Escape" }); view.nodes.find(node => node.props.style?.zIndex === 1100).props.onClick();
  assert.deepEqual(calls, [["close"], ["close"], ["close"]]);
  calls = []; view = render({ isApplying: true }); effects();
  assert.equal(keys.has("keydown"), false); view.nodes.find(node => node.props.style?.zIndex === 1100).props.onClick(); button(view, "閉じる（何も消費しません）").props.onClick();
  assert.deepEqual(calls, []); assert.ok(checks(view).every(node => node.props.disabled));
});
test("results render all four checkpoint topics including two unchanged and prohibit same-run actions", async () => {
  reset(); await ready(); const results = ["applied", "skipped", "unchanged", "unchanged"].map((status, n) => ({ topic_id: String(n), topic_key: ["overview", "principles", "current-work", "references"][n], status, checkpoint: "ok" }));
  const view = render({ results });
  assert.equal(view.nodes.filter(node => node.type === "section").length, 4); assert.equal(checks(view).length, 0);
  assert.equal(view.nodes.filter(node => node.type === "button").length, 1); assert.equal(text(button(view, "閉じる")), "閉じる");
  assert.match(view.text, /current-work/); assert.match(view.text, /references/); assert.equal((view.text.match(/変更なし（確認済み）/g) || []).length, 2);
});
test("all reachable status/checkpoint labels including applied none and ambiguous network failure", () => {
  const cases = [
    ["applied", "ok", "反映し、確認位置も記録しました"], ["applied", "none", "反映しました（記録する確認位置はありません）"],
    ["applied", "failed", "本文は更新されましたが、確認位置を記録できませんでした。次回、同じ発言が再度対象になる場合があります"],
    ["skipped", "ok", "見送りました"], ["skipped", "none", "見送りました"],
    ["skipped", "failed", "見送りの確認位置を記録できませんでした。次回、同じ発言が再度対象になる場合があります"],
    ["unchanged", "ok", "変更なし（確認済み）"], ["unchanged", "none", "変更なし（確認済み）"],
    ["unchanged", "failed", "変更はありませんが、確認位置を記録できませんでした。次回、再度対象になる場合があります"],
    ["conflict", "none", "別の操作で更新されたため未適用です（確認位置は進めていません）"],
    ["failed", "none", "更新結果を確認できませんでした。Project Memory一覧で現在の内容を確認してください。"],
  ];
  for (const [status, checkpoint, label] of cases) assert.equal(updateResultLabel({ status, checkpoint }), label);
  assert.doesNotMatch(updateResultLabel({ status: "failed", checkpoint: "none" }), /未適用|次回|再提案/);
});
