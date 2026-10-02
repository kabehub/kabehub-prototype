const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { installAliasResolver, installTsLoader } = require('./testBootstrap.cjs');
const { database, thread, message } = require('./auto-summary-test-helpers.cjs');
installAliasResolver(); installTsLoader();
let db, authCalls, modelCalls, modelOutput, captured, projectStatus=200, authStatus=200;
const load=Module._load;
Module._load=function(request,parent,main) {
  if(request==='@/lib/supabase/route-auth') return { requireRouteUser:async()=>{
    authCalls++; return authStatus===200 ? {ok:true,user:{id:'u'},supabase:db,finalizeJson:Response.json} : {ok:false,response:Response.json({}, {status:authStatus})};
  }};
  if(request==='@/lib/project-memory/get-owned-project') return {getOwnedProject:async()=>projectStatus===200?{ok:true}:{ok:false,error:'Project not found',status:projectStatus}};
  if(request==='@/lib/logger') return {externalApiFailed(){},dbOperationFailed(){}};
  if(request==='@/lib/lore/openai') return {chatCompleteMini:async(key,system,input,opts)=>{
    modelCalls++; captured={key,system,input,opts}; if(modelOutput instanceof Error) throw modelOutput;
    return modelOutput ?? JSON.stringify({topics:JSON.parse(input).requested_topics.map(t=>({topic_key:t.topic_key,content_md:'generated'}))});
  }};
  return load.call(this,request,parent,main);
};
const {POST,dynamic}=require('../app/api/projects/[projectId]/memory/bootstrap/preview/route.ts');
const {AUTO_SUMMARY_STANDARD_TOPIC_KEYS:keys}=require('../lib/project-memory/auto-summary-limits.ts');
const reset=(topics=[],fail)=>{db=database({project_memory_topics:topics,threads:[thread('t')],messages:[message('t',1),message('t',2)]},fail);authCalls=0;modelCalls=0;modelOutput=null;projectStatus=200;authStatus=200;};
const post=(key='key')=>POST(new Request('http://local',{method:'POST',headers:key?{'x-openai-api-key':key}:{}}),{params:Promise.resolve({projectId:'p'})});
test('key check precedes authentication, auth and project errors propagate',async()=>{
  reset(); assert.equal(dynamic,'force-dynamic'); assert.equal((await post('  ')).status,400); assert.equal(authCalls,0);
  authStatus=401; assert.equal((await post()).status,401); authStatus=200;projectStatus=404;assert.equal((await post()).status,404);
});
test('all standard topics or no eligible conversations skip LLM',async()=>{
  reset(keys.map(topic_key=>({topic_key,project_id:'p'}))); assert.deepEqual(await (await post()).json(),{result:'not_applicable',reason:'all_standard_topics_exist'});assert.equal(modelCalls,0);
  reset();db=database({threads:[],project_memory_topics:[]});assert.equal((await (await post()).json()).reason,'no_eligible_threads');assert.equal(modelCalls,0);
});
test('success contract, missing-only request, key trimming, completion budget, no existing body reads or writes',async()=>{
  reset([{topic_key:'overview',content_md:'PRIVATE EXISTING BODY',project_id:'p'}]);
  const response=await post(' key '); const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.result,'preview');assert.equal(body.prompt_version,1);assert.equal(typeof body.run_id,'string');
  assert.deepEqual(JSON.parse(captured.input).requested_topics.map(t=>t.topic_key),keys.slice(1));
  assert.ok(!captured.input.includes('PRIVATE EXISTING BODY'));assert.equal(captured.key,'key');assert.deepEqual(captured.opts,{jsonMode:true,maxCompletionTokens:16384});
  assert.equal(body.stats.input_chars,captured.input.length);assert.equal(body.considered_threads.length,1);
  assert.ok(db.calls.every(c=>!c.select.includes('content_md')));
  // The DB test model intentionally exposes no write or RPC methods.
});
test('DB errors are 500, LLM failure and invalid responses are 502, empty evidence is not applicable',async()=>{
  for(const table of ['project_memory_topics','threads','messages']) {reset([],table);assert.equal((await post()).status,500);assert.equal(modelCalls,0);}
  for(const output of [new Error('upstream'),'invalid',JSON.stringify({topics:[]})]) {reset();modelOutput=output;assert.equal((await post()).status,502);}
  reset();modelOutput=JSON.stringify({topics:keys.map(topic_key=>({topic_key,content_md:' \n '}))});
  assert.deepEqual(await (await post()).json(),{result:'not_applicable',reason:'insufficient_evidence'});
});
