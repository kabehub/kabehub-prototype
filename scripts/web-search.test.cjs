const assert = require('node:assert/strict');
const { test } = require('node:test');
const { installAliasResolver, installTsLoader } = require('./testBootstrap.cjs');
installTsLoader();
installAliasResolver();
const shared = require('../packages/shared/src/index.ts');
const registry = require('../lib/modelRegistry.ts');
const sharedRegistry = require('../packages/shared/src/modelRegistry.ts');
const { resolveAssistantPersistence, shouldEmitCitations } = require('../lib/chat-assistant-persistence.ts');
const { normalizeSources, withSources } = shared;

test('both registries and the shared root expose model capability without surface/status filtering', () => {
  assert.deepEqual(registry.MODEL_REGISTRY, sharedRegistry.MODEL_REGISTRY);
  const models = registry.MODEL_REGISTRY.filter(m => m.provider === 'claude');
  assert.equal(models.length, 13);
  for (const source of [registry, sharedRegistry, shared]) {
    for (const model of models) assert.equal(source.supportsWebSearch('claude', model.id), true);
    for (const model of source.MODEL_REGISTRY.filter(m => ['gemini', 'openai'].includes(m.provider))) {
      assert.equal(source.supportsWebSearch(model.provider, model.id), false);
    }
    assert.equal(source.supportsWebSearch('openai', models[0].id), false);
    assert.equal(source.supportsWebSearch('claude', 'unknown'), false);
    const fixture = { kind: 'text', id: 'search-capability-fixture', provider: 'claude', status: 'hidden', surfaces: { chat: false, arena: false }, features: { webSearch: true } };
    source.MODEL_REGISTRY.push(fixture);
    try {
      assert.equal(source.supportsWebSearch('claude', fixture.id), true);
      assert.equal(source.isAllowedModel('claude', fixture.id, 'chat'), false);
    } finally { source.MODEL_REGISTRY.pop(); }
  }
  assert.equal(typeof shared.normalizeSources, 'function');
  assert.equal(typeof shared.withSources, 'function');
  assert.equal(shared.WEB_SEARCH_MAX_USES_CLAUDE, 3);
  assert.equal(shared.MAX_SOURCES, 20);
  assert.equal(shared.MAX_SOURCE_TITLE_LENGTH, 120);
  assert.equal(shared.MAX_SOURCE_URL_LENGTH, 2048);
});

test('normalization removes credentials/tracking, deduplicates first wins and computes display fields', () => {
  assert.deepEqual(normalizeSources([
    { url: 'https://user:password@WWW.Example.COM/page?keep=yes&utm_source=openai&utm_source=other#part', title: '  first\n\t title  ' },
    { url: 'https://www.example.com/page?keep=yes&utm_source=other#part', title: 'duplicate ignored' },
    { url: 'http://www.other.example/', title: ' \n ' },
    { url: 'https://another.example/', title: 7 },
  ], 'claude'), { v: 1, provider: 'claude', items: [
    { url: 'https://www.example.com/page?keep=yes&utm_source=other#part', title: 'first title', domain: 'example.com' },
    { url: 'http://www.other.example/', title: 'other.example', domain: 'other.example' },
    { url: 'https://another.example/', title: 'another.example', domain: 'another.example' },
  ] });
});

test('only HTTP(S), malformed/long URL safety, credential removal before length validation and 120 code points', () => {
  for (const raw of [null, undefined, {}, 'url', [], [null, 1, {}, { url: 1 }], [
    { url: 'javascript:alert(1)' }, { url: 'data:text/plain,x' }, { url: 'ftp://example.com' }, { url: '/relative' },
    { url: 'https://' }, { url: 'https://example.com/' + 'x'.repeat(100000) },
  ]]) assert.equal(normalizeSources(raw, 'claude'), undefined);
  const prefix = 'https://example.com/';
  assert.equal(normalizeSources([{ url: prefix + 'x'.repeat(2048 - prefix.length) }], 'claude').items[0].url.length, 2048);
  assert.equal(normalizeSources([{ url: prefix + 'x'.repeat(2049 - prefix.length) }], 'claude'), undefined);
  const result = normalizeSources([{ url: 'https://' + 'x'.repeat(3000) + ':secret@example.com/', title: '😀'.repeat(121) }], 'openai');
  assert.equal(result.provider, 'openai');
  assert.equal(result.items[0].url, 'https://example.com/');
  assert.equal(Array.from(result.items[0].title).length, 120);
  assert.equal(result.items[0].title, '😀'.repeat(120));
});

test('only the first 20 distinct valid cited sources survive', () => {
  const raw = Array.from({ length: 25 }, (_, i) => ({ url: `https://example.com/${i}` }));
  raw.splice(1, 0, raw[0]);
  const result = normalizeSources(raw, 'claude');
  assert.equal(result.items.length, 20);
  assert.equal(result.items.at(-1).url, 'https://example.com/19');
});

const oldSources = normalizeSources([{ url: 'https://old.example/' }], 'claude');
const newSources = normalizeSources([{ url: 'https://new.example/' }], 'claude');
test('withSources replaces/removes only sources without mutating its input', () => {
  const metadata = { copied_from_message_id: 'old-id', sources: oldSources, extra: { keep: true } };
  assert.deepEqual(withSources(metadata, newSources), { ...metadata, sources: newSources });
  assert.deepEqual(withSources(metadata, undefined), { copied_from_message_id: 'old-id', extra: { keep: true } });
  assert.equal(metadata.sources, oldSources);
  for (const value of [null, undefined, 42, 'text', []]) assert.deepEqual(withSources(value, undefined), {});
});

const original = { content: 'old', provider: 'claude', model_id: 'claude-sonnet-4-5', input_tokens: null, output_tokens: 17, metadata: { sources: oldSources, copied_from_message_id: 'keep' } };
const input = { isLightRegenerate: true, status: 'completed', original, accumulatedText: 'new', usedProvider: 'gemini', resolvedModelId: 'gemini-2.5-flash', usage: { input_tokens: null, output_tokens: null }, sources: newSources };
test('pure persistence restores every old field on light failure/abort, including provider and null tokens', () => {
  for (const status of ['failed', 'aborted']) {
    assert.deepEqual(resolveAssistantPersistence({ ...input, status }), original);
    assert.equal(shouldEmitCitations({ aborted: status === 'aborted', isLightRegenerate: true, status }), false);
  }
});
test('pure persistence replaces/removes sources on light success and keeps new null usage', () => {
  const saved = resolveAssistantPersistence(input);
  assert.equal(saved.content, 'new');
  assert.equal(saved.provider, 'gemini');
  assert.equal(saved.input_tokens, null);
  assert.equal(saved.output_tokens, null);
  assert.deepEqual(saved.metadata, { ...original.metadata, sources: newSources });
  assert.deepEqual(resolveAssistantPersistence({ ...input, sources: undefined }).metadata, { copied_from_message_id: 'keep' });
  for (const status of ['completed', 'failed', 'aborted']) {
    const saved = resolveAssistantPersistence({ ...input, status, isLightRegenerate: false });
    assert.equal(saved.content, 'new');
    assert.deepEqual(saved.metadata, { sources: newSources });
  }
  assert.equal(Object.hasOwn(resolveAssistantPersistence({ ...input, isLightRegenerate: false, sources: undefined }), 'metadata'), false);
  assert.equal(shouldEmitCitations({ aborted: false, isLightRegenerate: false, status: 'failed' }), true);
  assert.equal(shouldEmitCitations({ aborted: true, isLightRegenerate: false, status: 'aborted' }), false);
});
