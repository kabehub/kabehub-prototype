const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const rootDir = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(rootDir, request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTypescript(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2018,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const {
  SYNTHETIC_ROOT_ID,
  buildDisplayParentIdMap,
  buildChildrenOf,
  computeTreeLayout,
} = require("../lib/branchTree.ts");
const {
  buildChainBlocksByRootAnchor,
  buildCurrentLaneKeyByBranchRootId,
  buildMessageById,
  compareMessagesForDisplay,
} = require("../lib/branching.ts");

function msg(overrides) {
  return {
    id: overrides.id,
    thread_id: "thread-1",
    role: overrides.role ?? "user",
    content: overrides.content ?? overrides.id,
    provider: overrides.provider ?? (overrides.role === "assistant" ? "claude" : "user"),
    created_at: overrides.created_at ?? `2026-01-01T00:00:${String(overrides.message_number ?? 0).padStart(2, "0")}Z`,
    message_number: overrides.message_number,
    parent_id: overrides.parent_id ?? null,
    is_active: overrides.is_active ?? true,
    branch_root_id: overrides.branch_root_id ?? null,
    branch_index: overrides.branch_index ?? null,
  };
}

const messages = [
  msg({ id: "u1", message_number: 1, content: "①" }),
  msg({ id: "u2", message_number: 2, parent_id: "u1", content: "②" }),
  msg({ id: "u3a", message_number: 3, parent_id: "u2", branch_root_id: "u3a", branch_index: 0, is_active: false, content: "③" }),
  msg({ id: "u4a", message_number: 4, parent_id: "u3a", branch_root_id: "u3a", branch_index: 0, is_active: false, content: "④" }),
  msg({ id: "u3b", message_number: 5, parent_id: "u3a", branch_root_id: "u3b", branch_index: 0, is_active: false, content: "③ prime" }),
  msg({ id: "u4b", message_number: 6, parent_id: "u3b", branch_root_id: "u3b", branch_index: 0, is_active: false, content: "④ prime" }),
  msg({ id: "u3c", message_number: 7, parent_id: "u3b", branch_root_id: "u3c", branch_index: 0, is_active: true, content: "③ double prime" }),
  msg({ id: "u4c", message_number: 8, parent_id: "u3c", branch_root_id: "u3c", branch_index: 0, is_active: true, content: "④ double prime" }),
  msg({ id: "memo1", message_number: 9, parent_id: "u2", provider: "memo", content: "hidden memo" }),
  msg({ id: "orphan", message_number: 10, parent_id: "missing-parent", content: "orphan" }),
].sort(compareMessagesForDisplay);

const displayParents = buildDisplayParentIdMap(messages);
assert.equal(displayParents.u1, SYNTHETIC_ROOT_ID);
assert.equal(displayParents.u2, "u1");
assert.equal(displayParents.u3a, "u2");
assert.equal(displayParents.u3b, "u2");
assert.equal(displayParents.u3c, "u2");
assert.equal(displayParents.u4a, "u3a");
assert.equal(displayParents.u4b, "u3b");
assert.equal(displayParents.u4c, "u3c");
assert.equal(displayParents.orphan, SYNTHETIC_ROOT_ID);
assert.equal(displayParents.memo1, undefined);

const childrenOf = buildChildrenOf(messages, displayParents);
assert.deepEqual(childrenOf.u2.map((m) => m.id), ["u3a", "u3b", "u3c"]);
assert.equal(childrenOf[SYNTHETIC_ROOT_ID].some((m) => m.id === "orphan"), true);

const messageById = buildMessageById(messages.filter((m) => m.provider !== "memo"));
const chains = buildChainBlocksByRootAnchor(messages.filter((m) => m.provider !== "memo"), messageById);
const currentLaneKeys = buildCurrentLaneKeyByBranchRootId(chains, messages);
const { nodes, edges } = computeTreeLayout(messages, currentLaneKeys);
const nodeById = Object.fromEntries(nodes.map((node) => [node.id, node]));

assert.equal(nodes.some((node) => node.id === "memo1"), false);
assert.equal(nodeById.u2.width, 3);
assert.equal(nodeById.u3a.depth, 2);
assert.equal(nodeById.u3b.depth, 2);
assert.equal(nodeById.u3c.depth, 2);
assert.equal(nodeById.u1.isCommon, true);
assert.equal(nodeById.u2.isCommon, true);
assert.equal(nodeById.u3a.isCurrentLane, false);
assert.equal(nodeById.u3b.isCurrentLane, false);
assert.equal(nodeById.u3c.isCurrentLane, true);
assert.equal(nodeById.u4c.isCurrentLane, true);
assert.equal(edges.some((edge) => edge.fromId === "u2" && edge.toId === "u3c"), true);

console.log("branchTree tests passed");
