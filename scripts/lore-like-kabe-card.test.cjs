const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { installAliasResolver, installTsLoader } = require('./testBootstrap.cjs');
const { sequence, row } = require('./thread-trash-test-helpers.cjs');

globalThis.AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage;
let db, embeddingInputs, embeddingError;
class AiProviderRequestError extends Error {
  constructor(status, errorCode) {
    super(errorCode);
    this.status = status;
    this.errorCode = errorCode;
    this.provider = 'openai';
  }
}

const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === '@/lib/supabase/route-auth') return {
    requireRouteUser: async () => ({ ok: true, user: { id: 'u' }, supabase: db, finalizeJson: Response.json }),
  };
  if (request === '@/lib/mcp-auth') return { serviceRoleClient: () => db };
  if (request === '@/lib/lore/openai') return {
    AiProviderRequestError,
    createEmbedding: async (_key, input) => {
      embeddingInputs.push(input);
      if (embeddingError) throw embeddingError;
      return [1];
    },
  };
  return original.call(this, request, parent, main);
};
installTsLoader();
installAliasResolver();
const { POST } = require('../app/api/lore/like/route.ts');
const { LIKED_AI_DEFAULTS } = require('../lib/lore/types.ts');

const validCard = '```kabe-card\ntitle: title\nbadge: badge\nmeta: meta\ntone: warning\n本文\n```';
const plainCard = 'title（badge／meta）\n本文';
const invalidCard = '```kabe-card\nbadge: invalid\n原文\n```';
const req = () => new Request('http://local/api/lore/like', {
  method: 'POST', body: JSON.stringify({ messageId: 'm' }), headers: { 'x-openai-api-key': 'key' },
});
function setup(content, { duplicate = false, error = null } = {}) {
  db = sequence([
    row({ id: 'm', thread_id: 't', role: 'assistant', content, user_id: 'u' }),
    row({ project_id: null, user_id: 'u', deleted_at: null }),
    row(duplicate ? { id: 'x' } : null),
    ...(!duplicate && !error ? [row(null)] : []),
  ]);
  embeddingInputs = [];
  embeddingError = error;
}
function inserted() {
  const inserts = db.calls.filter(call => call.operation === 'insert');
  assert.strictEqual(inserts.length, 1);
  assert.strictEqual(inserts[0].table, 'lore_embeddings');
  assert.deepEqual(db.calls.map(call => call.table), ['messages', 'threads', 'lore_embeddings', 'lore_embeddings']);
  return inserts[0];
}

test('case 1: valid card uses the same plain text for embedding and Lore', async () => {
  setup(validCard);
  const response = await POST(req());
  assert.strictEqual(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  const insert = inserted();
  assert.strictEqual(embeddingInputs.length, 1);
  assert.strictEqual(embeddingInputs[0], plainCard);
  assert.ok(!embeddingInputs[0].includes('```kabe-card'));
  assert.ok(!embeddingInputs[0].includes('tone:'));
  assert.strictEqual(embeddingInputs[0], insert.payload.chunk_text);
  assert.deepEqual(insert.payload.metadata, { ai_proposed_kind: LIKED_AI_DEFAULTS.memoryKind });
});

test('case 2: mixed cards convert only valid cards and preserve invalid source', async () => {
  setup(`${validCard}\n\n${invalidCard}`);
  const response = await POST(req());
  assert.strictEqual(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  const insert = inserted();
  assert.deepEqual(embeddingInputs, [`${plainCard}\n\n${invalidCard}`]);
  assert.strictEqual(embeddingInputs[0], insert.payload.chunk_text);
});

test('case 3: cardless CRLF text is unchanged in embedding and Lore', async () => {
  const content = ' \t 前文 😀　\r\n**強調**\r\n後文　 ';
  setup(content);
  const response = await POST(req());
  assert.strictEqual(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  const insert = inserted();
  assert.deepEqual(embeddingInputs, [content]);
  assert.strictEqual(insert.payload.chunk_text, content);
});

test('case 4: duplicate skips embedding and insert', async () => {
  setup(validCard, { duplicate: true });
  const response = await POST(req());
  assert.strictEqual(response.status, 200);
  assert.deepEqual(await response.json(), { alreadyLiked: true });
  assert.deepEqual(embeddingInputs, []);
  assert.strictEqual(db.calls.length, 3);
  assert.ok(db.calls.every(call => call.operation === 'select'));
});

test('case 5: embedding failure preserves the response and skips insert after plainifying', async () => {
  setup(validCard, { error: new AiProviderRequestError(429, 'UPSTREAM_API_ERROR') });
  const response = await POST(req());
  assert.strictEqual(response.status, 429);
  assert.deepEqual(await response.json(), {
    error: 'OpenAI APIへのリクエストに失敗しました', provider: 'openai', status: 429,
  });
  assert.strictEqual(db.calls.length, 3);
  assert.ok(db.calls.every(call => call.operation === 'select'));
  assert.deepEqual(embeddingInputs, [plainCard]);
});
