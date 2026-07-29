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
  ["lib/lore/mappers.ts", ["stringValue", "numberValue", "normalizeConsolidationCandidate", "normalizeDreamingCandidate", "normalizeRpcNewId", "toMemoryCard", "memoryNeedsReview", "clamp"]],
  ["lib/lore/consolidation.ts", ["normalizePair", "pairKey", "validateApprovedPair", "validateDreamingSources"]],
  ["lib/lore/dreaming.ts", ["buildGreedyChainClusters", "hasSameFolderNameAndMemoryKind", "buildUserPrompt", "isJsonStringLike", "validateMergedText"]],
  ["app/api/lore/consolidate/preview/route.ts", ["newerSource", "suggestedValue"]],
  ["app/api/lore/consolidate/merge/route.ts", ["normalizeTags"]],
  ["lib/lore/batchTrain.ts", ["normalizeMemory", "buildMemoryExtractionPrompt", "fetchTargetMessages"]],
  ["app/api/lore/update-temporal-status/route.ts", ["toCount", "normalizeResult"]],
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
const pendingTests = [];
function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      pendingTests.push(result.then(() => {
        passed++;
        console.log(`ok - ${name}`);
      }, (error) => {
        console.error(`not ok - ${name}`);
        throw error;
      }));
      return;
    }
    passed++;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const mappersModule = loadTestExports("lib/lore/mappers.ts", testExportsByFile.get("lib/lore/mappers.ts"));
const consolidationModule = loadTestExports("lib/lore/consolidation.ts", testExportsByFile.get("lib/lore/consolidation.ts"));
const dreaming = loadTestExports("lib/lore/dreaming.ts", testExportsByFile.get("lib/lore/dreaming.ts"));
const preview = loadTestExports("app/api/lore/consolidate/preview/route.ts", testExportsByFile.get("app/api/lore/consolidate/preview/route.ts"));
const merge = loadTestExports("app/api/lore/consolidate/merge/route.ts", testExportsByFile.get("app/api/lore/consolidate/merge/route.ts"));
const batchTrain = loadTestExports("lib/lore/batchTrain.ts", testExportsByFile.get("lib/lore/batchTrain.ts"));
const temporal = loadTestExports("app/api/lore/update-temporal-status/route.ts", testExportsByFile.get("app/api/lore/update-temporal-status/route.ts"));
const { LORE_MEMORY_SELECT: sharedSelect } = require("../lib/loreMemorySelect.ts");
const { LIKED_AI_DEFAULTS } = require("../lib/lore/types.ts");

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
  assert.deepEqual(mappersModule.normalizeConsolidationCandidate(row), {
    idA: "same", idB: "same", chunkTextA: "A", chunkTextB: "B",
    memoryKindA: null, memoryKindB: null, temporalStatusA: null, temporalStatusB: null,
    createdAtA: null, createdAtB: null, similarity: 0.9,
  });
  assert.equal(mappersModule.normalizeDreamingCandidate(row), null);
  assert.equal(mappersModule.normalizeDreamingCandidate(row), null);
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
  for (const api of [consolidationModule, consolidationModule]) {
    for (const version of ["liked_ai", "liked_ai_cleaned"]) {
      assert.ok(api.validateApprovedPair([source("a", version), source("b")], "user", "a", "b"));
    }
    for (const version of ["user_edited", "user_created"]) {
      assert.equal(api.validateApprovedPair([source("a", version), source("b")], "user", "a", "b"), null);
    }
  }
});

test("dreaming rejects four protected variants and mismatched folder/kind", () => {
  for (const version of ["user_edited", "user_created", "liked_ai", "liked_ai_cleaned"]) {
    assert.equal(consolidationModule.validateDreamingSources([source("a", version), source("b")], "user", ["a", "b"]), null);
  }
  assert.equal(consolidationModule.validateDreamingSources([source("a"), source("b", "ai", { folder_name: "other" })], "user", ["a", "b"]), null);
  assert.equal(consolidationModule.validateDreamingSources([source("a"), source("b", "ai", { memory_kind: "plan" })], "user", ["a", "b"]), null);
  assert.ok(consolidationModule.validateDreamingSources([source("a"), source("b")], "user", ["a", "b"]));
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

test("fetchTargetMessages preserves every query condition and ordering", async () => {
  const calls = [];
  const builder = {};
  for (const method of ["select", "eq", "neq", "or", "order"]) {
    builder[method] = (...args) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.limit = (value) => {
    calls.push(["limit", value]);
    return Promise.resolve({ data: [], error: null });
  };
  const supabase = {
    from(table) {
      calls.push(["from", table]);
      return builder;
    },
  };

  await batchTrain.fetchTargetMessages(supabase, "user-1", 37);
  assert.deepEqual(calls, [
    ["from", "messages"],
    ["select", "id, thread_id, content, created_at"],
    ["eq", "user_id", "user-1"],
    ["eq", "is_learned", false],
    ["eq", "skip_learning", false],
    ["eq", "role", "user"],
    ["neq", "provider", "memo"],
    ["neq", "provider", "image_gen"],
    ["or", "is_active.is.null,is_active.eq.true"],
    ["order", "created_at", { ascending: true }],
    ["limit", 37],
  ]);
});

test("all pair normalizers use idA < idB ordering", () => {
  for (const api of [consolidationModule, consolidationModule, consolidationModule]) {
    assert.deepEqual(Array.from(api.normalizePair("z", "a")), ["a", "z"]);
    assert.deepEqual(Array.from(api.normalizePair("a", "z")), ["a", "z"]);
  }
  assert.equal(consolidationModule.pairKey("z", "a"), "a:z");
});

test("shared clamp preserves bounds and NaN behavior", () => {
  const clamp = mappersModule.clamp;
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
  assert.equal(clamp(4, 0, 10), 4);
  assert.equal(Number.isNaN(clamp(NaN, 0, 10)), true);
});

test("toCount and normalizeResult absorb camel/snake forms", () => {
  assert.equal(temporal.toCount("3"), 0);
  assert.equal(temporal.toCount(NaN), 0);
  assert.deepEqual(temporal.normalizeResult({ pastCount: 2, expired_count: 3 }), { pastCount: 2, expiredCount: 3, total: 5 });
  assert.deepEqual(temporal.normalizeResult([{ past_count: 4, expiredCount: 1, total: 9 }]), { pastCount: 4, expiredCount: 1, total: 9 });
  assert.deepEqual(temporal.normalizeResult({ pastCount: "bad", expiredCount: Infinity, total: "bad" }), { pastCount: 0, expiredCount: 0, total: 0 });
  assert.deepEqual(temporal.normalizeResult(null), { pastCount: 0, expiredCount: 0, total: 0 });
});

test("LIKED_AI_DEFAULTS preserves liked-ai insert defaults", () => {
  assert.deepEqual(LIKED_AI_DEFAULTS, {
    memoryKind: "idea",
    importanceScore: 0.8,
    confidenceScore: 0.75,
  });
});

test("normalizeRpcNewId accepts shapes and prioritizes newId/new_id/id", () => {
  assert.equal(mappersModule.normalizeRpcNewId("direct"), "direct");
  assert.equal(mappersModule.normalizeRpcNewId([{ newId: "camel", new_id: "snake", id: "id" }]), "camel");
  assert.equal(mappersModule.normalizeRpcNewId({ new_id: "snake", id: "id" }), "snake");
  assert.equal(mappersModule.normalizeRpcNewId({ id: "id" }), "id");
  assert.equal(mappersModule.normalizeRpcNewId([]), null);
});

test("toMemoryCard converts every DB field and preserves current defaults", () => {
  const row = {
    id: "memory-1",
    chunk_text: "記憶本文",
    tags: ["tag-a"],
    memory_kind: "project",
    temporal_status: "future",
    importance_score: 0.7,
    confidence_score: 0.8,
    source_thread_id: "thread-1",
    source_message_id: "message-1",
    source_message_number: 12,
    is_pinned: true,
    is_archived: false,
    extraction_version: "ai",
    is_manually_corrected: true,
    last_confirmed_at: "2026-01-02T00:00:00Z",
    valid_from: "2026-01-03T00:00:00Z",
    valid_until: "2026-12-31T00:00:00Z",
    event_time: "2026-01-04T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
  };

  assert.deepEqual(mappersModule.toMemoryCard(row), {
    id: "memory-1",
    chunkText: "記憶本文",
    tags: ["tag-a"],
    memoryKind: "project",
    temporalStatus: "future",
    importanceScore: 0.7,
    confidenceScore: 0.8,
    sourceThreadId: "thread-1",
    sourceMessageId: "message-1",
    sourceMessageNumber: 12,
    isPinned: true,
    isArchived: false,
    extractionVersion: "ai",
    lastConfirmedAt: "2026-01-02T00:00:00Z",
    validFrom: "2026-01-03T00:00:00Z",
    validUntil: "2026-12-31T00:00:00Z",
    eventTime: "2026-01-04T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
  });

  const nullRow = {
    id: "1", chunk_text: "t", tags: null, memory_kind: null, temporal_status: null,
    importance_score: null, confidence_score: null, source_thread_id: null,
    source_message_id: null, source_message_number: null, is_pinned: null,
    is_archived: null, extraction_version: null, is_manually_corrected: false,
    last_confirmed_at: null, valid_from: null, valid_until: null,
    event_time: null, created_at: "2026-01-01",
  };
  const card = mappersModule.toMemoryCard(nullRow);
  assert.deepEqual(card.tags, []);
  assert.equal(card.memoryKind, "fact");
  assert.equal(card.temporalStatus, "current");
  assert.equal(card.importanceScore, 0);
  assert.equal(card.confidenceScore, 0);
  assert.equal(card.isPinned, false);
  assert.equal(card.isArchived, false);
});

test("memoryNeedsReview preserves current review boundaries", () => {
  const now = Date.parse("2026-01-10T00:00:00Z");
  const base = { temporalStatus: "current", confidenceScore: 0.9, validUntil: null };

  assert.equal(mappersModule.memoryNeedsReview({ ...base, temporalStatus: "uncertain" }, now), true);
  assert.equal(mappersModule.memoryNeedsReview({ ...base, temporalStatus: "expired" }, now), true);
  assert.equal(mappersModule.memoryNeedsReview({ ...base, confidenceScore: 0.49 }, now), true);
  assert.equal(mappersModule.memoryNeedsReview({ ...base, confidenceScore: 0.5 }, now), false);
  assert.equal(mappersModule.memoryNeedsReview({ ...base, temporalStatus: "past", validUntil: "2020-01-01T00:00:00Z" }, now), false);
  assert.equal(mappersModule.memoryNeedsReview({ ...base, validUntil: "2026-01-09T23:59:59Z" }, now), true);
  assert.equal(mappersModule.memoryNeedsReview({ ...base, validUntil: "2026-01-10T00:00:00Z" }, now), false);
  assert.equal(mappersModule.memoryNeedsReview({ ...base, validUntil: "not-a-date" }, now), false);
});

test("additional exposed helpers preserve current behavior", () => {
  assert.equal(mappersModule.stringValue({ a: 1, b: "x" }, ["a", "b"]), "x");
  assert.equal(mappersModule.numberValue({ a: "2.5" }, ["a"]), 2.5);
  assert.equal(dreaming.hasSameFolderNameAndMemoryKind([source("a"), source("b")]), true);
  assert.equal(dreaming.hasSameFolderNameAndMemoryKind([source("a"), source("b", "ai", { memory_kind: "plan" })]), false);
  assert.deepEqual(merge.normalizeTags(["a", "b"], null, ["b", "c"]), ["a", "b", "c"]);
  assert.equal(preview.suggestedValue("same", "same", "fallback", "new"), "same");
  assert.equal(preview.suggestedValue(null, null, "fallback", null), "fallback");
  assert.equal(preview.newerSource(source("a"), source("b")).id, "a");
});

Promise.all(pendingTests).then(() => {
  console.log(`1..${passed}`);
  console.log(`# ${passed} lore characterization tests passed`);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
