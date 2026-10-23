const assert=require('node:assert/strict');
const {test}=require('node:test');
const Module=require('node:module');
const {installAliasResolver,installTsLoader}=require('./testBootstrap.cjs');
const {sequence,row,has}=require('./thread-trash-test-helpers.cjs');
globalThis.AsyncLocalStorage=require('node:async_hooks').AsyncLocalStorage;
let db;
const original=Module._load;
Module._load=function(request,parent,main){
  if(request==='@/lib/supabase/route-auth')return {requireRouteUser:async()=>({ok:true,user:{id:'u'},supabase:db,finalizeJson:Response.json,finalizeResponse:r=>r})};
  if(request==='@/lib/rate-limit')return {checkChatRateLimit:async()=>({allowed:true,remaining:10,resetAt:Date.now()+1000,limit:10})};
  if(request==='uuid')return {v4:()=> 'generated-id'};
  if(request==='@/lib/logger')return {dbOperationFailed(){}};
  if(request==='@/lib/aiUsage')return {calculateTextUsageCost:()=>({estimatedCostUsd:0,costSource:'computed'}),recordUsageEvent:async()=>true};
  if(request==='@/lib/mcp-auth')return {serviceRoleClient:()=>db};
  return original.call(this,request,parent,main);
};
installTsLoader();installAliasResolver();
const restore=require('../app/api/threads/[id]/messages/restore-branch/route.ts');
const chat=require('../app/api/chat/route.ts');
const arena=require('../app/api/arena/route.ts');
const live={id:'t',user_id:'u',deleted_at:null,project_id:null};
const req=(body)=>new Request('http://local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const invokers={
  restore:()=>restore.PATCH(req({branchRootId:'root',branchIndex:0}),{params:Promise.resolve({id:'t'})}),
  chat:()=>chat.POST(req({threadId:'t',provider:'claude',isMemo:true,userContent:'edited',branchEdit:{baseUserMessageId:'base'}})),
};
for(const [name,invoke] of Object.entries(invokers)) {
  for(const [label,after,status] of [['trash',{...live,deleted_at:'2026-10-01'},409],['missing',null,400],['live',live,400]])test(`${name}: P0001 thread not found rechecks ${label}`,async()=>{
    db=sequence([row(live),row(null,{code:'P0001',message:'thread not found'}),row(after)]);
    const res=await invoke();assert.equal(res.status,status);assert.equal(db.calls.length,3);
    if(status===409)assert.deepEqual(await res.json(),{error:'thread is in trash'});
  });
  test(`${name}: other P0001 keeps 400 and does not recheck`,async()=>{
    db=sequence([row(live),row(null,{code:'P0001',message:'branch root message not found'})]);assert.equal((await invoke()).status,400);assert.equal(db.calls.length,2);
  });
  test(`${name}: preexisting trash refuses before RPC`,async()=>{
    db=sequence([row({...live,deleted_at:'2026-10-01'})]);assert.equal((await invoke()).status,409);assert.equal(db.calls.length,1);
  });
}

const arenaInvoke=body=>arena.POST(new Request('http://local/api/arena',{method:'POST',headers:{'content-type':'application/json','x-anthropic-api-key':'key'},body:JSON.stringify({threadId:'t',currentProvider:'claude',...body})}));
for(const body of [{isFirst:true},{mode:'saveHumanMessage',content:'hello'},{isFirst:false,interventionContent:'intervene'},{mode:'timeTravel',since:'2026-01-01'}])test(`arena preexisting trash stops mode ${JSON.stringify(body)}`,async()=>{
  db=sequence([row({...live,deleted_at:'2026-10-01'})]);const res=await arenaInvoke(body);assert.equal(res.status,409);assert.equal(db.calls.length,1);
});
test('arena ensure recheck after thread INSERT conflict refuses raced trash',async()=>{
  db=sequence([row(null),row(null,{code:'23505'}),row({...live,deleted_at:'2026-10-01'})]);assert.equal((await arenaInvoke({isFirst:true})).status,409);assert.equal(db.calls.length,3);assert.ok(db.calls.every(q=>q.table==='threads'));
});
test('arena timeTravel missing thread preserves zero-row DELETE success',async()=>{
  db=sequence([row(null),row(null)]);assert.equal((await arenaInvoke({mode:'timeTravel',since:'2026-01-01'})).status,200);assert.equal(db.calls[1].operation,'delete');
});
test('arena generated assistant INSERT trigger failure preserves 200 saved:false',async()=>{
  const saved=global.fetch;
  global.fetch=async()=>Response.json({content:[{type:'text',text:'generated'}],usage:{input_tokens:1,output_tokens:1},stop_reason:'end_turn'});
  try {
    db=sequence([row(live),row(null,{code:'P0001',message:'thread is in trash'})]);
    const res=await arenaInvoke({isFirst:false,topic:'topic',history:[{role:'user',content:'hello'}]});
    assert.equal(res.status,200);const body=await res.json();assert.equal(body.saved,false);assert.equal(body.message.content,'generated');
    assert.ok(!db.calls.some(q=>q.operation==='delete'));
  } finally {global.fetch=saved;}
});
