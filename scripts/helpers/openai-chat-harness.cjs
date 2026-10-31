const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { installAliasResolver, installTsLoader } = require('../testBootstrap.cjs');
globalThis.AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'offline';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'offline-service';
let state;
const original = {
  content: 'original answer', provider: 'claude', model_id: 'claude-opus-4-6', input_tokens: 61, output_tokens: null,
  metadata: { copied_from_message_id: 'keep', sources: { v: 1, provider: 'claude', items: [{ url: 'https://old.example/', title: 'old', domain: 'old.example' }] } },
};
function query(table) {
  let columns = '';
  const q = {
    select(value) { columns = value; return q; }, eq() { return q; }, is() { return q; }, not() { return q; }, order() { return q; }, limit() { return q; },
    async maybeSingle() {
      if (table === 'threads') return { data: { id: 't', project_id: null, user_id: 'u', deleted_at: null }, error: null };
      if (table === 'messages' && columns.startsWith('id, content')) return { data: { id: 'old-assistant', ...state.original }, error: null };
      return { data: null, error: null };
    },
    async insert(payload) { state.inserts.push(payload); return { error: null }; },
    async upsert(payload) { state.saves.push(payload); return { error: state.saveFails ? { code: 'MOCK_SAVE_FAILURE' } : null }; },
    async update(payload) { state.updates.push(payload); return { error: null }; },
    then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
  };
  return q;
}
const db = { from: query };
const load = Module._load;
Module._load = function (request, parent, main) {
  if (request === 'uuid') return { v4: () => '00000000-0000-4000-8000-000000000001' };
  if (request === '@vercel/functions') return { waitUntil: promise => state.background.push(promise) };
  if (request === '@/lib/supabase/route-auth') return { requireRouteUser: async () => ({ ok: true, user: { id: 'u' }, supabase: db, finalizeResponse: response => response }) };
  if (request === '@/lib/rate-limit') return { checkChatRateLimit: async () => ({ allowed: true }) };
  if (request === '@/lib/mcp-auth') return { serviceRoleClient: () => ({}) };
  if (request === '@/lib/aiUsage') return {
    calculateTextUsageCost: () => ({ estimatedCostUsd: null, costSource: 'unavailable' }),
    recordUsageEvent: async (_client, event) => { state.usage.push(event); return true; },
  };
  if (request === '@/lib/logger') return new Proxy({}, { get: (_target, name) => name === 'toExternalService' ? value => value === 'claude' ? 'anthropic' : value : (...values) => state.logs.push([name, ...values]) });
  if (request === '@/lib/lore') return {
    embedQuery: async () => { throw new Error('Unexpected Lore request'); },
    searchLoreByEmbeddingForProject: async () => [], searchLoreV2ByEmbeddingForProject: async () => [],
  };
  return load.call(this, request, parent, main);
};
installAliasResolver();
installTsLoader({ transformOutput(output, filename) {
  return filename.endsWith(path.join('app', 'api', 'chat', 'route.ts'))
    ? output + '\nmodule.exports.__test = { streamOpenAI, streamClaude };' : output;
} });
const { NextRequest } = require('next/server');
const route = require('../../app/api/chat/route.ts');
Module._load = load;

// Synthetic event payloads follow the Phase 2a specification, not a live API capture.
function responseFor(events, options = {}) {
  const encoder = new TextEncoder();
  const chunks = options.chunks ?? events.map(event => encoder.encode(`event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`));
  let index = 0;
  return new Response(new ReadableStream({ async pull(controller) {
    await new Promise(resolve => setImmediate(resolve));
    if (index < chunks.length) controller.enqueue(chunks[index++]);
    else if (options.abort || options.failRead) {
      if (options.abort) options.abortController?.abort();
      const error = new Error('PRIVATE_TRANSPORT_MESSAGE');
      if (options.abort) error.name = 'AbortError';
      controller.error(error);
    } else controller.close();
  } }), { status: 200 });
}
async function invoke(events = [], options = {}) {
  state = { background: [], saves: [], inserts: [], updates: [], rest: [], upstream: [], usage: [], logs: [], original: structuredClone(original), ...options };
  const controller = new AbortController();
  const oldFetch = global.fetch;
  global.fetch = async (url, init) => {
    if (url === 'http://127.0.0.1:9/rest/v1/messages') {
      state.rest.push(JSON.parse(init.body)); return new Response('', { status: 201 });
    }
    assert.ok(['https://api.openai.com/v1/chat/completions', 'https://api.openai.com/v1/responses'].includes(url), 'unexpected upstream');
    state.upstream.push({ url, body: init.body, signal: init.signal });
    if (options.httpStatus) return Response.json({ error: { message: 'PRIVATE_HTTP_MESSAGE', type: 'tool_secret' } }, { status: options.httpStatus });
    const sent = JSON.parse(init.body);
    if (url.endsWith('/responses') && !sent.stream) return Response.json({ output: [{ content: [{ type: 'output_text', text: 'legacy Pro' }] }], usage: { input_tokens: 1, output_tokens: 2 } });
    if (url.endsWith('/chat/completions')) return responseFor([{ choices: [{ delta: { content: 'legacy chat' } }] }]);
    return responseFor(events, { ...options, abortController: controller });
  };
  try {
    const body = { threadId: 't', userContent: 'hello 日本語', messages: [], provider: 'openai', modelId: 'gpt-5.4-mini', webSearch: true,
      ...(options.light ? { regenerateMode: 'light', isRegenerate: true, targetMessageId: 'old-assistant' } : {}), ...options.body };
    const request = new NextRequest('http://localhost/api/chat', { method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-openai-api-key': 'offline-key' }, body: JSON.stringify(body) });
    const response = await route.POST(request);
    const text = await response.text();
    await Promise.all(state.background);
    const json = response.headers.get('content-type').includes('application/json') ? JSON.parse(text) : undefined;
    const rows = json ? [] : text.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(text.includes('kabe-ctl:'), false);
    assert.equal(JSON.stringify([state.saves, state.rest]).includes('kabe-ctl:'), false);
    return { ...state, response, text, json, rows, kinds: rows.map(row => row.type), signal: request.signal };
  } finally { global.fetch = oldFetch; }
}
module.exports = { invoke, responseFor, original, route };
