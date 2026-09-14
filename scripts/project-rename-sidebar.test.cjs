const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");
const {
  installAliasResolver,
  installTsLoader,
} = require("./testBootstrap.cjs");

const originalFetch = global.fetch;
const originalLoad = Module._load;

let hookState = [];
let cursor = 0;
let fetchCalls = [];
let toastCalls = [];
let refreshCalls = 0;

const hooks = {
  ...React,
  useState(initial) {
    const index = cursor++;
    if (!(index in hookState)) {
      hookState[index] = typeof initial === "function" ? initial() : initial;
    }
    return [
      hookState[index],
      (value) => {
        hookState[index] =
          typeof value === "function" ? value(hookState[index]) : value;
      },
    ];
  },
  useRef(value) {
    return { current: value };
  },
  useEffect() {},
  useMemo(fn) {
    return fn();
  },
  useCallback(fn) {
    return fn;
  },
};

Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "react") return hooks;
  if (request === "@/components/Toast") {
    return {
      useToast() {
        return {
          showToast(...args) {
            toastCalls.push(args);
          },
        };
      },
    };
  }
  if (
    request === "@/components/ProjectDeleteConfirmModal" ||
    request === "@/components/ProjectMemoryConsolidationModal"
  ) {
    return { __esModule: true, default: () => null };
  }
  if (request === "@/lib/apiKeyStore") {
    return { webApiKeyStore: { async getKey() { return null; } } };
  }
  if (request === "@/lib/project-memory/consolidation-client") {
    return {
      async applyProjectMemoryConsolidation() {
        throw new Error("unexpected consolidation call");
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

installAliasResolver();
installTsLoader({ jsx: true });

const sidebarModule = require(path.join(
  __dirname,
  "..",
  "components",
  "Sidebar.tsx",
));
const Sidebar = sidebarModule.default;

global.fetch = async (input, init = {}) => {
  const url = String(input);
  const method = init.method ?? "GET";
  const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
  fetchCalls.push({ url, method, body, cache: init.cache });

  if (url === "/api/projects" && method === "GET") {
    return Response.json({ projects: [{ id: "11111111-1111-4111-8111-111111111111", name: "New Project" }] });
  }
  if (url.startsWith("/api/project-settings?") && method === "GET") {
    return Response.json({
      project_id: "11111111-1111-4111-8111-111111111111",
      system_prompt: "prompt",
      folder_type: "novel",
      pinned_github_files: [],
      github_repo: null,
      github_ref: null,
    });
  }
  if (url === "/api/project-settings" && method === "POST") {
    return Response.json({ success: true });
  }
  if (url.startsWith("/api/projects/") && method === "PATCH") {
    return Response.json({ success: true, name: body.name.trim() });
  }
  throw new Error(`unexpected fetch: ${method} ${url}`);
};

const props = {
  threads: [
    {
      id: "thread-1",
      title: "Thread",
      created_at: "2026-09-14T00:00:00.000Z",
      folder_name: "Old Project",
      project_id: "11111111-1111-4111-8111-111111111111",
    },
  ],
  activeThreadId: null,
  onSelectThread() {},
  onNewThread() {},
  onDeleteThread() {},
  onSearch() {},
  isSearching: false,
  user: { id: "user-1", email: "user@example.com" },
  onLogout() {},
  async onUpdateFolder() { return null; },
  onNewThreadInFolder() {},
  async onRefreshThreads() {
    refreshCalls += 1;
  },
};

function collectExpanded(value, result) {
  if (value === null || value === undefined || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    for (const child of value) collectExpanded(child, result);
    return;
  }
  if (!React.isValidElement(value)) return;
  if (typeof value.type === "function") {
    collectExpanded(value.type(value.props), result);
    return;
  }
  result.push(value);
  collectExpanded(value.props.children, result);
}

function renderSidebar() {
  cursor = 0;
  const result = [];
  collectExpanded(Sidebar(props), result);
  return result;
}

function textContent(value) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (React.isValidElement(value)) return textContent(value.props.children);
  return "";
}

function findButton(nodes, label) {
  const matches = nodes.filter(
    (node) => node.type === "button" && textContent(node.props.children) === label,
  );
  assert.equal(matches.length, 1, `button: ${label}`);
  return matches[0];
}

function findRenameInput(nodes) {
  const matches = nodes.filter(
    (node) => node.type === "input" && node.props["aria-label"] === "Project名",
  );
  assert.equal(matches.length, 1, "Project rename input");
  return matches[0];
}

async function openSettings(nodes) {
  const button = nodes.find(
    (node) =>
      node.type === "button" &&
      node.props.title === "フォルダのシステムプロンプトを設定",
  );
  assert.ok(button, "folder settings button");
  button.props.onClick({ stopPropagation() {} });
  await new Promise((resolve) => setImmediate(resolve));
}

(async () => {
  try {

    hookState = [];
    fetchCalls = [];
    toastCalls = [];
    refreshCalls = 0;

    let nodes = renderSidebar();
    await openSettings(nodes);
    nodes = renderSidebar();
    const renameInput = findRenameInput(nodes);
    assert.equal(renameInput.props.value, "Old Project");
    renameInput.props.onChange({ target: { value: "Unsaved Rename" } });
    nodes = renderSidebar();

    await findButton(nodes, "保存").props.onClick();
    const settingsSave = fetchCalls.find((call) => call.method === "POST");
    assert.equal(settingsSave.body.folder_name, "Old Project");
    assert.equal(
      fetchCalls.some((call) => call.method === "PATCH"),
      false,
      "editing the rename draft must not rename through settings save",
    );

    nodes = renderSidebar();
    await openSettings(nodes);
    nodes = renderSidebar();
    findRenameInput(nodes).props.onChange({
      target: { value: "  New Project  " },
    });
    nodes = renderSidebar();

    await findButton(nodes, "変更").props.onClick();
    const renameCall = fetchCalls.find((call) => call.method === "PATCH");
    assert.deepEqual(renameCall.body, { name: "  New Project  " });
    assert.equal(refreshCalls, 1);
    const projectsListCall = fetchCalls.find(
      (call) => call.url === "/api/projects" && call.method === "GET",
    );
    assert.ok(projectsListCall, "rename must refresh the Projects name map");
    assert.equal(projectsListCall.cache, "no-store");
    assert.deepEqual(toastCalls.at(-1), [
      "Project名を「New Project」に変更しました",
    ]);

    nodes = renderSidebar();
    assert.equal(
      nodes.some(
        (node) => node.type === "span" && textContent(node.props.children) === "New Project",
      ),
      true,
      "the projectNameById map must expose the renamed display name",
    );
    assert.equal(
      nodes.some(
        (node) =>
          node.type === "input" && node.props["aria-label"] === "Project名",
      ),
      false,
      "the settings drawer must close after rename",
    );
    assert.equal(
      fetchCalls.filter((call) => call.method === "POST").length,
      1,
      "rename must not trigger a stale settings save for the old name",
    );

    console.log(
      "ok - Sidebar rename draft is isolated and successful rename closes the drawer",
    );
  } finally {
    global.fetch = originalFetch;
    Module._load = originalLoad;
  }
})().catch((error) => {
  global.fetch = originalFetch;
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
