const assert = require('node:assert/strict');
const { test } = require('node:test');
const { responseFor } = require('./helpers/openai-chat-harness.cjs');
const { buildOpenAIWebSearchRequest: build, streamOpenAIWebSearch: stream } = require('../lib/openai-web-search.ts');
const { buildCombinedSystemPrompt } = require('../lib/chat-system-blocks.ts');
const { MODEL_REGISTRY } = require('../lib/modelRegistry.ts');
const { normalizeSources } = require('../packages/shared/src/webSearch.ts');
const f = require('./helpers/openai-responses-fixtures.cjs');
const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aW1hZ2U=' } };
async function run(events, options = {}) {
  const usages = [], calls = [], citations = [], observations = [], chunks = [];
  let searching = 0, request, error;
  const streamValue = stream({ apiKey: 'offline-key', modelId: 'gpt-6-astra', messages: [{ role: 'user', content: 'question' }],
    signal: options.signal, onUsage: value => usages.push(value), onTextDone: value => observations.push(value),
    search: { controlToken: '\0kabe-ctl:unit:searching\0', onSearching: () => searching++, onCitation: value => citations.push(value) },
    errors: {
      onHttpError: status => { calls.push(['http', status]); return new Error('http'); },
      onTerminalError: (kind, reason) => { calls.push(['terminal', kind, reason]); return new Error(`${kind}:${reason ?? ''}`); },
      onTransportError: err => { calls.push(['transport', err.name]); return new Error('transport'); },
    },
    fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      if (options.fetchError) throw options.fetchError;
      if (options.httpStatus) return new Response('PRIVATE_HTTP', { status: options.httpStatus });
      if (options.emptyBody) return new Response(null);
      return responseFor(events, options);
    },
  });
  const reader = streamValue.getReader();
  try { while (true) { const item = await reader.read(); if (item.done) break; chunks.push(item.value); } }
  catch (err) { error = err; }
  finally { reader.releaseLock(); }
  assert.equal(usages.length, 1, 'onUsage exactly once on every exit');
  return { usages, calls, citations, observations, chunks, searching, request, error, text: chunks.filter(c => !c.startsWith('\0')).join('') };
}

test('request builder preserves trimmed combined system bytes and converts only current user images', () => {
  const combined = buildCombinedSystemPrompt({ stable: ' stable ', cached: [{ label: 'memory', text: 'memory 日本語' }], pre: '\npre', post: '\n\npost ' });
  const messages = [{ role: 'user', content: 'past' }, { role: 'assistant', content: 'old' }, { role: 'user', content: 'now' }];
  const body = build({ modelId: 'gpt-5.4', systemPrompt: combined, messages, imageBlocks: [image, image] });
  assert.deepEqual(body.input.slice(0, 3), [{ role: 'system', content: combined.trim() }, ...messages.slice(0, 2)]);
  assert.deepEqual(Buffer.from(body.input[0].content), Buffer.from(combined.trim()));
  assert.deepEqual(body.input[3], { role: 'user', content: [
    { type: 'input_image', image_url: 'data:image/png;base64,aW1hZ2U=' }, { type: 'input_image', image_url: 'data:image/png;base64,aW1hZ2U=' }, { type: 'input_text', text: 'now' },
  ] });
  assert.equal(body.input.filter(m => m.role === 'system').length, 1);
  assert.equal('instructions' in body, false);
  assert.equal('tool_choice' in body, false);
  assert.equal('stream_options' in body, false);
  assert.deepEqual(body.tools, [{ type: 'web_search' }]);
  assert.equal(body.max_tool_calls, 3); assert.equal(body.max_output_tokens, 8192);
  assert.equal(body.stream, true); assert.equal(body.store, false);
  for (const systemPrompt of [undefined, '', ' \r\n\t ']) assert.deepEqual(build({ modelId: 'gpt-5.4', systemPrompt, messages }).input, messages);
  assert.deepEqual(build({ modelId: 'gpt-5.4', messages: messages.slice(0, 2), imageBlocks: [image] }).input, messages.slice(0, 2));
});

for (const model of MODEL_REGISTRY.filter(m => m.kind === 'text' && m.provider === 'openai' && !['gpt-4o', 'gpt-5.5-pro'].includes(m.id))) {
  test(`reasoning mapping and exact transport: ${model.id}`, async () => {
    let body, url, init;
    const controller = new AbortController();
    const readable = stream({ apiKey: 'offline', modelId: model.id, messages: [], signal: controller.signal,
      search: { controlToken: 'control', onSearching() {}, onCitation() {} },
      errors: { onHttpError: () => new Error(), onTerminalError: () => new Error(), onTransportError: () => new Error() },
      fetchImpl: async (u, i) => { url = u; init = i; body = JSON.parse(i.body); return responseFor([f.terminal()]); } });
    await new Response(readable.pipeThrough(new TextEncoderStream())).text();
    assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(init.method, 'POST'); assert.equal(init.signal, controller.signal);
    assert.deepEqual(init.headers, { Authorization: 'Bearer offline', 'Content-Type': 'application/json' });
    if (model.openai.reasoningEffort) assert.deepEqual(body.reasoning, { effort: 'medium' });
    else assert.equal(Object.hasOwn(body, 'reasoning'), false);
  });
}

for (const phase of ['in_progress', 'searching', 'completed']) test(`search detection from ${phase} only, token standalone and once`, async () => {
  const result = await run([f.search(phase), f.search(phase), f.delta(), f.terminal()]);
  assert.equal(result.error, undefined); assert.equal(result.searching, 1);
  assert.equal(result.chunks[0], '\0kabe-ctl:unit:searching\0'); assert.equal(result.text, '回答 日本語');
});
for (const phase of ['added', 'done']) test(`search detection from output_item.${phase}`, async () => {
  const result = await run([{ type: `response.output_item.${phase}`, item: { type: 'web_search_call' } }, f.delta(), f.terminal()]);
  assert.equal(result.searching, 1); assert.equal(result.error, undefined);
});
test('annotations added and final output normalize to one source, never action.sources/reasoning/final text', async () => {
  const result = await run(f.answer());
  assert.equal(result.error, undefined); assert.equal(result.text, '回答 日本語');
  assert.equal(result.citations.length, 2);
  assert.deepEqual(normalizeSources(result.citations, 'openai'), { v: 1, provider: 'openai', items: [{ url: 'https://www.example.com/page', title: 'Public example', domain: 'example.com' }] });
  assert.equal(JSON.stringify(result).includes('PRIVATE_REASONING'), false);
  assert.equal(JSON.stringify(result).includes('PRIVATE_UNCITED'), false);
  assert.deepEqual(result.usages, [{ input_tokens: 100, output_tokens: 20, cached_input_tokens: 30, cache_write_input_tokens: 10, normal_input_tokens: 60 }]);
});
test('no search/no annotations and synthetic gpt-5.4 no annotations complete normally', async () => {
  for (const events of [[f.delta(), f.terminal('completed', undefined, { output: [] })], [f.search(), f.delta(), f.terminal('completed', undefined, { output: f.output([]) })]]) {
    const result = await run(events); assert.equal(result.error, undefined); assert.equal(result.citations.length, 0);
    assert.equal(result.searching, events.length === 3 ? 1 : 0);
  }
});
test('missing usage stays null; normal tokens clamp at zero', async () => {
  const missing = await run([f.terminal('completed', undefined, { usage: undefined })]);
  assert.deepEqual(missing.usages[0], { input_tokens: null, output_tokens: null, cached_input_tokens: null, cache_write_input_tokens: null, normal_input_tokens: null });
  const clamped = await run([f.terminal('completed', undefined, { usage: { input_tokens: 2, output_tokens: 1, input_tokens_details: { cached_tokens: 3, cache_write_tokens: 4 } } })]);
  assert.equal(clamped.usages[0].normal_input_tokens, 0);
});
for (const reason of ['max_output_tokens', 'content_filter', 'PRIVATE_REASON']) test(`incomplete retains sources and usage once: ${reason}`, async () => {
  const result = await run([f.search(), f.delta(), f.terminal('incomplete', reason)]);
  assert.equal(result.text, '回答 日本語'); assert.equal(result.citations.length, 1);
  assert.equal(result.usages[0].input_tokens, 100);
  assert.deepEqual(result.calls, [['terminal', 'incomplete', reason === 'PRIVATE_REASON' ? undefined : reason]]);
});
for (const [name, events] of [
  ['failed', [f.delta(), f.terminal('failed')]], ['error', [f.delta(), { type: 'error', error: { message: 'PRIVATE_ERROR' } }]],
  ['delta EOF', [f.delta()]], ['empty EOF', []], ['duplicate completed', [f.terminal(), f.terminal()]],
  ['different terminals', [f.terminal(), f.terminal('failed')]], ['late delta', [f.delta('before'), f.terminal(), f.delta('FORBIDDEN_AFTER_TERMINAL')]],
  ['late search', [f.terminal(), f.search()]], ['late annotation', [f.terminal(), f.added()]],
  ['late search item', [f.terminal(), { type: 'response.output_item.done', item: { type: 'web_search_call' } }]],
]) test(`terminal state rejects ${name}`, async () => {
  const result = await run(events); assert.ok(result.error); assert.equal(result.calls.length, 1);
  assert.equal(result.text.includes('FORBIDDEN_AFTER_TERMINAL'), false);
  if (name.startsWith('late')) assert.equal(result.searching, 0);
  if (name === 'failed') assert.equal(result.usages[0].input_tokens, 100);
});
test('duplicate terminal never overwrites first terminal usage or citations', async () => {
  const result = await run([f.terminal(), f.terminal('completed', undefined, { usage: { input_tokens: 999 }, output: f.output([{ ...f.annotation, url: 'https://forbidden.example/' }]) })]);
  assert.equal(result.usages[0].input_tokens, 100); assert.equal(result.citations.length, 1);
});
test('all deltas survive one transport chunk even when the terminal fails', async () => {
  const events = [f.delta('a'), f.delta('b'), f.delta('c'), f.terminal('failed')];
  const result = await run([], { chunks: [Buffer.from(events.map(e => `data:${JSON.stringify(e)}\n`).join(''))] });
  assert.equal(result.text, 'abc'); assert.ok(result.error);
});
test('invalid complete JSON followed by completed is a protocol error with recovered usage', async () => {
  const result = await run([], { chunks: [Buffer.from('data: {broken}\n'), Buffer.from(`data:${JSON.stringify(f.terminal())}\n`)] });
  assert.equal(result.error.message, 'protocol:'); assert.equal(result.usages[0].input_tokens, 100);
});
test('SSE handles event lines, optional space, CRLF, DONE and final data without newline', async () => {
  const raw = `event: response.output_text.delta\r\ndata:${JSON.stringify(f.delta())}\r\n\r\ndata: [DONE]\r\ndata: ${JSON.stringify(f.terminal())}`;
  const result = await run([], { chunks: [Buffer.from(raw)] });
  assert.equal(result.error, undefined); assert.equal(result.text, '回答 日本語');
});
test('SSE decodes every byte separately across multibyte text and JSON lines', async () => {
  const raw = Buffer.from(`event: delta\ndata:${JSON.stringify(f.delta())}\n\ndata:${JSON.stringify(f.terminal())}`);
  const result = await run([], { chunks: [...raw].map(byte => Uint8Array.of(byte)) });
  assert.equal(result.error, undefined); assert.equal(result.text, '回答 日本語');
});
test('truncated final JSON and empty HTTP body are protocol errors', async () => {
  for (const options of [{ chunks: [Buffer.from('data: {"type":')] }, { emptyBody: true }]) {
    const result = await run([], options); assert.equal(result.error.message, 'protocol:');
  }
});
test('HTTP error and transport failure use only their injected handler', async () => {
  const http = await run([], { httpStatus: 400 }); assert.deepEqual(http.calls, [['http', 400]]);
  const transport = await run([], { fetchError: new Error('PRIVATE_TRANSPORT') }); assert.deepEqual(transport.calls, [['transport', 'Error']]);
  const read = await run([f.terminal()], { failRead: true }); assert.deepEqual(read.calls, [['transport', 'Error']]); assert.equal(read.usages[0].input_tokens, 100);
});
test('AbortError and signal abort close normally, preserving recovered usage exactly once', async () => {
  for (const mode of ['read', 'signal', 'fetch', 'midstream']) {
    const controller = new AbortController();
    const error = new Error('PRIVATE_ABORT'); error.name = 'AbortError';
    const result = await run(mode === 'fetch' ? [] : mode === 'midstream' ? [f.search(), f.delta()] : [f.delta(), f.terminal()], {
      signal: controller.signal, ...(mode === 'fetch' ? { fetchError: error } : { abort: true, ...(mode === 'signal' ? { abortController: controller } : {}) }),
    });
    assert.equal(result.error, undefined); assert.deepEqual(result.calls, []); assert.equal(result.usages[0].aborted, true);
    assert.equal(result.usages[0].input_tokens, ['fetch', 'midstream'].includes(mode) ? null : 100);
  }
});
test('an aborted signal also suppresses a transport error whose name is not AbortError', async () => {
  const controller = new AbortController(); controller.abort();
  const result = await run([], { signal: controller.signal, fetchError: new Error('PRIVATE_TRANSPORT') });
  assert.equal(result.error, undefined); assert.equal(result.usages[0].aborted, true); assert.deepEqual(result.calls, []);
});
test('done text is observational per item/content part; mismatch never changes delta text or fails', async () => {
  const done = (item_id, content_index, text) => ({ type: 'response.output_text.done', item_id, content_index, text });
  const result = await run([f.delta('a', 'one', 0), f.delta('x', 'two', 0), f.delta('b', 'one', 0), f.delta('z', 'one', 1),
    done('one', 0, 'ab'), done('two', 0, 'DIFFERENT'), done('one', 1, 'z'), f.terminal()]);
  assert.equal(result.text, 'axbz'); assert.equal(result.error, undefined);
  assert.deepEqual(result.observations, [
    { itemId: 'one', contentIndex: 0, matchesDelta: true }, { itemId: 'two', contentIndex: 0, matchesDelta: false }, { itemId: 'one', contentIndex: 1, matchesDelta: true },
  ]);
});
