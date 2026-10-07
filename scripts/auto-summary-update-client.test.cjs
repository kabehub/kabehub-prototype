const assert = require('node:assert/strict');
const { test } = require('node:test');
const { installTsLoader } = require('./testBootstrap.cjs');
installTsLoader();
const { parseUpdatePreview, requestUpdatePreview, applyUpdate, skipAllUpdates, checkpointOnly } = require('../lib/project-memory/auto-summary-update-client.ts');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function preview() {
  return {
    run_id: id(1), model: 'model', prompt_version: 7, result: 'preview', excluded_topics: [],
    considered_threads: [{ thread_id: id(2), last_message_at: '2026-01-01T00:00:00Z', included_message_count: 2, truncated: false,
      oldest_included_message_id: id(3), newest_included_message_id: id(4), newest_included_created_at: '2026-01-01T00:00:00Z' }],
    stats: { user_messages_available: 3, user_messages_included: 2, threads_total: 3, threads_eligible: 2, threads_included: 1, input_chars: 100, input_chars_limit: 60000 },
    checkpoint_topics: ['overview', 'principles', 'references'].map((topic_key, i) => ({ topic_id: id(10 + i), topic_key, base_revision: i + 1, cursors: [{ thread_id: id(2), message_id: id(4) }] })),
    proposals: ['overview', 'principles'].map((topic_key, i) => ({ topic_id: id(10 + i), topic_key, base_revision: i + 1,
      origin: 'auto_summary', current_content_md: 'before', proposed_content_md: 'after', reason: 'new evidence' })),
  };
}
const only = () => ({ ...preview(), result: 'checkpoint_only', proposals: [] });
const notApplicable = () => ({ run_id: id(1), model: 'model', prompt_version: 1, result: 'not_applicable', reason: 'no_new_messages', excluded_topics: [{ topic_key: 'current-work', reason: 'no_baseline' }] });

test('parser accepts all results, empty cursors, origins, exclusions and future prompt versions', () => {
  for (const p of [preview(), only(), notApplicable(), { ...notApplicable(), reason: 'no_updatable_topics' }]) assert.deepEqual(parseUpdatePreview(p), p);
  for (const origin of ['auto_summary', 'auto_summary_update', 'consolidation_run', 'instruction_edit', 'manual_or_unknown']) {
    const p = preview(); p.proposals[0].origin = origin; p.checkpoint_topics[0].cursors = []; assert.ok(parseUpdatePreview(p));
  }
  for (const reason of ['no_baseline', 'no_auto_summary_history', 'provenance_mismatch', 'empty_topic']) {
    const p = preview(); p.excluded_topics = [{ topic_key: 'current-work', reason }]; assert.ok(parseUpdatePreview(p));
  }
  const p = preview(); p.considered_threads[0].included_message_count = 1; p.considered_threads[0].oldest_included_message_id = id(4); p.stats.user_messages_included = 1;
  assert.ok(parseUpdatePreview(p));
});

const invalid = [
  ['unknown result', p => p.result = 'other'], ['empty proposals', p => p.proposals = []],
  ['checkpoint only proposals', p => p.result = 'checkpoint_only'], ['invalid run UUID', p => p.run_id = 'run'],
  ['blank model', p => p.model = ' '], ['prompt zero', p => p.prompt_version = 0], ['fractional prompt', p => p.prompt_version = 1.5],
  ['empty threads', p => p.considered_threads = []], ['too many threads', p => p.considered_threads = Array(101).fill(p.considered_threads[0])],
  ['duplicate thread', p => p.considered_threads.push(p.considered_threads[0])],
  ...['thread_id', 'oldest_included_message_id', 'newest_included_message_id'].map(k => [`bad thread ${k}`, p => p.considered_threads[0][k] = 'bad']),
  ...['last_message_at', 'newest_included_created_at'].map(k => [`bad timestamp ${k}`, p => p.considered_threads[0][k] = 'bad']),
  ['bad truncated', p => p.considered_threads[0].truncated = 0], ['zero count', p => p.considered_threads[0].included_message_count = 0],
  ['single unequal messages', p => p.considered_threads[0].included_message_count = 1],
  ['multiple equal messages', p => p.considered_threads[0].oldest_included_message_id = id(4)],
  ['empty checkpoint topics', p => p.checkpoint_topics = []], ['too many checkpoint topics', p => p.checkpoint_topics = Array(5).fill(p.checkpoint_topics[0])],
  ['duplicate topic id', p => p.checkpoint_topics[1].topic_id = id(10)], ['duplicate topic key', p => p.checkpoint_topics[1].topic_key = 'overview'],
  ['bad topic UUID', p => p.checkpoint_topics[0].topic_id = 'bad'], ['bad topic key', p => p.checkpoint_topics[0].topic_key = 'custom'],
  ...[0, 2147483648, 1.5].map(v => [`invalid revision ${v}`, p => p.checkpoint_topics[0].base_revision = v]),
  ['too many cursors', p => p.checkpoint_topics[0].cursors = Array(101).fill(p.checkpoint_topics[0].cursors[0])],
  ['duplicate cursor', p => p.checkpoint_topics[0].cursors.push(p.checkpoint_topics[0].cursors[0])],
  ['unknown cursor thread', p => p.checkpoint_topics[0].cursors[0].thread_id = id(99)],
  ['wrong cursor message', p => p.checkpoint_topics[0].cursors[0].message_id = id(3)],
  ['bad cursor UUID', p => p.checkpoint_topics[0].cursors[0].message_id = 'bad'],
  ['missing checkpoint proposal', p => p.proposals[0].topic_id = id(99)],
  ['duplicate proposal id', p => p.proposals.push(p.proposals[0])], ['duplicate proposal key', p => p.proposals[1].topic_key = 'overview'],
  ['proposal key mismatch', p => p.proposals[0].topic_key = 'current-work'], ['proposal revision mismatch', p => p.proposals[0].base_revision = 2],
  ['bad origin', p => p.proposals[0].origin = 'other'], ['identical content', p => p.proposals[0].proposed_content_md = 'before'],
  ...['reason', 'current_content_md', 'proposed_content_md'].map(k => [`empty ${k}`, p => p.proposals[0][k] = ' ']),
  ['bad excluded key', p => p.excluded_topics = [{ topic_key: 'custom', reason: 'no_baseline' }]],
  ['bad excluded reason', p => p.excluded_topics = [{ topic_key: 'current-work', reason: 'other' }]],
  ['duplicate excluded', p => p.excluded_topics = Array(2).fill({ topic_key: 'current-work', reason: 'no_baseline' })],
  ['excluded checkpoint overlap', p => p.excluded_topics = [{ topic_key: 'overview', reason: 'no_baseline' }]],
  ...[['user_messages_available', 1], ['user_messages_included', 1], ['threads_total', 0], ['threads_eligible', 0], ['threads_eligible', 4], ['threads_included', 2], ['input_chars', 0], ['input_chars', 60001], ['input_chars_limit', 60001]].map(([k, v]) => [`stats ${k}=${v}`, p => p.stats[k] = v]),
];
for (const [name, mutate] of invalid) test(`parser rejects ${name}`, () => { const p = preview(); mutate(p); assert.equal(parseUpdatePreview(p), null); });

test('parser requires exact keys and numeric/array types at every level', () => {
  const paths = [p => p, p => p.stats, p => p.considered_threads[0], p => p.checkpoint_topics[0], p => p.checkpoint_topics[0].cursors[0], p => p.proposals[0], p => p.excluded_topics[0]];
  for (const path of paths) {
    const base = preview(); base.excluded_topics = [{ topic_key: 'current-work', reason: 'empty_topic' }];
    for (const key of Object.keys(path(base))) {
      const p = structuredClone(base); delete path(p)[key]; assert.equal(parseUpdatePreview(p), null, key);
    }
    const p = structuredClone(base); path(p).extra = true; assert.equal(parseUpdatePreview(p), null);
  }
  for (const k of Object.keys(preview().stats)) for (const v of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, '1']) {
    const p = preview(); p.stats[k] = v; assert.equal(parseUpdatePreview(p), null);
  }
  for (const k of ['proposals', 'checkpoint_topics', 'considered_threads', 'excluded_topics']) for (const v of [null, {}, 'array']) {
    const p = preview(); p[k] = v; assert.equal(parseUpdatePreview(p), null);
  }
  for (const v of [null, [], {}, 1]) assert.equal(parseUpdatePreview(v), null);
  for (const mutate of [p => p.extra = true, p => delete p.model, p => p.reason = 'other', p => p.excluded_topics[0].extra = true]) {
    const p = notApplicable(); mutate(p); assert.equal(parseUpdatePreview(p), null);
  }
});

test('request forwards URL/key/signal and maps fixed and fallback errors', async () => {
  const controller = new AbortController(); const p = preview(); let call;
  assert.deepEqual(await requestUpdatePreview('a/b', 'key', controller.signal, async (url, init) => { call = { url, init }; return Response.json(p); }), p);
  assert.equal(call.url, '/api/projects/a%2Fb/memory/update/preview'); assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers['x-openai-api-key'], 'key'); assert.equal(call.init.signal, controller.signal);
  for (const [error, message] of [['update_input_too_large', '差分要約の入力が大きすぎます'], ['invalid_llm_response', 'AIの差分要約応答が不正です'], ['llm_failed', 'AIによる差分要約に失敗しました'], ['server', 'server'], ['', '差分要約を生成できませんでした'], ['constructor', 'constructor']]) {
    await assert.rejects(requestUpdatePreview('p', 'key', undefined, async () => Response.json({ error }, { status: 500 })), { message });
  }
  await assert.rejects(requestUpdatePreview('p', 'key', undefined, async () => new Response('bad', { status: 500 })), /生成できません/);
  for (const response of [Response.json({}), new Response('bad')]) await assert.rejects(requestUpdatePreview('p', 'key', undefined, async () => response), /応答が不正です/);
});

test('all entry validation failures throw before any fetch', async () => {
  let calls = 0; const fetcher = async () => { calls++; throw Error('must not run'); };
  for (const selection of [[], [id(10), id(10)], [id(99)], [id(10), id(99)], [1], Array(1), null, {}, 'id']) await assert.rejects(applyUpdate('p', preview(), selection, fetcher));
  for (const p of [only(), notApplicable(), {}]) await assert.rejects(applyUpdate('p', p, [id(10)], fetcher));
  for (const p of [only(), notApplicable(), {}]) await assert.rejects(skipAllUpdates('p', p, fetcher));
  for (const p of [preview(), notApplicable(), {}]) await assert.rejects(checkpointOnly('p', p, fetcher));
  assert.equal(calls, 0);
});

test('apply sends exact full PATCH provenance then checkpoints new revision; skips and unchanged use base', async () => {
  const p = preview(), calls = [];
  const results = await applyUpdate('a/b', p, [id(10)], async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, init, body });
    return init.method === 'PATCH' ? Response.json({ topic: { id: id(10), revision: 2 } }) : Response.json({ advanced: 0 });
  });
  assert.deepEqual(results.map(r => [r.topic_id, r.status, r.checkpoint]), [[id(10), 'applied', 'ok'], [id(11), 'skipped', 'ok'], [id(12), 'unchanged', 'ok']]);
  const patch = calls.find(c => c.init.method === 'PATCH');
  assert.equal(patch.url, `/api/projects/a%2Fb/memory/topics/${id(10)}`);
  assert.equal(patch.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(patch.body, { expected_revision: 1, edit_kind: 'full', new_content_md: 'after', source_refs: [{ type: 'auto_summary_update', run_id: p.run_id, model: p.model, prompt_version: 7, base_revision: 1, considered_threads: p.considered_threads }] });
  for (const t of p.checkpoint_topics) {
    const c = calls.find(c => c.init.method === 'POST' && c.body.topic_id === t.topic_id);
    assert.equal(c.url, '/api/projects/a%2Fb/memory/update/checkpoint');
    assert.deepEqual(c.body, { topic_id: t.topic_id, expected_revision: t.topic_id === id(10) ? 2 : t.base_revision, cursors: t.cursors });
    if (t.topic_id === id(10)) assert.ok(calls.indexOf(c) > calls.indexOf(patch));
  }
});

for (const failure of [409, 400, 500, 'network']) test(`PATCH ${failure} is never retried or checkpointed, other topics succeed`, async () => {
  const calls = [];
  const results = await applyUpdate('p', preview(), [id(10)], async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'PATCH') { if (failure === 'network') throw Error('offline'); return Response.json({}, { status: failure }); }
    assert.notEqual(JSON.parse(init.body).topic_id, id(10)); return Response.json({});
  });
  assert.equal(results[0].status, failure === 409 ? 'conflict' : 'failed'); assert.equal(results[0].checkpoint, 'none');
  assert.deepEqual(results.slice(1).map(r => r.checkpoint), ['ok', 'ok']); assert.equal(calls.filter(c => c.init.method === 'PATCH').length, 1);
});

for (const [name, response] of [
  ['wrong id', () => Response.json({ topic: { id: id(99), revision: 2 } })],
  ['wrong revision', () => Response.json({ topic: { id: id(10), revision: 3 } })],
  ['fractional revision', () => Response.json({ topic: { id: id(10), revision: 2.5 } })],
  ['string revision', () => Response.json({ topic: { id: id(10), revision: '2' } })],
  ['missing topic', () => Response.json({})], ['bad JSON', () => new Response('bad', { status: 201 })],
]) test(`successful PATCH with ${name} stays applied and never checkpoints or retries`, async () => {
  const calls = []; const results = await applyUpdate('p', preview(), [id(10)], async (url, init) => {
    calls.push(init.method); if (init.method === 'PATCH') return response();
    assert.notEqual(JSON.parse(init.body).topic_id, id(10)); return Response.json({});
  });
  assert.deepEqual(results[0], { topic_id: id(10), topic_key: 'overview', status: 'applied', checkpoint: 'failed', error: '更新は適用されましたが、消費位置を確認できませんでした' });
  assert.equal(calls.filter(m => m === 'PATCH').length, 1);
});

for (const failure of ['network', 500, 503, 409, 400]) for (const recover of [true, false]) test(`checkpoint ${failure}, recover=${recover}, retry policy and retained statuses`, async () => {
  for (const action of ['apply', 'skip', 'only']) {
    const counts = new Map(); let patches = 0;
    const fetcher = async (url, init) => {
      const body = JSON.parse(init.body);
      if (init.method === 'PATCH') { patches++; return Response.json({ topic: { id: id(10), revision: 2 } }); }
      const n = (counts.get(body.topic_id) || 0) + 1; counts.set(body.topic_id, n);
      if (recover && n === 2) return Response.json({ advanced: 0 });
      if (failure === 'network') throw Error('offline'); return Response.json({}, { status: failure });
    };
    const results = action === 'apply' ? await applyUpdate('p', preview(), [id(10)], fetcher) : action === 'skip' ? await skipAllUpdates('p', preview(), fetcher) : await checkpointOnly('p', only(), fetcher);
    const retry = failure === 'network' || failure >= 500;
    assert.deepEqual([...counts.values()], [retry ? 2 : 1, retry ? 2 : 1, retry ? 2 : 1]); assert.equal(patches, action === 'apply' ? 1 : 0);
    assert.deepEqual(results.map(r => r.status), action === 'apply' ? ['applied', 'skipped', 'unchanged'] : action === 'skip' ? ['skipped', 'skipped', 'unchanged'] : ['unchanged', 'unchanged', 'unchanged']);
    for (const r of results) {
      assert.equal(r.checkpoint, retry && recover ? 'ok' : 'failed');
      if (r.checkpoint === 'failed') assert.match(r.error, r.status === 'applied' ? /更新は適用/ : /見送りの記録に失敗/);
    }
  }
});

test('empty cursors never fetch checkpoint and skip/only never PATCH', async () => {
  for (const action of ['apply', 'skip', 'only']) {
    const p = action === 'only' ? only() : preview(); p.checkpoint_topics.forEach(t => t.cursors = []); let calls = 0;
    const fetcher = async (url, init) => { calls++; assert.equal(init.method, 'PATCH'); return Response.json({ topic: { id: id(10), revision: 2 } }); };
    const results = action === 'apply' ? await applyUpdate('p', p, [id(10)], fetcher) : action === 'skip' ? await skipAllUpdates('p', p, fetcher) : await checkpointOnly('p', p, fetcher);
    assert.equal(calls, action === 'apply' ? 1 : 0); assert.ok(results.every(r => r.checkpoint === 'none' && r.error === undefined));
  }
});

test('topics start in parallel and each PATCH waits for confirmation before checkpoint', async () => {
  const started = [], resolvers = new Map(), checkpoints = [];
  const pending = applyUpdate('p', preview(), [id(10), id(11)], async (url, init) => {
    if (init.method === 'PATCH') {
      const topicId = url.split('/').at(-1); started.push(topicId);
      return new Promise(resolve => resolvers.set(topicId, resolve));
    }
    checkpoints.push(JSON.parse(init.body).topic_id); return Response.json({});
  });
  assert.deepEqual(started, [id(10), id(11)]); assert.deepEqual(checkpoints, [id(12)]);
  resolvers.get(id(11))(Response.json({ topic: { id: id(11), revision: 3 } }));
  resolvers.get(id(10))(Response.json({}, { status: 409 }));
  const results = await pending; assert.deepEqual(results.map(r => r.status), ['conflict', 'applied', 'unchanged']);
  assert.deepEqual(checkpoints, [id(12), id(11)]);
});
