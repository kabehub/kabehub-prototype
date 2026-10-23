const assert=require('node:assert/strict');
const {test}=require('node:test');
const Module=require('node:module');
const {installAliasResolver,installTsLoader}=require('./testBootstrap.cjs');
const {database,row,has}=require('./thread-trash-test-helpers.cjs');
const original=Module._load;
Module._load=function(request,parent,main){if(request==='@/lib/logger')return {dbOperationFailed(){}};return original.call(this,request,parent,main);};
installTsLoader();installAliasResolver();
const {purgeThread}=require('../lib/threads/purge.ts');
const {isThreadTrashedError,mapThreadTrashRpcMessage,threadTrashResponse}=require('../lib/threads/trash-errors.ts');
const page=(start,n)=>Array.from({length:n},(_,i)=>({id:String(start+i),metadata:{storagePath:`u/t/${start+i}.png`}}));
const user=db=>purgeThread({mode:'user',client:db,authenticatedUserId:'u',threadId:'t'});
const storageCalls=db=>db.calls.filter(c=>c.operation==='storage');

test('collects >1000 paths across all pages before CASCADE, never recalc_fork_count',async()=>{
  let pages=0;
  const db=database(q=>{
    if(q.table==='messages'){assert.ok(has(q,'order','id'));const range=q.methods.find(m=>m[0]==='range');assert.deepEqual(range,['range',pages*500,pages*500+499]);return row(page(pages++*500,pages<=2?500:1));}
    assert.equal(q.table,'threads');assert.equal(q.operation,'delete');assert.equal(pages,3);assert.ok(has(q,'not','deleted_at','is',null));assert.ok(has(q,'eq','user_id','u'));return row([{id:'t'}]);
  });
  const result=await user(db);assert.equal(result.outcome,'deleted');assert.equal(result.storage.attemptedCount,1001);assert.equal(storageCalls(db).flatMap(c=>c.paths).length,1001);
  assert.ok(db.calls.findIndex(c=>c.operation==='delete')<db.calls.findIndex(c=>c.operation==='storage'));
  assert.ok(db.calls.every(c=>c.operation!=='rpc'));
});
test('page error aborts before DB deletion and Storage',async()=>{
  let pages=0;const db=database(q=>{assert.equal(q.table,'messages');return pages++===0?row(page(0,500)):row(null,{code:'XX000'});});
  const r=await user(db);assert.equal(r.outcome,'error');assert.equal(r.storage.attemptedCount,0);assert.equal(storageCalls(db).length,0);assert.ok(db.calls.every(c=>c.operation==='select'));
});
for(const [label,result,outcome] of [['zero rows',row([]),'not_found'],['DB error',row(null,{code:'XX000'}),'error']])test(`${label}: Storage untouched`,async()=>{
  const db=database(q=>q.table==='messages'?row(page(0,1)):result);assert.equal((await user(db)).outcome,outcome);assert.equal(storageCalls(db).length,0);
});
test('cron resolves owner before collection and false RPC leaves Storage untouched',async()=>{
  const db=database(q=>{if(q.table==='threads')return row({user_id:'u'});if(q.table==='messages')return row(page(0,1));assert.equal(q.table,'purge_expired_thread');assert.deepEqual(q.args,{p_thread_id:'t'});return row(false);});
  const r=await purgeThread({mode:'cron',serviceClient:db,threadId:'t'});assert.equal(r.outcome,'not_found');assert.equal(storageCalls(db).length,0);assert.equal(db.calls[0].table,'threads');
});
test('Storage failure retains deleted outcome and reports failed count',async()=>{
  const db=database(q=>q.table==='messages'?row(page(0,1)):row([{id:'t'}]));db.storage.from=()=>({remove:async()=>({error:{code:'STORAGE_FAILED'}})});
  const r=await user(db);assert.equal(r.outcome,'deleted');assert.equal(r.storage.failedCount,1);
});
test('trash RPC error mapping is exact and pure',()=>{
  for(const [s,status] of [['thread not found',404],['trash retention expired',409],['thread is in trash',409],['branch root message not found',null],[' thread not found',null],['',null]])assert.equal(mapThreadTrashRpcMessage(s),status);
  assert.ok(isThreadTrashedError({code:'P0001',message:'thread is in trash'}));
  for(const e of [null,'thread is in trash',{code:'XX000',message:'thread is in trash'},{code:'P0001',message:'thread not found'}])assert.equal(isThreadTrashedError(e),false);
  assert.deepEqual(threadTrashResponse(),[{error:'thread is in trash'},{status:409}]);
});
