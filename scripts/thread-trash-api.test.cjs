const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const Module = require('node:module');
const { installAliasResolver, installTsLoader } = require('./testBootstrap.cjs');
const { database, sequence, row, has } = require('./thread-trash-test-helpers.cjs');

globalThis.AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage;
let db, authorized, finalized;
const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === '@/lib/supabase/route-auth') return {
    requireRouteUser: async () => authorized ? {
      ok: true, user: { id: 'u' }, supabase: db,
      finalizeJson: (body, init) => { finalized++; return Response.json(body, init); },
    } : { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) },
  };
  if (request === '@/lib/logger') return { dbOperationFailed() {}, dbOperationFailedBestEffort() {} };
  if (request === 'uuid') return { v4: () => 'token' };
  if (request === '@/lib/lore/openai') return { createEmbedding: async () => { throw new Error('unexpected embedding'); } };
  return original.call(this, request, parent, main);
};
installTsLoader();
installAliasResolver();
const softDelete = require('../app/api/threads/[id]/route.ts').DELETE;
const list = require('../app/api/trash/threads/route.ts').GET;
const restore = require('../app/api/trash/threads/[id]/restore/route.ts').POST;
const purge = require('../app/api/trash/threads/[id]/route.ts').DELETE;
const lorePatch = require('../app/api/lore/[id]/route.ts').PATCH;
const bulkArchive = require('../app/api/lore/bulk-archive/route.ts').POST;
const { mapThreadTrashRpcError } = require('../lib/threads/trash-errors.ts');
const { API_AUTH_CLASSIFICATIONS, classifyApi } = require('../lib/proxy-paths.ts');
const deletedAt = '2026-10-23T04:05:06.123456+00:00';
const expiresAt = '2026-10-30T04:05:06.123Z';
const invoke = (handler, method, body) => handler(new Request('http://local/api/test', {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}), { params: Promise.resolve({ id: 't' }) });
beforeEach(() => {
  authorized = true; finalized = 0;
  db = sequence([]);
});
async function response(handler, method, status, body) {
  const result = await invoke(handler, method, body);
  assert.equal(result.status, status);
  assert.equal(finalized, 1, 'authenticated response uses finalizeJson');
  return result.json();
}
function rpc(q, name) {
  assert.equal(q.operation, 'rpc'); assert.equal(q.table, name);
  assert.deepEqual(q.args, { p_user_id: 'u', p_thread_id: 't' });
}
function preflight(q) {
  assert.equal(q.table, 'threads'); assert.equal(q.operation, 'select');
  assert.ok(has(q, 'select', 'is_public, deleted_at'));
  assert.ok(has(q, 'eq', 'id', 't')); assert.ok(has(q, 'eq', 'user_id', 'u'));
  assert.ok(q.methods.every(m => !['is', 'not'].includes(m[0]) && m[1] !== 'deleted_at'));
}

test('DELETE only calls soft_delete_thread; no messages, physical DELETE, Lore or Storage', async () => {
  db = sequence([q => { rpc(q, 'soft_delete_thread'); return row(deletedAt); }]);
  assert.deepEqual(await response(softDelete, 'DELETE', 200), { success: true, deleted_at: deletedAt, expires_at: expiresAt });
  assert.equal(db.calls.length, 1);
});

test('repeated DELETE keeps the RPC timestamp and expiry unchanged', async () => {
  db = database(q => { rpc(q, 'soft_delete_thread'); return row(deletedAt); });
  const first = await (await invoke(softDelete, 'DELETE')).json();
  const second = await (await invoke(softDelete, 'DELETE')).json();
  assert.deepEqual(first, second); assert.equal(db.calls.length, 2);
  assert.equal(first.deleted_at, deletedAt); assert.equal(first.expires_at, expiresAt);
});

const rpcErrors = [
  ['42501', 'thread not found', 403, 'Forbidden'],
  ['P0001', 'thread not found', 404, 'thread not found'],
  ['P0001', 'trash retention expired', 409, 'trash retention expired'],
  ['P0001', 'thread is in trash', 409, 'thread is in trash'],
  ['P0001', 'unrecognized error', 500],
  ['XX000', 'thread not found', 500],
  [undefined, 'trash retention expired', 500],
];
for (const [code, message, status, expected] of rpcErrors) {
  test(`RPC error mapper: ${code} / ${message}`, () => {
    assert.deepEqual(mapThreadTrashRpcError({ code, message }), {
      status, error: expected ?? 'Failed to process thread trash request',
    });
  });
  test(`DELETE RPC error: ${code} / ${message} -> ${status}`, async () => {
    db = sequence([row(null, { code, message })]);
    const body = await response(softDelete, 'DELETE', status);
    assert.equal(body.error, expected ?? 'Failed to process thread trash request');
    assert.equal(db.calls.length, 1);
  });
}

for (const value of [null, undefined, '', 'not a date', 'infinity', 123, {}, [], '+275760-09-13T00:00:00.000Z']) {
  test(`DELETE rejects invalid/unrepresentable timestamp: ${JSON.stringify(value)}`, async () => {
    db = sequence([row(value)]);
    assert.ok((await response(softDelete, 'DELETE', 500)).error);
    assert.equal(db.calls.length, 1);
  });
}

test('GET returns only the six trash columns in RPC order', async () => {
  const rows = ['z', 'a'].map(id => ({ id, title: id, deleted_at: deletedAt, expires_at: expiresAt,
    is_public: id === 'z', project_id: id === 'z' ? 'project' : null }));
  db = sequence([q => {
    assert.equal(q.table, 'list_trashed_threads'); assert.deepEqual(q.args, { p_user_id: 'u' });
    return row(rows.map(r => ({ ...r, private_extra: 'omit' })));
  }]);
  assert.deepEqual(await response(list, 'GET', 200), rows); assert.equal(db.calls.length, 1);
});
test('GET empty trash returns an empty array', async () => {
  db = sequence([row([])]); assert.deepEqual(await response(list, 'GET', 200), []);
});
for (const [code, status] of [['42501', 403], ['XX000', 500]]) {
  test(`GET RPC error ${code} -> ${status}`, async () => {
    db = sequence([row(null, { code, message: 'thread not found' })]);
    assert.ok((await response(list, 'GET', status)).error);
  });
}

for (const label of ['missing', 'owned by another user']) {
  test(`restore ${label} -> 404 before RPC`, async () => {
    db = sequence([q => { preflight(q); return row(null); }]);
    assert.deepEqual(await response(restore, 'POST', 404), { error: 'Not Found' });
    assert.equal(db.calls.length, 1);
  });
}
test('restore lookup error stops before RPC', async () => {
  db = sequence([row(null, { code: 'XX000' })]);
  await response(restore, 'POST', 500); assert.equal(db.calls.length, 1);
});
for (const [code, message, status, expected] of rpcErrors) {
  test(`restore RPC error ${code} / ${message} -> ${status}`, async () => {
    db = sequence([row({ is_public: true, deleted_at: deletedAt }), row(null, { code, message })]);
    assert.deepEqual(await response(restore, 'POST', status), {
      error: expected ?? 'Failed to process thread trash request',
    });
    assert.equal(db.calls.length, 2);
  });
}
for (const deleted_at of [deletedAt, null]) for (const is_public of [true, false]) {
  test(`restore ${deleted_at ? 'trash' : 'already live'}, is_public=${is_public}, no SELECT after RPC`, async () => {
    db = sequence([
      q => { preflight(q); return row({ is_public, deleted_at }); },
      q => { rpc(q, 'restore_thread'); return row(null); },
    ]);
    assert.deepEqual(await response(restore, 'POST', 200), { success: true, is_public });
    assert.equal(db.calls.length, 2);
  });
}

// Exercise the real purge helper using a recorder that applies its DELETE predicates.
function purgeDatabase(thread, error) {
  return database(q => {
    if (q.table === 'messages') {
      assert.ok(has(q, 'eq', 'thread_id', 't')); assert.ok(has(q, 'eq', 'user_id', 'u'));
      return row(has(q, 'range', 0, 499) ? [{ id: 'm', metadata: { storagePath: 'u/t/image.png' } }] : []);
    }
    assert.equal(q.table, 'threads'); assert.equal(q.operation, 'delete');
    assert.ok(has(q, 'eq', 'id', 't')); assert.ok(has(q, 'eq', 'user_id', 'u'));
    assert.ok(has(q, 'not', 'deleted_at', 'is', null)); assert.ok(has(q, 'select', 'id'));
    return row(thread?.id === 't' && thread.user_id === 'u' && thread.deleted_at ? [{ id: 't' }] : [], error);
  });
}
test('purge deletes owned trash using user client and then cleans Storage', async () => {
  db = purgeDatabase({ id: 't', user_id: 'u', deleted_at: deletedAt });
  assert.deepEqual(await response(purge, 'DELETE', 200), { success: true });
  assert.equal(db.calls.filter(c => c.operation === 'storage').length, 1);
  assert.ok(db.calls.every(c => c.operation !== 'rpc'));
});
for (const [label, thread] of [
  ['missing', null], ['live', { id: 't', user_id: 'u', deleted_at: null }],
  ['other user trash', { id: 't', user_id: 'other', deleted_at: deletedAt }],
  ['other user live', { id: 't', user_id: 'other', deleted_at: null }],
]) test(`purge ${label} -> same 404; no Storage cleanup`, async () => {
  db = purgeDatabase(thread);
  assert.deepEqual(await response(purge, 'DELETE', 404), { error: 'Not Found' });
  assert.ok(db.calls.every(c => c.operation !== 'storage'));
});
test('purge DB error -> 500, no Storage cleanup', async () => {
  db = purgeDatabase(null, { code: 'XX000' });
  await response(purge, 'DELETE', 500); assert.ok(db.calls.every(c => c.operation !== 'storage'));
});
test('purge path collection error -> 500 without DELETE', async () => {
  db = sequence([row(null, { code: 'XX000' })]);
  await response(purge, 'DELETE', 500); assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].operation, 'select');
});
test('purge DB success + Storage failure still -> 200', async () => {
  db = purgeDatabase({ id: 't', user_id: 'u', deleted_at: deletedAt });
  let removed = 0;
  db.storage.from = () => ({ remove: async () => { removed++; return { error: { code: 'STORAGE_FAILED' } }; } });
  assert.deepEqual(await response(purge, 'DELETE', 200), { success: true }); assert.equal(removed, 1);
});

for (const [handler, method, pathname] of [
  [softDelete, 'DELETE', '/api/threads/t'], [list, 'GET', '/api/trash/threads'],
  [restore, 'POST', '/api/trash/threads/t/restore'], [purge, 'DELETE', '/api/trash/threads/t'],
]) {
  test(`${method} ${pathname} unauthenticated -> 401, no DB or Storage calls`, async () => {
    authorized = false;
    const result = await invoke(handler, method);
    assert.equal(result.status, 401); assert.deepEqual(db.calls, []); assert.equal(finalized, 0);
  });
  test(`${method} ${pathname} has exactly one bearer classification`, () => {
    assert.equal(classifyApi(pathname, method), 'bearer');
    assert.equal(API_AUTH_CLASSIFICATIONS.filter(r => r.pattern.test(pathname) && r.methods.includes(method)).length, 1);
  });
}

test('Lore PATCH archive clears the thread-delete marker with the archive update', async () => {
  db = sequence([row({ is_pinned: false }), row({ id: 't', is_archived: true })]);
  await response(lorePatch, 'PATCH', 200, { action: 'archive' });
  const write = db.calls[1];
  assert.deepEqual(write.payload, { is_archived: true, archived_by_thread_delete_at: null });
  assert.ok(has(write, 'eq', 'user_id', 'u')); assert.ok(has(write, 'eq', 'id', 't'));
});
test('Lore bulk-archive clears markers and preserves ownership and pin filters', async () => {
  db = sequence([row([{ id: 'a' }])]);
  assert.deepEqual(await response(bulkArchive, 'POST', 200, { ids: ['a', 'b'] }), { archivedCount: 1, skippedCount: 1 });
  const write = db.calls[0];
  assert.deepEqual(write.payload, { is_archived: true, archived_by_thread_delete_at: null });
  assert.ok(has(write, 'eq', 'user_id', 'u')); assert.ok(has(write, 'eq', 'is_pinned', false));
  assert.ok(has(write, 'in', 'id', ['a', 'b']));
});
test('Lore pin does not change the thread-delete marker', async () => {
  db = sequence([row({ id: 't', is_pinned: false })]);
  await response(lorePatch, 'PATCH', 200, { action: 'pin', isPinned: false });
  assert.deepEqual(db.calls[0].payload, { is_pinned: false });
});
test('Lore pinned archive is still rejected without UPDATE', async () => {
  db = sequence([row({ is_pinned: true })]);
  await response(lorePatch, 'PATCH', 409, { action: 'archive' });
  assert.equal(db.calls.length, 1); assert.equal(db.calls[0].operation, 'select');
});
