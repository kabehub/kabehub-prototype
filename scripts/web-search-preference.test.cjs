const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const { installTsLoader, installAliasResolver } = require('./testBootstrap.cjs');
installTsLoader(); installAliasResolver();
const storeHooks = [];
const load = Module._load;
Module._load = function (name, parent, main) {
  if (name === 'react') return { useSyncExternalStore(subscribe, snapshot, serverSnapshot) {
    storeHooks.push({ subscribe, snapshot, serverSnapshot });
    return typeof window === 'undefined' ? serverSnapshot() : snapshot();
  } };
  return load.call(this, name, parent, main);
};
const preference = require('../lib/webSearchPreference.ts');
Module._load = load;
const { readWebSearchPreference: read, writeWebSearchPreference: write, resolveWebSearch, useWebSearchPreference, WEB_SEARCH_STORAGE_KEY: key } = preference;
const { MODEL_REGISTRY, supportsWebSearch } = require('../lib/modelRegistry.ts');
const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
};
test('storage value is 1/unset, defaults OFF, and storage/SSR failures do not escape', () => {
  assert.equal(key, 'kabehub_web_search');
  assert.equal(read(), false);
  assert.doesNotThrow(() => write(true));
  const s = storage();
  assert.equal(read(s), false); write(true, s); assert.equal(read(s), true); assert.equal(s.getItem(key), '1');
  write(false, s); assert.equal(read(s), false); assert.equal(s.getItem(key), null);
  s.setItem(key, 'true'); assert.equal(read(s), false);
  const broken = new Proxy({}, { get() { throw new Error('private mode'); } });
  assert.equal(read(broken), false); assert.doesNotThrow(() => write(true, broken)); assert.doesNotThrow(() => write(false, broken));
  global.window = Object.defineProperty({}, 'localStorage', { get() { throw new Error('blocked'); } });
  try { assert.equal(read(), false); assert.doesNotThrow(() => write(true)); } finally { delete global.window; }
});
test('all subscribers observe writes and cross-tab storage events; failed writes do not notify', () => {
  const events = new Map(), s = storage();
  global.window = { localStorage: s, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
  try {
    const values = [];
    useWebSearchPreference(); useWebSearchPreference();
    const a = storeHooks.at(-2), b = storeHooks.at(-1);
    const stopA = a.subscribe(() => values.push(['a', a.snapshot()]));
    const stopB = b.subscribe(() => values.push(['b', b.snapshot()]));
    assert.equal(a.serverSnapshot(), false); assert.equal(a.snapshot(), false);
    write(true); assert.deepEqual(values, [['a', true], ['b', true]]);
    assert.equal(a.snapshot(), a.snapshot());
    const count = values.length;
    write(true, { setItem() { throw new Error('blocked'); } }); assert.equal(values.length, count);
    s.removeItem(key); events.get('storage')({ key }); assert.deepEqual(values.slice(-2), [['a', false], ['b', false]]);
    events.get('storage')({ key: 'other' }); assert.equal(values.length, count + 2);
    stopA(); stopB(); assert.equal(events.has('storage'), false);
  } finally { delete global.window; }
});
test('resolveWebSearch truth table preserves stored preference but gates provider/model/roleplay', () => {
  for (const preference of [false, true]) for (const provider of ['claude', 'gemini', 'openai'])
    for (const modelId of ['claude-sonnet-4-5', 'unknown']) for (const roleplay of [false, true]) {
      assert.equal(resolveWebSearch({ preference, provider, modelId, roleplay }), preference && provider === 'claude' && modelId === 'claude-sonnet-4-5' && !roleplay);
    }
});

test('resolveWebSearch returns strict booleans for supported, unsupported and foreign provider truth tables', () => {
  const cases = [
    ['claude', 'claude-sonnet-4-5', true], ['openai', 'gpt-5.4-mini', true],
    ['openai', 'gpt-4o', false], ['openai', 'gpt-5.5-pro', false], ['openai', 'unknown', false],
    ['gemini', 'gemini-3.8-flash', false], ['gemini', 'gpt-5.4-mini', false],
    ['image_gen', 'gpt-image-2.5-sunburst', false], ['image_gen', 'gpt-5.4-mini', false],
    ['unknown', 'gpt-5.4-mini', false], ['unknown', 'claude-sonnet-4-5', false],
    ['claude', 'gpt-5.4-mini', false], ['openai', 'claude-sonnet-4-5', false],
  ];
  for (const [provider, modelId, supported] of cases) for (const preference of [false, true]) for (const roleplay of [undefined, false, true]) {
    const actual = resolveWebSearch({ preference, provider, modelId, roleplay });
    assert.equal(typeof actual, 'boolean');
    assert.equal(actual, supported && preference && !roleplay, `${provider}/${modelId}/${preference}/${roleplay}`);
  }
});

test('resolveWebSearch enables exactly the ten OpenAI registry search models', () => {
  const models = MODEL_REGISTRY.filter(model => model.kind === 'text' && model.provider === 'openai');
  const supported = models.filter(model => model.features?.webSearch === true).map(model => model.id);
  const enabled = models.filter(model => resolveWebSearch({ preference: true, provider: 'openai', modelId: model.id })).map(model => model.id);
  assert.equal(supported.length, 10);
  assert.deepEqual(enabled, supported);
  for (const modelId of supported) {
    assert.equal(resolveWebSearch({ preference: false, provider: 'openai', modelId }), false);
    assert.equal(resolveWebSearch({ preference: true, provider: 'openai', modelId, roleplay: true }), false);
  }
});

test('all Claude model results retain the pre-Phase-2b behavior', () => {
  const ids = [...MODEL_REGISTRY.filter(model => model.kind === 'text' && model.provider === 'claude').map(model => model.id), 'unknown'];
  for (const modelId of ids) for (const preference of [false, true]) for (const roleplay of [undefined, false, true]) {
    const actual = resolveWebSearch({ preference, provider: 'claude', modelId, roleplay });
    assert.equal(typeof actual, 'boolean');
    assert.equal(actual, preference && supportsWebSearch('claude', modelId) && !roleplay);
  }
});
