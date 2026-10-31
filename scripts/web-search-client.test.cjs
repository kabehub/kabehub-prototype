const assert = require('node:assert/strict');
const { test } = require('node:test');
const { installTsLoader, installAliasResolver } = require('./testBootstrap.cjs');
const { pageCallback, fileCallback, deferred, tick, source } = require('./thread-trash-ui-test-helpers.cjs');
installTsLoader({ jsx: true }); installAliasResolver();
const { resolveWebSearch } = require('../lib/webSearchPreference.ts');
const { resolveRichDisplay } = require("../lib/richDisplayPreference.ts");
const { parseMessageSources } = require('../lib/sourceChips.ts');
const { getDefaultModel } = require('../lib/modelRegistry.ts');
const { buildMessageWithTextFiles } = require('../lib/attachmentContent.ts');
const { canUseDeepThinking } = require('../components/ChatInput.tsx');
const trash = require('../lib/threads/trash-client.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const sources = { v: 1, provider: 'claude', items: [{ url: 'https://example.com/', title: 'Title', domain: 'example.com' }] };
const old = { id: 'a', thread_id: 't', role: 'assistant', content: 'old answer', provider: 'claude', model_id: 'claude-opus-4-6', metadata: { sources, copied_from_message_id: 'keep' }, created_at: 'now' };
const user = { id: 'u', role: 'user', content: 'question', provider: 'user' };
function setup(options = {}) {
  const state = { messages: [user, structuredClone(old)], temporaryMessages: [], loading: false, searching: false, threadId: 't', epoch: 0 };
  const bodies = [], rawBodies = [], calls = [], notices = [];
  const c = {
    ...trash, resolveWebSearch, resolveRichDisplay, getDefaultModel, parseMessageSources,
    richDisplayPreference: options.richDisplayPreference ?? false,
    webSearchPreference: options.preference ?? false, isTemporary: !!options.temporary, isTemporaryRef: { current: !!options.temporary },
    activeThreadId: 't', activeThread: { roleplay_mode: !!options.roleplay }, messages: state.messages, temporaryMessages: [],
    provider: 'claude', isLoading: false, isImagePinned: false, imageContextId: null,
    generationViewRef: { current: null }, abortReasonRef: { current: null }, abortControllerRef: { current: null },
    captureView: () => ({ epoch: state.epoch, threadId: state.threadId }),
    isCurrentView: view => view.epoch === state.epoch && view.threadId === state.threadId,
    setMessages(value) { state.messages = typeof value === 'function' ? value(state.messages) : value; },
    setTemporaryMessages(value) { state.temporaryMessages = typeof value === 'function' ? value(state.temporaryMessages) : value; },
    setWebSearchingState(value) { state.searching = value; }, setIsLoading(value) { state.loading = value; },
    setStreamingContent() {}, setGithubProgressMessages() {}, setThinkingContents() {}, setInputValue() {}, setImageContextId() {},
    retention: { get: () => null, remember() {} }, getApiKeyHeaders: async () => ({}),
    loadModel: () => 'claude-sonnet-4-5', crypto: { randomUUID: () => 'branch-id' }, uuidv4: () => 'uuid',
    showToast: (...values) => notices.push(values), console: { error() {} }, fetchThreads: async () => [],
    persistAbortedMessages: async () => true,
    fetch: async (url, init) => {
      calls.push([url, init]);
      if (init?.method === 'PATCH') return Response.json({});
      if (options.sync === 'network') throw new Error('network failure');
      if (options.sync === 'http') return new Response(null, { status: 500 });
      return Response.json(options.sync === 'missing' ? [user] : options.dbRows ?? [user, old]);
    },
    fetchWithStreaming: async (url, headers, body) => {
      bodies.push(JSON.parse(body)); rawBodies.push(body);
      return { userMessage: user, assistantMessage: { ...old, content: 'STREAM answer', metadata: { sources } }, aborted: !!options.aborted };
    },
    webApiClient: { request: async (url, init) => {
      bodies.push(JSON.parse(init.body)); rawBodies.push(init.body);
      return Response.json({ userMessage: user, assistantMessage: { ...old, content: 'temporary', metadata: { sources } } });
    } },
  };
  return { c, state, bodies, rawBodies, calls, notices };
}

for (const preference of [false, true]) test(`all five request paths omit OFF or include true only when requested, preference=${preference}`, async () => {
  for (const kind of ['normal', 'temporary', 'branch', 'light', 'edit']) {
    const s = setup({ preference, temporary: kind === 'temporary' });
    if (['normal', 'temporary'].includes(kind)) await pageCallback('handleSubmit', s.c)('question', 'claude-sonnet-4-5', undefined, false, 'question', { webSearch: preference });
    else if (kind === 'edit') await pageCallback('handleEditAndRegenerate', s.c)(user, 'edited', 'claude');
    else await pageCallback('handleRegenerate', s.c)('claude', s.c.messages[1], undefined, kind);
    assert.equal(s.bodies.length, 1, kind);
    assert.equal(Object.hasOwn(s.bodies[0], 'webSearch'), preference, kind);
    if (preference) assert.equal(s.bodies[0].webSearch, true);
    if (kind === 'temporary') {
      assert.equal(s.bodies[0].isTemporary, true);
      assert.deepEqual(plain(s.state.messages.at(-1).metadata), { sources });
      assert.deepEqual(plain(s.state.temporaryMessages.at(-1).metadata), { sources });
      assert.equal(s.calls.length, 0);
    }
  }
});

test('normal submission resolves the body model; regeneration uses server default, never saved model', async () => {
  const s = setup({ preference: true });
  s.c.loadModel = () => { throw new Error('Regeneration must not read stored model'); };
  const models = [];
  s.c.resolveWebSearch = input => { models.push(input.modelId); return resolveWebSearch(input); };
  await pageCallback('handleRegenerate', s.c)('claude', old, undefined, 'light');
  assert.deepEqual(models, [getDefaultModel('claude', 'chat')]);
  const e = setup({ preference: true }); e.c.loadModel = s.c.loadModel;
  e.c.resolveWebSearch = input => { models.push(input.modelId); return resolveWebSearch(input); };
  await pageCallback('handleEditAndRegenerate', e.c)(user, 'edited', 'claude');
  assert.deepEqual(models, [getDefaultModel('claude', 'chat'), getDefaultModel('claude', 'chat')]);
  const unsupported = setup();
  await pageCallback('handleSubmit', unsupported.c)('question', 'unknown', undefined, false, undefined, { webSearch: true });
  assert.equal(Object.hasOwn(unsupported.bodies[0], 'webSearch'), false);
});

test('roleplay rejects search in normal, temporary, regeneration and edit requests', async () => {
  for (const kind of ['normal', 'temporary', 'branch', 'light', 'edit']) {
    const s = setup({ preference: true, roleplay: true, temporary: kind === 'temporary' });
    if (['normal', 'temporary'].includes(kind)) await pageCallback('handleSubmit', s.c)('question', 'claude-sonnet-4-5', undefined, false, undefined, { webSearch: true });
    else if (kind === 'edit') await pageCallback('handleEditAndRegenerate', s.c)(user, 'edited', 'claude');
    else await pageCallback('handleRegenerate', s.c)('claude', old, undefined, kind);
    assert.equal(Object.hasOwn(s.bodies[0], 'webSearch'), false);
  }
});

test('temporary ref guard precedes all regeneration I/O even with stale normal-mode state', async () => {
  for (const name of ['handleRegenerate', 'handleEditAndRegenerate']) {
    const s = setup(); s.c.isTemporaryRef.current = true;
    if (name === 'handleRegenerate') await pageCallback(name, s.c)('claude', old);
    else await pageCallback(name, s.c)(user, 'edited', 'claude');
    assert.equal(s.bodies.length, 0); assert.equal(s.calls.length, 0);
    assert.equal(s.notices[0][0], '一時モードでは再生成できません');
  }
});

test('both inputs preserve all five positional arguments and append only the search options', () => {
  for (const file of ['components/ChatInput.tsx', 'components/ChatInputCentered.tsx']) {
    let args;
    const files = [{ kind: 'text', name: 'note.txt', content: 'attached' }, { kind: 'image', name: 'i', base64: 'bytes', mediaType: 'image/jpeg', previewUrl: 'blob:preview' }];
    const c = { value: ' raw ', provider: 'claude', activeProvider: 'claude', selectedModel: 'claude-sonnet-4-5',
      attachedFiles: files, isDeepThinking: true, canUseDeepThinking: () => true, buildMessageWithTextFiles,
      webSearchPreference: true, webSearchAvailable: true, resolveWebSearch,
      onChange() {}, onSubmit(...value) { args = value; }, setAttachedFiles() {}, setIsPreviewExpanded() {}, URL: { revokeObjectURL() {} },
    };
    fileCallback(file, 'handleSubmit', c)();
    assert.equal(args[0], buildMessageWithTextFiles(c.value, [files[0]]).content);
    assert.equal(args[1], c.selectedModel);
    assert.deepEqual(plain(args[2]), [{ kind: 'image', name: 'i', base64: 'bytes', mediaType: 'image/jpeg' }]);
    assert.equal(args[3], true); assert.equal(args[4], ' raw '); assert.deepEqual(plain(args[5]), { webSearch: true });
  }
});

const meta = deep => ({ type: 'meta', userMessage: user, assistantMessageId: 'a', threadId: 't', provider: 'claude', createdAt: 'now', isDeepThinking: deep });
async function receive(rows, deep = false) {
  const s = setup(); const updates = [], texts = [];
  const view = s.c.captureView(); s.c.generationViewRef.current = view;
  s.c.setWebSearchingState = value => { s.state.searching = value; updates.push(value); };
  s.c.setIsWebSearching = pageCallback('setIsWebSearching', s.c);
  s.c.AbortController = AbortController; s.c.TextDecoder = TextDecoder;
  s.c.webApiClient.request = async () => new Response([meta(deep), ...rows].map(row => JSON.stringify(row) + '\n').join(''));
  const result = await pageCallback('fetchWithStreaming', s.c)('/api/chat', {}, '{}', text => texts.push(text));
  return { ...s, updates, texts, result };
}
test('searching survives thinking, clears on real text/done, and citations attach metadata', async () => {
  const s = await receive([{ type: 'searching' }, { type: 'chunk', text: '{"kind":"thinking","text":"thinking"}\n' },
    { type: 'chunk', text: '{"kind":"text","text":"answer"}\n' }, { type: 'citations', sources }, { type: 'done', aborted: false }], true);
  assert.deepEqual(s.updates, [true, false, false]); assert.equal(s.result.thinkingContent, 'thinking');
  assert.equal(s.result.assistantMessage.content, 'answer'); assert.deepEqual(plain(s.result.assistantMessage.metadata), { sources });
  const empty = await receive([{ type: 'searching' }, { type: 'chunk', text: '' }, { type: 'done', aborted: false }]);
  assert.deepEqual(empty.updates, [true, false]);
});
test('malformed citations are ignored and old chunk/done fixtures produce no metadata key', async () => {
  for (const bad of [{ ...sources, v: 2 }, { ...sources, items: {} }, { ...sources, items: [{ url: 1, title: 'x', domain: 'x' }] }]) {
    const s = await receive([{ type: 'citations', sources: bad }, { type: 'chunk', text: 'old' }, { type: 'done', aborted: false }]);
    assert.equal(s.result.assistantMessage.content, 'old'); assert.equal(Object.hasOwn(s.result.assistantMessage, 'metadata'), false);
  }
  const s = await receive([{ type: 'chunk', text: 'first' }, { type: 'chunk', text: ' second' }, { type: 'done', aborted: false }]);
  assert.deepEqual(s.texts, ['first', 'first second']); assert.equal(Object.hasOwn(s.result.assistantMessage, 'metadata'), false);
});

test('late searching/chunk/done from A cannot mutate B, even when a new generation has started', async () => {
  const s = setup(); const emitted = [], encoder = new TextEncoder();
  s.c.AbortController = AbortController; s.c.TextDecoder = TextDecoder;
  s.c.setWebSearchingState = value => { emitted.push(value); s.state.searching = value; };
  s.c.setIsWebSearching = pageCallback('setIsWebSearching', s.c);
  s.c.generationViewRef.current = s.c.captureView();
  let stream;
  s.c.webApiClient.request = async () => new Response(new ReadableStream({ start(value) { stream = value; } }));
  const pending = pageCallback('fetchWithStreaming', s.c)('/api/chat', {}, '{}', () => {});
  await tick();
  stream.enqueue(encoder.encode(JSON.stringify({ type: 'searching' }) + '\n')); await tick();
  assert.equal(s.state.searching, true);
  s.state.threadId = 'B'; s.state.epoch++;
  s.c.generationViewRef.current = s.c.captureView(); s.state.searching = true;
  const count = emitted.length;
  for (const row of [{ type: 'searching' }, { type: 'chunk', text: 'late' }, { type: 'done', aborted: false }]) stream.enqueue(encoder.encode(JSON.stringify(row) + '\n'));
  stream.close(); await pending;
  assert.equal(emitted.length, count); assert.equal(s.state.searching, true);
});
test('an old finally does not clear a newer request or its searching indicator', async () => {
  const s = setup(), io = deferred(); s.c.fetchWithStreaming = () => io.promise;
  const pending = pageCallback('handleSubmit', s.c)('question'); await tick();
  const oldView = s.c.generationViewRef.current;
  s.state.threadId = 'B'; s.state.epoch++;
  const newView = s.c.captureView(); s.c.generationViewRef.current = newView;
  s.state.searching = true; s.state.loading = true;
  io.resolve({ userMessage: user, assistantMessage: old, aborted: false }); await pending;
  assert.notEqual(oldView, newView); assert.equal(s.c.generationViewRef.current, newView);
  assert.equal(s.state.searching, true); assert.equal(s.state.loading, true);
});

for (const failure of ['http', 'network', 'missing']) test(`light sync ${failure} retains all four old fields and notifies`, async () => {
  const s = setup({ sync: failure });
  await pageCallback('handleRegenerate', s.c)('claude', s.c.messages[1], undefined, 'light');
  assert.deepEqual(plain(s.state.messages[1]), old);
  assert.equal(s.notices[0][0], '最新状態を取得できませんでした。ページを再読み込みしてください');
});
test('light completion uses DB content/provider/model/metadata, including server rollback and source removal', async () => {
  for (const row of [old, { ...old, content: 'DB answer', provider: 'gemini', model_id: 'gemini-2.5-flash', metadata: { copied_from_message_id: 'keep' } }]) {
    const s = setup({ dbRows: [user, row] });
    await pageCallback('handleRegenerate', s.c)('claude', s.c.messages[1], undefined, 'light');
    assert.deepEqual(plain(s.state.messages[1]), row);
    assert.equal(s.state.messages[0], user);
    assert.equal(s.calls.at(-1)[1].cache, 'no-store');
  }
});
test('light abort restores metadata and provider alongside content/model without a sync GET', async () => {
  const s = setup({ aborted: true });
  await pageCallback('handleRegenerate', s.c)('gemini', s.c.messages[1], undefined, 'light');
  assert.deepEqual(plain(s.state.messages[1]), old); assert.equal(s.calls.length, 0);
});
test('search setters are reset at every progress-clear site; props and roleplay availability are wired', () => {
  assert.match(source, /isWebSearching=\{isWebSearching\}/);
  for (const match of source.matchAll(/setGithubProgressMessages\(\[\]\);/g)) assert.match(source.slice(match.index, match.index + 110), /setWebSearchingState\(false\)/);
});

// Raw bodies captured from eea4db6 before Phase 2b edits. Do not regenerate from the worktree.
const CLIENT_OFF_GOLDEN = {
  "normal": "{\"threadId\":\"t\",\"queryText\":\"question\",\"messages\":[{\"role\":\"user\",\"content\":\"question\",\"provider\":\"user\"},{\"role\":\"assistant\",\"content\":\"old answer\",\"provider\":\"claude\"}],\"userContent\":\"question\",\"provider\":\"openai\",\"modelId\":\"gpt-5.4-mini\",\"systemPrompt\":\"\",\"attachedImages\":[],\"isDeepThinking\":false}",
  "temporary": "{\"threadId\":null,\"messages\":[{\"role\":\"user\",\"content\":\"question\",\"provider\":\"user\"},{\"role\":\"assistant\",\"content\":\"old answer\",\"provider\":\"claude\"},{\"role\":\"user\",\"content\":\"question\",\"provider\":\"user\"}],\"userContent\":\"question\",\"provider\":\"openai\",\"modelId\":\"gpt-5.4-mini\",\"systemPrompt\":\"\",\"isTemporary\":true,\"attachedImages\":[]}",
  "branch": "{\"threadId\":\"t\",\"messages\":[{\"role\":\"user\",\"content\":\"question\",\"provider\":\"user\"}],\"userContent\":\"question\",\"provider\":\"openai\",\"modelId\":\"gpt-5.4-mini\",\"isRegenerate\":true,\"regenerateMode\":\"branch\",\"systemPrompt\":\"\"}",
  "light": "{\"threadId\":\"t\",\"messages\":[{\"role\":\"user\",\"content\":\"question\",\"provider\":\"user\"}],\"userContent\":\"question\",\"provider\":\"openai\",\"modelId\":\"gpt-5.4-mini\",\"isRegenerate\":true,\"regenerateMode\":\"light\",\"targetMessageId\":\"a\",\"systemPrompt\":\"\"}",
  "edit": "{\"threadId\":\"t\",\"userContent\":\"edited\",\"provider\":\"openai\",\"modelId\":\"gpt-5.4-mini\",\"branchEdit\":{\"baseUserMessageId\":\"u\"},\"systemPrompt\":\"\"}"
};

async function sendOpenAIPath(kind, { preference = true, roleplay = false, provider = 'openai', modelId = 'gpt-5.4-mini', richDisplayPreference = false } = {}) {
  const s = setup({ preference, roleplay, richDisplayPreference, temporary: kind === 'temporary' });
  s.c.provider = provider;
  s.c.loadModel = () => modelId;
  if (['normal', 'temporary'].includes(kind)) await pageCallback('handleSubmit', s.c)('question', modelId, undefined, false, 'question', { webSearch: preference });
  else if (kind === 'edit') await pageCallback('handleEditAndRegenerate', s.c)(user, 'edited', provider, modelId);
  else await pageCallback('handleRegenerate', s.c)(provider, s.c.messages[1], modelId, kind);
  assert.equal(s.bodies.length, 1, kind);
  return s;
}

for (const kind of ['normal', 'temporary', 'branch', 'light', 'edit']) for (const scenario of [
  { name: 'OpenAI supported ON', expected: true },
  { name: 'OpenAI OFF', preference: false, expected: false },
  { name: '4o ON', modelId: 'gpt-4o', expected: false },
  { name: 'Pro ON', modelId: 'gpt-5.5-pro', expected: false },
  { name: 'OpenAI roleplay ON', roleplay: true, expected: false },
  { name: 'Gemini ON', provider: 'gemini', modelId: 'gemini-3.8-flash', expected: false },
]) test(`${kind} request search gating: ${scenario.name}`, async () => {
  const s = await sendOpenAIPath(kind, scenario);
  assert.equal(Object.hasOwn(s.bodies[0], 'webSearch'), scenario.expected);
  if (scenario.expected) assert.equal(s.bodies[0].webSearch, true);
  assert.equal(s.bodies[0].provider, scenario.provider ?? 'openai');
  assert.equal(s.bodies[0].modelId, scenario.modelId ?? 'gpt-5.4-mini');
});

for (const kind of ['branch', 'light', 'edit']) for (const sourceProvider of ['claude', 'gemini']) test(`${kind} regenerates ${sourceProvider} as OpenAI using target server default`, async () => {
  const s = setup({ preference: true });
  s.c.provider = sourceProvider;
  s.c.messages[1].provider = sourceProvider;
  s.c.messages[1].model_id = getDefaultModel(sourceProvider, 'chat');
  s.c.loadModel = () => { throw new Error('Regeneration must not use the current provider stored model'); };
  const resolutions = [];
  s.c.resolveWebSearch = input => { resolutions.push(input); return resolveWebSearch(input); };
  if (kind === 'edit') await pageCallback('handleEditAndRegenerate', s.c)(user, 'edited', 'openai');
  else await pageCallback('handleRegenerate', s.c)('openai', s.c.messages[1], undefined, kind);
  assert.equal(s.bodies.length, 1); assert.equal(s.bodies[0].provider, 'openai'); assert.equal(s.bodies[0].webSearch, true);
  assert.equal(Object.hasOwn(s.bodies[0], 'modelId'), false);
  assert.equal(resolutions[0].provider, 'openai'); assert.equal(resolutions[0].modelId, getDefaultModel('openai', 'chat'));
});

for (const kind of ['branch', 'light', 'edit']) for (const targetProvider of ['claude', 'gemini']) test(`${kind} uses ${targetProvider} target capability when the current provider is OpenAI`, async () => {
  const s = setup({ preference: true }); s.c.provider = 'openai';
  if (kind === 'edit') await pageCallback('handleEditAndRegenerate', s.c)(user, 'edited', targetProvider);
  else await pageCallback('handleRegenerate', s.c)(targetProvider, s.c.messages[1], undefined, kind);
  assert.equal(s.bodies.length, 1); assert.equal(s.bodies[0].provider, targetProvider);
  assert.equal(Object.hasOwn(s.bodies[0], 'webSearch'), targetProvider === 'claude');
  if (targetProvider === 'claude') assert.equal(s.bodies[0].webSearch, true);
});

for (const file of ['components/ChatInput.tsx', 'components/ChatInputCentered.tsx']) test(`${file} submits OpenAI search without enabling stale deep thinking`, () => {
  for (const modelId of ['gpt-5.4-mini', 'gpt-4o', 'gpt-5.5-pro']) for (const preference of [false, true]) {
    let args;
    const files = [{ kind: 'text', name: 'note.txt', content: 'attached' }, { kind: 'image', name: 'i', base64: 'bytes', mediaType: 'image/jpeg', previewUrl: 'blob:preview' }];
    const c = { value: ' raw ', provider: 'openai', activeProvider: 'openai', selectedModel: modelId,
      attachedFiles: files, isDeepThinking: true, canUseDeepThinking, buildMessageWithTextFiles,
      webSearchPreference: preference, webSearchAvailable: true, resolveWebSearch,
      onChange() {}, onSubmit(...value) { args = value; }, setAttachedFiles() {}, setIsPreviewExpanded() {}, URL: { revokeObjectURL() {} },
    };
    fileCallback(file, 'handleSubmit', c)();
    assert.equal(args[0], buildMessageWithTextFiles(c.value, [files[0]]).content); assert.equal(args[1], modelId);
    assert.deepEqual(plain(args[2]), [{ kind: 'image', name: 'i', base64: 'bytes', mediaType: 'image/jpeg' }]);
    assert.equal(args[3], false); assert.equal(args[4], ' raw ');
    assert.deepEqual(plain(args[5]), { webSearch: preference && modelId === 'gpt-5.4-mini' });
  }
});

test('all five OpenAI client OFF raw request bodies match immutable eea4db6 baseline bytes', async () => {
  for (const kind of ['normal', 'temporary', 'branch', 'light', 'edit']) {
    const s = await sendOpenAIPath(kind, { preference: false, richDisplayPreference: false });
    assert.equal(s.rawBodies.length, 1);
    assert.deepEqual(Buffer.from(s.rawBodies[0]), Buffer.from(CLIENT_OFF_GOLDEN[kind]), kind);
  }
});

for (const kind of ['normal', 'branch', 'light', 'edit']) {
  for (const scenario of [
    { name: 'ON', richDisplayPreference: true, expected: true },
    { name: 'OFF', richDisplayPreference: false, expected: false },
    { name: 'roleplay', richDisplayPreference: true, roleplay: true, expected: false },
  ]) test(`${kind} rich display request: ${scenario.name}`, async () => {
    const s = await sendOpenAIPath(kind, { ...scenario, preference: false });
    assert.equal(Object.hasOwn(s.bodies[0], 'richDisplay'), scenario.expected);
    if (scenario.expected) assert.equal(s.bodies[0].richDisplay, true);
  });
}

test('temporary submission never sends richDisplay even when its preference is ON', async () => {
  const s = await sendOpenAIPath('temporary', { richDisplayPreference: true });
  assert.equal(s.bodies[0].isTemporary, true);
  assert.equal(Object.hasOwn(s.bodies[0], 'richDisplay'), false);
});

for (const kind of ['normal', 'branch', 'light', 'edit']) test(`${kind} web search and rich display preferences are independent`, async () => {
  for (const scenario of [
    { preference: true, richDisplayPreference: false, web: true, rich: false },
    { preference: false, richDisplayPreference: true, web: false, rich: true },
    { preference: true, richDisplayPreference: true, roleplay: true, web: false, rich: false },
  ]) {
    const s = await sendOpenAIPath(kind, scenario);
    assert.equal(Object.hasOwn(s.bodies[0], 'webSearch'), scenario.web);
    assert.equal(Object.hasOwn(s.bodies[0], 'richDisplay'), scenario.rich);
  }
});

test('all three page callbacks include richDisplayPreference in their dependency arrays', () => {
  for (const name of ['handleSubmit', 'handleRegenerate', 'handleEditAndRegenerate']) {
    const start = source.indexOf(`const ${name} = useCallback(`);
    assert.ok(start >= 0, name);
    const dependencies = source.slice(start).match(/\}, \[([^\]]*)\]\);/);
    assert.ok(dependencies, name);
    assert.match(dependencies[1], /\brichDisplayPreference\b/, name);
  }
});

test('only guarded page callbacks reject missing or inherited rich display VM bindings', () => {
  for (const name of ['handleSubmit', 'handleRegenerate', 'handleEditAndRegenerate']) {
    for (const key of ['resolveRichDisplay', 'richDisplayPreference']) {
      const s = setup(); delete s.c[key];
      assert.throws(() => pageCallback(name, s.c), { message: `Missing VM context: ${key} for ${name}` });
      Object.setPrototypeOf(s.c, { [key]: key === 'resolveRichDisplay' ? resolveRichDisplay : false });
      assert.throws(() => pageCallback(name, s.c), { message: `Missing VM context: ${key} for ${name}` });
    }
  }
  assert.equal(typeof pageCallback('handleAbort', { abortReasonRef: {}, abortControllerRef: {} }), 'function');
  assert.equal(typeof fileCallback('components/ChatInput.tsx', 'handleSubmit', {}), 'function');
});
