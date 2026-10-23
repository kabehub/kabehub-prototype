const assert = require('node:assert/strict');

// Small PostgREST recorder. Tests supply a resolver and inspect actual DML
// filters, not just which canned result the mock returns.
function database(resolve) {
  const calls = [];
  function query(table, rpcArgs) {
    const record = { table, operation: rpcArgs ? 'rpc' : 'select', args: rpcArgs, methods: [], payload: undefined };
    calls.push(record);
    const q = {};
    for (const method of ['select','eq','is','not','order','range','limit','neq','in','gte','or','maybeSingle','single','insert','update','upsert','delete']) {
      q[method] = (...args) => {
        record.methods.push([method,...args]);
        if (['insert','update','upsert','delete'].includes(method)) { record.operation=method; record.payload=args[0]; }
        return q;
      };
    }
    q.then = (a,b) => Promise.resolve().then(()=>resolve(record,calls)).then(a,b);
    return q;
  }
  return { calls, from: table=>query(table), rpc: (name,args)=>query(name,args),
    storage: { from: () => ({ remove: async paths => { calls.push({operation:'storage',paths}); return {error:null}; } }) } };
}
const has = (q, method, ...args) => q.methods.some(m => JSON.stringify(m) === JSON.stringify([method,...args]));
function sequence(results) {
  return database(record => {
    assert.ok(results.length, `unexpected query: ${JSON.stringify(record)}`);
    const next=results.shift();
    return typeof next === 'function' ? next(record) : next;
  });
}
const row = (data, error=null) => ({data,error});
module.exports = { database, sequence, row, has };
