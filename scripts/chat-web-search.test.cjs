const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');
const { installAliasResolver, installTsLoader } = require('./testBootstrap.cjs');
globalThis.AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage;

let state;
const originalLoad = Module._load;
function query(table) {
  let columns = '';
  const q = {
    select(value) { columns = value; state.selects.push([table, value]); return q; },
    eq() { return q; }, is() { return q; }, not() { return q; }, order() { return q; }, limit() { return q; },
    async maybeSingle() {
      if (table === 'threads') return { data: { id: 't', project_id: null, user_id: 'u', deleted_at: null }, error: null };
      if (table === 'messages' && columns.startsWith('id, content')) return { data: { id: 'old-assistant', ...state.original }, error: null };
      return { data: null, error: null };
    },
    async insert(payload) { state.inserts.push(payload); return { error: null }; },
    async upsert(payload) {
      state.saves.push(payload);
      return { error: state.saveFails ? { code: 'MOCK_SAVE_FAILURE' } : null };
    },
    async update(payload) { state.updates.push(payload); return { error: null }; },
    then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
  };
  return q;
}
const db = { from: query };
Module._load = function (request, parent, main) {
  if (request === '@vercel/functions') return { waitUntil: promise => state.background.push(promise) };
  if (request === '@/lib/supabase/route-auth') return { requireRouteUser: async () => ({ ok: true, user: { id: 'u' }, supabase: db, finalizeResponse: response => response }) };
  if (request === '@/lib/rate-limit') return { checkChatRateLimit: async () => ({ allowed: true }) };
  if (request === '@/lib/mcp-auth') return { serviceRoleClient: () => ({}) };
  if (request === '@/lib/aiUsage') return {
    calculateTextUsageCost: () => ({ estimatedCostUsd: null, costSource: 'unavailable' }),
    recordUsageEvent: async (_client, event) => { state.usage.push(event); return true; },
  };
  if (request === '@/lib/logger') return new Proxy({}, { get: (_target, name) => name === 'toExternalService' ? value => value : (...values) => state.logs.push([name, ...values]) });
  if (request === '@/lib/lore') return {
    embedQuery: async () => { throw new Error('Unexpected Lore request'); },
    searchLoreByEmbeddingForProject: async () => [], searchLoreV2ByEmbeddingForProject: async () => [],
  };
  return originalLoad.call(this, request, parent, main);
};
installAliasResolver();
installTsLoader({ transformOutput(output, filename) {
  return filename.endsWith(path.join('app', 'api', 'chat', 'route.ts'))
    ? output + '\nmodule.exports.__test = { streamClaude };'
    : output;
} });
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'offline';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'offline-service';
const { NextRequest } = require('next/server');
const { POST, __test: { streamClaude } } = require('../app/api/chat/route.ts');
const { normalizeSources } = require('../packages/shared/src/webSearch.ts');
Module._load = originalLoad;

// Immutable goldens: captured by executing git-show a1cbf14's route, registry and
// system-block helper with a mocked fetch. Never derive these from the worktree.
const GOLDEN = {
  unspecified: '{"model":"claude-sonnet-4-5","max_tokens":8192,"stream":true,"messages":[{"role":"user","content":"hello 日本語"}]}',
  false: '{"model":"claude-sonnet-4-5","max_tokens":8192,"stream":true,"messages":[{"role":"user","content":"hello 日本語"}]}',
  thinking: '{"model":"claude-sonnet-4-5","thinking":{"type":"enabled","budget_tokens":10000},"max_tokens":16000,"stream":true,"messages":[{"role":"user","content":"hello 日本語"}]}',
  cached: '{"model":"claude-sonnet-4-5","max_tokens":8192,"stream":true,"messages":[{"role":"user","content":[{"type":"text","text":"previous","cache_control":{"type":"ephemeral"}}]},{"role":"assistant","content":"answer"},{"role":"user","content":"next"}],"system":[{"type":"text","text":"stable","cache_control":{"type":"ephemeral"}},{"type":"text","text":"memory","cache_control":{"type":"ephemeral"}},{"type":"text","text":"pinned","cache_control":{"type":"ephemeral"}},{"type":"text","text":"dynamic"}]}',
};
const oldSources = normalizeSources([{ url: 'https://old.example/' }], 'claude');
const ORIGINAL = {
  content: 'original answer', provider: 'claude', model_id: 'claude-opus-4-6',
  input_tokens: 61, output_tokens: null,
  metadata: { copied_from_message_id: 'source-id', copied_from_thread_id: 'source-thread', sources: oldSources },
};
function reset(options = {}) {
  state = { background: [], saves: [], inserts: [], updates: [], selects: [], rest: [], upstream: [], usage: [], logs: [], original: structuredClone(ORIGINAL), ...options };
}
const delta = (text, index = 2) => ({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } });
const start = (index, content_block) => ({ type: 'content_block_start', index, content_block });
const stop = index => ({ type: 'content_block_stop', index });
const citation = (url = 'https://user:secret@WWW.Example.COM/page?utm_source=openai', title = '  First\n title  ', index = 2) => ({
  type: 'content_block_delta', index, delta: { type: 'citations_delta', citation: { type: 'web_search_result_location', url, title, cited_text: 'CITED_TEXT_MUST_NOT_BE_SAVED', encrypted_index: 'encrypted-index' } },
});
const usageStart = { type: 'message_start', message: { usage: { input_tokens: 11, cache_creation_input_tokens: 2, cache_read_input_tokens: 3 } } };
const usageEnd = { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7, server_tool_use: { web_search_requests: 1 } } };
const sseError = { type: 'error', error: { type: 'overloaded_error', message: 'PRIVATE_UPSTREAM_BODY' } };
function tool(index = 0, error = false) {
  return [
    start(index, { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: {} }),
    { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: '{"query":"QUERY_MUST_NOT_BE_SAVED"}' } }, stop(index),
    start(index + 1, { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: error
      ? { type: 'web_search_tool_result_error', error_code: 'too_many_requests' }
      : [{ type: 'web_search_result', url: 'https://uncited.example/', title: 'UNCITED', encrypted_content: 'ENCRYPTED_MUST_NOT_BE_SAVED', page_age: 'yesterday' }] }),
    stop(index + 1),
  ];
}
function answer() {
  // Five consecutive text blocks = two citation positions * 2 + 1.
  return [
    start(2, { type: 'text', text: '' }), delta('前半'), stop(2),
    start(3, { type: 'text', text: '' }), delta('引用一', 3), citation(undefined, undefined, 3), stop(3),
    start(4, { type: 'text', text: '' }), delta('中間', 4), stop(4),
    start(5, { type: 'text', text: '' }), delta('引用二', 5), citation('https://second.example/', 'Second', 5), stop(5),
    start(6, { type: 'text', text: '' }), delta('末尾', 6), stop(6),
  ];
}
function responseFor(events, options = {}) {
  let index = 0;
  return new Response(new ReadableStream({
    async pull(controller) {
      // Let the real transform/wrapper consume preceding chunks before errors.
      await new Promise(resolve => setImmediate(resolve));
      if (index < events.length) {
        controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(events[index++]) + '\n\n'));
      } else if (options.abort || options.failRead) {
        if (options.abortSignal) options.abortSignal.abort();
        const error = new Error(options.abort ? 'Synthetic cancellation' : 'Synthetic read failure');
        if (options.abort) error.name = 'AbortError';
        controller.error(error);
      } else controller.close();
    },
  }), { status: 200 });
}
async function consume(stream) {
  const parts = [];
  const reader = stream.getReader();
  while (true) {
    const value = await reader.read();
    if (value.done) return parts;
    parts.push(value.value);
  }
}
async function invoke(events, options = {}) {
  reset(options);
  const controller = new AbortController();
  global.fetch = async (url, init) => {
    if (url === 'http://127.0.0.1:9/rest/v1/messages') {
      state.rest.push(JSON.parse(init.body));
      return new Response('', { status: 201 });
    }
    state.upstream.push({ url, body: init.body });
    if (options.httpStatus) {
      if (options.unreadableBody) return new Response('not-json PRIVATE_UPSTREAM_BODY', { status: options.httpStatus });
      return Response.json(options.httpBody ?? {}, { status: options.httpStatus });
    }
    return responseFor(events, { ...options, abortSignal: options.abortRequest ? controller : undefined });
  };
  const body = { threadId: 't', userContent: 'hello', messages: [], provider: 'claude', modelId: 'claude-sonnet-4-5', webSearch: true,
    ...(options.light ? { regenerateMode: 'light', isRegenerate: true, targetMessageId: 'old-assistant' } : {}), ...options.body };
  const providerHeader = { claude: 'x-anthropic-api-key', gemini: 'x-gemini-api-key', openai: 'x-openai-api-key' }[body.provider];
  const res = await POST(new NextRequest('http://localhost/api/chat', {
    method: 'POST', signal: controller.signal,
    headers: { 'content-type': 'application/json', ...(options.noKey ? {} : { [providerHeader]: 'mock-key' }) }, body: JSON.stringify(body),
  }));
  assert.equal(res.status, options.expectedStatus ?? 200);
  const text = await res.text();
  await Promise.all(state.background);
  const json = res.headers.get('content-type').includes('application/json') ? JSON.parse(text) : undefined;
  const rows = json ? [] : text.trim().split('\n').map(line => JSON.parse(line));
  const kinds = rows.map(row => row.type);
  const chunks = rows.filter(row => row.type === 'chunk').map(row => row.text);
  const plain = options.body?.isDeepThinking
    ? chunks.flatMap(chunk => { try { const value = JSON.parse(chunk); return value.kind === 'text' ? [value.text] : []; } catch { return []; } }).join('')
    : chunks.join('');
  assert.equal(text.includes('kabe-ctl:'), false);
  assert.equal(JSON.stringify(state.saves).includes('kabe-ctl:'), false);
  assert.equal(JSON.stringify(state.rest).includes('kabe-ctl:'), false);
  if (rows.length) { assert.equal(kinds[0], 'meta'); assert.equal(kinds.at(-1), 'done'); }
  return { ...state, res, text, rows, kinds, chunks, plain, json };
}
const savedColumns = row => Object.fromEntries(['content', 'provider', 'model_id', 'input_tokens', 'output_tokens', 'metadata'].map(key => [key, row[key]]));
const expectedSources = normalizeSources([{ url: 'https://user:secret@WWW.Example.COM/page?utm_source=openai', title: '  First\n title  ' }, { url: 'https://second.example/', title: 'Second' }], 'claude');

test('search OFF init.body matches immutable a1cbf14 golden bytes in all four combinations', async () => {
  reset();
  for (const name of Object.keys(GOLDEN)) {
    let captured;
    let calls = 0;
    global.fetch = async (_url, init) => { captured = init.body; return responseFor([delta('ok')]); };
    const cached = name === 'cached';
    const options = name === 'false' ? false : undefined;
    const parts = await consume(streamClaude('key', cached ? [{ role: 'user', content: 'previous' }, { role: 'assistant', content: 'answer' }, { role: 'user', content: 'next' }] : [{ role: 'user', content: 'hello 日本語' }],
      cached ? 'stable' : undefined, cached ? 'dynamic' : undefined, 'claude-sonnet-4-5', [], undefined, () => { calls++; }, name === 'thinking', cached ? 0 : -1,
      cached ? [{ label: 'project-memory-topics', text: 'memory' }, { label: 'pinned', text: 'pinned' }] : [], options));
    assert.deepEqual(Buffer.from(captured), Buffer.from(GOLDEN[name]), name);
    assert.equal(calls, 1);
    assert.deepEqual(parts, name === 'thinking' ? ['{"kind":"text","text":"ok"}\n'] : ['ok']);
  }
});

test('OFF and enabled-without-tool retain the same event output; strict boolean and provider checks', async () => {
  for (const webSearch of [undefined, false, 'true', 1]) {
    const result = await invoke([delta('plain'), sseError], { body: { webSearch } });
    assert.deepEqual(result.kinds, ['meta', 'chunk', 'done']);
    assert.equal('tools' in JSON.parse(result.upstream[0].body), false);
    assert.ok(result.usage.every(event => event.status === 'completed'));
  }
  const noTool = await invoke([delta('plain'), citation()], { body: { webSearch: true } });
  assert.deepEqual(noTool.kinds, ['meta', 'chunk', 'done']);
  assert.equal(Object.hasOwn(noTool.saves[0], 'metadata'), false);
  const gemini = await invoke([{ candidates: [{ content: { parts: [{ text: 'Gemini' }] } }] }], { body: { provider: 'gemini', modelId: 'gemini-2.5-flash' } });
  assert.equal('tools' in JSON.parse(gemini.upstream[0].body), false);
  const invalid = await invoke([], { body: { modelId: 'invalid' }, expectedStatus: 400 });
  assert.equal(invalid.upstream.length, 0);
  const memo = await invoke([], { body: { isMemo: true } });
  assert.equal(memo.upstream.length, 0);
});

test('real transform preserves consecutive cited text blocks, excludes uncited search data and saves identical sources', async () => {
  const result = await invoke([usageStart, ...tool(), ...answer(), usageEnd]);
  assert.equal(result.plain, '前半引用一中間引用二末尾');
  assert.equal(result.saves[0].content, result.plain);
  assert.deepEqual(result.kinds, ['meta', 'searching', ...Array(5).fill('chunk'), 'citations', 'done']);
  assert.deepEqual(result.rows.at(-2), { type: 'citations', sources: expectedSources });
  assert.deepEqual(result.saves[0].metadata, { sources: expectedSources });
  assert.deepEqual(JSON.parse(result.upstream[0].body).tools, [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]);
  for (const secret of ['QUERY_MUST_NOT_BE_SAVED', 'CITED_TEXT_MUST_NOT_BE_SAVED', 'ENCRYPTED_MUST_NOT_BE_SAVED', 'encrypted-index', 'uncited.example', 'page_age']) {
    assert.equal(JSON.stringify(result.saves).includes(secret), false);
    assert.equal(JSON.stringify(result.rows).includes(secret), false);
  }
  assert.equal(result.upstream.length, 1);
});

test('text -> tool/result group -> text inserts exactly one separator, searching remains once per request', async () => {
  const result = await invoke([delta('before', 0), ...tool(1), ...tool(3), delta('after', 5), delta('continued', 6)]);
  assert.equal(result.plain, 'before\n\naftercontinued');
  assert.equal(result.saves[0].content, result.plain);
  assert.deepEqual(result.kinds, ['meta', 'chunk', 'searching', 'chunk', 'chunk', 'done']);
  const repeated = await invoke([delta('a'), ...tool(), delta('b'), ...tool(4), delta('c')]);
  assert.equal(repeated.plain, 'a\n\nb\n\nc');
  assert.equal(repeated.kinds.filter(kind => kind === 'searching').length, 1);
  const cited = await invoke([delta('before', 0), ...tool(1), delta('after', 3), citation()]);
  assert.deepEqual(cited.kinds, ['meta', 'chunk', 'searching', 'chunk', 'citations', 'done']);
  assert.equal(cited.plain, 'before\n\nafter');
});

for (const error of [false, true]) test(`tool execution with no citation, tool-error=${error}, is nonfatal`, async () => {
  const result = await invoke([...tool(0, error), delta('answer')]);
  assert.deepEqual(result.kinds, ['meta', 'searching', 'chunk', 'done']);
  assert.equal(Object.hasOwn(result.saves[0], 'metadata'), false);
  assert.ok(result.usage.every(event => event.status === 'completed'));
  assert.equal(result.upstream.length, 1);
});

test('Deep Thinking and temporary paths remove raw control tokens while preserving kind lines and citations', async () => {
  const thinking = { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'private thoughts' } };
  const signature = { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'not-output' } };
  const events = [thinking, signature, ...tool(), ...answer()];
  const normal = await invoke(events, { body: { isDeepThinking: true } });
  assert.equal(normal.plain, '前半引用一中間引用二末尾');
  assert.equal(normal.saves[0].content, normal.plain);
  assert.deepEqual(JSON.parse(normal.chunks[0]), { kind: 'thinking', text: 'private thoughts' });
  for (const chunk of normal.chunks) assert.ok(['thinking', 'text'].includes(JSON.parse(chunk).kind));
  assert.equal(normal.kinds.filter(kind => kind === 'searching').length, 1);
  assert.equal(normal.kinds.filter(kind => kind === 'citations').length, 1);
  for (const isDeepThinking of [false, true]) {
    const temporary = await invoke(events, { body: { isTemporary: true, isDeepThinking } });
    assert.equal(temporary.json.assistantMessage.content, normal.plain);
    assert.deepEqual(temporary.json.assistantMessage.metadata, { sources: expectedSources });
    assert.equal(temporary.saves.length, 0);
    assert.equal(temporary.rest.length, 0);
  }
});

test('citations callback returns only URL/title; old fixtures without start/stop stay unchanged', async () => {
  reset();
  global.fetch = async () => responseFor([...tool(), delta('answer'), citation()]);
  const citations = [];
  let searching = 0;
  const parts = await consume(streamClaude('key', [], undefined, undefined, 'claude-sonnet-4-5', [], undefined, undefined, false, -1, [],
    { maxUses: 3, controlToken: 'CONTROL', onSearching: () => searching++, onCitation: value => citations.push(value) }));
  assert.equal(searching, 1);
  assert.deepEqual(parts, ['CONTROL', 'answer']);
  assert.deepEqual(citations, [{ url: 'https://user:secret@WWW.Example.COM/page?utm_source=openai', title: '  First\n title  ' }]);
  const oldFixture = await invoke([delta('old'), delta('fixture')]);
  assert.equal(oldFixture.plain, 'oldfixture');
  assert.deepEqual(oldFixture.kinds, ['meta', 'chunk', 'chunk', 'done']);
});

test('SSE error ON joins the existing failed path, emits error then citations then done without close TypeError', async () => {
  const result = await invoke([usageStart, ...tool(), ...answer(), sseError]);
  assert.deepEqual(result.kinds.slice(-3), ['chunk', 'citations', 'done']);
  assert.match(result.chunks.at(-1), /Claude APIへのリクエストに失敗しました/);
  assert.ok(result.usage.every(event => event.status === 'failed'));
  assert.equal(result.saves[0].content, '前半引用一中間引用二末尾');
  assert.deepEqual(result.saves[0].metadata, { sources: expectedSources });
  assert.equal(JSON.stringify([result.logs, result.rows]).includes('PRIVATE_UPSTREAM_BODY'), false);
  const source = fs.readFileSync(path.join(__dirname, '../app/api/chat/route.ts'), 'utf8');
  assert.match(source, /if \(parsed.type === "error"\)\s*\{[\s\S]*?streamErrorType =/);
  assert.deepEqual(result.logs.find(row => row[0] === 'externalApiFailed'), [
    'externalApiFailed', { service: 'claude', errorCode: 'UPSTREAM_STREAM_ERROR', errorType: 'overloaded_error' },
  ]);
  assert.match(source, /if \(streamErrorType !== null\)\s*\{\s*logger\.externalApiFailed\(\{[\s\S]*?\}\);\s*throw new ReportedProviderError/);
});

test('Claude absorbs AbortError, flush keeps done.aborted=false but suppresses citations and retains saved partial sources', async () => {
  for (const saveFails of [false, true]) {
    const result = await invoke([usageStart, ...tool(), ...answer()], { abort: true, saveFails });
    assert.deepEqual(result.rows.at(-1), { type: 'done', aborted: false });
    assert.equal(result.kinds.includes('citations'), false);
    assert.ok(result.usage.every(event => event.status === 'aborted'));
    assert.equal(result.saves[0].content, '前半引用一中間引用二末尾');
    assert.deepEqual(result.saves[0].metadata, { sources: expectedSources });
    if (saveFails) assert.deepEqual(result.rest[0], result.saves[0]);
  }
});

test('REST fallback and normal persistence agree on success, and temporary errors discard unrelated sources', async () => {
  const result = await invoke([usageStart, ...tool(), ...answer(), usageEnd], { saveFails: true });
  assert.deepEqual(result.rest[0], result.saves[0]);
  assert.deepEqual(result.rest[0].metadata, { sources: expectedSources });
  for (const errorOptions of [{ events: [], failRead: true }, { events: [sseError] }]) {
    const temporary = await invoke([...tool(), ...answer(), ...errorOptions.events], { failRead: errorOptions.failRead, body: { isTemporary: true } });
    assert.match(temporary.json.assistantMessage.content, /エラー:/);
    assert.equal(Object.hasOwn(temporary.json.assistantMessage, 'metadata'), false);
    assert.equal(temporary.saves.length, 0);
  }
});

test('light success replaces sources, OFF removes only sources, and null new tokens are explicit in both payloads', async () => {
  for (const saveFails of [false, true]) {
    const withCitations = await invoke([...tool(), ...answer()], { light: true, saveFails });
    assert.equal(withCitations.saves[0].id, 'old-assistant');
    assert.deepEqual(withCitations.saves[0].metadata, { ...ORIGINAL.metadata, sources: expectedSources });
    assert.equal(withCitations.saves[0].provider, 'claude');
    assert.equal(withCitations.saves[0].model_id, 'claude-sonnet-4-5');
    assert.ok(Object.hasOwn(withCitations.saves[0], 'input_tokens'));
    assert.ok(Object.hasOwn(withCitations.saves[0], 'output_tokens'));
    assert.equal(withCitations.saves[0].input_tokens, null);
    assert.equal(withCitations.saves[0].output_tokens, null);
    if (saveFails) assert.deepEqual(withCitations.rest[0], withCitations.saves[0]);
    const off = await invoke([delta('new answer')], { light: true, saveFails, body: { webSearch: false } });
    assert.deepEqual(off.saves[0].metadata, { copied_from_message_id: 'source-id', copied_from_thread_id: 'source-thread' });
    if (saveFails) assert.deepEqual(off.rest[0], off.saves[0]);
  }
});

for (const saveFails of [false, true]) {
  for (const mode of ['failed', 'absorbed-abort', 'request-abort']) test(`light rollback restores whole snapshot, mode=${mode}, fallback=${saveFails}`, async () => {
    const result = await invoke([usageStart, ...tool(), ...answer(), ...(mode === 'failed' ? [sseError] : [])], {
      light: true, saveFails, abort: mode !== 'failed', abortRequest: mode === 'request-abort',
    });
    assert.deepEqual(savedColumns(result.saves[0]), ORIGINAL);
    assert.equal(result.kinds.includes('citations'), false);
    assert.ok(result.usage.every(event => event.status === (mode === 'failed' ? 'failed' : 'aborted')));
    if (saveFails) assert.deepEqual(savedColumns(result.rest[0]), ORIGINAL);
    assert.ok(result.selects.some(([, columns]) => columns === 'id, content, provider, model_id, input_tokens, output_tokens, metadata, threads!inner(deleted_at)'));
  });
}

test('Claude -> Gemini light failure restores old Claude provider/tokens/metadata including in REST fallback', async () => {
  for (const saveFails of [false, true]) {
    const result = await invoke([], { light: true, saveFails, failRead: true, body: { provider: 'gemini', modelId: 'gemini-2.5-flash' } });
    assert.deepEqual(savedColumns(result.saves[0]), ORIGINAL);
    if (saveFails) assert.deepEqual(savedColumns(result.rest[0]), ORIGINAL);
  }
});

test('missing-key light JSON returns exactly the cleaned metadata saved to DB; nonlight omits metadata/tokens', async () => {
  const light = await invoke([], { light: true, noKey: true });
  assert.match(light.saves[0].content, /APIキーが設定されていません/);
  assert.deepEqual(light.saves[0].metadata, { copied_from_message_id: 'source-id', copied_from_thread_id: 'source-thread' });
  assert.deepEqual(light.json.assistantMessage.metadata, light.saves[0].metadata);
  assert.equal(Object.hasOwn(light.saves[0], 'input_tokens'), false);
  const normal = await invoke([], { noKey: true });
  assert.equal(Object.hasOwn(normal.json.assistantMessage, 'metadata'), false);
  assert.equal(Object.hasOwn(normal.saves[0], 'metadata'), false);
  const success = await invoke([delta('plain')], { body: { webSearch: false } });
  for (const key of ['metadata', 'input_tokens', 'output_tokens']) assert.equal(Object.hasOwn(success.saves[0], key), false);
});

test('HTTP tool-specific 400 uses safe Japanese guidance only when search is ON and never retries', async () => {
  for (const scenario of [
    { on: true, status: 400, related: true, body: { error: { type: 'invalid_request_error', message: 'web_search PRIVATE_UPSTREAM_BODY' } } },
    { on: true, status: 400, related: true, body: { error: { type: 'tool_not_allowed', message: 'PRIVATE_UPSTREAM_BODY' } } },
    { on: true, status: 400, related: false, body: { error: { type: 'invalid_request_error', message: 'PRIVATE_UPSTREAM_BODY' } } },
    { on: false, status: 400, related: false, body: { error: { type: 'tool_not_allowed', message: 'PRIVATE_UPSTREAM_BODY' } } },
    { on: true, status: 403, related: false, body: { error: { type: 'tool_not_allowed', message: 'PRIVATE_UPSTREAM_BODY' } } },
    { on: true, status: 500, related: false, body: { error: { type: 'tool_not_allowed', message: 'PRIVATE_UPSTREAM_BODY' } } },
    { on: true, status: 400, related: false, unreadable: true },
  ]) {
    const result = await invoke([], { httpStatus: scenario.status, httpBody: scenario.body, unreadableBody: scenario.unreadable, body: { webSearch: scenario.on } });
    assert.match(result.plain, scenario.related ? /Web検索を利用できませんでした.*Web検索をオフにして送信してください/ : /Claude APIへのリクエストに失敗しました/);
    assert.equal(JSON.stringify([result.logs, result.rows]).includes('PRIVATE_UPSTREAM_BODY'), false);
    assert.ok(result.usage.every(event => event.status === 'failed'));
    assert.equal(result.upstream.length, 1);
  }
});
