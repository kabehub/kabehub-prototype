const assert=require('node:assert/strict');
const {test}=require('node:test');
const Module=require('node:module');
const {installAliasResolver,installTsLoader}=require('./testBootstrap.cjs');
const {database,sequence,row,has}=require('./thread-trash-test-helpers.cjs');
globalThis.AsyncLocalStorage=require('node:async_hooks').AsyncLocalStorage;
let db,embeddings,skipped;
const original=Module._load;
Module._load=function(request,parent,main){
  if(request==='@/lib/supabase/route-auth')return {requireRouteUser:async()=>({ok:true,user:{id:'u'},supabase:db,finalizeJson:Response.json})};
  if(request==='@/lib/mcp-auth')return {serviceRoleClient:()=>db};
  if(request==='@/lib/logger')return {securityGuardRejected:p=>skipped.push(p)};
  if(request==='@/lib/lore/openai')return {createEmbedding:async()=>{embeddings++;return [1];},chatCompleteMini:async()=>JSON.stringify({memories:[{text:'fact'}]}),AiProviderRequestError:class extends Error{}};
  if(request==='uuid')return {v4:()=> 'new-id'};
  return original.call(this,request,parent,main);
};
installTsLoader();installAliasResolver();
const notes=require('../app/api/threads/[id]/notes/route.ts');
const messageNotes=require('../app/api/threads/[id]/message-notes/route.ts');
const drafts=require('../app/api/threads/[id]/drafts/route.ts');
const tags=require('../app/api/threads/[id]/tags/route.ts');
const like=require('../app/api/lore/like/route.ts');
const {runBatchTrain}=require('../lib/lore/batchTrain.ts');
const {deleteOwnedMessage}=require('../lib/messages/delete.ts');
const trash={id:'trash-parent',deleted_at:'2026-10-01'};
const req=(method,body)=>new Request('http://local/api/threads/live-url/notes',{method,body:JSON.stringify(body),headers:{'x-openai-api-key':'key'}});

for(const [name,route,table] of [['notes',notes,'thread_notes'],['message-notes',messageNotes,'message_notes'],['drafts',drafts,'drafts']]) {
  test(`${name}: DELETE uses the actual resource parent, URL cannot bypass trash`,async()=>{
    db=sequence([row({thread_id:'trash-parent'}),row(trash)]);
    const res=await route.DELETE(req('DELETE',{id:'resource'}),{params:Promise.resolve({id:'live-url'})});
    assert.equal(res.status,409);assert.deepEqual(await res.json(),{error:'thread is in trash'});
    assert.equal(db.calls[0].table,table);assert.ok(has(db.calls[0],'eq','user_id','u'));
    assert.ok(has(db.calls[1],'eq','id','trash-parent'));assert.ok(db.calls.every(c=>c.operation==='select'));
  });
  test(`${name}: live resource deletes regardless of URL; absent resource stays success`,async()=>{
    for(const existing of [true,false]) {
      db=sequence(existing?[row({thread_id:'real-parent'}),row({id:'real-parent',deleted_at:null}),row(null)]:[row(null),row(null)]);
      const res=await route.DELETE(req('DELETE',{id:'resource'}),{params:Promise.resolve({id:'different-url'})});
      assert.equal(res.status,200);assert.deepEqual(await res.json(),{success:true});
      assert.equal(db.calls.at(-1).operation,'delete');assert.ok(has(db.calls.at(-1),'eq','user_id','u'));
    }
  });
  test(`${name}: POST preflight and trigger race both return 409`,async()=>{
    for(const results of [[row(trash)],[row({id:'live',deleted_at:null}),row(null,{code:'P0001',message:'thread is in trash'})]]) {
      db=sequence(results);const res=await route.POST(req('POST',{content:'note',messageId:'m'}),{params:Promise.resolve({id:'t'})});assert.equal(res.status,409);
      if(db.calls.length===1)assert.equal(db.calls[0].operation,'select');
    }
  });
  test(`${name}: trigger must not expose foreign trash as 409 when no owned parent was verified`,async()=>{
    db=sequence([row(null),row(null,{code:'P0001',message:'thread is in trash'})]);
    const res=await route.POST(req('POST',{content:'note',messageId:'m'}),{params:Promise.resolve({id:'foreign'})});
    assert.equal(res.status,500);
  });
}
test('notes PATCH resolves actual target before updating content or updated_at',async()=>{
  db=sequence([row({thread_id:'trash-parent'}),row(trash)]);const res=await notes.PATCH(req('PATCH',{id:'resource',content:'changed'}));
  assert.equal(res.status,409);assert.equal(db.calls[0].table,'thread_notes');assert.ok(db.calls.every(c=>c.operation==='select'));
});
test('tags POST trigger mapping requires a verified owned parent',async()=>{
  for(const [parent,status] of [[{id:'t',deleted_at:null},409],[null,500]]) {
    db=sequence([row(parent),row(null),row(null,{code:'P0001',message:'thread is in trash'})]);
    const res=await tags.POST(req('POST',{name:'tag'}),{params:Promise.resolve({id:'t'})});assert.equal(res.status,status);
  }
});
test('notes PATCH missing resource retains single() failure',async()=>{
  db=sequence([row(null),row(null,{message:'no rows'})]);assert.equal((await notes.PATCH(req('PATCH',{id:'missing',content:'changed'}))).status,500);
});
test('message deletion refuses trash before Lore, message DELETE and Storage',async()=>{
  db=sequence([row({thread_id:'trash-parent',metadata:{storagePath:'u/t/image.png'}}),row(trash)]);
  assert.deepEqual(await deleteOwnedMessage({supabase:db,userId:'u',messageId:'m'}),{ok:false,trashed:true});assert.ok(db.calls.every(c=>c.operation==='select'));
});
test('thread-scoped absent message retains idempotent success without side effects',async()=>{
  db=sequence([row(null)]);assert.deepEqual(await deleteOwnedMessage({supabase:db,userId:'u',messageId:'m',threadId:'t'}),{ok:true});assert.equal(db.calls.length,1);
});
for(const [label,msg,parent,status] of [
  ['missing message',null,null,404], ['missing parent',{thread_id:'t',user_id:'u'},null,404],
  ['foreign message',{thread_id:'t',user_id:'other'}, {...trash,user_id:'other'},403],
  ['foreign parent',{thread_id:'t',user_id:'u'}, {...trash,user_id:'other'},403],
  ['owned trash',{thread_id:'t',user_id:'u'}, {...trash,user_id:'u'},409],
  ['owned live wrong role',{thread_id:'t',user_id:'u',role:'user'}, {id:'t',user_id:'u',deleted_at:null},400],
])test(`lore like privacy ordering: ${label}`,async()=>{
  db=sequence(msg?[row(msg),row(parent)]:[row(null)]);embeddings=0;
  const res=await like.POST(req('POST',{messageId:'m'}));assert.equal(res.status,status);assert.equal(embeddings,0);assert.ok(db.calls.every(c=>c.operation==='select'));
});
test('batchTrain skips trash before embedding/persistence and never marks learned',async()=>{
  embeddings=0;skipped=[];
  db=database(q=>{if(q.table==='messages')return row([{id:'m',thread_id:'t',content:'fact',created_at:'2026-01-01'}]);if(q.table==='lore_embeddings')return row([]);if(q.table==='threads')return row(trash);assert.fail(q.table);});
  const r=await runBatchTrain(db,'key','u',10);assert.equal(r.ok,true);assert.equal(r.insertedCount,0);assert.equal(embeddings,0);assert.equal(skipped[0].skippedCount,1);assert.ok(db.calls.every(c=>c.operation==='select'));
});
