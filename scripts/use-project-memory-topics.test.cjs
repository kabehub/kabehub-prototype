const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

const originalLoad = Module._load;
const originalFetch = global.fetch;
let apiKey = "key";
let state = [], cursor = 0, deps = [], cleanups = [], pending = [];
const hooks = {
  ...React,
  useState(initial) {
    const i = cursor++;
    if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
    return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
  },
  useRef(initial) {
    const i = cursor++;
    if (!(i in state)) state[i] = { current: initial };
    return state[i];
  },
  useCallback(fn, nextDeps) {
    const i = cursor++;
    if (!state[i] || nextDeps.some((value, position) => value !== state[i].deps[position])) state[i] = { fn, deps: nextDeps };
    return state[i].fn;
  },
  useEffect(fn, nextDeps) {
    const i = cursor++;
    if (!deps[i] || nextDeps.some((value, position) => value !== deps[i][position])) {
      pending.push(() => { cleanups[i]?.(); deps[i] = nextDeps; cleanups[i] = fn(); });
    }
  },
};
Module._load = function (request, parent, isMain) {
  if (request === "react") return hooks;
  if (request === "@/lib/apiKeyStore") return { webApiKeyStore: { async getKey() { return apiKey; } } };
  return originalLoad.call(this, request, parent, isMain);
};
installAliasResolver();
installTsLoader({ jsx: true });
const useTopics = require(path.join(__dirname, "..", "lib", "project-memory", "use-project-memory-topics.ts")).useProjectMemoryTopics;
const topic = (id) => ({ id, topic_key: id, content_md: "Content", revision: 1, created_at: "", updated_at: "",
  promotion: { status: "not_promoted", source_revision: null, lore_id: null } });
const render = (options = {}) => { cursor = 0; return useTopics({ projectId: "A", enabled: true, ...options }); };
const effects = () => { const todo = pending; pending = []; todo.forEach((run) => run()); };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const reset = (fetcher) => { state = []; cursor = 0; deps = []; cleanups = []; pending = []; global.fetch = fetcher; };
const file = (name, content) => ({ name, async text() { return content; } });
const header = (id = "A-topic") => `<!-- kabehub-topic:v1 ${JSON.stringify({ topic_id: id, topic_key: id, revision: 1 })} -->\nNew`;

(async () => {
  let gets = 0;
  reset(async () => { gets++; return Response.json({ topics: [topic("A-topic")] }); });
  render({ keepLoaded: false }); effects(); await flush();
  assert.equal(gets, 1);
  render({ enabled: false, keepLoaded: false }); effects();
  render({ keepLoaded: false }); effects(); await flush();
  assert.equal(gets, 2, "keepLoaded=false refetches on reopening");

  gets = 0;
  reset(async () => { gets++; return Response.json({ topics: [topic("A-topic")] }); });
  render({ keepLoaded: true }); effects(); await flush();
  assert.equal(render({ enabled: false, keepLoaded: true }).topics.length, 1);
  effects(); assert.equal(gets, 1, "disabled does not fetch");
  render({ keepLoaded: true }); effects(); await flush();
  assert.equal(gets, 1, "keepLoaded=true keeps a successful GET");
  assert.equal(render({ keepLoaded: true }).topics.length, 1);

  gets = 0;
  reset(async () => { gets++; return gets === 1 ? new Response(null, { status: 500 }) : Response.json({ topics: [topic("A-topic")] }); });
  render({ keepLoaded: true }); effects(); await flush();
  assert.equal(render({ keepLoaded: true }).topics.length, 0);
  render({ enabled: false, keepLoaded: true }); effects();
  render({ keepLoaded: true }); effects(); await flush();
  assert.equal(gets, 2, "failed GET is not loaded");
  assert.equal(render({ keepLoaded: true }).topics.length, 1);

  gets = 0;
  reset(async () => { gets++; return Response.json(gets === 1 ? { topics: null } : { topics: [topic("A-topic")] }); });
  render({ keepLoaded: true }); effects(); await flush();
  render({ enabled: false, keepLoaded: true }); effects();
  render({ keepLoaded: true }); effects(); await flush();
  assert.equal(gets, 2, "invalid GET body is not loaded");

  gets = 0;
  reset(async (url) => { gets++; return Response.json({ topics: [topic(url.includes("/B/") ? "B-topic" : "A-topic")] }); });
  render({ keepLoaded: true }); effects(); await flush();
  assert.equal(render({ keepLoaded: true }).topics[0].id, "A-topic");
  const firstBRender = render({ projectId: "B", keepLoaded: true });
  assert.deepEqual(firstBRender.topics, [], "old topics must be hidden before B effect");
  effects(); await flush();
  assert.equal(render({ projectId: "B", keepLoaded: true }).topics[0].id, "B-topic");

  let resolveA;
  reset((url) => url.includes("/A/") ? new Promise((resolve) => { resolveA = resolve; }) : Promise.resolve(Response.json({ topics: [topic("B-topic")] })));
  render({ keepLoaded: true }); effects();
  render({ projectId: "B", keepLoaded: true }); effects(); await flush();
  resolveA(Response.json({ topics: [topic("A-topic")] })); await flush();
  assert.equal(render({ projectId: "B", keepLoaded: true }).topics[0].id, "B-topic", "stale response ignored");

  for (const [status, expectedGets] of [[200, 2], [409, 2], [404, 1], [500, 1]]) {
    gets = 0;
    reset(async (_url, init = {}) => {
      if (!init.method) { gets++; return Response.json({ topics: [topic("A-topic")] }); }
      return Response.json({ error: "failed" }, { status });
    });
    render(); effects(); await flush();
    await render().promote(topic("A-topic"));
    assert.equal(gets, expectedGets, `promotion ${status} reload count`);
  }
  for (const [method, status, expectedGets] of [
    ["PATCH", 200, 2], ["PATCH", 409, 2], ["PATCH", 404, 2], ["PATCH", 500, 1],
    ["POST", 201, 2], ["POST", 409, 2], ["POST", 404, 2], ["POST", 500, 1],
  ]) {
    gets = 0;
    reset(async (_url, init = {}) => {
      if (!init.method) { gets++; return Response.json({ topics: [topic("A-topic")] }); }
      assert.equal(init.method, method);
      return new Response(null, { status });
    });
    render(); effects(); await flush();
    await render().selectUploadFile(method === "PATCH" ? file("A-topic.md", header()) : file("new.md", "New"));
    await render().executeUpload();
    assert.equal(gets, expectedGets, `${method} ${status} reload count`);
  }

  const preview = { result: "proposal", run_id: "run-1", model: "model-1", prompt_version: 1,
    topic_id: "A-topic", topic_key: "A-topic", revision: 2, updated_at: "timestamp",
    old_content_md: "Content", new_content_md: "Replacement", summary: "changed" };
  const start = async (fetcher) => {
    apiKey = "key";
    reset(fetcher);
    render(); effects(); await flush();
    render().openInstructionEdit(topic("A-topic"));
    return render();
  };
  const getResponse = () => Response.json({ topics: [topic("A-topic")] });

  let writes = 0;
  let edit = await start(async (_url, init = {}) => {
    if (!init.method) return getResponse();
    writes++; return Response.json(preview);
  });
  assert.equal(edit.instructionEdit.phase, "input");
  assert.equal(edit.isActionLocked(), true);
  await edit.promote(topic("A-topic"));
  await edit.selectUploadFile(file("new.md", "New"));
  await edit.executeUpload();
  assert.equal(writes, 0, "editing blocks promote and upload");
  assert.equal(render().uploadConfirm, null);
  edit.setInstructionEditInstruction("rewrite");
  assert.equal(render().instructionEdit.instruction, "rewrite");
  await edit.generateInstructionEditPreview("rewrite");
  assert.equal(render().instructionEdit.phase, "preview");
  assert.equal(render().instructionEdit.preview.revision, 2);
  await render().reload();
  assert.equal(render().instructionEdit.phase, "preview", "reload preserves edit state");
  render().backToInstructionInput();
  assert.equal(render().instructionEdit.phase, "input");
  assert.equal(render().instructionEdit.preview, null);
  const regenerating = edit.generateInstructionEditPreview("rewrite again");
  assert.equal(render().instructionEdit.phase, "generating");
  assert.equal(render().instructionEdit.preview, null);
  await regenerating;
  render().closeInstructionEdit();
  assert.equal(render().instructionEdit, null);

  for (const [body, notice] of [
    [{ result: "no_change", run_id: preview.run_id, model: preview.model, prompt_version: 1,
      topic_id: preview.topic_id, topic_key: preview.topic_key, revision: 2, updated_at: preview.updated_at }, "変更はありませんでした"],
    [{ result: "not_applicable", run_id: preview.run_id, model: preview.model, prompt_version: 1,
      topic_id: preview.topic_id, topic_key: preview.topic_key, revision: 2, updated_at: preview.updated_at,
      reason: "unrelated" }, "unrelated"],
    [null, "AI編集案を生成できませんでした"],
  ]) {
    edit = await start(async (_url, init = {}) => !init.method ? getResponse() : Response.json(body));
    await edit.generateInstructionEditPreview("rewrite");
    const current = render().instructionEdit;
    assert.equal(current.phase, "input");
    assert.equal(current.preview, null);
    assert.equal(current.instruction, "rewrite");
    assert.match(current.notice, new RegExp(notice));
  }

  let releasePreview, previewSignal;
  edit = await start(async (_url, init = {}) => {
    if (!init.method) return getResponse();
    previewSignal = init.signal;
    return new Promise((resolve) => { releasePreview = () => resolve(Response.json(preview)); });
  });
  const generating = edit.generateInstructionEditPreview("rewrite");
  await flush();
  assert.equal(render().instructionEdit.phase, "generating");
  render().cancelInstructionEditGeneration();
  assert.equal(previewSignal.aborted, true);
  assert.equal(render().instructionEdit.phase, "input");
  assert.equal(render().instructionEdit.notice, null);
  releasePreview(); await generating;
  assert.equal(render().instructionEdit.phase, "input", "late preview ignored after cancel");

  for (const [status, phase, doneStatus] of [[200, "done", "applied"], [409, "done", "conflict"],
    [404, "done", "not_found"], [500, "preview", null]]) {
    let getsForEdit = 0;
    let patches = 0;
    edit = await start(async (_url, init = {}) => {
      if (!init.method) { getsForEdit++; return getResponse(); }
      if (init.method === "POST") return Response.json(preview);
      patches++; return new Response(null, { status });
    });
    await edit.generateInstructionEditPreview("rewrite");
    await render().applyInstructionEditPreview();
    const current = render().instructionEdit;
    assert.equal(current.phase, phase);
    assert.equal(current.doneStatus, doneStatus);
    assert.equal(getsForEdit, status === 500 ? 1 : 2);
    if (status === 500) {
      assert.equal(current.preview.result, "proposal");
      await render().applyInstructionEditPreview();
      assert.equal(patches, 2, "transient failure can retry the same revision");
    } else {
      assert.equal(current.preview, null);
      await render().applyInstructionEditPreview();
      assert.equal(patches, 1, "terminal result cannot reapply");
    }
  }

  let releasePatch;
  edit = await start(async (_url, init = {}) => {
    if (!init.method) return getResponse();
    if (init.method === "POST") return Response.json(preview);
    return new Promise((resolve) => { releasePatch = () => resolve(new Response(null, { status: 200 })); });
  });
  await edit.generateInstructionEditPreview("rewrite");
  const applying = render().applyInstructionEditPreview();
  assert.equal(render().instructionEdit.phase, "applying");
  render().closeInstructionEdit();
  assert.equal(render().instructionEdit.phase, "applying", "cannot close during apply");
  releasePatch(); await applying;

  let finishStalePatch;
  edit = await start(async (_url, init = {}) => {
    if (!init.method) return getResponse();
    if (init.method === "POST") return Response.json(preview);
    return new Promise((resolve) => { finishStalePatch = () => resolve(new Response(null, { status: 200 })); });
  });
  await edit.generateInstructionEditPreview("rewrite");
  const staleApply = render().applyInstructionEditPreview();
  render({ projectId: "B" }); effects(); await flush();
  finishStalePatch(); await staleApply;
  assert.equal(render({ projectId: "B" }).instructionEdit, null, "late PATCH result cannot restore old project state");

  let releaseProjectPreview, projectSignal;
  edit = await start(async (_url, init = {}) => {
    if (!init.method) return getResponse();
    projectSignal = init.signal;
    return new Promise((resolve) => { releaseProjectPreview = () => resolve(Response.json(preview)); });
  });
  const projectPending = edit.generateInstructionEditPreview("rewrite"); await flush();
  render({ projectId: "B" }); effects(); await flush();
  assert.equal(projectSignal.aborted, true);
  assert.equal(render({ projectId: "B" }).instructionEdit, null);
  releaseProjectPreview(); await projectPending;
  assert.equal(render({ projectId: "B" }).instructionEdit, null);

  edit = await start(async (_url, init = {}) => {
    if (!init.method) return getResponse();
    projectSignal = init.signal;
    return new Promise((resolve) => { releaseProjectPreview = () => resolve(Response.json(preview)); });
  });
  const disabledPending = edit.generateInstructionEditPreview("rewrite"); await flush();
  render({ enabled: false }); effects();
  assert.equal(projectSignal.aborted, true);
  assert.equal(render({ enabled: false }).instructionEdit, null);
  releaseProjectPreview(); await disabledPending;
  assert.equal(render({ enabled: false }).instructionEdit, null);

  let releaseRead;
  apiKey = "key"; reset(async () => getResponse());
  render(); effects(); await flush();
  const reading = render().selectUploadFile({ name: "new.md", text: () => new Promise((resolve) => { releaseRead = resolve; }) });
  render().openInstructionEdit(topic("A-topic"));
  releaseRead("New"); await reading;
  assert.equal(render().uploadConfirm, null, "late file read cannot open confirmation");

  apiKey = null; reset(async () => getResponse());
  render(); effects(); await flush();
  render().openInstructionEdit(topic("A-topic"));
  assert.equal(render().instructionEdit, null, "missing key blocks open");

  apiKey = "key"; reset(async (_url, init = {}) => init.method === "POST"
    ? new Promise(() => {}) : getResponse());
  render(); effects(); await flush();
  void render().promote(topic("A-topic"));
  render().openInstructionEdit(topic("A-topic"));
  assert.equal(render().instructionEdit, null, "promotion blocks open");

  let finishUpload;
  apiKey = "key"; reset(async (_url, init = {}) => init.method === "POST"
    ? new Promise((resolve) => { finishUpload = resolve; }) : getResponse());
  render(); effects(); await flush();
  await render().selectUploadFile(file("new.md", "New"));
  const uploading = render().executeUpload();
  render().openInstructionEdit(topic("A-topic"));
  assert.equal(render().instructionEdit, null, "upload blocks open");
  finishUpload(new Response(null, { status: 201 })); await uploading;
  console.log("ok - instruction edit lock, transitions, cancellation, apply, invalidation, and upload race");
  console.log("ok - useProjectMemoryTopics cache, request invalidation, and reload conditions");
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch;
  Module._load = originalLoad;
});
