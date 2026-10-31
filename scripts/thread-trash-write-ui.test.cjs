const assert = require('node:assert/strict');
const { test } = require('node:test');
const { installTsLoader } = require('./testBootstrap.cjs');
const { pageCallback, fileCallback, deferred, tick } = require('./thread-trash-ui-test-helpers.cjs');
installTsLoader();
require("./testBootstrap.cjs").installAliasResolver();
const client = require('../lib/threads/trash-client.ts');
const { isViewCurrent } = require('../lib/threads/view-guard.ts');
const trashResponse = () => Response.json({ error: 'thread is in trash' }, { status: 409 });
const message = { id: 'm', thread_id: 't', content: 'hello', role: 'user', provider: 'user', created_at: '2026-10-25T00:00:00Z', metadata: { storagePath: 'u/t/img' } };
const { resolveWebSearch } = require("../lib/webSearchPreference.ts");
const { resolveRichDisplay } = require("../lib/richDisplayPreference.ts");
const { getDefaultModel } = require("../lib/modelRegistry.ts");
function setup() {
  const state = { inputValue: '', messages: [message], tags: [{ id: 'tag' }], showDialog: true,
    notes: [], drafts: [], messageNotes: [], tagInputValue: 'old tag', showTagInput: false };
  const notices = [], alerts = [], calls = [], updates = [];
  const c = {
    ...client, isViewCurrent,
    resolveWebSearch, resolveRichDisplay, getDefaultModel, webSearchPreference: false, richDisplayPreference: false, setWebSearchingState() {}, activeThreadId: 't', activeThreadIdRef: { current: 't' }, viewEpochRef: { current: 1 },
    isTemporaryRef: { current: false }, generationViewRef: { current: null }, abortReasonRef: { current: null }, abortControllerRef: { current: null },
    activeThread: {}, thread: { id: 't', title: 'title' }, messages: [message], temporaryMessages: [], isTemporary: false, isLoading: false,
    inputValue: '  original text  ', provider: 'claude', isImagePinned: false, imageContextId: null,
    uuidv4: () => 'new', crypto: { randomUUID: () => 'new' }, loadModel: () => 'model', getDefaultImageModel: () => 'image-model',
    console: { error() {} }, localStorage: { getItem() {}, setItem() {}, removeItem() {} },
    window: { confirm: () => true, location: { href: '/' } }, alert: text => alerts.push(text),
    getApiKeyHeaders: async () => ({}), fetchThreads: async () => [], selectThread: async () => {},
    retention: { get: () => null, remember() {} }, replaceQueryText: () => null,
    buildApiKeyHeaders: async () => ({ 'x-claude-api-key': 'test', 'x-openai-api-key': 'test' }),
    API_KEY_HEADER_NAMES: { claude: 'x-claude-api-key', openai: 'x-openai-api-key' }, webApiKeyStore: {}, apiKeyStore: {},
    showToast: (...args) => notices.push(args),
    fetch: async (url, init) => { calls.push([url, init]); return init?.method ? trashResponse() : Response.json([]); },
    webApiClient: { request: async (url, init) => { calls.push([url, init]); return trashResponse(); } },
    isExtracting: false, threads: [], displayThreads: [],
    tagInputValue: 'old tag', tagSubmittingRef: { current: false }, normalizeTagName: s => s.trim(), TAG_NAME_MAX_LENGTH: 30,
    tags: [{ id: 'tag' }], newNoteContent: 'note', editingNoteContent: 'note',
    editTitle: 'new title', shareSaving: false, systemPromptDraft: 'prompt',
    onThreadUpdate: (...args) => updates.push(args), onTitleUpdate: (...args) => updates.push(args),
  };
  for (const field of ['inputValue', 'messages', 'temporaryMessages', 'isLoading', 'streamingContent', 'githubProgressMessages',
    'githubProgressState', 'thinkingContents', 'imageContextId', 'imageRefId', 'imageRefUpload', 'isImagePinned',
    'searchMatchIds', 'searchMatchIndex', 'activeThreadId', 'isTemporary', 'isExtracting', 'isNovelPaneOpen', 'isOutlineOpen',
    'tags', 'tagInputValue', 'showTagInput', 'showDialog', 'notes', 'editingNoteId', 'newNoteContent', 'messageNotes', 'drafts',
    'shareSaving', 'sharePublic', 'shareHideMemos', 'shareAllowPromptFork', 'shareGenre', 'systemPromptSaving', 'rpSaving', 'likeStatus']) {
    c[`set${field[0].toUpperCase()}${field.slice(1)}`] = value => {
      state[field] = typeof value === 'function' ? value(state[field]) : value;
    };
  }
  c.captureView = pageCallback('captureView', c); c.isCurrentView = pageCallback('isCurrentView', c);
  c.commitActiveThread = pageCallback('commitActiveThread', c);
  c.persistAbortedMessages = pageCallback('persistAbortedMessages', c);
  c.captureViewGuard = () => { const view = c.captureView(); return () => c.isCurrentView(view); };
  return { c, state, notices, alerts, calls, updates };
}
function common(notices) {
  assert.equal(notices.length, 1); assert.equal(notices[0][0], 'このスレッドはゴミ箱にあります');
  assert.equal(notices[0][2].action.label, 'ゴミ箱を開く');
}
for (const query of [undefined, 'raw input', '']) test(`normal 409 restores queryText=${JSON.stringify(query)} without expanding attachments`, async () => {
  const { c, state, notices } = setup();
  c.fetchWithStreaming = async () => { throw new client.ThreadWriteError(409, 'thread is in trash'); };
  await pageCallback('handleSubmit', c)('content + attachment', undefined, [], false, query);
  assert.equal(state.inputValue, query ?? 'content + attachment'); assert.equal(state.isLoading, false); common(notices);
});
test('409 cannot overwrite new typing or restore into a switched view', async () => {
  for (const switched of [false, true]) {
    const { c, state, notices } = setup(), stream = deferred(); c.fetchWithStreaming = () => stream.promise;
    const pending = pageCallback('handleSubmit', c)('old'); await tick();
    state.inputValue = 'new typing'; if (switched) c.commitActiveThread('other');
    stream.reject(new client.ThreadWriteError(409, 'thread is in trash')); await pending;
    assert.equal(state.inputValue, 'new typing'); assert.equal(notices.length, switched ? 0 : 1);
  }
});
test('normal 500 keeps the old generic toast and does not restore input', async () => {
  const { c, state, notices } = setup();
  c.fetchWithStreaming = async () => { throw new client.ThreadWriteError(500, 'thread is in trash'); };
  await pageCallback('handleSubmit', c)('old'); assert.equal(state.inputValue, '');
  assert.equal(notices[0][0], 'メッセージの送信に失敗しました');
});
test('memo 409 removes optimistic memo and restores original untrimmed hand input', async () => {
  const { c, state, notices } = setup(); await pageCallback('handleMemoSubmit', c)();
  assert.equal(state.messages.length, 1); assert.equal(state.messages[0], message);
  assert.equal(state.inputValue, '  original text  '); common(notices);
});
for (const status of [409, 500]) test(`image pre-memo ${status} stops before image generation and clears loading`, async () => {
  const { c, state, calls, notices } = setup();
  c.webApiClient.request = async (url, init) => {
    calls.push([url, init]); return status === 409 ? trashResponse() : new Response(null, { status });
  };
  await pageCallback('handleImageGenerate', c)('draw');
  assert.equal(calls.length, 1); assert.equal(calls[0][0], '/api/chat'); assert.equal(state.isLoading, false);
  assert.equal(state.messages.length, 1); if (status === 409) common(notices); else assert.equal(notices[0][0], '画像の生成に失敗しました');
});

for (const reason of ['thread-trashed', 'user', null]) for (const status of [409, 500]) {
  test(`aborted PATCH ${status}, reason=${reason}: synchronizes and chooses notification`, async () => {
    const { c, state, notices, calls } = setup(); c.abortReasonRef.current = reason;
    c.fetch = async (url, init) => {
      calls.push([url, init]); return init?.method ? status === 409 ? trashResponse() : new Response(null, { status }) : Response.json([{ id: 'canonical' }]);
    };
    assert.equal(await c.persistAbortedMessages('t', [message], c.captureView(), 'generic failure'), false);
    assert.equal(state.messages[0].id, 'canonical'); assert.equal(calls.length, 2);
    if (reason === 'thread-trashed') assert.equal(notices.length, 0);
    else if (status === 409) common(notices); else assert.equal(notices[0][0], 'generic failure');
  });
}
test('partial aborted PATCH waits for both results, prioritizes trash and performs one canonical read', async () => {
  const { c, state, notices, calls } = setup(), second = deferred();
  c.fetch = async (url, init) => {
    calls.push([url, init]);
    if (!init?.method) return Response.json([{ id: 'canonical' }]);
    return url.endsWith('/second') ? second.promise : new Response(null, { status: 500 });
  };
  const pending = c.persistAbortedMessages('t', [message, { id: 'second' }], c.captureView(), 'generic');
  await tick(); assert.equal(calls.length, 2);
  second.resolve(trashResponse()); await pending;
  common(notices); assert.equal(state.messages[0].id, 'canonical'); assert.equal(calls.length, 3);
});
test('failed canonical re-read never fabricates a successful memo after PATCH failure', async () => {
  const { c, state, notices } = setup();
  c.fetch = async (_url, init) => init?.method ? trashResponse() : new Response(null, { status: 500 });
  assert.equal(await c.persistAbortedMessages('t', [message], c.captureView(), 'generic'), false);
  assert.equal(state.messages.length, 1); assert.equal(state.messages[0].provider, 'user'); common(notices);
});
test('aborted memo is shown only after PATCH success; failure never leaves optimistic memo', async () => {
  for (const success of [false, true]) {
    const { c, state } = setup(); c.fetchWithStreaming = async () => ({ userMessage: { id: 'u' }, assistantMessage: { id: 'a' }, aborted: true });
    c.fetch = async (_url, init) => init?.method ? success ? Response.json({}) : trashResponse() : Response.json([]);
    await pageCallback('handleSubmit', c)('hello');
    assert.equal(state.messages.length, success ? 3 : 0);
    if (success) assert.equal(state.messages[1].provider, 'memo');
    assert.equal(c.abortReasonRef.current, null);
  }
});
for (const handler of ['handleRegenerate', 'handleEditAndRegenerate']) test(`${handler} 409 notifies and re-GETs messages`, async () => {
  const { c, state, notices, calls } = setup(), assistant = { id: 'a', role: 'assistant', content: 'answer' };
  c.messages = [message, assistant];
  c.fetchWithStreaming = async () => { throw new client.ThreadWriteError(409, 'thread is in trash'); };
  const callback = pageCallback(handler, c);
  if (handler === 'handleRegenerate') await callback('claude', assistant, undefined, 'light');
  else await callback(message, 'edit', 'claude');
  common(notices); assert.ok(calls.some(([, init]) => !init?.method)); assert.equal(state.isLoading, false);
});

for (const [name, args] of [
  ['handleDeleteMessage', [message]], ['handleTrimFrom', [message]], ['handleDeleteImage', [message]],
  ['handleMemoizeMessage', [message]], ['handleRestoreBranch', ['root', 0]], ['handleCopyThread', ['t']],
  ['handleBranchToNewChat', [message]], ['handleExtractSettings', []], ['handleUpdateFolder', ['t', null]],
]) test(`${name}: exact 409 uses common toast and no old generic alert`, async () => {
  const { c, notices, alerts } = setup(); await pageCallback(name, c)(...args); common(notices); assert.equal(alerts.length, 0);
});
test('message update 409 notifies but still rejects for the bubble rollback; 404 stays 404', async () => {
  const { c, notices, state } = setup();
  await assert.rejects(pageCallback('handleUpdateMessage', c)('m', { content: 'edit' }), client.isThreadTrashWriteError);
  common(notices); assert.equal(state.messages[0].content, 'hello');
  c.fetch = async () => Response.json({ error: 'thread not found' }, { status: 404 }); notices.length = 0;
  await assert.rejects(pageCallback('handleUpdateMessage', c)('m', { content: 'edit' }), e => e.status === 404);
  assert.equal(notices.length, 0);
});
test('restore-branch thread-not-found 404 retains its generic failure and is never treated as trash', async () => {
  const { c, notices } = setup();
  c.fetch = async () => Response.json({ error: 'thread not found' }, { status: 404 });
  await pageCallback('handleRestoreBranch', c)('root', 0);
  assert.equal(notices.length, 1); assert.equal(notices[0][0], 'ブランチの復元に失敗しました'); assert.equal(notices[0][2], undefined);
});

const panel = (name, c) => fileCallback('components/ChatPanel.tsx', name, c);
for (const [name, args] of [
  ['handleSaveShare', [true, false, true]], ['handlePushLatest', []], ['handleSaveSystemPrompt', []],
  ['handleSaveRoleplay', [true, 'character', null]], ['handleDeleteTag', ['tag']], ['handleAddNote', []],
  ['handleUpdateNote', ['note']], ['handleDeleteNote', ['note']], ['handleAddMessageNote', ['m', 'note']],
  ['handleDeleteMessageNote', ['note']], ['handleSaveDraft', []], ['handleDeleteDraft', ['draft']],
]) test(`ChatPanel ${name}: 409 uses common toast and no success callback`, async () => {
  const { c, notices, updates } = setup(); await panel(name, c)(...args); common(notices); assert.equal(updates.length, 0);
});
test('tag 409 restores its input without overwriting new typing or the next view', async () => {
  for (const next of ['empty', 'typing', 'other view']) {
    const { c, state, notices } = setup(), request = deferred(); c.fetch = () => request.promise;
    const pending = panel('handleAddTag', c)();
    state.tagInputValue = next === 'typing' ? 'new tag' : ''; if (next === 'other view') c.commitActiveThread('other');
    request.resolve(trashResponse()); await pending;
    assert.equal(state.tagInputValue, next === 'empty' ? 'old tag' : next === 'typing' ? 'new tag' : '');
    assert.equal(notices.length, next === 'other view' ? 0 : 1); assert.equal(c.tagSubmittingRef.current, false);
  }
});
for (const kind of ['409', '500', 'network', 'success']) test(`title save ${kind}: closes and updates only on success`, async () => {
  const { c, state, updates, notices } = setup();
  c.fetch = async () => {
    if (kind === 'network') throw new Error('offline');
    return kind === '409' ? trashResponse() : Response.json({}, { status: kind === '500' ? 500 : 200 });
  };
  await panel('handleSaveTitle', c)(); assert.equal(updates.length, kind === 'success' ? 1 : 0);
  assert.equal(state.showDialog, kind !== 'success');
  if (kind === '409') common(notices);
  else if (kind !== 'success') assert.equal(notices[0][0], 'タイトルの保存に失敗しました');
});
test('Lore like 409 uses common toast and resets like status', async () => {
  const { c, state, notices, alerts } = setup(); c.likeStatus = 'idle'; c.message = message;
  await fileCallback('components/MessageBubble.tsx', 'handleLike', c)();
  common(notices); assert.equal(state.likeStatus, 'idle'); assert.equal(alerts.length, 0);
});
test('both bubble editors keep editing and avoid duplicate generic alerts after the page notifies trash', async () => {
  for (const component of ['MessageBubble', 'RoleplayBubble']) for (const trash of [false, true]) {
    const { c, alerts } = setup(); let editing = true;
    Object.assign(c, { message, editContent: 'edit', isSavingEdit: false,
      setIsSavingEdit() {}, setIsEditing: value => { editing = value; },
      onUpdateMessage: async () => { throw trash ? new client.ThreadWriteError(409, 'thread is in trash') : new Error('offline'); } });
    await fileCallback(`components/${component}.tsx`, 'handleSaveEdit', c)();
    assert.equal(editing, true); assert.equal(alerts.length, trash ? 0 : 1);
  }
});

test('Arena DELETE 409 stops without the timeTravel fallback; generic 500 still falls back', async () => {
  for (const status of [409, 500]) {
    const { c, notices, calls } = setup(); Object.assign(c, { isRunning: false, waitingForHuman: null, threadId: 't',
      players: [], messagesRef: { current: [message] }, calcTotalTurns: () => 0, setTotalTurns() {}, setActionQueue() {} });
    c.fetch = async () => status === 409 ? trashResponse() : new Response(null, { status });
    c.webApiClient.request = async (url, init) => { calls.push([url, init]); return Response.json({}); };
    await fileCallback('app/arena/page.tsx', 'handleTimeTravel', c)(message);
    assert.equal(calls.length, status === 409 ? 0 : 1); if (status === 409) common(notices);
  }
});
test('Arena human 409 keeps input and queue; share 409 keeps token unchanged', async () => {
  for (const name of ['handleHumanSubmit', 'handleShare']) {
    const { c, notices, alerts } = setup(); Object.assign(c, { threadId: 't', humanInputText: 'hello', waitingForHuman: 0,
      playerLabels: ['AI1'], config: {}, isSharing: false, setIsSharing() {}, setShareToken() { assert.fail('no success token'); },
      setHumanInputText() { assert.fail('no input clear'); }, setActionQueue() { assert.fail('no queue consumption'); } });
    await fileCallback('app/arena/page.tsx', name, c)(); common(notices); assert.equal(alerts.length, 0);
  }
});
test('Arena AI turn propagates the typed trash error for the queue catch', async () => {
  const { c } = setup(); Object.assign(c, { threadId: 't', playerLabels: ['AI1'], setThinkingLabel() {}, setThinkingIsAi1() {} });
  await assert.rejects(fileCallback('app/arena/page.tsx', 'runOneTurn', c)([], { provider: 'claude' }, 0, true, 'topic'), client.isThreadTrashWriteError);
});
for (const failing of [0, 1, 2]) for (const status of [409, 500]) test(`novel save request ${failing + 1} returns ${status}: stops and never navigates`, async () => {
  const { c, calls, notices, alerts } = setup(); let saved = true;
  Object.assign(c, { result: 'result', isSaving: false, saveTitle: 'title', files: [], checkItems: [], totalChars: 0,
    setIsSaving: value => { saved = value; } });
  c.fetch = async (url, init) => {
    const index = calls.length; calls.push([url, init]);
    return index === failing ? status === 409 ? trashResponse() : new Response(null, { status }) : Response.json({});
  };
  await fileCallback('app/novel-check/page.tsx', 'handleSave', c)();
  assert.equal(calls.length, failing + 1); assert.equal(c.window.location.href, '/'); assert.equal(saved, false);
  if (status === 409) { common(notices); assert.equal(alerts.length, 0); } else assert.match(alerts[0], /保存に失敗しました/);
});
test('novel save navigates only after all three successful responses', async () => {
  const { c, calls } = setup(); Object.assign(c, { result: 'result', isSaving: false, saveTitle: 'title', files: [], checkItems: [], totalChars: 0, setIsSaving() {} });
  c.fetch = async (url, init) => { calls.push([url, init]); return Response.json({}); };
  await fileCallback('app/novel-check/page.tsx', 'handleSave', c)();
  assert.equal(calls.length, 3); assert.equal(c.window.location.href, '/?thread=new');
});
