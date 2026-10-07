const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const { installAliasResolver, installTsLoader } = require('./testBootstrap.cjs');
const routePath = '../app/api/projects/[projectId]/memory/update/checkpoint/route.ts';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const message = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const cursor = { thread_id: id, message_id: message };
const valid = { topic_id: id, expected_revision: 1, cursors: [cursor] };
let authResponse, project, topic, result, calls, logs, order, queries;
const supabase = {
  from(table) {
    assert.equal(table, 'project_memory_topics');
    order.push('topic');
    const filters = [];
    queries.push({ table, filters });
    const q = {
      select(columns) { assert.equal(columns, 'id'); return q; },
      eq(key, value) { filters.push([key, value]); return q; },
      async maybeSingle() {
        if (topic.error || !topic.data) return topic;
        return filters.every(([key, value]) => topic.data[key] === value)
          ? topic : { data: null, error: null };
      },
    };
    return q;
  },
  async rpc(name, args) { order.push('rpc'); calls.push({ name, args }); return result; },
};
const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === '@/lib/supabase/route-auth') return {
    async requireRouteUser() {
      order.push('auth');
      return authResponse ? { ok: false, response: authResponse } :
        { ok: true, user: { id: 'user' }, supabase, finalizeJson: (body, init) => Response.json(body, init) };
    },
  };
  if (request === '@/lib/project-memory/get-owned-project') return {
    async getOwnedProject(db, user, projectId) {
      assert.equal(db, supabase); assert.equal(user, 'user'); assert.equal(projectId, 'project');
      order.push('project'); return project;
    },
  };
  if (request === '@/lib/logger') return { dbOperationFailed: log => logs.push(log) };
  return original.call(this, request, parent, main);
};
installAliasResolver(); installTsLoader();
const route = require(routePath);
Module._load = original;
function reset() {
  authResponse = null; project = { ok: true };
  topic = { data: { id, project_id: 'project' }, error: null };
  result = { data: 1, error: null };
  calls = []; logs = []; order = []; queries = [];
}
function run(body = valid, malformed = false) {
  // No headers or OpenAI key: touching headers would fail this request.
  return route.POST({ async json() {
    order.push('body');
    if (malformed) throw Error('Invalid JSON');
    return body;
  } }, { params: Promise.resolve({ projectId: 'project' }) });
}
async function expectResponse(response, status, body) {
  assert.equal(response.status, status); assert.deepEqual(await response.json(), body);
}
test('auth failures preserve response and prevent body, project, topic and RPC access', async () => {
  for (const status of [401, 403]) {
    reset(); authResponse = Response.json({ error: 'auth failed' }, { status });
    assert.equal(await run(), authResponse);
    assert.deepEqual(order, ['auth']); assert.deepEqual(calls, []);
  }
});
const invalidCases = [
  ['bad JSON', valid, 'Invalid request body', true],
  ...[null, [], 'body', 1, false].map(body => ['non-object', body, 'Invalid request body']),
  ...['bad', 1, null, undefined].map(topic_id => ['topic UUID', { ...valid, topic_id }, 'invalid topic_id']),
  ...[0, -1, 1.5, '1', 2147483648, NaN, Infinity, null].map(expected_revision =>
    ['revision', { ...valid, expected_revision }, 'expected_revision must be a positive integer']),
  ...[null, {}, 'array', undefined].map(cursors => ['array required', { ...valid, cursors }, 'cursors must be a jsonb array']),
  ...[[], Array(101).fill(cursor)].map(cursors => ['array length', { ...valid, cursors }, 'cursors must contain 1 to 100 items']),
  ...[null, [], 1, 'cursor', {}, { thread_id: id }, { message_id: message },
    { ...cursor, extra: true }, { ...cursor, thread_id: 'bad' }, { ...cursor, message_id: 'bad' },
    { ...cursor, thread_id: 1 }, { ...cursor, message_id: 1 }, new Date(),
  ].map(element => ['cursor element', { ...valid, cursors: [element] }, 'invalid cursor element']),
  ...[id, id.toUpperCase()].map(thread_id =>
    ['duplicate', { ...valid, cursors: [cursor, { ...cursor, thread_id }] }, 'duplicate thread_id']),
  ['topic before revision', { topic_id: 'bad', expected_revision: 0, cursors: null }, 'invalid topic_id'],
  ['revision before array', { ...valid, expected_revision: 0, cursors: null }, 'expected_revision must be a positive integer'],
  ['length before element', { ...valid, cursors: Array(101).fill(null) }, 'cursors must contain 1 to 100 items'],
  ['element before duplicate', { ...valid, cursors: [cursor, cursor, null] }, 'invalid cursor element'],
];
for (const [index, [label, body, error, malformed]] of invalidCases.entries()) test('validation: ' + label + ' ' + index, async () => {
  reset(); await expectResponse(await run(body, malformed), 400, { error });
  assert.deepEqual(order, ['auth', 'body']); assert.deepEqual(queries, []); assert.deepEqual(calls, []);
});
test('owned project failure forwards status and error before topic access', async () => {
  for (const [status, error] of [[404, 'Project not found'], [500, 'Failed to load project'], [403, 'Forbidden']]) {
    reset(); project = { ok: false, status, error };
    await expectResponse(await run(), status, { error });
    assert.deepEqual(order, ['auth', 'body', 'project']); assert.deepEqual(calls, []);
  }
});
test('topic lookup is scoped to both topic and project; missing/foreign topic and DB failure stop RPC', async () => {
  for (const [data, error, status, text] of [
    [null, null, 404, 'Topic not found'],
    [{ id, project_id: 'other' }, null, 404, 'Topic not found'],
    [{ id: message, project_id: 'project' }, null, 404, 'Topic not found'],
    [null, { code: 'DB' }, 500, 'Failed to load topic'],
  ]) {
    reset(); topic = { data, error };
    await expectResponse(await run(), status, { error: text });
    assert.deepEqual(queries, [{ table: 'project_memory_topics', filters: [['id', id], ['project_id', 'project']] }]);
    assert.deepEqual(calls, []);
  }
});
test('without OpenAI key calls scalar RPC once with copied cursors and preserves processing order', async () => {
  reset(); result.data = 7;
  const body = { ...valid, expected_revision: 2147483647, extra: 'ignored' };
  await expectResponse(await run(body), 200, { advanced: 7 });
  assert.deepEqual(order, ['auth', 'body', 'project', 'topic', 'rpc']);
  assert.deepEqual(calls, [{ name: 'advance_project_memory_auto_summary_cursors', args: {
    p_user_id: 'user', p_topic_id: id, p_expected_revision: 2147483647, p_cursors: [cursor],
  } }]);
  assert.notEqual(calls[0].args.p_cursors, body.cursors);
  assert.notEqual(calls[0].args.p_cursors[0], cursor);
  assert.deepEqual(logs, []);
});
test('100 cursors accepted; zero and non-number scalar results succeed', async () => {
  reset();
  const cursors = Array.from({ length: 100 }, (_, i) => ({ ...cursor,
    thread_id: i.toString(16).padStart(8, '0') + '-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }));
  await expectResponse(await run({ ...valid, cursors }), 200, { advanced: 1 });
  assert.equal(calls[0].args.p_cursors.length, 100);
  for (const data of [0, null, undefined, '3', {}, [3]]) {
    reset(); result.data = data;
    await expectResponse(await run(), 200, { advanced: 0 });
    assert.equal(calls.length, 1);
  }
});
for (const [message, code, status, error] of [
  ['revision conflict', 'P0001', 409, 'Revision conflict'],
  ['topic not found', 'P0001', 404, 'Topic not found'],
  ['private IDs and body', '42501', 403, 'Forbidden'],
  ...['cursors must be a jsonb array', 'cursors must contain 1 to 100 items', 'invalid cursor element', 'duplicate thread_id']
    .map(message => [message, 'P0001', 400, message]),
  ['private IDs and body', 'XX000', 500, 'Failed to process request'],
]) test('RPC mapping and metadata-only log: ' + code + ' ' + message, async () => {
  reset(); result = { data: null, error: { message, code, details: id + message } };
  await expectResponse(await run(), status, { error });
  assert.deepEqual(logs, [{ route: 'projects-memory-update-checkpoint',
    operation: 'advance_project_memory_auto_summary_cursors', table: 'project_memory_auto_summary_cursors', errorCode: code }]);
  assert.equal(calls.length, 1);
});
test('static route contract: force-dynamic and no OpenAI key requirement', () => {
  assert.equal(route.dynamic, 'force-dynamic');
  assert.equal(fs.readFileSync(require.resolve(routePath), 'utf8').includes('x-openai-api-key'), false);
});
