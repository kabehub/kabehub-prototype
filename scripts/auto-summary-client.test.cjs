const { test }=require('node:test');
const assert=require('node:assert/strict');
const {installAliasResolver,installTsLoader}=require('./testBootstrap.cjs');
installAliasResolver();installTsLoader();
const {parseBootstrapPreview,applyAutoSummary,requestAutoSummaryPreview}=require('../lib/project-memory/auto-summary-client.ts');
const {preview}=require('./auto-summary-test-helpers.cjs');

test('client accepts prompt v7 and carries v7 into applied provenance',async()=>{
  const p={...preview(),prompt_version:7};
  assert.deepEqual(parseBootstrapPreview(p),p);
  let body;
  await applyAutoSummary('p',p,['overview'],async(url,init)=>{body=JSON.parse(init.body);return Response.json({},{status:201});});
  assert.equal(body.source_refs[0].prompt_version,7);
});
test('strict client rejects unknown fields at all levels, types, duplicates, invalid numbers and nonstandard/empty topics',()=>{
  assert.ok(parseBootstrapPreview(preview()));
  const mutations=[p=>p.extra=true,p=>p.prompt_version=0,p=>p.prompt_version=Infinity,p=>p.run_id='',p=>p.model=null,
    p=>p.topics[0].extra=1,p=>p.topics[0].content_md=' ',p=>p.topics[0].content_md=1,p=>p.topics[0].topic_key='current_state',p=>p.topics.push(p.topics[0]),
    p=>p.stats.extra=1,p=>p.stats.threads_total=-1,p=>p.stats.threads_eligible=0,p=>p.stats.threads_included=101,p=>p.stats.input_chars=60001,
    p=>p.stats.input_chars_limit=60001,p=>p.stats.threads_truncated=2,p=>p.stats.messages_truncated=1,p=>p.stats.input_chars=1.5,
    p=>p.considered_threads.push(p.considered_threads[0]),p=>p.considered_threads[0].extra=1,p=>p.considered_threads[0].truncated='false',
    p=>p.considered_threads[0].included_message_count=0,p=>p.considered_threads[0].last_message_at='bad',p=>p.considered_threads[0].newest_included_message_id='a',
    p=>p.topics=[],p=>delete p.stats.input_chars];
  for(const mutate of mutations) {const p=preview();mutate(p);assert.equal(parseBootstrapPreview(p),null,String(mutate));}
  for(const reason of ['all_standard_topics_exist','no_eligible_threads','insufficient_evidence']) assert.ok(parseBootstrapPreview({result:'not_applicable',reason}));
  assert.equal(parseBootstrapPreview({result:'not_applicable',reason:'unknown'}),null);
  assert.equal(parseBootstrapPreview({result:'not_applicable',reason:'no_eligible_threads',extra:1}),null);
});
test('apply posts provenance array and independently handles 201,409 and failure',async()=>{
  const calls=[];const p=preview();
  const results=await applyAutoSummary('a/b',p,p.topics.map(t=>t.topic_key),async(url,init)=>{
    calls.push({url,init,body:JSON.parse(init.body)});const key=calls.at(-1).body.topic_key;
    return Response.json({error:'server error'},{status:key==='overview'?201:key==='principles'?409:500});
  });
  assert.deepEqual(results.map(r=>r.status),['applied','conflict','failed']);assert.equal(results[2].error,'server error');
  assert.equal(calls.length,3);for(const call of calls) {
    assert.equal(call.url,'/api/projects/a%2Fb/memory/topics');assert.equal(call.init.method,'POST');
    assert.deepEqual(call.body.source_refs,[{type:'auto_summary',run_id:'run',model:'model',prompt_version:1,considered_threads:p.considered_threads}]);
    assert.ok(!JSON.stringify(call.body.source_refs).includes('content_md'));
    assert.ok(!JSON.stringify(call.body.source_refs).includes('stats'));
    assert.ok(!JSON.stringify(call.body.source_refs).includes('user_messages_'));
  }
  for(const status of [200,400,502]) assert.equal((await applyAutoSummary('p',p,['overview'],async()=>Response.json({},{status})))[0].status,'failed');
  assert.equal((await applyAutoSummary('p',p,['overview'],async()=>{throw new Error('network')}))[0].status,'failed');
});

test('coverage is exact, safe, consistent with provenance and bounded by available messages',()=>{
  const complete=preview();assert.deepEqual(parseBootstrapPreview(complete),complete);
  const partial=preview();partial.stats.user_messages_available=3000;
  assert.deepEqual(parseBootstrapPreview(partial),partial);
  const mutations=[
    p=>p.stats.user_messages_available=1,
    p=>p.stats.user_messages_included=3,
    p=>p.stats.user_messages_included=1,
    p=>p.stats.user_messages_included=0,
    p=>delete p.stats.user_messages_included,
    p=>delete p.stats.user_messages_available,
    p=>p.stats.user_messages_unknown=2,
    p=>{p.stats.threads_included=2;p.stats.threads_eligible=2;p.considered_threads.push({...p.considered_threads[0],thread_id:'other'});p.stats.user_messages_included=1;},
  ];
  for (const key of ['user_messages_included','user_messages_available']) {
    for (const invalid of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,null,undefined,'2']) mutations.push(p=>p.stats[key]=invalid);
  }
  for (const mutate of mutations) {const p=preview();mutate(p);assert.equal(parseBootstrapPreview(p),null,String(mutate));}
});
test('preview request fails closed and forwards API key and cancellation signal',async()=>{
  const controller=new AbortController();let captured;
  const p=await requestAutoSummaryPreview('p','key',controller.signal,async(url,init)=>{captured={url,init};return Response.json(preview());});
  assert.equal(p.result,'preview');assert.equal(captured.init.signal,controller.signal);assert.equal(captured.init.headers['x-openai-api-key'],'key');
  await assert.rejects(requestAutoSummaryPreview('p','key',undefined,async()=>Response.json({result:'preview'})),/応答が不正/);
  await assert.rejects(requestAutoSummaryPreview('p','key',undefined,async()=>Response.json({error:'server'},{status:502})),/server/);
});
