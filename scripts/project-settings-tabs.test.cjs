const assert = require("node:assert/strict");
const { test } = require("node:test");
const React = require("react");
const { installTsLoader } = require("./testBootstrap.cjs");

installTsLoader({ jsx: true });
const ProjectSettingsTabs = require("../components/ProjectSettingsTabs.tsx").default;
const ids = ["instructions", "reference", "memory"];

function render(activeTab, onChange = () => {}) {
  const tablist = ProjectSettingsTabs({ activeTab, onChange });
  return { tablist, tabs: React.Children.toArray(tablist.props.children) };
}

test("ProjectSettingsTabs exposes tablist and controlled ARIA attributes", () => {
  for (const activeTab of ids) {
    const { tablist, tabs } = render(activeTab);
    assert.equal(tablist.props.role, "tablist");
    assert.deepEqual(tabs.map(tab => tab.props.children), ["指示", "参照", "Memory"]);
    assert.equal(tabs.length, 3);
    tabs.forEach((tab, index) => {
      assert.equal(tab.type, "button");
      assert.equal(tab.props.type, "button");
      assert.equal(tab.props.role, "tab");
      assert.equal(tab.props.id, `project-settings-tab-${ids[index]}`);
      assert.equal(tab.props["aria-controls"], `project-settings-panel-${ids[index]}`);
      assert.equal(tab.props["aria-selected"], ids[index] === activeTab);
      assert.equal(tab.props.tabIndex, ids[index] === activeTab ? 0 : -1);
    });
  }
});

test("ProjectSettingsTabs clicks call onChange once without internal state", () => {
  const calls = [];
  const { tabs } = render("instructions", tab => calls.push(tab));
  tabs.forEach(tab => tab.props.onClick());
  assert.deepEqual(calls, ids);
  assert.equal(tabs[0].props["aria-selected"], true);
  assert.equal(render("memory").tabs[2].props["aria-selected"], true);
});

for (const [key, destinations] of [
  ["ArrowLeft", ["memory", "instructions", "reference"]],
  ["ArrowRight", ["reference", "memory", "instructions"]],
  ["Home", ["instructions", "instructions", "instructions"]],
  ["End", ["memory", "memory", "memory"]],
]) {
  test(`ProjectSettingsTabs ${key} selects and focuses the destination, including edges`, () => {
    const originalDocument = global.document;
    try {
      for (let index = 0; index < ids.length; index++) {
        const events = [];
        global.document = {
          getElementById(id) {
            assert.equal(id, `project-settings-tab-${destinations[index]}`);
            return { focus() { events.push("focus"); } };
          },
        };
        const { tabs } = render(ids[index], tab => events.push(tab));
        tabs[index].props.onKeyDown({ key, preventDefault() { events.push("preventDefault"); } });
        assert.deepEqual(events, ["preventDefault", destinations[index], "focus"]);
      }
    } finally {
      if (originalDocument === undefined) delete global.document;
      else global.document = originalDocument;
    }
  });
}

test("ProjectSettingsTabs ignores other keys and tolerates a missing focus target", () => {
  const originalDocument = global.document;
  try {
    const calls = [];
    global.document = { getElementById() { return null; } };
    const { tabs } = render("instructions", tab => calls.push(tab));
    for (const key of ["Tab", "Enter", "Escape", "ArrowUp", "ArrowDown"]) {
      tabs[0].props.onKeyDown({ key, preventDefault() { assert.fail("unhandled key"); } });
    }
    assert.deepEqual(calls, []);
    tabs[0].props.onKeyDown({ key: "End", preventDefault() {} });
    assert.deepEqual(calls, ["memory"]);
  } finally {
    if (originalDocument === undefined) delete global.document;
    else global.document = originalDocument;
  }
});
