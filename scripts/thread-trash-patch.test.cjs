const assert=require('node:assert/strict');
const {test}=require('node:test');
const Module=require('node:module');
const {installAliasResolver,installTsLoader}=require('./testBootstrap.cjs');
const {sequence,row,has}=require('./thread-trash-test-helpers.cjs');
globalThis.AsyncLocalStorage=require('node:async_hooks').AsyncLocalStorage;
let db;
const original=Module._load;
Module._load=function(request,parent,main){
  if(request==='@/lib/supabase/route-auth')return {requireRouteUser:async()=>({ok:true,user:{id:'u'},supabase:db,finalizeJson:Response.json})};
  if(request==='uuid')return {v4:()=> 'token'};
  if(request==='@/lib/project-memory/get-owned-project')return {getOwnedProject:async()=>({ok:true})};
  return original.call(this,request,parent,main);
};
installTsLoader();installAliasResolver();
const {PATCH}=require('../app/api/threads/[id]/route.ts');
const invoke=(body={title:'new'})=>PATCH(new Request('http://local/api/threads/t',{method:'PATCH',body:JSON.stringify(body)}),{params:Promise.resolve({id:'t'})});
const live={id:'t',user_id:'u',deleted_at:null,title:'new'};
const trash={...live,deleted_at:'2026-10-01'};
const writes=()=>db.calls.filter(c=>['update','insert','upsert'].includes(c.operation));
const conflict={code:'23505',message:'duplicate unique value'};
async function run(results,status,body){db=sequence([...results]);const res=await invoke(body);assert.equal(res.status,status);return res.json();}
function conditional(q){assert.equal(q.operation,'update');assert.ok(has(q,'eq','id','t'));assert.ok(has(q,'eq','user_id','u'));assert.ok(has(q,'is','deleted_at',null));assert.ok(has(q,'maybeSingle'));}

test('live update returns the existing row shape',async()=>{assert.deepEqual(await run([row(live)],200),live);conditional(writes()[0]);assert.equal(writes().length,1);});
test('trash only attempts zero-row conditional UPDATE; no INSERT',async()=>{assert.deepEqual(await run([row(null),row(trash)],409),{error:'thread is in trash'});assert.equal(writes().length,1);conditional(writes()[0]);});
test('missing ID inserts same id,user_id and updates as previous upsert',async()=>{await run([row(null),row(null),row(live)],200);assert.deepEqual(writes()[1].payload,{id:'t',user_id:'u',title:'new'});assert.equal(writes()[1].operation,'insert');});
test('UPDATE DB error terminates before INSERT',async()=>{assert.deepEqual(await run([row(null,{code:'XX000',message:'update failed'})],500),{error:'update failed'});assert.equal(db.calls.length,1);});
test('23505 owned live row retries conditional UPDATE once',async()=>{await run([row(null),row(null),row(null,conflict),row(live),row(live)],200);assert.deepEqual(writes().map(c=>c.operation),['update','insert','update']);conditional(writes()[2]);});
test('23505 without owned row retains original error, discloses no owner',async()=>{assert.deepEqual(await run([row(null),row(null),row(null,conflict),row(null)],500),{error:conflict.message});assert.equal(writes().length,2);});
test('23505 retry zero-row terminates after one retry, including no-row recheck',async()=>{await run([row(null),row(null),row(null,conflict),row(live),row(null),row(null)],500);assert.equal(writes().filter(c=>c.operation==='update').length,2);assert.equal(db.calls.length,6);});
test('zero-row retry sees trash and returns 409',async()=>{await run([row(null),row(live),row(null),row(trash)],409);assert.equal(writes().length,2);});
test('retry DB error terminates',async()=>{await run([row(null),row(live),row(null,{message:'retry failed'})],500);assert.equal(db.calls.length,3);});
test('lookup errors terminate before INSERT',async()=>{await run([row(null),row(null,{message:'lookup failed'})],500);assert.equal(writes().length,1);});
test('empty patch uses live SELECT and never empty UPDATE; trash still 409',async()=>{await run([row(null),row(trash)],409,{});assert.equal(writes().length,0);assert.ok(has(db.calls[0],'is','deleted_at',null));});
test('empty live patch returns full row; empty missing patch creates',async()=>{assert.deepEqual(await run([row(live)],200,{}),live);assert.equal(writes().length,0);await run([row(null),row(null),row(live)],200,{});assert.deepEqual(writes()[0].payload,{id:'t',user_id:'u'});});
test('needsToken keeps an existing token and generates only when missing',async()=>{
  await run([row({...live,share_token:'old'}),row(live)],200,{needsToken:true,is_public:true});assert.equal('share_token' in writes()[0].payload,false);
  await run([row({...live,share_token:null}),row(live)],200,{needsToken:true,is_public:true});assert.equal(writes()[0].payload.share_token,'token');
});
