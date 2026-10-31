const assert = require('node:assert/strict');
const { test } = require('node:test');
const { installTsLoader } = require('./testBootstrap.cjs');
const { pageCallback, deferred, tick, source } = require('./thread-trash-ui-test-helpers.cjs');
installTsLoader();
require("./testBootstrap.cjs").installAliasResolver();
const { isViewCurrent, createLatestRequest } = require('../lib/threads/view-guard.ts');
const { trashDaysRemaining } = require('../lib/threads/trash-display.ts');
const trashClient = require('../lib/threads/trash-client.ts');

test('view identity requires BOTH epoch and ID, including delete/Undo/reselect ABA', () => {
  for (const [epoch, threadId, expected] of [[3, 't', true], [4, 't', false], [3, 'other', false], [4, null, false]]) {
    assert.equal(isViewCurrent({ epoch: 3, threadId: 't' }, { currentEpoch: epoch, currentThreadId: threadId }), expected);
  }
  assert.equal(isViewCurrent({ epoch: 0, threadId: null }, { currentEpoch: 0, currentThreadId: null }), true);
});
test('latest request sequence ignores older requests and supports invalidation', () => {
  const requests = createLatestRequest(), a = requests.start(), b = requests.start();
  assert.equal(requests.isLatest(a), false); assert.equal(requests.isLatest(b), true);
  requests.start(); assert.equal(requests.isLatest(b), false);
});
test('remaining days clamps expired dates and rounds partial days upward', () => {
  const now = Date.parse('2026-10-25T00:00:00Z');
  for (const [offset, expected] of [[-1, 0], [0, 0], [1, 1], [86400000, 1], [86400001, 2], [7 * 86400000, 7]]) {
    assert.equal(trashDaysRemaining(new Date(now + offset).toISOString(), now), expected);
  }
});

const { resolveWebSearch } = require("../lib/webSearchPreference.ts");
const { resolveRichDisplay } = require("../lib/richDisplayPreference.ts");
const { getDefaultModel } = require("../lib/modelRegistry.ts");
function setup() {
  const events = [], toasts = [];
  const context = {
    ...trashClient,
    resolveWebSearch, resolveRichDisplay, getDefaultModel, webSearchPreference: false, richDisplayPreference: false, setWebSearchingState() {},
    activeThreadId: 't', activeThread: {}, messages: [], temporaryMessages: [], inputValue: '',
    threads: [{ id: 't', is_public: true }], displayThreads: [{ id: 't', is_public: true }], isLoading: false, isTemporary: false, provider: 'claude',
    activeThreadIdRef: { current: 't' }, viewEpochRef: { current: 1 }, isTemporaryRef: { current: false },
    abortReasonRef: { current: null }, abortControllerRef: { current: null }, generationViewRef: { current: null },
    deletingThreadIdsRef: { current: new Set() }, threadRequests: createLatestRequest(),
    isViewCurrent, Set, Date, console: { error() {} },
    crypto: { randomUUID: () => 'branch' }, uuidv4: () => 'new-thread', loadModel: () => 'model',
    isImagePinned: false, imageContextId: null, getDefaultImageModel: () => 'image-model',
    retention: { remember() {}, get: () => null }, replaceQueryText: () => null,
    getApiKeyHeaders: async () => ({}), fetchThreads: async () => [],
    trashRestoreError: require('../lib/threads/trash-display.ts').trashRestoreError,
    localStorage: { setItem() {}, removeItem() {}, getItem: () => null },
    window: { confirm: () => true },
    showToast: (...args) => toasts.push(args),
    fetch: async (url, init) => { events.push([url, init]); return Response.json([]); },
  };
  for (const key of ['Messages', 'TemporaryMessages', 'Threads', 'DisplayThreads', 'StreamingContent', 'GithubProgressState',
    'GithubProgressMessages', 'ThinkingContents', 'IsLoading', 'IsTemporary', 'ActiveThreadId', 'InputValue',
    'SearchMatchIds', 'SearchMatchIndex', 'ImageContextId', 'ImageRefId', 'ImageRefUpload']) {
    const field = key[0].toLowerCase() + key.slice(1);
    context[`set${key}`] = value => {
      context[field] = typeof value === 'function' ? value(context[field]) : value;
      events.push([`set${key}`, context[field]]);
    };
  }
  context.captureView = pageCallback('captureView', context);
  context.isCurrentView = pageCallback('isCurrentView', context);
  context.commitActiveThread = pageCallback('commitActiveThread', context);
  context.commitTemporary = pageCallback('commitTemporary', context);
  context.selectThread = pageCallback('selectThread', context);
  context.persistAbortedMessages = pageCallback('persistAbortedMessages', context);
  return { context, events, toasts };
}
const result = (aborted = false) => ({ userMessage: { id: 'u', content: 'old' }, assistantMessage: { id: 'a', content: 'old answer' }, aborted });

test('all active ID writes are centralized; unchanged ID does not advance epoch', () => {
  const { context: c } = setup();
  const start = c.viewEpochRef.current;
  c.commitActiveThread('t'); assert.equal(c.viewEpochRef.current, start);
  c.commitActiveThread(null); c.commitActiveThread('t'); assert.equal(c.viewEpochRef.current, start + 2);
  assert.equal((source.match(/setActiveThreadId\(/g) ?? []).length, 1);
});

test('actual fetchThreads drops an older delayed result', async () => {
  const { context: c } = setup(), first = deferred(), second = deferred();
  let count = 0; c.fetch = () => (++count === 1 ? first : second).promise;
  const fetchThreads = pageCallback('fetchThreads', c);
  const old = fetchThreads(), latest = fetchThreads();
  second.resolve(Response.json([{ id: 'restored' }])); await latest;
  first.resolve(Response.json([{ id: 'trashed' }])); await old;
  assert.equal(c.threads[0].id, 'restored'); assert.equal(c.displayThreads[0].id, 'restored');
});

test('DELETE invalidates an earlier list read, including before its refresh completes', async () => {
  const { context: c } = setup(), old = deferred(), refresh = deferred(); let lists = 0;
  c.fetch = (url) => url === '/api/threads' ? (++lists === 1 ? old : refresh).promise
    : Promise.resolve(Response.json({ success: true }));
  c.fetchThreads = pageCallback('fetchThreads', c);
  const reading = c.fetchThreads();
  await pageCallback('handleDeleteThread', c)('t');
  old.resolve(Response.json([{ id: 't' }])); await reading;
  assert.equal(c.threads.length, 0); // local removal is preserved while the refresh is pending
  assert.equal(c.displayThreads.length, 0);
  refresh.resolve(Response.json([])); await tick();
  assert.equal(c.threads.length, 0); assert.equal(c.displayThreads.length, 0);
});

test('a delayed search cannot overwrite the list after a newer refresh starts', async () => {
  const { context: c } = setup(), search = deferred(); c.fetch = () => search.promise;
  c.setIsSearching = () => {};
  const pending = pageCallback('handleSearch', c)('old', 'title');
  c.threadRequests.start(); c.displayThreads = [];
  search.resolve(Response.json([{ id: 'trashed' }])); await pending;
  assert.equal(c.displayThreads.length, 0);
});

test('stream progress setter rejects stale view updates while allowing cleanup', () => {
  const { context: c } = setup(); c.githubProgressState = [];
  const setter = pageCallback('setGithubProgressMessages', c);
  c.generationViewRef.current = c.captureView(); setter(prev => [...prev, 'current']);
  assert.equal(c.githubProgressState.length, 1);
  c.commitActiveThread(null); c.commitActiveThread('t'); setter(prev => [...prev, 'stale']);
  assert.equal(c.githubProgressState.length, 0);
  setter([]); assert.equal(c.githubProgressState.length, 0);
});

for (const fails of [false, true]) test(`selectThread delayed ${fails ? 'error' : 'success'} cannot overwrite after delete/Undo/reselect`, async () => {
  const { context: c } = setup(), old = deferred(); let calls = 0;
  c.fetch = () => ++calls === 1 ? old.promise : Promise.resolve(Response.json([{ id: 'fresh' }]));
  const pending = c.selectThread('t'); c.commitActiveThread(null); await c.selectThread('t');
  if (fails) old.reject(new Error('old failure')); else old.resolve(Response.json([{ id: 'old' }]));
  await pending; assert.equal(c.messages[0].id, 'fresh');
});

for (const aborted of [false, true]) test(`stream ${aborted ? 'abort' : 'completion'} after delete + Undo cannot add old messages/chunks/memo PATCHes`, async () => {
  const { context: c, events, toasts } = setup(), stream = deferred(); let chunk;
  c.fetchWithStreaming = async (_url, _headers, _body, onChunk) => { chunk = onChunk; return stream.promise; };
  c.fetch = async (url, init) => {
    events.push([url, init]);
    return Response.json(url.endsWith('/messages') ? [{ id: 'restored' }] : { success: true });
  };
  const running = pageCallback('handleSubmit', c)('hello'); await tick();
  c.abortControllerRef.current = { abort() { events.push(['abort', c.abortReasonRef.current]); } };
  await pageCallback('handleDeleteThread', c)('t');
  assert.equal(c.activeThreadIdRef.current, null);
  assert.ok(events.some(e => e[0] === 'abort' && e[1] === 'thread-trashed'));
  assert.equal(toasts[0][2].duration, 8000); assert.match(toasts[0][0], /公開も停止/);
  await toasts[0][2].action.onClick(); assert.equal(c.activeThreadIdRef.current, 't');
  chunk('old chunk'); stream.resolve(result(aborted)); await running;
  assert.equal(c.messages[0].id, 'restored'); assert.equal(c.messages.length, 1);
  assert.equal(c.streamingContent, ''); assert.equal(c.isLoading, false); assert.equal(c.abortReasonRef.current, null);
  assert.ok(!events.some(e => e[1]?.method === 'PATCH'));
});

test('auto-new submission captures its epoch AFTER committing the resolved ID', async () => {
  const { context: c } = setup(); c.activeThreadId = null; c.activeThreadIdRef.current = null;
  c.fetchWithStreaming = async () => result();
  await pageCallback('handleSubmit', c)('hello');
  assert.equal(c.activeThreadIdRef.current, 'new-thread'); assert.equal(c.messages.length, 2);
});

test('temporary submission completion is ignored after a view switch', async () => {
  const { context: c } = setup(), request = deferred(); c.isTemporary = true;
  c.webApiClient = { request: () => request.promise };
  const pending = pageCallback('handleSubmit', c)('hello'); await tick();
  c.commitActiveThread('other'); c.messages = []; c.temporaryMessages = [];
  request.resolve(Response.json(result())); await pending;
  assert.equal(c.messages.length, 0); assert.equal(c.temporaryMessages.length, 0); assert.equal(c.isLoading, false);
});

for (const handler of ['handleRegenerate', 'handleEditAndRegenerate']) for (const throws of [false, true]) {
  test(`${handler} delayed ${throws ? 'failure' : 'result'} is ignored, finally still runs`, async () => {
    const { context: c } = setup(), stream = deferred();
    const user = { id: 'u', role: 'user', content: 'hi' }, assistant = { id: 'a', role: 'assistant', content: 'answer' };
    c.messages = [user, assistant]; c.fetchWithStreaming = () => stream.promise;
    const callback = pageCallback(handler, c);
    const pending = handler === 'handleRegenerate' ? callback('claude', assistant) : callback(user, 'edit', 'claude');
    await tick(); c.commitActiveThread('other'); c.messages = [{ id: 'other' }];
    if (throws) stream.reject(new Error('old error')); else stream.resolve(result());
    await pending; assert.equal(c.messages[0].id, 'other'); assert.equal(c.messages.length, 1); assert.equal(c.isLoading, false);
  });
}

test('image generation continues without a signal; its stale result cannot update the UI', async () => {
  const { context: c } = setup(), image = deferred(); const requests = [];
  c.webApiClient = { request: (url, init) => {
    requests.push([url, init]); return url === '/api/image-gen' ? image.promise : Promise.resolve(Response.json({ userMessage: { id: 'memo' } }));
  } };
  const pending = pageCallback('handleImageGenerate', c)('draw'); await tick();
  c.commitActiveThread(null); c.commitActiveThread('t'); c.messages = [{ id: 'restored' }];
  image.resolve(Response.json({ messageId: 'old-image', storagePath: 'old/path' })); await pending;
  assert.equal(c.messages[0].id, 'restored'); assert.equal(c.messages.length, 1); assert.equal(c.isLoading, false);
  assert.ok(requests.every(([, init]) => !Object.hasOwn(init, 'signal')));
});

for (const other of [true, false]) test(`Undo does not select the old thread while ${other ? 'viewing another thread' : 'in temporary mode'}`, async () => {
  const { context: c, toasts } = setup(); c.fetch = async () => Response.json({ success: true });
  await pageCallback('handleDeleteThread', c)('t');
  if (other) c.commitActiveThread('other'); else c.isTemporaryRef.current = true;
  let selects = 0; c.selectThread = async () => { selects++; };
  await toasts[0][2].action.onClick(); assert.equal(selects, 0);
});
test('failed DELETE clears abort reason and shows no Undo; interrupted generation stays interrupted', async () => {
  const { context: c, toasts } = setup(); c.isLoading = true; let aborts = 0;
  c.abortControllerRef.current = { abort: () => aborts++ };
  c.fetch = async () => Response.json({ error: 'failed' }, { status: 500 });
  await pageCallback('handleDeleteThread', c)('t');
  assert.equal(aborts, 1); assert.equal(c.abortReasonRef.current, null); assert.equal(c.activeThreadIdRef.current, 't');
  assert.equal(toasts.length, 1); assert.equal(toasts[0][1], 'error');
});
test('Undo expired retention uses the explicit error toast', async () => {
  const { context: c, toasts } = setup();
  c.fetch = async () => Response.json({ success: true }); await pageCallback('handleDeleteThread', c)('t');
  c.fetch = async () => Response.json({ error: 'trash retention expired' }, { status: 409 });
  await toasts[0][2].action.onClick(); assert.equal(toasts[1][0], '保持期間が過ぎたため復元できません');
});
