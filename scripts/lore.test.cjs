const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");

const rootDir = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(rootDir, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const testExportsByFile = new Map([
  ["app/api/lore/consolidate/candidates/route.ts", ["clamp", "stringValue", "numberValue", "normalizeCandidate", "pairKey"]],
  ["app/api/lore/dreaming-batch/route.ts", ["clamp", "stringValue", "numberValue", "normalizeCandidate", "buildGreedyChainClusters", "validateSources", "hasSameFolderNameAndMemoryKind", "buildUserPrompt", "isJsonStringLike", "validateMergedText", "normalizeRpcNewId"]],
  ["app/api/lore/dreaming-batch/history/route.ts", ["clamp"]],
  ["app/api/lore/consolidate/preview/route.ts", ["normalizePair", "validateSources", "newerSource", "suggestedValue"]],
  ["app/api/lore/consolidate/merge/route.ts", ["normalizePair", "validateSources", "normalizeTags"]],
  ["app/api/lore/consolidate/dismiss/route.ts", ["normalizePair"]],
  ["app/api/lore/batch-train/route.ts", ["clamp", "normalizeMemory", "buildMemoryExtractionPrompt"]],
  ["app/api/lore/update-temporal-status/route.ts", ["toCount", "normalizeResult"]],
  ["app/memory/page.tsx", ["consolidationPairKey"]],
]);

function compile(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  let output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2018,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  }).outputText;

  const relativePath = path.relative(rootDir, filename).split(path.sep).join("/");
  const names = testExportsByFile.get(relativePath);
  if (names) output += `\nmodule.exports.__test = { ${names.join(", ")} };`;
  module._compile(output, filename);
}
require.extensions[".ts"] = compile;
require.extensions[".tsx"] = compile;

global.fetch = async () => {
  throw new Error("Network access is forbidden in lore characterization tests");
};

function loadTestExports(relativePath, expectedNames) {
  const loaded = require(path.join(rootDir, relativePath));
  const bag = relativePath.endsWith("loreMemorySelect.ts") ? loaded : loaded.__test;
  assert.ok(bag, `${relativePath}: __test export was not injected`);
  for (const name of expectedNames) {
    assert.notEqual(typeof bag[name], "undefined", `${relativePath}: missing ${name}`);
  }
  return bag;
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const candidates = loadTestExports("app/api/lore/consolidate/candidates/route.ts", testExportsByFile.get("app/api/lore/consolidate/candidates/route.ts"));
const dreaming = loadTestExports("app/api/lore/dreaming-batch/route.ts", testExportsByFile.get("app/api/lore/dreaming-batch/route.ts"));
const history = loadTestExports("app/api/lore/dreaming-batch/history/route.ts", testExportsByFile.get("app/api/lore/dreaming-batch/history/route.ts"));
const preview = loadTestExports("app/api/lore/consolidate/preview/route.ts", testExportsByFile.get("app/api/lore/consolidate/preview/route.ts"));
const merge = loadTestExports("app/api/lore/consolidate/merge/route.ts", testExportsByFile.get("app/api/lore/consolidate/merge/route.ts"));
const dismiss = loadTestExports("app/api/lore/consolidate/dismiss/route.ts", testExportsByFile.get("app/api/lore/consolidate/dismiss/route.ts"));
const batchTrain = loadTestExports("app/api/lore/batch-train/route.ts", testExportsByFile.get("app/api/lore/batch-train/route.ts"));
const temporal = loadTestExports("app/api/lore/update-temporal-status/route.ts", testExportsByFile.get("app/api/lore/update-temporal-status/route.ts"));
const { LORE_MEMORY_SELECT: sharedSelect } = require("../lib/loreMemorySelect.ts");

let memoryPage = null;
try {
  memoryPage = loadTestExports("app/memory/page.tsx", testExportsByFile.get("app/memory/page.tsx"));
} catch (error) {
  if (error && error.code === "MODULE_NOT_FOUND") {
    console.log(`# app/memory/page.tsx skipped: ${error.message}`);
  } else {
    throw error;
  }
}

test("LORE_MEMORY_SELECT contains exactly the 19 unified columns without embedding", () => {
  const shared = sharedSelect.split(", ");
  const expectedColumns = [
    "id",
    "chunk_text",
    "tags",
    "memory_kind",
    "temporal_status",
    "importance_score",
    "confidence_score",
    "source_thread_id",
    "source_message_id",
    "source_message_number",
    "is_pinned",
    "is_archived",
    "extraction_version",
    "is_manually_corrected",
    "last_confirmed_at",
    "valid_from",
    "valid_until",
    "event_time",
    "created_at",
  ];
  assert.deepEqual(shared, expectedColumns);
  assert.equal(shared.length, 19);
  assert.equal(shared.includes("embedding"), false);
});

test("buildGreedyChainClusters chains, isolates, and caps a cluster at five", () => {
  assert.deepEqual(dreaming.buildGreedyChainClusters([
    { idA: "a", idB: "b" }, { idA: "b", idB: "c" },
    { idA: "x", idB: "y" }, { idA: "c", idB: "d" },
    { idA: "d", idB: "e" }, { idA: "e", idB: "f" },
  ], 5), [{ ids: ["a", "b", "c", "d", "e"] }, { ids: ["x", "y"] }]);
});

test("buildGreedyChainClusters merges two clusters unless the result exceeds five", () => {
  assert.deepEqual(dreaming.buildGreedyChainClusters([
    { idA: "a", idB: "b" }, { idA: "c", idB: "d" }, { idA: "b", idB: "c" },
  ], 5), [{ ids: ["a", "b", "c", "d"] }]);
  assert.deepEqual(dreaming.buildGreedyChainClusters([
    { idA: "a", idB: "b" }, { idA: "b", idB: "c" },
    { idA: "d", idB: "e" }, { idA: "e", idB: "f" }, { idA: "c", idB: "d" },
  ], 5), [{ ids: ["a", "b", "c"] }, { ids: ["d", "e", "f"] }]);
});

test("buildGreedyChainClusters rejects new clusters once limit is reached", () => {
  assert.deepEqual(dreaming.buildGreedyChainClusters([
    { idA: "a", idB: "b" }, { idA: "x", idB: "y" }, { idA: "b", idB: "c" },
  ], 1), [{ ids: ["a", "b", "c"] }]);
});

test("normalizeCandidate copies intentionally disagree on identical ids", () => {
  const row = { idA: "same", idB: "same", chunkTextA: "A", chunkTextB: "B", similarity: "0.9" };
  assert.deepEqual(candidates.normalizeCandidate(row), {
    idA: "same", idB: "same", chunkTextA: "A", chunkTextB: "B",
    memoryKindA: null, memoryKindB: null, temporalStatusA: null, temporalStatusB: null,
    createdAtA: null, createdAtB: null, similarity: 0.9,
  });
  assert.equal(dreaming.normalizeCandidate(row), null);
});

function source(id, extractionVersion = "ai", overrides = {}) {
  return {
    id, user_id: "user", chunk_text: id, folder_name: "folder", memory_kind: "fact",
    is_archived: false, superseded_by: null, is_pinned: false,
    extraction_version: extractionVersion, created_at: `2025-01-0${id === "a" ? 2 : 1}T00:00:00Z`,
    ...overrides,
  };
}

test("preview and merge reject only user-edited extraction variants", () => {
  for (const api of [preview, merge]) {
    for (const version of ["liked_ai", "liked_ai_cleaned"]) {
      assert.ok(api.validateSources([source("a", version), source("b")], "user", "a", "b"));
    }
    for (const version of ["user_edited", "user_created"]) {
      assert.equal(api.validateSources([source("a", version), source("b")], "user", "a", "b"), null);
    }
  }
});

test("dreaming rejects four protected variants and mismatched folder/kind", () => {
  for (const version of ["user_edited", "user_created", "liked_ai", "liked_ai_cleaned"]) {
    assert.equal(dreaming.validateSources([source("a", version), source("b")], "user", ["a", "b"]), null);
  }
  assert.equal(dreaming.validateSources([source("a"), source("b", "ai", { folder_name: "other" })], "user", ["a", "b"]), null);
  assert.equal(dreaming.validateSources([source("a"), source("b", "ai", { memory_kind: "plan" })], "user", ["a", "b"]), null);
  assert.ok(dreaming.validateSources([source("a"), source("b")], "user", ["a", "b"]));
});

test("buildUserPrompt destructively sorts sources oldest-first", () => {
  const validated = [source("a"), source("b")];
  const prompt = dreaming.buildUserPrompt(validated);
  assert.deepEqual(validated.map((row) => row.id), ["b", "a"]);
  assert.equal(validated[0].id, "b", "after generateMergedText, validated[0] is currently the oldest source");
  assert.equal(prompt, "記憶1（created_at: 2025-01-01T00:00:00Z）:\nb\n\n---\n\n記憶2（created_at: 2025-01-02T00:00:00Z）:\na");
});

test("validateMergedText and isJsonStringLike preserve current boundaries", () => {
  assert.equal(dreaming.validateMergedText(""), "Merged text is empty");
  assert.equal(dreaming.validateMergedText("   "), "Merged text is empty");
  assert.equal(dreaming.validateMergedText("x".repeat(500)), null);
  assert.equal(dreaming.validateMergedText("x".repeat(501)), "Merged text exceeds 500 characters");
  for (const value of ["{}", "[]", "\"text\""]) {
    assert.equal(dreaming.isJsonStringLike(value), true);
    assert.equal(dreaming.validateMergedText(value), "Merged text must not be JSON");
  }
  for (const value of ["{broken", "123", "null"]) {
    assert.equal(dreaming.isJsonStringLike(value), false);
    assert.equal(dreaming.validateMergedText(value), null);
  }
});

test("normalizeMemory defaults, clamps, and rejects non-finite/nonnumeric scores", () => {
  assert.equal(batchTrain.normalizeMemory(null), null);
  assert.equal(batchTrain.normalizeMemory({ text: "  " }), null);
  assert.deepEqual(batchTrain.normalizeMemory({ text: " hello ", memoryKind: "bad", temporalStatus: "bad" }), {
    text: "hello", memoryKind: "fact", temporalStatus: "current", importanceScore: 0.5, confidenceScore: 0.8,
  });
  assert.deepEqual(batchTrain.normalizeMemory({ text: "x", memoryKind: "plan", temporalStatus: "future", importanceScore: 2, confidenceScore: -1 }), {
    text: "x", memoryKind: "plan", temporalStatus: "future", importanceScore: 1, confidenceScore: 0,
  });
  for (const value of [NaN, Infinity, "0.2"]) {
    const result = batchTrain.normalizeMemory({ text: "x", importanceScore: value, confidenceScore: value });
    assert.equal(result.importanceScore, 0.5);
    assert.equal(result.confidenceScore, 0.8);
  }
});

test("buildMemoryExtractionPrompt full output snapshot", () => {
  assert.equal(batchTrain.buildMemoryExtractionPrompt([
    { chunk_text: "猫が好き", memory_kind: "preference", metadata: { ai_proposed_kind: "fact" } },
    { chunk_text: "期限", memory_kind: null, metadata: null },
  ]), `ユーザー発言から、今後の会話で役立つ長期記憶だけを抽出してください。
雑談、挨拶、単発の質問、AIへの指示だけで永続的な事実ではない内容は除外してください。
出力は {"memories": [...]} のJSONオブジェクトのみ。memoriesの各要素は以下の形式にしてください。
{"text": string, "memoryKind": "preference"|"project"|"plan"|"decision"|"fact"|"todo"|"idea"|"constraint"|"profile"|"temporary"|"other", "temporalStatus": "current"|"past"|"future"|"expired"|"uncertain", "importanceScore": number, "confidenceScore": number}

以下は過去にAI分類をユーザーが修正した例です。同じ傾向の内容では corrected_memoryKind を優先して分類してください。
1. text: "猫が好き" / ai_proposed_kind: fact / corrected_memoryKind: preference
2. text: "期限" / ai_proposed_kind: unknown / corrected_memoryKind: fact`);
});

test("all pair normalizers use idA < idB ordering", () => {
  for (const api of [preview, merge, dismiss]) {
    assert.deepEqual(Array.from(api.normalizePair("z", "a")), ["a", "z"]);
    assert.deepEqual(Array.from(api.normalizePair("a", "z")), ["a", "z"]);
  }
  assert.equal(candidates.pairKey("z", "a"), "a:z");
  if (memoryPage) assert.equal(memoryPage.consolidationPairKey({ idA: "z", idB: "a" }), "a:z");
});

test("four clamp copies preserve bounds and NaN behavior", () => {
  for (const clamp of [candidates.clamp, dreaming.clamp, history.clamp, batchTrain.clamp]) {
    assert.equal(clamp(-1, 0, 10), 0);
    assert.equal(clamp(11, 0, 10), 10);
    assert.equal(clamp(4, 0, 10), 4);
    assert.equal(Number.isNaN(clamp(NaN, 0, 10)), true);
  }
});

test("toCount and normalizeResult absorb camel/snake forms", () => {
  assert.equal(temporal.toCount("3"), 0);
  assert.equal(temporal.toCount(NaN), 0);
  assert.deepEqual(temporal.normalizeResult({ pastCount: 2, expired_count: 3 }), { pastCount: 2, expiredCount: 3, total: 5 });
  assert.deepEqual(temporal.normalizeResult([{ past_count: 4, expiredCount: 1, total: 9 }]), { pastCount: 4, expiredCount: 1, total: 9 });
  assert.deepEqual(temporal.normalizeResult({ pastCount: "bad", expiredCount: Infinity, total: "bad" }), { pastCount: 0, expiredCount: 0, total: 0 });
  assert.deepEqual(temporal.normalizeResult(null), { pastCount: 0, expiredCount: 0, total: 0 });
});

test("normalizeRpcNewId accepts shapes and prioritizes newId/new_id/id", () => {
  assert.equal(dreaming.normalizeRpcNewId("direct"), "direct");
  assert.equal(dreaming.normalizeRpcNewId([{ newId: "camel", new_id: "snake", id: "id" }]), "camel");
  assert.equal(dreaming.normalizeRpcNewId({ new_id: "snake", id: "id" }), "snake");
  assert.equal(dreaming.normalizeRpcNewId({ id: "id" }), "id");
  assert.equal(dreaming.normalizeRpcNewId([]), null);
});

test("additional exposed helpers preserve current behavior", () => {
  assert.equal(candidates.stringValue({ a: 1, b: "x" }, ["a", "b"]), "x");
  assert.equal(candidates.numberValue({ a: "2.5" }, ["a"]), 2.5);
  assert.equal(dreaming.hasSameFolderNameAndMemoryKind([source("a"), source("b")]), true);
  assert.equal(dreaming.hasSameFolderNameAndMemoryKind([source("a"), source("b", "ai", { memory_kind: "plan" })]), false);
  assert.deepEqual(merge.normalizeTags(["a", "b"], null, ["b", "c"]), ["a", "b", "c"]);
  assert.equal(preview.suggestedValue("same", "same", "fallback", "new"), "same");
  assert.equal(preview.suggestedValue(null, null, "fallback", null), "fallback");
  assert.equal(preview.newerSource(source("a"), source("b")).id, "a");
});

console.log(`1..${passed}`);
console.log(`# ${passed} lore characterization tests passed`);
console.log(`# app/memory/page.tsx require: ${memoryPage ? "success" : "skipped"}`);
