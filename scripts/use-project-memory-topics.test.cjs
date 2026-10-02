const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

const originalLoad = Module._load;
const originalFetch = global.fetch;
let apiKey = "key";
let state = [], cursor = 0, deps = [], cleanups = [], pending = [];
let stateChanges = 0;
let onStateChange = null;
const hooks = {
  ...React,
  useState(initial) {
    const i = cursor++;
    if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
    return [state[i], (value) => { stateChanges++; state[i] = typeof value === "function" ? value(state[i]) : value; onStateChange?.(state[i]); }];
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
const topic = (id) => ({ id, topic_key: id, content_md: "Content", include_in_chat: false, revision: 1, created_at: "", updated_at: "",
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
  const editedA = { id: "55555555-5555-4555-8555-555555555555", title: "Edited" };
  const editedB = { id: "66666666-6666-4666-8666-666666666666", title: "Newly edited" };
  const needsConfirm = (rows) => Response.json({ code: "edited_lore_needs_confirmation", edited_lores: rows }, { status: 409 });
  let promoteBodies = [];
  reset(async (_url, init = {}) => {
    if (!init.method) return Response.json({ topics: [topic("A-topic")] });
    promoteBodies.push(JSON.parse(init.body));
    return promoteBodies.length === 1 ? needsConfirm([editedA]) : promoteBodies.length === 2
      ? needsConfirm([editedA, editedB]) : Response.json({ created: true });
  });
  render(); effects(); await flush();
  await render().promote(topic("A-topic"));
  assert.deepEqual(render().pendingConfirm.editedLores, [editedA]);
  assert.equal(render().isActionLocked(), true);
  await render().promote(topic("A-topic"));
  await render().selectUploadFile(file("new.md", "New"));
  render().openInstructionEdit(topic("A-topic"));
  assert.equal(render().instructionEdit, null);
  assert.equal(render().uploadConfirm, null);
  assert.equal(promoteBodies.length, 1);
  await render().confirmPromotion();
  assert.deepEqual(promoteBodies[1].acknowledged_edited_lore_ids, [editedA.id]);
  assert.deepEqual(render().pendingConfirm.editedLores, [editedA, editedB]);
  await render().confirmPromotion();
  assert.deepEqual(promoteBodies[2].acknowledged_edited_lore_ids, [editedA.id, editedB.id]);
  assert.equal(render().pendingConfirm, null);

  for (const finalStatus of ["cancel", 409, 500]) {
    let calls = 0;
    reset(async (_url, init = {}) => {
      if (!init.method) return Response.json({ topics: [topic("A-topic")] });
      calls++;
      return calls === 1 ? needsConfirm([editedA]) : Response.json({ error: "failed" }, { status: finalStatus });
    });
    render(); effects(); await flush();
    await render().promote(topic("A-topic"));
    if (finalStatus === "cancel") { render().cancelPromotionConfirm(); assert.equal(calls, 1); }
    else await render().confirmPromotion();
    assert.equal(render().pendingConfirm !== null, finalStatus === 500, "revision conflict is terminal; transient failure can retry");
  }
  let finishConfirmation;
  let confirmationCalls = 0;
  reset(async (_url, init = {}) => {
    if (!init.method) return Response.json({ topics: [topic("A-topic")] });
    confirmationCalls++;
    return confirmationCalls === 1 ? needsConfirm([editedA]) : new Promise((resolve) => { finishConfirmation = resolve; });
  });
  render(); effects(); await flush();
  await render().promote(topic("A-topic"));
  const confirming = render().confirmPromotion();
  void render().confirmPromotion();
  render().cancelPromotionConfirm();
  assert.ok(render().pendingConfirm, "cannot cancel in flight");
  await flush();
  assert.equal(confirmationCalls, 2, "rapid confirm starts one POST");
  finishConfirmation(needsConfirm([editedA, editedB])); await confirming;
  render({ projectId: "B" }); effects(); await flush();
  assert.equal(render({ projectId: "B" }).pendingConfirm, null);

  for (const options of [{ projectId: "B" }, { enabled: false }]) {
    let resolveLate;
    reset(async (_url, init = {}) => !init.method ? Response.json({ topics: [topic("A-topic")] })
      : new Promise((resolve) => { resolveLate = resolve; }));
    render(); effects(); await flush();
    const late = render().promote(topic("A-topic")); await flush();
    render(options); effects(); await flush();
    resolveLate(needsConfirm([editedA])); await late;
    assert.equal(render(options).pendingConfirm, null, "late confirmation does not restore old project state");
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
  const { PROJECT_MEMORY_CHAT_MAX_CHARS } = require("../lib/project-memory/chat-inclusion-limits.ts");
  const limitMessage = `チャット注入の上限（本文合計${PROJECT_MEMORY_CHAT_MAX_CHARS.toLocaleString("ja-JP")}字）を超えるため、ONにできません。`;
  const toggleCases = [
    [200, {}, null],
    [409, { code: "chat_inclusion_limit_exceeded", error: "raw English" }, limitMessage],
    [400, { error: "raw English" }, "本文が空のtopicはONにできません。"],
    [404, { error: "raw English" }, "対象のtopicが見つかりませんでした。一覧を更新しました。"],
    [409, { code: "unknown", error: "raw English" }, "チャット注入の設定に失敗しました"],
    [500, { error: "raw English" }, "チャット注入の設定に失敗しました"],
    ["network", null, "チャット注入の設定に失敗しました"],
  ];
  for (const [status, body, message] of toggleCases) {
    const calls = [];
    let reloads = 0;
    reset(async (url, init = {}) => {
      calls.push({ url, init });
      if (!init.method) {
        reloads++;
        if (reloads > 1) assert.equal(render().error, null, "reload clears error before final Japanese error is set");
        return Response.json({ topics: [{ ...topic("A-topic"), include_in_chat: status === 200 }] });
      }
      if (status === "network") throw new Error("private network failure");
      return Response.json(body, { status });
    });
    render(); effects(); await flush();
    await render().setChatInclusion(topic("A-topic"), true);
    const patch = calls.find(call => call.init.method);
    assert.equal(patch.url, "/api/projects/A/memory/topics/A-topic/chat-inclusion");
    assert.equal(patch.init.method, "PATCH");
    assert.deepEqual(JSON.parse(patch.init.body), { include: true });
    assert.equal(reloads, 2, `${status} reloads before error`);
    assert.equal(render().error, message);
    assert.equal(render().chatInclusionTopicId, null);
    assert.equal(render().topics[0].include_in_chat, status === 200);
  }
  let toggleCalls = [];
  reset(async (url, init = {}) => {
    if (!init.method) return getResponse();
    toggleCalls.push({ url, body: JSON.parse(init.body) });
    return Response.json({ topic: { id: "a/b", include_in_chat: false }, included_chars: 0 });
  });
  render(); effects(); await flush();
  await render().setChatInclusion(topic("A-topic"), false);
  await render().setChatInclusion({ ...topic("A-topic"), content_md: " \n\t" }, true);
  assert.equal(toggleCalls.length, 0, "same value and empty ON are no-ops");
  await render().setChatInclusion({ ...topic("a/b"), content_md: " \n\t", include_in_chat: true }, false);
  assert.equal(toggleCalls[0].url, "/api/projects/A/memory/topics/a%2Fb/chat-inclusion");
  assert.deepEqual(toggleCalls[0].body, { include: false }, "empty ON topic can turn OFF");
  render({ enabled: false }); effects();
  await render({ enabled: false }).setChatInclusion(topic("A-topic"), true);
  assert.equal(toggleCalls.length, 1, "disabled hook never starts a toggle");

  // Both directions share the same synchronous lock; stale upload closures must also be blocked.
  let finishToggle;
  let togglePatches = 0, nonToggleWrites = 0;
  reset(async (url, init = {}) => {
    if (!init.method) return getResponse();
    if (!url.endsWith("/chat-inclusion")) { nonToggleWrites++; return Response.json({}); }
    togglePatches++;
    return new Promise(resolve => { finishToggle = () => resolve(Response.json({ topic: { id: "A-topic", include_in_chat: true }, included_chars: 7 })); });
  });
  render(); effects(); await flush();
  await render().selectUploadFile(file("new.md", "New"));
  const uploadClosure = render();
  uploadClosure.cancelUploadConfirm();
  const toggleClosure = render();
  const toggling = toggleClosure.setChatInclusion(topic("A-topic"), true);
  await toggleClosure.setChatInclusion(topic("A-topic"), true);
  assert.equal(togglePatches, 1, "rapid clicks start one PATCH before render");
  assert.equal(render().chatInclusionTopicId, "A-topic");
  assert.equal(render().isActionLocked(), true);
  assert.equal(render().topics[0].include_in_chat, false, "no optimistic update");
  await render().promote(topic("A-topic"));
  let reads = 0;
  await render().selectUploadFile({ name: "new.md", async text() { reads++; return "New"; } });
  await uploadClosure.executeUpload();
  render().openInstructionEdit(topic("A-topic"));
  assert.equal(nonToggleWrites, 0);
  assert.equal(reads, 0, "toggle blocks the upload's start guard");
  assert.equal(render().instructionEdit, null);
  assert.equal(render().uploadConfirm, null);
  finishToggle(); await toggling;
  assert.equal(render().isActionLocked(), false);
  for (const action of ["promote", "upload", "edit"]) {
    let finishAction;
    let patches = 0;
    reset(async (url, init = {}) => {
      if (!init.method) return getResponse();
      if (url.endsWith("/chat-inclusion")) { patches++; return Response.json({}); }
      return new Promise(resolve => { finishAction = () => resolve(new Response(null, { status: action === "upload" ? 201 : 200 })); });
    });
    render(); effects(); await flush();
    let inFlight;
    if (action === "promote") { inFlight = render().promote(topic("A-topic")); await flush(); }
    else if (action === "upload") { await render().selectUploadFile(file("new.md", "New")); inFlight = render().executeUpload(); }
    else render().openInstructionEdit(topic("A-topic"));
    await render().setChatInclusion(topic("A-topic"), true);
    assert.equal(patches, 0, `${action} blocks toggle`);
    assert.equal(render().chatInclusionTopicId, null);
    if (inFlight) { finishAction(); await inFlight; }
    else render().closeInstructionEdit();
  }

  // Check each async boundary; stale completions must not even call state setters.
  for (const boundary of ["fetch", "json", "reload"]) {
    for (const options of [{ projectId: "B" }, { enabled: false }]) {
      let finishLate;
      let getCount = 0;
      reset(async (url, init = {}) => {
        if (!init.method) {
          getCount++;
          if (boundary === "reload" && getCount === 2) {
            return new Promise(resolve => { finishLate = () => resolve(Response.json({ topics: [topic("A-late")] })); });
          }
          return Response.json({ topics: [topic(url.includes("/B/") ? "B-topic" : "A-topic")] });
        }
        if (boundary === "fetch") return new Promise(resolve => { finishLate = () => resolve(Response.json({ code: "chat_inclusion_limit_exceeded" }, { status: 409 })); });
        if (boundary === "json") return { status: 409, json: () => new Promise(resolve => { finishLate = () => resolve({ code: "chat_inclusion_limit_exceeded" }); }) };
        return Response.json({ code: "chat_inclusion_limit_exceeded" }, { status: 409 });
      });
      render(); effects(); await flush();
      const late = render().setChatInclusion(topic("A-topic"), true);
      await flush();
      render(options); effects(); await flush();
      const before = render(options);
      const settersBefore = stateChanges;
      finishLate(); await late;
      assert.equal(stateChanges, settersBefore, `${boundary} stale completion does not change any state`);
      const after = render(options);
      assert.deepEqual(after.topics, before.topics);
      assert.equal(after.error, before.error);
      assert.equal(after.chatInclusionTopicId, null);
      assert.equal(after.isActionLocked(), false);
      if (options.projectId) assert.equal(after.topics[0].id, "B-topic");
    }
  }
  // Queue the project switch while reload commits its result. The queued switch runs
  // after reload finishes, but before setChatInclusion resumes to set the error.
  reset(async (url, init = {}) => init.method
    ? Response.json({ code: "chat_inclusion_limit_exceeded" }, { status: 409 })
    : Response.json({ topics: [topic(url.includes("/B/") ? "B-topic" : "A-topic")] }));
  render(); effects(); await flush();
  let switchedAfterReload = false;
  onStateChange = value => {
    if (value?.projectId !== "A") return;
    onStateChange = null;
    queueMicrotask(() => { switchedAfterReload = true; render({ projectId: "B" }); effects(); });
  };
  await render().setChatInclusion(topic("A-topic"), true);
  await flush();
  assert.equal(switchedAfterReload, true);
  assert.equal(render({ projectId: "B" }).topics[0].id, "B-topic");
  assert.equal(render({ projectId: "B" }).error, null, "A's limit error cannot remain on B after reload");
  assert.equal(render({ projectId: "B" }).chatInclusionTopicId, null);

  let finishUnmount;
  reset(async (_url, init = {}) => !init.method ? getResponse() : new Promise(resolve => { finishUnmount = resolve; }));
  render(); effects(); await flush();
  const unmounted = render().setChatInclusion(topic("A-topic"), true);
  for (const cleanup of cleanups) cleanup?.();
  const settersBeforeUnmount = stateChanges;
  finishUnmount(Response.json({})); await unmounted;
  assert.equal(stateChanges, settersBeforeUnmount, "unmount invalidates late toggle");
  console.log("ok - chat inclusion success, errors after reload, synchronous locks, no-ops and all stale async boundaries");
  console.log("ok - instruction edit lock, transitions, cancellation, apply, invalidation, and upload race");
  console.log("ok - useProjectMemoryTopics cache, request invalidation, and reload conditions");
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch;
  Module._load = originalLoad;
});
