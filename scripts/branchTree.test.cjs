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

const fixtureMessages = [
  msg({ id: "m1", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 1, content: "①" }),
  msg({ id: "m2", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 2, content: "②" }),
  msg({ id: "m3", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 3, content: "③" }),
  msg({ id: "m4", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 4, content: "④" }),
  msg({ id: "m5", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 5, content: "⑤" }),
  msg({ id: "m6", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 6, content: "⑥" }),
  msg({ id: "m7", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 7, content: "⑦" }),
  msg({ id: "m8", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 8, content: "⑧" }),
  msg({ id: "m9", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 9, branch_root_id: "m9", branch_index: 0, content: "⑨" }),
  msg({ id: "m10", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 10, branch_root_id: "m9", branch_index: 1, content: "⑩" }),
  msg({ id: "m11", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 11, branch_root_id: "m9", branch_index: 0, content: "⑪" }),
  msg({ id: "m12", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 12, parent_id: "m11", branch_root_id: "m9", branch_index: 0, content: "⑫" }),
  msg({ id: "m13", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 13, parent_id: "m8", branch_root_id: "m13", branch_index: 0, content: "⑬" }),
  msg({ id: "m14", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 14, parent_id: "m13", branch_root_id: "m13", branch_index: 0, content: "⑭" }),
  msg({ id: "m15", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 15, branch_root_id: "m15", branch_index: 0, content: "⑮" }),
  msg({ id: "m16", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 16, parent_id: "m15", branch_root_id: "m15", branch_index: 0, content: "⑯" }),
  msg({ id: "m17", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 17, parent_id: "m16", branch_root_id: "m15", branch_index: 0, content: "⑰" }),
  msg({ id: "m18", thread_id: "e14b622b-6236-4325-ae43-84f906c97749", message_number: 18, parent_id: "m17", branch_root_id: "m15", branch_index: 0, content: "⑱" }),
].sort(compareMessagesForDisplay);

const fixtureDisplayParents = buildDisplayParentIdMap(fixtureMessages);
assert.deepEqual(
  ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"].map((id) => fixtureDisplayParents[id]),
  [SYNTHETIC_ROOT_ID, "m1", "m2", "m3", "m4", "m5", "m6", "m7"]
);
assert.equal(fixtureDisplayParents.m9, "m8");
assert.equal(fixtureDisplayParents.m13, "m8");
assert.equal(fixtureDisplayParents.m11, "m9");
assert.equal(fixtureDisplayParents.m15, "m14");

console.log("branchTree tests passed");
