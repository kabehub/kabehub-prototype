const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { installAliasResolver, installTsLoader } = require('./testBootstrap.cjs');
let authenticated, project, result, calls, logs, order;
const user='user';
const supabase={
  from(table){ assert.equal(table,'projects'); const q={select(){return q;},eq(k,v){order.push([k,v]);return q;},async maybeSingle(){return project;}};return q; },
  async rpc(name,args){calls.push({name,args});return result;},
};
const original=Module._load;
Module._load=function(request,parent,main){
  if(request==='@/lib/supabase/route-auth')return {async requireRouteUser(){order.push('auth');return authenticated?{ok:true,user:{id:user},supabase,finalizeJson:(body,init)=>Response.json(body,init)}:{ok:false,response:Response.json({error:'Unauthorized'},{status:401})};}};
  if(request==='@/lib/logger')return {dbOperationFailed:log=>logs.push(log)};
  return original.call(this,request,parent,main);
};
installAliasResolver();installTsLoader();
const {POST}=require('../app/api/projects/[projectId]/memory/topics/bulk-delete/route.ts');
Module._load=original;
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const topic={id,expected_revision:1};
function reset(){authenticated=true;project={data:{id:'project'},error:null};result={data:2,error:null};calls=[];logs=[];order=[];}
const request=body=>({async json(){order.push('body');return body;}});
const run=body=>POST(request(body),{params:Promise.resolve({projectId:'project'})});
test('authentication then owned Project then body; failure never reaches RPC',async()=>{
  reset();authenticated=false;assert.equal((await run({topics:[topic]})).status,401);assert.deepEqual(order,['auth']);
  reset();project={data:null,error:null};assert.equal((await run({topics:[topic]})).status,404);assert.ok(!order.includes('body'));assert.equal(calls.length,0);
  reset();project={data:null,error:{code:'DB'}};assert.equal((await run({topics:[topic]})).status,500);assert.equal(calls.length,0);
  reset();await run({topics:[topic]});assert.deepEqual(order,['auth',['id','project'],['user_id',user],'body']);
});
test('all malformed bodies fail 400 before RPC including case insensitive duplicate UUID',async()=>{
  const bad=[null,[],{}, {topics:{}},{topics:[]},{topics:Array(51).fill(topic)},
    ...[null,[],{}, {...topic,id:'bad'},{...topic,id:1}].map(t=>({topics:[t]})),
    ...[0,-1,1.5,'1',2147483648,1e100,null].map(expected_revision=>({topics:[{id,expected_revision}]})),
    {topics:[topic,topic]},{topics:[topic,{...topic,id:id.toUpperCase()}]}];
  for(const body of bad){reset();assert.equal((await run(body)).status,400,JSON.stringify(body));assert.equal(calls.length,0);}
  reset();assert.equal((await POST({json:async()=>{throw Error('invalid JSON');}},{params:Promise.resolve({projectId:'project'})})).status,400);
});
test('successful RPC mapping and 50 items / max revision accepted',async()=>{
  reset();const response=await run({topics:[{id:id.toUpperCase(),expected_revision:2147483647}]});
  assert.deepEqual(await response.json(),{deleted_count:2});
  assert.deepEqual(calls,[{name:'delete_project_memory_topics',args:{p_user_id:user,p_project_id:'project',p_topics:[{topic_id:id,expected_revision:2147483647}]}}]);
  reset();const topics=Array.from({length:50},(_,i)=>({...topic,id:`${i.toString(16).padStart(8,'0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`}));
  assert.equal((await run({topics})).status,200);assert.equal(calls[0].args.p_topics.length,50);
});
test('RPC errors map 400/404/409/403/500 and log only approved fields',async()=>{
  for(const [message,code,status] of [
    ...['topics must be a jsonb array','topics must contain 1 to 50 items','invalid topic element','duplicate topic_id'].map(m=>[m,'P0001',400]),
    ['project not found','P0001',404],['topic not found','P0001',404],['revision conflict','P0001',409],['Unauthorized','42501',403],['private body','XX000',500],
  ]){reset();result={data:null,error:{message,code}};assert.equal((await run({topics:[topic]})).status,status);
    assert.deepEqual(logs,[{route:'projects-memory-topics',operation:'delete_project_memory_topics',table:'project_memory_topics',errorCode:code}]);}
});
