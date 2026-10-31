const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const { installAliasResolver, installTsLoader } = require('./testBootstrap.cjs');
const responses = require('./helpers/openai-responses-fixtures.cjs');

globalThis.AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'offline';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'offline-service';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_PROMPT = 'Project system prompt';
const LABEL_NOTE = '\n\n【重要】会話履歴中の [model-id] はシステムが付与した発言者識別ラベルです。あなた自身の返答には絶対にこの形式のラベルを含めないでください。';
const PINNED = 'pinned reference fixture';
let state;

function query(table) {
  const call = { table };
  state.queries.push(call);
  const q = {
    select(columns) { call.columns = columns; return q; },
    eq() { return q; }, is() { return q; }, not() { return q; }, order() { return q; }, limit() { return q; },
    async maybeSingle() {
      if (table === 'threads') {
        state.threadReads++;
        if (state.createThread && state.threadReads === 1) return { data: null, error: null };
        return { data: { project_id: state.projectId, roleplay_mode: state.roleplay, user_id: 'u', deleted_at: null }, error: null };
      }
      if (table === 'project_settings') return { data: {
        system_prompt: PROJECT_PROMPT, folder_type: state.folderType,
        pinned_github_files: state.cached ? ['fixture'] : [],
        github_repo: state.loop ? 'test/repo' : null,
      }, error: null };
      return { data: null, error: null };
    },
    async insert(payload) { state.writes.push({ table, payload }); return { error: null }; },
    async upsert(payload) { state.writes.push({ table, payload }); return { error: null }; },
    then(resolve, reject) {
      const data = table === 'project_memory_topics' && state.cached
        ? [{ id: 'topic', topic_key: 'overview', content_md: 'cached memory fixture', revision: 1 }] : [];
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return q;
}

const originalLoad = Module._load;
Module._load = function (request, parent, main) {
  if (request === 'uuid') return { v4: () => '00000000-0000-4000-8000-000000000001' };
  if (request === '@vercel/functions') return { waitUntil: promise => state.background.push(promise) };
  if (request === '@/lib/supabase/route-auth') return { requireRouteUser: async () => ({
    ok: true, user: { id: 'u' }, supabase: { from: query }, finalizeResponse: response => response,
  }) };
  if (request === '@/lib/supabase/route-handler') return { createRouteHandlerSupabaseClient() { throw new Error('Unexpected real DB client'); } };
  if (request === '@/lib/rate-limit') return { checkChatRateLimit: async () => ({ allowed: true }) };
  if (request === '@/lib/mcp-auth') return { serviceRoleClient: () => ({}) };
  if (request === '@/lib/aiUsage') return {
    calculateTextUsageCost: () => ({ estimatedCostUsd: null, costSource: 'unavailable' }),
    recordUsageEvent: async () => true,
  };
  if (request === '@/lib/logger') return new Proxy({}, { get: () => () => {} });
  if (request === '@/lib/lore') return {
    embedQuery: async () => [0], searchLoreByEmbeddingForProject: async () => [], searchLoreV2ByEmbeddingForProject: async () => [],
  };
  if (request === '@/lib/github-token-store') return { getGithubToken: async () => 'offline' };
  if (request === '@/lib/github') return { buildPinnedGithubContext: async () => ({ context: PINNED, warnings: [] }) };
  if (request === '@/lib/github-tool-loop') return { runGithubToolLoop: async options => {
    state.loopSystems.push(options.systemPrompt);
    return { contextBlock: 'explored reference fixture', warnings: [] };
  } };
  if (request === '@/lib/context-window') {
    const real = originalLoad.call(this, request, parent, main);
    return { ...real, trimContextToWindow(messages, system, options) {
      state.trimSystems.push(system);
      return real.trimContextToWindow(messages, system, options);
    } };
  }
  return originalLoad.call(this, request, parent, main);
};
installAliasResolver(); installTsLoader();
let POST, NextRequest, KABE_CARD_SYSTEM_PROMPT;
try {
  ({ NextRequest } = require('next/server'));
  ({ POST } = require('../app/api/chat/route.ts'));
  ({ KABE_CARD_SYSTEM_PROMPT } = require('../lib/kabe-card-system-prompt.ts'));
} finally { Module._load = originalLoad; }

const variants = [
  { name: 'Claude', provider: 'claude', modelId: 'claude-sonnet-4-5', webSearch: false, endpoint: 'https://api.anthropic.com/v1/messages' },
  { name: 'Claude Thinking', provider: 'claude', modelId: 'claude-sonnet-4-5', webSearch: false, isDeepThinking: true, endpoint: 'https://api.anthropic.com/v1/messages' },
  { name: 'Claude cached', provider: 'claude', modelId: 'claude-sonnet-4-5', webSearch: false, cached: true, endpoint: 'https://api.anthropic.com/v1/messages' },
  { name: 'Claude search', provider: 'claude', modelId: 'claude-sonnet-4-5', webSearch: true, endpoint: 'https://api.anthropic.com/v1/messages' },
  { name: 'Gemini', provider: 'gemini', modelId: 'gemini-2.5-flash', webSearch: false, endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse' },
  { name: 'OpenAI chat', provider: 'openai', modelId: 'gpt-5.4-mini', webSearch: false, endpoint: 'https://api.openai.com/v1/chat/completions' },
  { name: 'OpenAI search', provider: 'openai', modelId: 'gpt-5.4-mini', webSearch: true, endpoint: 'https://api.openai.com/v1/responses' },
  { name: 'OpenAI Pro', provider: 'openai', modelId: 'gpt-5.5-pro', webSearch: false, endpoint: 'https://api.openai.com/v1/responses' },
];
const sse = events => new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''));
async function send(variant, options = {}) {
  // Successful ON cases explicitly use a normal Project, never the novel default from other harnesses.
  state = { projectId: PROJECT_ID, folderType: 'chat', roleplay: false, cached: !!variant.cached,
    loop: false, threadReads: 0, background: [], upstream: [], queries: [], writes: [], trimSystems: [], loopSystems: [], ...options };
  const previousFetch = global.fetch;
  global.fetch = async (url, init) => {
    const address = String(url), body = JSON.parse(init.body);
    assert.equal(address, variant.endpoint, 'unexpected provider URL; no network is allowed');
    state.upstream.push({ url: address, raw: init.body, body });
    if (variant.provider === 'claude') return sse([{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'answer' } }]);
    if (variant.provider === 'gemini') return sse([{ candidates: [{ content: { parts: [{ text: 'answer' }] } }] }]);
    if (address.endsWith('/chat/completions')) return sse([{ choices: [{ delta: { content: 'answer' } }] }]);
    if (body.stream) return sse([responses.delta('answer'), responses.terminal('completed', undefined, { output: [] })]);
    return Response.json({ output: [{ content: [{ type: 'output_text', text: 'answer' }] }] });
  };
  try {
    const body = { threadId: 't', userContent: 'hello', messages: variant.cached ? [
      { role: 'user', content: 'previous' },
      { role: 'assistant', content: 'previous answer', provider: 'claude', model_id: 'claude-sonnet-4-5' },
    ] : [], provider: variant.provider, modelId: variant.modelId,
    webSearch: variant.webSearch, isDeepThinking: variant.isDeepThinking ?? false, ...options.body };
    const response = await POST(new NextRequest('http://localhost/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-anthropic-api-key': 'offline',
        'x-gemini-api-key': 'offline', 'x-openai-api-key': 'offline' }, body: JSON.stringify(body),
    }));
    const text = await response.text();
    await Promise.all(state.background);
    assert.equal(response.status, 200, text);
    if (!body.isMemo) {
      assert.equal(state.upstream.length, 1, text);
      assert.match(text, /answer/);
    }
    return { ...state, text };
  } finally { global.fetch = previousFetch; }
}
function systemOf(result, variant) {
  const body = result.upstream[0].body;
  if (variant.provider === 'claude') return body.system;
  if (variant.provider === 'gemini') return body.systemInstruction.parts[0].text;
  const messages = body.messages ?? body.input;
  assert.equal(messages[0].role, 'system');
  return messages[0].content;
}
function markerPaths(value, path = '') {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => key === 'cache_control'
    ? [path + '.' + key] : markerPaths(child, path + '.' + key));
}
const bytes = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));

for (const variant of variants) {
  test(`${variant.name}: ON appends exact stable rules and preserves cache marker positions`, async () => {
    const off = await send(variant);
    const on = await send(variant, { body: { richDisplay: true } });
    const stable = PROJECT_PROMPT + LABEL_NOTE;
    const enabledStable = stable + '\n\n' + KABE_CARD_SYSTEM_PROMPT;
    const offSystem = systemOf(off, variant), onSystem = systemOf(on, variant);
    if (variant.provider === 'claude') {
      assert.equal(offSystem[0].text, stable);
      assert.equal(onSystem[0].text, enabledStable);
      const expected = structuredClone(off.upstream[0].body);
      expected.system[0].text = enabledStable;
      assert.deepEqual(on.upstream[0].body, expected);
      assert.deepEqual(markerPaths(on.upstream[0].body), markerPaths(off.upstream[0].body));
      if (variant.cached) {
        assert.equal(markerPaths(onSystem).length, 3);
        assert.equal(markerPaths(on.upstream[0].body).length, 4);
      }
    } else {
      assert.equal(offSystem, stable);
      assert.equal(onSystem, enabledStable);
    }
    assert.equal(on.trimSystems.length, 1);
    assert.ok(on.trimSystems[0].startsWith(enabledStable));
  });

  test(`${variant.name}: all non-true values preserve complete OFF request and system bytes`, async () => {
    const baseline = await send(variant);
    const baselineSystem = systemOf(baseline, variant);
    assert.equal(bytes(baselineSystem).includes(Buffer.from(KABE_CARD_SYSTEM_PROMPT)), false);
    for (const richDisplay of [undefined, false, null, 'true', 1, {}]) {
      const result = await send(variant, { body: { richDisplay } });
      assert.deepEqual(bytes(systemOf(result, variant)), bytes(baselineSystem));
      assert.deepEqual(bytes(result.upstream[0].raw), bytes(baseline.upstream[0].raw));
      assert.deepEqual(result.trimSystems, baseline.trimSystems);
    }
  });
}

for (const variant of variants) test(`${variant.name}: temporary, roleplay, novel and memo exclude injection`, async () => {
  for (const scenario of [
    { body: { isTemporary: true, threadId: null } },
    { roleplay: true },
    { folderType: 'novel' },
    { createThread: true, roleplay: true },
  ]) {
    const off = await send(variant, scenario);
    const on = await send(variant, { ...scenario, body: { ...scenario.body, richDisplay: true } });
    assert.deepEqual(bytes(systemOf(on, variant)), bytes(systemOf(off, variant)));
    assert.deepEqual(bytes(on.upstream[0].raw), bytes(off.upstream[0].raw));
    assert.equal(bytes(systemOf(on, variant)).includes(Buffer.from(KABE_CARD_SYSTEM_PROMPT)), false);
    if (scenario.body?.isTemporary) {
      assert.equal(on.queries.some(q => ['threads', 'project_settings'].includes(q.table)), false);
    }
    if (scenario.createThread) {
      assert.equal(on.threadReads, 2);
      assert.deepEqual(on.queries.filter(q => q.table === 'threads' && q.columns).map(q => q.columns),
        ['project_id, user_id, deleted_at, roleplay_mode', 'project_id, user_id, deleted_at, roleplay_mode']);
    }
  }
  const memo = await send(variant, { body: { richDisplay: true, isMemo: true } });
  assert.equal(memo.upstream.length, 0);
  assert.deepEqual(memo.trimSystems, []);
  assert.deepEqual(memo.loopSystems, []);
});

test('GitHub discovery retains the base stable while ON answers and trim receive card rules', async () => {
  const variant = variants[0];
  const off = await send(variant, { loop: true });
  const on = await send(variant, { loop: true, body: { richDisplay: true } });
  assert.deepEqual(off.loopSystems, [PROJECT_PROMPT + LABEL_NOTE]);
  assert.deepEqual(on.loopSystems, off.loopSystems);
  assert.equal(on.loopSystems[0].includes(KABE_CARD_SYSTEM_PROMPT), false);
  assert.equal(systemOf(off, variant)[0].text, PROJECT_PROMPT + LABEL_NOTE);
  assert.equal(systemOf(on, variant)[0].text, PROJECT_PROMPT + LABEL_NOTE + '\n\n' + KABE_CARD_SYSTEM_PROMPT);
  // Combined system preserves the legacy raw separators; Claude trims each block.
  const reference = '\n\n\n\n' + require('../lib/ai-context-blocks.ts').buildReferencePreamble() + '\n\nexplored reference fixture';
  assert.equal(off.trimSystems[0], PROJECT_PROMPT + LABEL_NOTE + reference);
  assert.equal(on.trimSystems[0], PROJECT_PROMPT + LABEL_NOTE + '\n\n' + KABE_CARD_SYSTEM_PROMPT + reference);
  assert.equal(off.trimSystems[0].includes(KABE_CARD_SYSTEM_PROMPT), false);
});

test('threads outside a Project still receive rules and do not query Project settings', async () => {
  const result = await send(variants[0], { projectId: null, body: { richDisplay: true } });
  assert.equal(systemOf(result, variants[0])[0].text, LABEL_NOTE.trim() + '\n\n' + KABE_CARD_SYSTEM_PROMPT);
  assert.equal(result.queries.some(q => q.table === 'project_settings'), false);
});
