const assert = require("node:assert/strict");
const path = require("node:path");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");
installAliasResolver(); installTsLoader();
const { requestInstructionEditPreview, applyInstructionEdit } = require(path.join(__dirname,
  "../lib/project-memory/instruction-edit-client.ts"));

const base = { run_id: "run-1", model: "model-1", prompt_version: 1,
  topic_id: "topic-1", topic_key: "overview", revision: 3, updated_at: "timestamp" };
const proposal = { ...base, result: "proposal", old_content_md: "source-sentinel",
  new_content_md: "replacement-sentinel", summary: "changed" };
const args = { projectId: "project-1", topicId: "topic-1", instruction: "instruction-sentinel", apiKey: "key-sentinel" };
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
const fetchJson = (body, status = 200) => async () => Response.json(body, { status });

test("accepts all three preview variants and sends the request contract", async () => {
  const sent = [];
  for (const value of [proposal, { ...base, result: "no_change" },
    { ...base, result: "not_applicable", reason: "unrelated" }]) {
    const result = await requestInstructionEditPreview({ ...args, fetcher: async (url, init) => {
      sent.push([url, init]); return Response.json(value);
    } });
    assert.deepEqual(result, { ok: true, preview: value });
  }
  for (const [url, init] of sent) {
    assert.match(url, /\/topics\/topic-1\/edit-preview$/);
    assert.equal(init.method, "POST");
    assert.equal(init.headers["x-openai-api-key"], args.apiKey);
    assert.deepEqual(JSON.parse(init.body), { instruction: args.instruction });
  }
});

test("rejects malformed preview payloads", async () => {
  for (const value of [null, {}, { ...base, result: "unknown" },
    { ...proposal, revision: "3" }, { ...proposal, summary: null },
    { ...proposal, extra: true }, { ...proposal, new_content_md: " " },
    { ...base, result: "not_applicable" }, { ...base, result: "no_change", old_content_md: "extra" },
    { ...base, result: "no_change", topic_id: "other" }]) {
    const result = await requestInstructionEditPreview({ ...args, fetcher: fetchJson(value) });
    assert.equal(result.ok, false); assert.equal(result.kind, "error");
  }
});

test("maps preview errors by status and keeps AbortError distinct", async () => {
  for (const [status, message] of [[400, "指示を確認してください"], [413, "too large"],
    [502, "upstream"], [500, "AI編集案を生成できませんでした"]]) {
    const result = await requestInstructionEditPreview({ ...args, fetcher: fetchJson({ error: status === 413 ? "too large" : "upstream" }, status) });
    assert.deepEqual(result, { ok: false, kind: "error", status, message });
  }
  const aborted = await requestInstructionEditPreview({ ...args, fetcher: async () => {
    const error = new Error("aborted"); error.name = "AbortError"; throw error;
  } });
  assert.deepEqual(aborted, { ok: false, kind: "aborted" });
  const failed = await requestInstructionEditPreview({ ...args, fetcher: async () => { throw new Error("network"); } });
  assert.deepEqual(failed, { ok: false, kind: "error", status: null, message: "AI編集案を生成できませんでした" });
});

test("applies full PATCH with revision and provenance only", async () => {
  let sent;
  const result = await applyInstructionEdit({ projectId: args.projectId, preview: proposal,
    fetcher: async (url, init) => { sent = [url, init]; return new Response(null, { status: 200 }); } });
  assert.deepEqual(result, { status: "applied" });
  assert.match(sent[0], /\/topics\/topic-1$/);
  assert.equal(sent[1].method, "PATCH");
  assert.deepEqual(JSON.parse(sent[1].body), { expected_revision: 3, edit_kind: "full",
    new_content_md: proposal.new_content_md,
    source_refs: [{ type: "instruction_edit", run_id: proposal.run_id,
      model: proposal.model, prompt_version: proposal.prompt_version }] });
  assert.equal(sent[1].body.includes(args.instruction), false);
  assert.equal(sent[1].body.includes(args.apiKey), false);
});

test("maps apply statuses and exceptions", async () => {
  for (const [code, status] of [[409, "conflict"], [404, "not_found"], [500, "failed"]]) {
    const result = await applyInstructionEdit({ projectId: args.projectId, preview: proposal,
      fetcher: async () => new Response(null, { status: code }) });
    assert.equal(result.status, status);
  }
  const result = await applyInstructionEdit({ projectId: args.projectId, preview: proposal,
    fetcher: async () => { throw new Error("network"); } });
  assert.equal(result.status, "failed");
});

(async () => {
  for (const [name, fn] of tests) { await fn(); console.log(`ok - ${name}`); }
  console.log(`passed ${tests.length} instruction edit client tests`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
