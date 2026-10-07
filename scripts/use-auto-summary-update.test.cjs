const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { installAliasResolver, installTsLoader } = require('./testBootstrap.cjs');
installAliasResolver(); installTsLoader();
const client = require('../lib/project-memory/auto-summary-update-client.ts');
const originalFetch = global.fetch;
let state = [], cursor = 0, deps = [], cleanups = [], pending = [], apiKey = 'key', notices = [], onApplied;
let calls, overrides;
const hooks = { ...React,
  useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], v => { state[i] = typeof v === 'function' ? v(state[i]) : v; }]; },
  useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
  useEffect(fn, d) { const i = cursor++; if (!deps[i] || d.some((v, n) => v !== deps[i][n])) pending.push(() => { cleanups[i]?.(); deps[i] = d; cleanups[i] = fn(); }); },
};
const wrapped = Object.fromEntries(['requestUpdatePreview', 'applyUpdate', 'skipAllUpdates', 'checkpointOnly'].map(name => [name, (...args) => {
  calls[name].push(args); return (overrides[name] || client[name])(...args);
}]));
const load = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'react') return hooks;
  if (request === '@/lib/apiKeyStore') return { webApiKeyStore: { getKey: async provider => { assert.equal(provider, 'openai'); return typeof apiKey === 'function' ? apiKey() : apiKey; } } };
  if (request === './auto-summary-update-client' && parent?.filename.endsWith('use-auto-summary-update.ts')) return wrapped;
  return load.call(this, request, parent, main);
};
const { useAutoSummaryUpdate } = require('../lib/project-memory/use-auto-summary-update.ts');
Module._load = load;
const render = (projectId = 'A', enabled = true) => { cursor = 0; return useAutoSummaryUpdate({ projectId, enabled, showToast: (...args) => notices.push(args), onApplied }); };
const effects = () => { const jobs = pending; pending = []; jobs.forEach(run => run()); };
const unmount = () => { cleanups.forEach(fn => fn?.()); cleanups = []; };
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const reset = (fetcher = async () => { throw Error('unexpected fetch'); }, reload) => {
  unmount(); state = []; deps = []; pending = []; cursor = 0; apiKey = 'key'; notices = []; onApplied = reload;
  calls = Object.fromEntries(Object.keys(wrapped).map(name => [name, []])); overrides = {}; global.fetch = fetcher;
  render(); effects();
};
after(() => { unmount(); global.fetch = originalFetch; });
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const excluded = [{ topic_key: 'current-work', reason: 'no_baseline' }];
function preview(result = 'preview') {
  return { run_id: id(1), model: 'model', prompt_version: 2, result, excluded_topics: excluded,
    considered_threads: [{ thread_id: id(2), last_message_at: '2026-01-01', included_message_count: 1, truncated: false,
      oldest_included_message_id: id(3), newest_included_message_id: id(3), newest_included_created_at: '2026-01-01' }],
    stats: { user_messages_available: 1, user_messages_included: 1, threads_total: 1, threads_eligible: 1, threads_included: 1, input_chars: 100, input_chars_limit: 60000 },
    checkpoint_topics: [{ topic_id: id(10), topic_key: 'overview', base_revision: 1, cursors: [{ thread_id: id(2), message_id: id(3) }] }],
    proposals: result === 'preview' ? [{ topic_id: id(10), topic_key: 'overview', base_revision: 1, origin: 'auto_summary', current_content_md: 'old', proposed_content_md: 'new', reason: 'evidence' }] : [],
  };
}
const notApplicable = reason => ({ run_id: id(1), model: 'model', prompt_version: 2, result: 'not_applicable', reason, excluded_topics: excluded });
const fetcher = async (url, init) => {
  if (url.endsWith('/preview')) return Response.json(preview());
  if (init.method === 'PATCH') return Response.json({ topic: { id: id(10), revision: 2 } });
  return Response.json({ advanced: 0 });
};
const generatePreview = async () => { await render().generate(); assert.equal(render().preview?.result, 'preview'); };

test('canGenerate follows enabled/project and all processing/preview conditions without eligibility GET', async () => {
  reset(fetcher); assert.equal(render().canGenerate, true); assert.equal(render(null).canGenerate, false); assert.equal(render('A', false).canGenerate, false);
  render(); await generatePreview(); assert.equal(render().canGenerate, false); render().close(); assert.equal(render().canGenerate, true);
  assert.equal(calls.requestUpdatePreview.length, 1); assert.deepEqual(Object.keys(render()).sort(), ['apply', 'canGenerate', 'close', 'generate', 'generating', 'isApplying', 'outcome', 'preview', 'results', 'skipAll'].sort());
});

test('generate uses trimmed key, signal and synchronous busy guard, then stores preview', async () => {
  const wait = deferred(); reset(() => wait.promise); apiKey = ' key '; const h = render();
  const running = h.generate(); await h.generate(); await flush();
  assert.equal(render().generating, true); assert.equal(render().canGenerate, false); assert.equal(calls.requestUpdatePreview.length, 1);
  const [project, key, signal] = calls.requestUpdatePreview[0]; assert.equal(project, 'A'); assert.equal(key, 'key'); assert.equal(signal.aborted, false);
  wait.resolve(Response.json(preview())); await running;
  assert.deepEqual(render().preview, preview()); assert.equal(render().results, null); assert.equal(render().generating, false);
});

test('missing API key and generation failure show error and release busy for retry', async () => {
  reset(fetcher); apiKey = ' '; await render().generate(); assert.deepEqual(notices, [['OpenAI APIキーが設定されていません', 'error']]); assert.equal(calls.requestUpdatePreview.length, 0);
  apiKey = 'key'; overrides.requestUpdatePreview = async () => { throw Error('request failed'); };
  await render().generate(); assert.deepEqual(notices.at(-1), ['request failed', 'error']); assert.equal(render().canGenerate, true);
  delete overrides.requestUpdatePreview; await generatePreview();
});

for (const [reason, notice] of [['no_updatable_topics', '差分更新できるMemoryがありません'], ['no_new_messages', '差分要約の対象となる新しい発言がありません']]) test(`generate ${reason} retains outcome and clears it at next generation`, async () => {
  reset(async () => Response.json(notApplicable(reason))); await render().generate();
  assert.deepEqual(render().outcome, notApplicable(reason)); assert.equal(render().preview, null); assert.deepEqual(notices, [[notice]]); assert.equal(calls.checkpointOnly.length, 0);
  const wait = deferred(); overrides.requestUpdatePreview = () => wait.promise;
  const running = render().generate(); assert.equal(render().outcome, null); await flush(); wait.resolve(preview()); await running;
  assert.equal(render().outcome, null); assert.equal(render().results, null);
});

for (const status of [200, 409]) test(`checkpoint_only automatically records cursor and reports status ${status}`, async () => {
  const requests = [];
  reset(async (url, init) => { requests.push({ url, init }); return url.endsWith('/preview') ? Response.json(preview('checkpoint_only')) : Response.json({ advanced: 0 }, { status }); });
  await render().generate(); assert.equal(calls.checkpointOnly.length, 1); assert.equal(requests.length, 2);
  assert.equal(requests[1].init.signal, undefined); assert.equal(render().preview, null); assert.equal(render().generating, false);
  assert.equal(render().outcome.result, 'checkpoint_only'); assert.deepEqual(render().outcome.excluded_topics, excluded);
  assert.equal(render().outcome.results[0].checkpoint, status === 200 ? 'ok' : 'failed');
  assert.deepEqual(notices, status === 200 ? [['更新が必要なMemoryはありませんでした']] : [['確認位置の記録に失敗しました（次回、同じ発言から再確認されます）', 'error']]);
});

test('checkpoint_only with empty cursors is a successful none outcome without checkpoint fetch', async () => {
  const p = preview('checkpoint_only'); p.checkpoint_topics[0].cursors = [];
  reset(async () => Response.json(p)); await render().generate(); assert.equal(render().outcome.results[0].checkpoint, 'none');
  assert.deepEqual(notices, [['更新が必要なMemoryはありませんでした']]);
});

for (const change of ['project', 'disable', 'unmount']) for (const result of ['preview', 'checkpoint_only', 'not_applicable']) test(`stale ${result} response after ${change} never starts checkpoint or changes state/toasts`, async () => {
  const wait = deferred(); let signal;
  reset(async (_url, init) => { signal = init.signal; return wait.promise; }); const running = render().generate(); await flush();
  if (change === 'unmount') unmount(); else { render(change === 'project' ? 'B' : 'A', change !== 'disable'); effects(); }
  assert.equal(signal.aborted, true);
  const before = structuredClone(state.slice(0, 5));
  wait.resolve(Response.json(result === 'not_applicable' ? notApplicable('no_new_messages') : preview(result))); await running;
  assert.equal(calls.checkpointOnly.length, 0); assert.deepEqual(notices, []); assert.deepEqual(state.slice(0, 5), before);
  if (change !== 'unmount') { const h = render(change === 'project' ? 'B' : 'A', change !== 'disable'); assert.equal(h.preview, null); assert.equal(h.outcome, null); }
});

for (const change of ['project', 'disable']) test(`identity check rejects checkpoint_only before ${change} effects run`, async () => {
  const wait = deferred(); reset(() => wait.promise); const running = render().generate(); await flush();
  render(change === 'project' ? 'B' : 'A', change !== 'disable'); wait.resolve(Response.json(preview('checkpoint_only'))); await running;
  assert.equal(calls.checkpointOnly.length, 0); assert.deepEqual(notices, []); effects();
});

test('Project change and disable clear populated outcomes and all visible state', async () => {
  for (const change of ['project', 'disable']) {
    reset(async () => Response.json(notApplicable('no_new_messages'))); await render().generate(); assert.ok(render().outcome);
    render().close(); assert.ok(render().outcome, 'close clears only preview/results');
    render(change === 'project' ? 'B' : 'A', change !== 'disable'); effects();
    const h = render(change === 'project' ? 'B' : 'A', change !== 'disable');
    assert.equal(h.outcome, null); assert.equal(h.preview, null); assert.equal(h.results, null); assert.equal(h.generating, false); assert.equal(h.isApplying, false);
  }
});

test('unmount during reload ignores its failure and performs no state writes or toast', async () => {
  const reload = deferred(); reset(fetcher, () => reload.promise); await generatePreview();
  const running = render().apply([id(10)]); await flush(); unmount(); const before = structuredClone(state.slice(0, 5));
  reload.reject(Error('unmounted')); await running; assert.deepEqual(state.slice(0, 5), before); assert.deepEqual(notices, []);
});

test('Project switch after checkpoint starts does not abort mutation and ignores completion', async () => {
  const wait = deferred(); let checkpointInit, checkpointFinished = false;
  reset(async (url, init) => { if (url.endsWith('/preview')) return Response.json(preview('checkpoint_only')); checkpointInit = init; const response = await wait.promise; checkpointFinished = true; return response; });
  const running = render().generate(); await flush(); assert.equal(calls.checkpointOnly.length, 1); assert.equal(render().generating, true);
  render('B'); effects(); assert.equal(checkpointInit.signal, undefined);
  wait.resolve(Response.json({ advanced: 1 })); await running;
  assert.equal(checkpointFinished, true); assert.equal(render('B').outcome, null); assert.deepEqual(notices, []); assert.equal(render('B').generating, false);
});

for (const status of [200, 409, 500]) test(`apply ${status} publishes results, reloads once and shares consumed run with skipAll`, async () => {
  let reloads = 0;
  reset(async (url, init) => url.endsWith('/preview') ? Response.json(preview()) : init.method === 'PATCH' ? Response.json({ topic: { id: id(10), revision: 2 } }, { status }) : Response.json({}), () => { reloads++; });
  await generatePreview(); const h = render(); const running = h.apply([id(10)]); await h.apply([id(10)]); await h.skipAll(); await running;
  assert.equal(calls.applyUpdate.length, 1); assert.equal(calls.skipAllUpdates.length, 0); assert.equal(reloads, 1);
  assert.equal(render().results[0].status, status === 200 ? 'applied' : status === 409 ? 'conflict' : 'failed'); assert.equal(render().isApplying, false);
  await render().apply([id(10)]); await render().skipAll(); assert.equal(calls.applyUpdate.length, 1); assert.equal(calls.skipAllUpdates.length, 0);
});

test('empty selection reaches client and throws before mutation; consumed run resets and retry works', async () => {
  let mutations = 0, reloads = 0;
  reset(async (url, init) => { if (!url.endsWith('/preview')) mutations++; return fetcher(url, init); }, () => { reloads++; });
  await generatePreview(); await render().apply([]);
  assert.deepEqual(calls.applyUpdate[0][2], []); assert.equal(calls.skipAllUpdates.length, 0); assert.equal(mutations, 0); assert.equal(reloads, 0);
  assert.equal(render().isApplying, false); assert.equal(notices[0][1], 'error');
  await render().apply([id(10)]); assert.equal(calls.applyUpdate.length, 2); assert.equal(reloads, 1);
});

test('skipAll client validation throw also allows retry without calling onApplied', async () => {
  let reloads = 0; reset(fetcher, () => { reloads++; }); await generatePreview();
  overrides.skipAllUpdates = async () => { throw Error('invalid preview'); }; await render().skipAll();
  assert.equal(reloads, 0); assert.equal(render().isApplying, false);
  delete overrides.skipAllUpdates; await render().skipAll(); assert.equal(reloads, 1); assert.equal(calls.skipAllUpdates.length, 2);
});

test('reload failure keeps run consumed, shows distinct error and finally unlocks', async () => {
  reset(fetcher, async () => { throw Error('reload'); }); await generatePreview(); await render().apply([id(10)]);
  assert.deepEqual(notices, [['Memory一覧の再読込に失敗しました', 'error']]); assert.equal(render().isApplying, false); assert.equal(render().results[0].status, 'applied');
  await render().apply([id(10)]); await render().skipAll(); assert.equal(calls.applyUpdate.length, 1); assert.equal(calls.skipAllUpdates.length, 0);
});

test('reload pending holds applying lock, prevents close/generate/apply/skip until completion', async () => {
  const reload = deferred(); reset(fetcher, () => reload.promise); await generatePreview(); const running = render().apply([id(10)]); await flush();
  assert.equal(render().isApplying, true); assert.equal(render().canGenerate, false); assert.equal(render().results[0].status, 'applied');
  render().close(); assert.ok(render().preview); await render().generate(); await render().apply([id(10)]); await render().skipAll();
  assert.equal(calls.requestUpdatePreview.length, 1); assert.equal(calls.applyUpdate.length, 1); assert.equal(calls.skipAllUpdates.length, 0);
  reload.resolve(); await running; assert.equal(render().isApplying, false);
});

test('skipAll records cursors without PATCH, reloads and consumes apply run; close advances nothing', async () => {
  let reloads = 0; const methods = []; reset(async (url, init) => { methods.push(init.method); return fetcher(url, init); }, () => { reloads++; });
  await generatePreview(); await render().skipAll(); assert.equal(render().results[0].status, 'skipped'); assert.equal(reloads, 1);
  assert.deepEqual(methods, ['POST', 'POST']); await render().apply([id(10)]); assert.equal(calls.applyUpdate.length, 0);
  const count = methods.length; render().close(); assert.equal(render().preview, null); assert.equal(render().results, null); assert.equal(methods.length, count);
  await generatePreview(); await render().apply([id(10)]); assert.equal(calls.applyUpdate.length, 1, 'fresh generation resets consumedRun');
});

test('closing an unconsumed preview never checkpoints or skips', async () => {
  reset(fetcher); await generatePreview(); render().close(); assert.equal(render().preview, null);
  assert.equal(calls.checkpointOnly.length, 0); assert.equal(calls.skipAllUpdates.length, 0); assert.equal(calls.applyUpdate.length, 0);
});

for (const change of ['project', 'disable']) test(`old apply completion after ${change} leaves new state untouched and never reloads`, async () => {
  const wait = deferred(); let reloads = 0;
  reset(async (url, init) => init.method === 'PATCH' ? wait.promise : fetcher(url, init), () => { reloads++; });
  await generatePreview(); const running = render().apply([id(10)]);
  render(change === 'project' ? 'B' : 'A', change !== 'disable'); effects();
  const before = structuredClone(state.slice(0, 5)); wait.resolve(Response.json({ topic: { id: id(10), revision: 2 } })); await running;
  assert.deepEqual(state.slice(0, 5), before); assert.equal(reloads, 0); assert.deepEqual(notices, []);
});

for (const change of ['project', 'disable']) for (const reject of [false, true]) test(`stale reload ${reject ? 'rejects' : 'resolves'} after ${change} cannot unlock new apply or toast`, async () => {
  const oldReload = deferred(), newReload = deferred(); let reloads = 0;
  reset(fetcher, () => ++reloads === 1 ? oldReload.promise : newReload.promise);
  await generatePreview(); const oldApply = render().apply([id(10)]); await flush();
  render(change === 'project' ? 'B' : 'A', change !== 'disable'); effects();
  if (change === 'disable') { render('A', true); effects(); }
  const project = change === 'project' ? 'B' : 'A';
  await render(project).generate(); const newApply = render(project).apply([id(10)]); await flush(); assert.equal(render(project).isApplying, true);
  const before = structuredClone(state.slice(0, 5));
  if (reject) oldReload.reject(Error('stale reload')); else oldReload.resolve(); await oldApply;
  assert.deepEqual(state.slice(0, 5), before); assert.equal(render(project).isApplying, true); assert.deepEqual(notices, []);
  newReload.resolve(); await newApply; assert.equal(render(project).isApplying, false);
});

test('stale client throw cannot reset new consumed run or display error', async () => {
  const wait = deferred(); reset(fetcher); await generatePreview(); overrides.applyUpdate = () => wait.promise;
  const oldApply = render().apply([id(10)]); render('B'); effects(); delete overrides.applyUpdate;
  await render('B').generate(); await render('B').apply([id(10)]);
  wait.reject(Error('old validation')); await oldApply; await render('B').skipAll();
  assert.deepEqual(notices, []); assert.equal(calls.skipAllUpdates.length, 0); assert.equal(render('B').results[0].status, 'applied');
});

test('stale API key read never starts request, and old generation cannot clear a new busy lock', async () => {
  const key = deferred(), response = deferred(); reset(() => response.promise); apiKey = () => key.promise;
  const old = render().generate(); render('B'); effects(); apiKey = 'key'; const current = render('B').generate(); await flush();
  key.resolve('old-key'); await old; assert.equal(calls.requestUpdatePreview.length, 1); assert.equal(render('B').generating, true);
  response.resolve(Response.json(preview())); await current; assert.equal(render('B').preview.result, 'preview');
});
