const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");
const originalLoad = Module._load;
const originals = { window: global.window, document: global.document, HTMLElement: global.HTMLElement };
let slots = [], cursor = 0, effects = [], dependencies = [], cleanups = [];
const hooks = {
  ...React,
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], () => {}]; },
  useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
  useEffect(fn, deps) {
    const i = cursor++;
    if (!dependencies[i] || deps.some((value, n) => value !== dependencies[i][n])) {
      effects.push(() => { cleanups[i]?.(); dependencies[i] = deps; cleanups[i] = fn(); });
    }
  },
};
const topic = { id: "topic", topic_key: "overview", revision: 2 };
const confirm = { topic, editedLores: [{ id: "old-1", title: "Edited title" }, { id: "old-2", title: "Other title" }] };
let cancelled = 0, submitted = 0, parentClosed = 0;
const fakeMemory = {
  topics: [], loading: false, error: null, canPromote: true, canInstructionEdit: true,
  promotingTopicId: null, uploading: false, uploadConfirm: null, instructionEdit: null,
  pendingConfirm: confirm, confirmPromotion() { submitted++; }, cancelPromotionConfirm() { cancelled++; },
  isActionLocked: () => true,
};
Module._load = function(request, parent, main) {
  if (request === "react") return hooks;
  if (request === "@/lib/project-memory/use-project-memory-topics") return { useProjectMemoryTopics: () => fakeMemory };
  if (request === "@/components/MarkdownRenderer") return { __esModule: true, default: () => null };
  return originalLoad.call(this, request, parent, main);
};
installAliasResolver(); installTsLoader({ jsx: true });
const Modal = require(path.join(__dirname, "..", "components", "ProjectMemoryPromotionConfirmModal.tsx")).default;
const TopicList = require(path.join(__dirname, "..", "components", "ProjectMemoryTopicList.tsx")).default;
const ListModal = require(path.join(__dirname, "..", "components", "ProjectMemoryListModal.tsx")).default;
const Section = require(path.join(__dirname, "..", "components", "ProjectMemorySection.tsx")).default;
const nodes = (root) => !root || typeof root !== "object" ? [] : [root, ...React.Children.toArray(root.props?.children).flatMap(nodes)];
const find = (tree, fn) => nodes(tree).find(fn);
const reset = () => { slots = []; cursor = 0; effects = []; dependencies = []; cleanups = []; };
const render = (props = {}) => { cursor = 0; return Modal({ confirm, submitting: false, error: null, onCancel() { cancelled++; }, onConfirm() { submitted++; }, ...props }); };
const flush = () => { const todo = effects; effects = []; todo.forEach((fn) => fn()); };
try {
  class Element {
    constructor() { this.isConnected = true; }
    focus() { global.document.activeElement = this; }
  }
  global.HTMLElement = Element;
  const previous = new Element();
  const listeners = new Map();
  global.window = { addEventListener(name, fn, capture) { listeners.set(name, { fn, capture }); }, removeEventListener(name) { listeners.delete(name); } };
  global.document = { activeElement: previous, addEventListener(name, fn) { listeners.set(name, { fn }); }, removeEventListener(name) { listeners.delete(name); } };
  reset();
  let tree = render();
  const dialog = find(tree, (n) => n.props?.role === "alertdialog");
  const buttons = nodes(tree).filter((n) => n.type === "button");
  const first = new Element(), last = new Element(), dialogElement = new Element();
  dialogElement.contains = (target) => [first, last, dialogElement].includes(target);
  dialogElement.querySelectorAll = () => [first, last];
  dialog.props.ref.current = dialogElement;
  buttons[0].props.ref.current = first;
  flush();
  assert.equal(global.document.activeElement, first, "safe cancel button receives initial focus");
  assert.equal(listeners.get("keydown").capture, true, "child Escape handles event before parent");
  const event = (key, overrides = {}) => ({ key, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...overrides });
  global.document.activeElement = last;
  const tab = event("Tab"); listeners.get("keydown").fn(tab);
  assert.equal(global.document.activeElement, first); assert.equal(tab.prevented, true);
  const backTab = event("Tab", { shiftKey: true }); listeners.get("keydown").fn(backTab);
  assert.equal(global.document.activeElement, last);
  listeners.get("focusin").fn({ target: previous });
  assert.equal(global.document.activeElement, first, "focus cannot escape to background");
  listeners.get("keydown").fn(event("Escape", { isComposing: true }));
  assert.equal(cancelled, 0, "IME Escape does not cancel");
  const escape = event("Escape"); listeners.get("keydown").fn(escape);
  assert.equal(cancelled, 1); assert.equal(escape.stopped, true);
  find(tree, (n) => n.props?.style?.zIndex === 1200).props.onClick();
  assert.equal(cancelled, 2);
  buttons[1].props.onClick(); assert.equal(submitted, 1);
  assert.match(JSON.stringify(tree), /2件のLore/);
  tree = render({ submitting: true }); flush();
  assert.equal(nodes(tree).filter((n) => n.type === "button").every((n) => n.props.disabled), true);
  listeners.get("keydown").fn(event("Escape"));
  find(tree, (n) => n.props?.style?.zIndex === 1200).props.onClick();
  nodes(tree).filter((n) => n.type === "button")[1].props.onClick();
  assert.equal(cancelled, 2); assert.equal(submitted, 1);
  dialogElement.querySelectorAll = () => [];
  listeners.get("keydown").fn(event("Tab"));
  assert.equal(global.document.activeElement, dialogElement);
  tree = render({ confirm: null }); flush();
  assert.equal(tree, null); assert.equal(global.document.activeElement, previous, "focus restored after closing");
  assert.equal(listeners.size, 0);

  for (const Parent of [ListModal, Section]) {
    reset();
    // Section's first state is expansion; force expanded for this integration check.
    if (Parent === Section) slots[0] = true;
    const parentTree = Parent({ isOpen: true, projectId: "project", projectName: "Project", onCancel() { parentClosed++; } });
    const list = find(parentTree, (n) => n.type === TopicList);
    assert.ok(list); assert.equal(list.props.pendingConfirm, confirm); assert.equal(list.props.actionsLocked, true);
    list.props.onConfirmPromotion(); list.props.onCancelPromotion();
    const shared = TopicList(list.props);
    const child = find(shared, (n) => n.type === Modal);
    assert.equal(child.props.confirm, confirm);
    if (Parent === ListModal) {
      find(parentTree, (n) => n.props?.style?.zIndex === 1100).props.onClick();
      const close = find(parentTree, (n) => n.type === "button" && n.props.children === "閉じる");
      assert.equal(close.props.disabled, true); close.props.onClick();
      assert.equal(parentClosed, 0);
    } else assert.equal(find(parentTree, (n) => n.type === "button").props.disabled, true);
  }
  console.log("ok - shared promotion modal, focus trap/restore, IME Escape, backdrop, submitting guards, both parent integrations");
} finally {
  Module._load = originalLoad;
  Object.assign(global, originals);
}
