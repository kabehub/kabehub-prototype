const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const { installTsLoader } = require('./testBootstrap.cjs');
installTsLoader();
const hooks = [];
const originalLoad = Module._load;
Module._load = function (name, parent, main) {
  if (name === 'react') return { useSyncExternalStore(subscribe, snapshot, serverSnapshot) {
    hooks.push({ subscribe, snapshot, serverSnapshot });
    return typeof window === 'undefined' ? serverSnapshot() : snapshot();
  } };
  return originalLoad.call(this, name, parent, main);
};
let preference;
try { preference = require('../lib/richDisplayPreference.ts'); }
finally { Module._load = originalLoad; }
const { readRichDisplayPreference: read, writeRichDisplayPreference: write,
  useRichDisplayPreference, resolveRichDisplay, RICH_DISPLAY_STORAGE_KEY: key } = preference;
function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

test('rich display defaults ON, only 0 disables it, and read failures fall back ON', () => {
  assert.equal(key, 'kabehub_rich_display');
  assert.equal(read(), true);
  assert.equal(useRichDisplayPreference()[0], true);
  assert.equal(hooks.at(-1).serverSnapshot(), true);
  const s = storage();
  assert.equal(read(s), true);
  for (const [value, expected] of [['0', false], ['1', true], ['true', true], ['', true], ['other', true]]) {
    s.setItem(key, value); assert.equal(read(s), expected, value);
  }
  assert.equal(read({ getItem() { throw new Error('blocked'); } }), true);
  global.window = Object.defineProperty({}, 'localStorage', { get() { throw new Error('blocked'); } });
  try {
    assert.equal(read(), true);
    assert.doesNotThrow(() => write(false));
    assert.doesNotThrow(() => write(true));
  } finally { delete global.window; }
});

test('rich display writes 0 for OFF and removes the key for ON without throwing', () => {
  const calls = [];
  const s = { setItem: (...args) => calls.push(['setItem', ...args]), removeItem: (...args) => calls.push(['removeItem', ...args]) };
  write(false, s); write(true, s);
  assert.deepEqual(calls, [['setItem', key, '0'], ['removeItem', key]]);
  assert.doesNotThrow(() => write(false, { setItem() { throw new Error('blocked'); } }));
  assert.doesNotThrow(() => write(true, { removeItem() { throw new Error('blocked'); } }));
  assert.doesNotThrow(() => write(false));
  assert.doesNotThrow(() => write(true));
});

test('rich display subscribers update synchronously in the same tab and on matching storage events', () => {
  const events = new Map(), s = storage();
  let adds = 0, removes = 0;
  global.window = {
    localStorage: s,
    addEventListener(name, fn) { adds++; events.set(name, fn); },
    removeEventListener(name, fn) { assert.equal(events.get(name), fn); removes++; events.delete(name); },
  };
  let stopA, stopB;
  try {
    useRichDisplayPreference(); useRichDisplayPreference();
    const a = hooks.at(-2), b = hooks.at(-1), values = [];
    stopA = a.subscribe(() => values.push(['a', a.snapshot()]));
    stopB = b.subscribe(() => values.push(['b', b.snapshot()]));
    assert.equal(adds, 1);
    assert.equal(a.snapshot(), true);
    write(false);
    assert.deepEqual(values, [['a', false], ['b', false]]);
    write(true);
    assert.deepEqual(values.slice(-2), [['a', true], ['b', true]]);
    const count = values.length;
    write(false, { setItem() { throw new Error('blocked'); } });
    write(true, { removeItem() { throw new Error('blocked'); } });
    assert.equal(values.length, count);
    events.get('storage')({ key: 'other' });
    assert.equal(values.length, count);
    s.setItem(key, '0'); events.get('storage')({ key });
    assert.deepEqual(values.slice(-2), [['a', false], ['b', false]]);
    s.removeItem(key); events.get('storage')({ key: null });
    assert.deepEqual(values.slice(-2), [['a', true], ['b', true]]);
    stopA(); stopA = null;
    assert.equal(events.has('storage'), true);
    stopB(); stopB = null;
    assert.equal(events.has('storage'), false);
    assert.equal(removes, 1);
  } finally { stopA?.(); stopB?.(); delete global.window; }
});

test('resolveRichDisplay requires strict true and excludes roleplay independently of provider', () => {
  for (const preference of [false, true, undefined, null, 'true', 1]) {
    for (const roleplay of [undefined, false, true]) {
      const actual = resolveRichDisplay({ preference, roleplay });
      assert.equal(typeof actual, 'boolean');
      assert.equal(actual, preference === true && !roleplay);
    }
  }
});
