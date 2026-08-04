const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

installAliasResolver();
installTsLoader();

let cleaningFailureTexts = new Set();
const openaiMock = {
  async chatCompleteMini(_openaiKey, systemPrompt, userText) {
    if (systemPrompt.includes("複数の記憶")) return "統合された記憶である。";
    if (cleaningFailureTexts.has(userText)) throw new Error("Cleaning failed");
    return `${userText}を整理した知識である。`;
  },
  async createEmbedding() {
    return [0.1, 0.2, 0.3];
  },
};

const originalLoad = Module._load;
Module._load = function loadWithOpenAiMock(request, parent, isMain) {
  if (request === "@/lib/lore/openai") return openaiMock;
  return originalLoad.call(this, request, parent, isMain);
};

global.fetch = async () => {
  throw new Error("Network access is forbidden in lore dreaming cleaning tests");
};

const { runDreamingBatch } = require(path.resolve(__dirname, "../lib/lore/dreaming.ts"));

const userId = "user-1";
const sourceRows = [
  {
    id: "source-a",
    user_id: userId,
    folder_name: "folder",
    chunk_text: "古い記憶",
    tags: [],
    memory_kind: "fact",
    temporal_status: "current",
    importance_score: 0.6,
    confidence_score: 0.8,
    is_archived: false,
    superseded_by: null,
    is_pinned: false,
    extraction_version: "ai",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "source-b",
    user_id: userId,
    folder_name: "folder",
    chunk_text: "新しい記憶",
    tags: [],
    memory_kind: "fact",
    temporal_status: "current",
    importance_score: 0.7,
    confidence_score: 0.9,
    is_archived: false,
    superseded_by: null,
    is_pinned: false,
    extraction_version: "ai",
    created_at: "2026-01-02T00:00:00Z",
  },
];

function createSupabaseMock(cleanSelectResult) {
  const trace = {
    cleanSelectCalls: 0,
    consolidationCalls: 0,
    inserted: [],
    updated: [],
  };

  const supabase = {
    async rpc(name) {
      if (name === "find_similar_lore_pairs_v2") {
        return {
          data: [{ id_a: "source-a", id_b: "source-b", similarity: 0.95 }],
          error: null,
        };
      }
      if (name === "consolidate_dreaming_batch") {
        trace.consolidationCalls++;
        return { data: [{ new_id: "merged-1" }], error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },

    from(table) {
      assert.equal(table, "lore_embeddings");
      let operation = "select";
      let selectedColumns = null;

      const builder = {
        select(columns) {
          selectedColumns = columns;
          return builder;
        },
        eq() {
          return builder;
        },
        is() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          assert.match(selectedColumns, /source_message_id/);
          trace.cleanSelectCalls++;
          return Promise.resolve(cleanSelectResult);
        },
        in(column, ids) {
          assert.equal(column, "id");
          assert.deepEqual(ids, ["source-a", "source-b"]);
          return Promise.resolve({ data: sourceRows, error: null });
        },
        insert(payload) {
          operation = "insert";
          trace.inserted.push(payload);
          return builder;
        },
        single() {
          assert.equal(operation, "insert");
          return Promise.resolve({
            data: { id: `cleaned-${trace.inserted.length}` },
            error: null,
          });
        },
        update(payload) {
          operation = "update";
          trace.updated.push(payload);
          return builder;
        },
        then(resolve, reject) {
          assert.equal(operation, "update");
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        },
      };

      return builder;
    },
  };

  return { supabase, trace };
}

async function runScenario(cleanSelectResult, failureTexts = []) {
  cleaningFailureTexts = new Set(failureTexts);
  const { supabase, trace } = createSupabaseMock(cleanSelectResult);
  const result = await runDreamingBatch(supabase, "openai-key", userId, {
    limit: 1,
    threshold: 0.8,
    folderName: null,
  });
  return { result, trace };
}

function mergeResultView(result) {
  return {
    processed: result.processed,
    succeeded: result.succeeded,
    failed: result.failed,
    results: result.results,
  };
}

let baselineMergeResult;
const tests = [
  ["records取得成功・0件ならcleanError nullで完走する", async () => {
    const { result, trace } = await runScenario({ data: [], error: null });

    assert.deepEqual({
      cleaned: result.cleaned,
      cleanFailed: result.cleanFailed,
      cleanError: result.cleanError,
    }, {
      cleaned: 0,
      cleanFailed: 0,
      cleanError: null,
    });
    assert.equal(result.processed, 1);
    assert.equal(result.succeeded, 1);
    assert.equal(result.failed, 0);
    assert.equal(trace.cleanSelectCalls, 1);
    baselineMergeResult = mergeResultView(result);
  }],

  ["records取得errorでもmerge結果を保持してcleanErrorを返す", async () => {
    const recordsErrorMessage = "mock records SELECT failed";
    let scenario;

    await assert.doesNotReject(async () => {
      scenario = await runScenario({
        data: null,
        error: { message: recordsErrorMessage },
      });
    });

    const { result, trace } = scenario;
    assert.equal(result.cleaned, 0);
    assert.equal(result.cleanFailed, 0);
    assert.equal(result.cleanError, recordsErrorMessage);
    assert.deepEqual(mergeResultView(result), baselineMergeResult);
    assert.equal(trace.cleanSelectCalls, 1);
    assert.equal(trace.consolidationCalls, 1);
    console.log(
      `# records SELECT error branch confirmed: cleanError="${result.cleanError}", merge result preserved`,
    );
  }],

  ["cleaning処理内の一部失敗をcleaned/failedへ数えerror nullを返す", async () => {
    const records = [
      {
        id: "liked-good",
        chunk_text: "成功するAI発言",
        folder_name: "folder",
        memory_kind: "idea",
        temporal_status: "current",
        importance_score: 0.8,
        confidence_score: 0.75,
        tags: [],
        source_message_id: "message-good",
        source_thread_id: "thread-1",
        metadata: { existing: true },
      },
      {
        id: "liked-bad",
        chunk_text: "失敗するAI発言",
        folder_name: "folder",
        memory_kind: "idea",
        temporal_status: "current",
        importance_score: 0.8,
        confidence_score: 0.75,
        tags: [],
        source_message_id: "message-bad",
        source_thread_id: "thread-1",
        metadata: null,
      },
    ];

    const { result, trace } = await runScenario(
      { data: records, error: null },
      ["失敗するAI発言"],
    );

    assert.equal(result.cleaned, 1);
    assert.equal(result.cleanFailed, 1);
    assert.equal(result.cleanError, null);
    assert.equal(trace.inserted.length, 1);
    assert.equal(trace.updated.length, 1);
    assert.deepEqual(trace.updated[0], {
      is_archived: true,
      superseded_by: "cleaned-1",
    });
  }],
];

(async () => {
  let passed = 0;
  for (const [name, test] of tests) {
    try {
      await test();
      passed++;
      console.log(`ok - ${name}`);
    } catch (error) {
      console.error(`not ok - ${name}`);
      throw error;
    }
  }
  console.log(`1..${passed}`);
  console.log(`# ${passed} lore dreaming cleaning tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
