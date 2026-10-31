const assert = require('node:assert/strict');
const { test } = require('node:test');
const { installTsLoader } = require('./testBootstrap.cjs');
const { pageCallback } = require('./thread-trash-ui-test-helpers.cjs');
installTsLoader();
const client = require('../lib/threads/trash-client.ts');
const { ThreadWriteError, isThreadTrashResponse, isThreadTrashWriteError, readThreadWriteError,
  throwIfThreadTrashed, notifyThreadTrashed, restoreThreadInput, threadWriteNotification } = client;

test('trash detection requires exact status AND exact error body', () => {
  for (const [status, body, expected] of [
    [409, { error: 'thread is in trash' }, true], [500, { error: 'thread is in trash' }, false],
    [404, { error: 'thread not found' }, false], [409, { error: 'trash retention expired' }, false],
    [409, { error: ' thread is in trash' }, false], [409, { error: 409 }, false],
    [409, null, false], [409, 'thread is in trash', false], [200, { error: 'thread is in trash' }, false],
  ]) assert.equal(isThreadTrashResponse(status, body), expected);
  assert.equal(isThreadTrashWriteError(new ThreadWriteError(409, 'thread is in trash')), true);
  assert.equal(isThreadTrashWriteError({ status: 409, error: 'thread is in trash' }), false);
});

test('typed error retains status and error string without consuming the response body', async () => {
  const response = Response.json({ error: 'thread is in trash' }, { status: 409 });
  const error = await readThreadWriteError(response, 'fallback');
  assert.ok(error instanceof Error); assert.ok(error instanceof ThreadWriteError);
  assert.equal(error.status, 409); assert.equal(error.error, 'thread is in trash'); assert.equal(error.message, 'fallback');
  assert.deepEqual(await response.json(), { error: 'thread is in trash' });
});
for (const kind of ['empty', 'invalid JSON', 'already consumed', 'non-string error']) test(`unreadable/invalid error body: ${kind} keeps status`, async () => {
  const response = kind === 'non-string error' ? Response.json({ error: {} }, { status: 500 })
    : new Response(kind === 'invalid JSON' ? 'broken' : null, { status: 500 });
  if (kind === 'already consumed') await response.text();
  const error = await readThreadWriteError(response, 'fallback');
  assert.equal(error.status, 500); assert.equal(error.error, undefined);
});
test('throwIfThreadTrashed leaves other conflicts/404/500 and success untouched', async () => {
  for (const status of [200, 404, 500]) await throwIfThreadTrashed(Response.json({ error: 'thread is in trash' }, { status }));
  await throwIfThreadTrashed(Response.json({ error: 'other conflict' }, { status: 409 }));
  await assert.rejects(throwIfThreadTrashed(Response.json({ error: 'thread is in trash' }, { status: 409 })), isThreadTrashWriteError);
});

test('common toast offers the trash navigation action only for exact trash errors', () => {
  const notices = [], originalWindow = global.window;
  global.window = { location: { href: '/' } };
  try {
    assert.equal(notifyThreadTrashed(new ThreadWriteError(500, 'thread is in trash'), (...args) => notices.push(args)), false);
    assert.equal(notifyThreadTrashed(new ThreadWriteError(409, 'thread is in trash'), (...args) => notices.push(args)), true);
    assert.equal(notices.length, 1); assert.equal(notices[0][0], 'このスレッドはゴミ箱にあります');
    assert.equal(notices[0][2].action.label, 'ゴミ箱を開く'); notices[0][2].action.onClick();
    assert.equal(global.window.location.href, '/trash');
  } finally { global.window = originalWindow; }
});

test('input restore uses queryText ?? content and never overwrites even whitespace input', () => {
  for (const [current, content, query, expected] of [
    ['', 'content', undefined, 'content'], ['', 'raw + ATTACHMENT', 'raw', 'raw'],
    ['', 'ATTACHMENT ONLY', '', ''], ['new typing', 'old', undefined, 'new typing'],
    [' ', 'old', 'raw', ' '], ['new typing', 'attachment content', 'raw', 'new typing'],
  ]) assert.equal(restoreThreadInput(current, content, query), expected);
});
for (const reason of ['thread-trashed', 'user', null]) for (const kind of ['trash', 'other409', '500', 'network']) {
  test(`notification decision: ${reason} / ${kind}`, () => {
    const error = kind === 'network' ? new Error('network') : new ThreadWriteError(kind === '500' ? 500 : 409,
      kind === 'trash' ? 'thread is in trash' : 'other');
    assert.equal(threadWriteNotification(error, reason), reason === 'thread-trashed' ? 'none' : kind === 'trash' ? 'trash' : 'generic');
  });
}

for (const [status, body, expected] of [[409, { error: 'thread is in trash' }, 'thread is in trash'],
  [500, { error: 'server failure' }, 'server failure'], [500, null, undefined]]) {
  test(`fetchWithStreaming non-2xx keeps status=${status}, error=${expected}`, async () => {
    const context = { generationViewRef: { current: null }, setIsWebSearching() {}, ...client, AbortController, abortControllerRef: { current: null },
      webApiClient: { request: async () => body ? Response.json(body, { status }) : new Response(null, { status }) } };
    const stream = pageCallback('fetchWithStreaming', context);
    await assert.rejects(stream('/api/chat', {}, '{}', () => {}), error => {
      assert.ok(error instanceof ThreadWriteError); assert.equal(error.status, status);
      assert.equal(error.error, expected); assert.equal(error.message, 'チャット応答取得失敗'); return true;
    });
  });
}
test('fetchWithStreaming successful JSON remains unchanged', async () => {
  const body = { userMessage: { id: 'u' }, assistantMessage: { id: 'a' }, aborted: false };
  const context = { generationViewRef: { current: null }, setIsWebSearching() {}, AbortController, abortControllerRef: { current: null }, webApiClient: { request: async () => Response.json(body) } };
  assert.deepEqual(await pageCallback('fetchWithStreaming', context)('/api/chat', {}, '{}', () => {}), body);
});
test('fetchWithStreaming successful NDJSON preserves chunks, metadata and progress', async () => {
  const lines = [
    { type: 'meta', userMessage: { id: 'u' }, assistantMessageId: 'a', threadId: 't', provider: 'claude', createdAt: 'now' },
    { type: 'chunk', text: 'first' }, { type: 'github_progress', text: 'progress' },
    { type: 'chunk', text: ' second' }, { type: 'done', aborted: false },
  ];
  const chunks = [], progress = [];
  const context = { generationViewRef: { current: null }, setIsWebSearching() {}, AbortController, TextDecoder, abortControllerRef: { current: null },
    webApiClient: { request: async () => new Response(lines.map(v => JSON.stringify(v)).join('\n') + '\n') },
    setGithubProgressMessages: fn => progress.push(...fn([])), uuidv4: () => 'fallback', Date };
  const result = await pageCallback('fetchWithStreaming', context)('/api/chat', {}, '{}', text => chunks.push(text));
  assert.deepEqual(chunks, ['first', 'first second']); assert.deepEqual(progress, ['progress']);
  assert.equal(result.assistantMessage.id, 'a'); assert.equal(result.assistantMessage.content, 'first second'); assert.equal(result.aborted, false);
});
