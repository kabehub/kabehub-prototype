const assert = require("node:assert/strict");
const { test } = require("node:test");
const { installTsLoader } = require("./testBootstrap.cjs");
installTsLoader();
const { fetchProjectMemorySummaryTopics } = require("../lib/project-memory/summary-client.ts");
const valid = { id: "id", topic_key: "overview", content_md: "body", include_in_chat: true, promotion: { status: "current" } };

test("summary client extracts only five fields and forwards encoded Project ID and signal", async () => {
  const original = global.fetch;
  try {
    const controller = new AbortController();
    global.fetch = async (url, options) => {
      assert.equal(url, "/api/projects/project%2F%20id/memory/topics");
      assert.equal(options.signal, controller.signal);
      return Response.json({ topics: [{ ...valid, extra: "discard", promotion: { status: "current", extra: 42 } }] });
    };
    assert.deepEqual(await fetchProjectMemorySummaryTopics("project/ id", controller.signal), [valid]);
    global.fetch = async () => Response.json({ topics: [] });
    assert.deepEqual(await fetchProjectMemorySummaryTopics("id"), []);
  } finally { global.fetch = original; }
});

test("summary client rejects HTTP errors, malformed JSON, invalid bodies and mixed invalid topics", async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => Response.json({ topics: [valid] }, { status: 500 });
    await assert.rejects(fetchProjectMemorySummaryTopics("id"));
    global.fetch = async () => new Response("not json");
    await assert.rejects(fetchProjectMemorySummaryTopics("id"));
    const badTopics = [null, "bad", {}, { ...valid, promotion: null }, { ...valid, promotion: {} }, { ...valid, promotion: { status: "unknown" } }];
    for (const key of Object.keys(valid)) {
      const missing = { ...valid }; delete missing[key]; badTopics.push(missing);
    }
    for (const key of ["id", "topic_key", "content_md"]) {
      for (const value of [null, 123, true, {}, []]) badTopics.push({ ...valid, [key]: value });
    }
    for (const value of [null, "true", 1]) badTopics.push({ ...valid, include_in_chat: value });
    for (const body of [null, {}, { topics: null }, { topics: {} }, { topics: "bad" },
      ...badTopics.map(topic => ({ topics: [valid, topic] }))]) {
      global.fetch = async () => Response.json(body);
      await assert.rejects(fetchProjectMemorySummaryTopics("id"), /読み込めません/, JSON.stringify(body));
    }
    for (const status of ["not_promoted", "current", "stale"]) {
      global.fetch = async () => Response.json({ topics: [{ ...valid, promotion: { status } }] });
      assert.equal((await fetchProjectMemorySummaryTopics("id"))[0].promotion.status, status);
    }
    global.fetch = async () => { throw new Error("network"); };
    await assert.rejects(fetchProjectMemorySummaryTopics("id"), /network/);
  } finally { global.fetch = original; }
});
