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
