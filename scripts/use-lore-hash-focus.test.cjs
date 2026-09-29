const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

let slots = [];
let cursor = 0;
let pending = [];
const mockReact = {
  useState(initial) {
    const index = cursor++;
    if (!slots[index]) slots[index] = { value: initial };
    return [slots[index].value, (value) => { slots[index].value = value; }];
  },
  useRef(initial) {
    const index = cursor++;
    if (!slots[index]) slots[index] = { current: initial };
    return slots[index];
  },
  useEffect(effect, deps) {
    const index = cursor++;
    const old = slots[index];
    if (!old || deps.some((value, i) => value !== old.deps[i])) {
      pending.push(() => {
        old?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      });
    }
  },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "react") return mockReact;
  return originalLoad.call(this, request, parent, isMain);
};
installAliasResolver();
installTsLoader();
const { useLoreHashFocus } = require(path.join(__dirname, "..", "lib", "lore", "use-lore-hash-focus.ts"));
Module._load = originalLoad;

const nativeTimeout = global.setTimeout;
const nativeClear = global.clearTimeout;
let timers;
let nextTimer;
let scrolls;
let elementExists;
function setup(hash = "#lore-target") {
  slots = []; pending = []; timers = new Map(); nextTimer = 1; scrolls = []; elementExists = true;
  global.window = { location: { hash } };
  global.document = { getElementById(id) { return elementExists && id === "lore-target" ? { scrollIntoView(options) { scrolls.push(options); } } : null; } };
  global.setTimeout = (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, delay }); return id; };
  global.clearTimeout = (id) => timers.delete(id);
}
function render(ready, cardIds = ["target"]) {
  cursor = 0; pending = [];
  const result = useLoreHashFocus({ ready, cardIds });
  pending.forEach((run) => run());
  return result;
}
function unmount() { for (const slot of slots) slot?.cleanup?.(); }
function restore() { global.setTimeout = nativeTimeout; global.clearTimeout = nativeClear; delete global.window; delete global.document; }

test("waits for ready, scrolls matching card, and clears highlight after cardIds change", () => {
  setup();
  try {
    render(false);
    assert.equal(scrolls.length, 0);
    assert.equal(render(true).highlightedId, null);
    assert.deepEqual(scrolls, [{ block: "center" }]);
    assert.equal(render(true).highlightedId, "target");
    render(true, ["target", "other"]);
    assert.equal(scrolls.length, 1);
    const timer = [...timers.values()][0];
    assert.equal(timer.delay, 3000);
    timer.callback();
    assert.equal(render(true, ["target", "other"]).highlightedId, null);
  } finally { unmount(); restore(); }
});

test("missing card or DOM element reports notFound", () => {
  for (const ids of [[], ["target"]]) {
    setup();
    try {
      if (ids.length) elementExists = false;
      render(true, ids);
      assert.equal(render(true, ids).notFound, true);
      assert.equal(scrolls.length, 0);
    } finally { unmount(); restore(); }
  }
});

test("empty and malformed hashes do nothing", () => {
  for (const hash of ["", "#lore-%GG", "#other-target"]) {
    setup(hash);
    try {
      render(true);
      assert.equal(render(true).notFound, false);
      assert.equal(scrolls.length, 0);
    } finally { unmount(); restore(); }
  }
});

test("unmount cancels highlight timer", () => {
  setup();
  try {
    render(true);
    assert.equal(timers.size, 1);
    unmount();
    assert.equal(timers.size, 0);
  } finally { restore(); }
});
