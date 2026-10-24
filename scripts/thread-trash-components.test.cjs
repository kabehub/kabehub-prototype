const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const React = require('react');
const { installTsLoader, installAliasResolver } = require('./testBootstrap.cjs');
const { deferred, tick } = require('./thread-trash-ui-test-helpers.cjs');
let current;
const hooks = {
  ...React,
  useState(initial) {
    const h = current, index = h.cursor++;
    if (!(index in h.values)) h.values[index] = typeof initial === 'function' ? initial() : initial;
    return [h.values[index], value => { h.values[index] = typeof value === 'function' ? value(h.values[index]) : value; }];
  },
  useRef(initial) { return hooks.useState(() => ({ current: initial }))[0]; },
  useCallback: fn => fn,
  useEffect(fn) { if (current.mounting) current.effects.push(fn); },
  useContext: () => ({ showToast: (...args) => current.notices.push(args) }),
};
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'react') return hooks;
  return originalLoad.call(this, request, parent, main);
};
installTsLoader({ jsx: true }); installAliasResolver();
const { ToastProvider } = require('../components/Toast.tsx');
const TrashPage = require('../app/trash/page.tsx').default;

function harness(Component) {
  const h = { values: [], cursor: 0, effects: [], notices: [], mounting: true, cleanups: [] };
  h.render = () => { current = h; h.cursor = 0; const tree = Component({ children: null }); h.mounting = false; return tree; };
  h.runEffects = () => { for (const effect of h.effects.splice(0)) h.cleanups.push(effect()); };
  h.dispose = () => h.cleanups.forEach(fn => fn?.());
  return h;
}
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(t => nodes(t, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function content(tree) {
  if (Array.isArray(tree)) return tree.map(content).join('');
  if (tree === null || tree === undefined || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return content(tree.props?.children);
}
const button = (tree, label) => nodes(tree, n => n.type === 'button' && content(n) === label)[0];
function fakeTimers() {
  const originalSet = global.setTimeout, originalClear = global.clearTimeout;
  const timers = new Map(); let id = 0;
  global.setTimeout = (fn, duration) => { timers.set(++id, { fn, duration }); return id; };
  global.clearTimeout = timer => timers.delete(timer);
  return { timers, restore() { global.setTimeout = originalSet; global.clearTimeout = originalClear; } };
}

test('Toast keeps legacy 2s/4s defaults and accepts custom duration/action', () => {
  const clock = fakeTimers(), h = harness(ToastProvider);
  try {
    const showToast = h.render().props.value.showToast;
    showToast('default'); showToast('success', 'success'); showToast('error', 'error');
    showToast('Undo', 'success', { duration: 8000, action: { label: '元に戻す', onClick() {} } });
    assert.deepEqual([...clock.timers.values()].map(t => t.duration), [2000, 2000, 4000, 8000]);
    assert.ok(button(h.render(), '元に戻す'));
    assert.equal(nodes(h.render(), n => n.props?.role === 'alert').length, 1);
    const [id, timer] = clock.timers.entries().next().value; clock.timers.delete(id); timer.fn();
    assert.equal(content(h.render()).includes('default'), false);
    h.runEffects(); h.dispose(); assert.equal(clock.timers.size, 0);
  } finally { clock.restore(); }
});
test('Toast action locks synchronously, stays open while pending, and closes when finished', async () => {
  const clock = fakeTimers(), h = harness(ToastProvider), action = deferred(); let calls = 0;
  try {
    h.render().props.value.showToast('Undo', 'success', { duration: 8000,
      action: { label: '元に戻す', onClick: () => { calls++; return action.promise; } } });
    const click = button(h.render(), '元に戻す').props.onClick;
    click(); click(); assert.equal(calls, 1); assert.equal(clock.timers.size, 0);
    assert.equal(button(h.render(), '元に戻す').props.disabled, true);
    action.resolve(); await tick(); assert.equal(button(h.render(), '元に戻す'), undefined);
  } finally { clock.restore(); }
});
test('Toast rejected action also closes the notification', async () => {
  const clock = fakeTimers(), h = harness(ToastProvider), action = deferred();
  try {
    h.render().props.value.showToast('Undo', 'success', { action: { label: 'run', onClick: () => action.promise } });
    button(h.render(), 'run').props.onClick(); action.reject(new Error('test action failure')); await tick();
    assert.equal(button(h.render(), 'run'), undefined);
  } finally { clock.restore(); }
});

const trashed = (is_public = false) => ({ id: 't', title: 'スレッド', deleted_at: '2026-10-23T00:00:00Z',
  expires_at: '2099-01-01T00:00:00Z', is_public, project_id: null });
async function mountedTrash(fetcher) {
  global.fetch = fetcher;
  const h = harness(TrashPage); assert.match(content(h.render()), /読み込み中/);
  h.runEffects(); await tick(); return h;
}
test('trash has loading, empty, error and retry states', async () => {
  const originalFetch = global.fetch;
  let h;
  try {
    h = await mountedTrash(async () => Response.json([])); assert.match(content(h.render()), /ゴミ箱は空/); h.dispose();
    h = await mountedTrash(async () => Response.json({}, { status: 500 }));
    assert.ok(nodes(h.render(), n => n.props?.role === 'alert').length);
    global.fetch = async () => Response.json([]); button(h.render(), '再読み込み').props.onClick(); await tick();
    assert.match(content(h.render()), /ゴミ箱は空/);
  } finally { h?.dispose(); global.fetch = originalFetch; }
});
test('public restore needs explicit confirmation, cancel sends no mutation, then confirms once', async () => {
  const originalFetch = global.fetch, request = deferred(); const calls = []; let h;
  try {
    h = await mountedTrash(async (_url, init) => {
      if (!init?.method) return Response.json([trashed(true)]);
      calls.push(init.method); return request.promise;
    });
    assert.match(content(h.render()), /公開スレッド/);
    button(h.render(), '復元').props.onClick(); assert.equal(calls.length, 0);
    assert.match(content(h.render()), /共有URLから再び閲覧/);
    button(h.render(), 'キャンセル').props.onClick(); assert.equal(calls.length, 0);
    button(h.render(), '復元').props.onClick();
    const click = button(h.render(), '復元する').props.onClick;
    click(); click(); assert.deepEqual(calls, ['POST']);
    assert.equal(button(h.render(), '復元').props.disabled, true);
    request.resolve(Response.json({ success: true, is_public: true })); await tick();
    assert.match(content(h.render()), /ゴミ箱は空/); assert.equal(h.notices[0][0], 'スレッドを復元しました');
  } finally { h?.dispose(); global.fetch = originalFetch; }
});
test('private restore runs immediately and shows the retention-expired error', async () => {
  const originalFetch = global.fetch; let h;
  try {
    h = await mountedTrash(async (_url, init) => !init?.method ? Response.json([trashed()])
      : Response.json({ error: 'trash retention expired' }, { status: 409 }));
    button(h.render(), '復元').props.onClick(); await tick();
    assert.equal(h.notices[0][0], '保持期間が過ぎたため復元できません');
    assert.ok(button(h.render(), '復元')); assert.equal(button(h.render(), '復元').props.disabled, false);
  } finally { h?.dispose(); global.fetch = originalFetch; }
});
test('permanent deletion requires the irreversible confirmation and removes the row', async () => {
  const originalFetch = global.fetch, calls = []; let h;
  try {
    h = await mountedTrash(async (_url, init) => {
      if (!init?.method) return Response.json([trashed()]);
      calls.push(init.method); return Response.json({ success: true });
    });
    button(h.render(), '完全に削除').props.onClick(); assert.match(content(h.render()), /取り消せません/);
    assert.equal(calls.length, 0); button(h.render(), '完全に削除する').props.onClick(); await tick();
    assert.deepEqual(calls, ['DELETE']); assert.match(content(h.render()), /ゴミ箱は空/);
  } finally { h?.dispose(); global.fetch = originalFetch; }
});
