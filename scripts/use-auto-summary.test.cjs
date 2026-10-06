const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const React=require('react');
const {installAliasResolver,installTsLoader}=require('./testBootstrap.cjs');
const {preview}=require('./auto-summary-test-helpers.cjs');
let state=[],cursor=0,deps=[],cleanups=[],pending=[],apiKey='key',notices=[];
const hooks={...React,
  useState(initial){const i=cursor++;if(!(i in state)) state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},
  useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},
  useCallback(fn,d){const i=cursor++;if(!state[i]||d.some((v,n)=>v!==state[i].deps[n]))state[i]={fn,deps:d};return state[i].fn;},
  useEffect(fn,d){const i=cursor++;if(!deps[i]||d.some((v,n)=>v!==deps[i][n]))pending.push(()=>{cleanups[i]?.();deps[i]=d;cleanups[i]=fn();});},
};
const load=Module._load;
Module._load=function(request,parent,main){
  if(request==='react')return hooks;
  if(request==='@/lib/apiKeyStore')return {webApiKeyStore:{getKey:async()=>apiKey}};
  return load.call(this,request,parent,main);
};
installAliasResolver();installTsLoader();
const {useAutoSummary}=require('../lib/project-memory/use-auto-summary.ts');
const toast=(...args)=>notices.push(args);
const render=(projectId='A',enabled=true)=>{cursor=0;return useAutoSummary({projectId,enabled,showToast:toast});};
const effects=()=>{const jobs=pending;pending=[];jobs.forEach(run=>run());};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const reset=fetcher=>{cleanups.forEach(fn=>fn?.());state=[];deps=[];cleanups=[];pending=[];cursor=0;apiKey='key';notices=[];global.fetch=fetcher;};

test('eligibility loads on open, fails disabled, switches labels and rejects old Project responses',async()=>{
  const original=global.fetch;
  try {
    reset(async()=>Response.json({topics:[]}));assert.equal(render().canGenerate,false);effects();await flush();
    assert.equal(render().canGenerate,true);assert.equal(render().buttonLabel,'会話からMemoryを作る');
    reset(async()=>Response.json({topics:[{topic_key:'overview'}]}));render();effects();await flush();assert.equal(render().buttonLabel,'不足分を会話から作る');
    reset(async()=>Response.json({topics:['bad']}));render();effects();await flush();assert.equal(render().canGenerate,false);assert.ok(render().error);
    reset(async()=>Response.json({topics:['overview','current-work','principles','references'].map(topic_key=>({topic_key}))}));render();effects();await flush();assert.equal(render().canGenerate,false);
    let resolveA;reset(url=>url.includes('/A/')?new Promise(r=>resolveA=r):Promise.resolve(Response.json({topics:[{topic_key:'overview'}]})));
    render();effects();assert.equal(render('B').canGenerate,false);effects();await flush();
    resolveA(Response.json({topics:[]}));await flush();assert.equal(render('B').missingStandardTopicKeys.length,3);
    assert.equal(render('B',false).canGenerate,false);effects();
  } finally{global.fetch=original;}
});
test('all apply outcomes refresh eligibility, run cannot be reapplied; stale apply refresh does not clear new Project eligibility',async()=>{
  const original=global.fetch;
  try {
    for(const status of [201,409,500]) {
      let gets=0;reset(async(url,init={})=>{
        if(!init.method){gets++;return Response.json({topics:gets>1?[{topic_key:'overview'}]:[]});}
        if(url.endsWith('/preview'))return Response.json(preview());
        return Response.json({error:'test error'},{status});
      });
      render();effects();await flush();await render().generate();assert.ok(render().preview);
      await render().apply(['overview']);assert.equal(gets,2);assert.equal(render().missingStandardTopicKeys.length,3);
      assert.equal(render().results[0].status,status===201?'applied':status===409?'conflict':'failed');
      await render().apply(['overview']);assert.equal(gets,2,'consumed preview cannot apply twice');
    }
    let finishApply;
    reset(async(url,init={})=>{
      if(!init.method)return Response.json({topics:url.includes('/B/')?[{topic_key:'overview'}]:[]});
      if(url.endsWith('/preview'))return Response.json(preview());
      return new Promise(resolve=>finishApply=resolve);
    });
    render();effects();await flush();await render().generate();const running=render().apply(['overview']);
    render().close();assert.ok(render().preview,'cannot close during apply');
    render('B');effects();await flush();assert.equal(render('B').missingStandardTopicKeys.length,3);
    finishApply(Response.json({},{status:201}));await running;
    assert.equal(render('B').missingStandardTopicKeys.length,3,'old apply reload must not clear B');
    let finishB;
    reset(async(url,init={})=>{
      if(!init.method) return url.includes('/B/') ? new Promise(resolve=>finishB=resolve) : Response.json({topics:[]});
      if(url.endsWith('/preview')) return Response.json(preview());
      return new Promise(resolve=>finishApply=resolve);
    });
    render();effects();await flush();await render().generate();const applyingA=render().apply(['overview']);
    render('B');effects();finishApply(Response.json({},{status:201}));await applyingA;
    finishB(Response.json({topics:[{topic_key:'overview'}]}));await flush();
    assert.equal(render('B').missingStandardTopicKeys.length,3,'old apply must not invalidate pending B GET');
    assert.equal(render('B').loading,false);
  }finally{global.fetch=original;}
});
test('not_applicable refreshes with distinct Japanese notices; missing key displays error without request',async()=>{
  const original=global.fetch;
  try {
    for(const reason of ['all_standard_topics_exist','no_eligible_threads','insufficient_evidence']){
      let gets=0;reset(async(_url,init={})=>{if(!init.method){gets++;return Response.json({topics:[]});}return Response.json({result:'not_applicable',reason});});
      render();effects();await flush();await render().generate();assert.equal(gets,2);assert.equal(render().preview,null);assert.ok(notices[0][0].length>10);
    }
    let requests=0;reset(async()=>{requests++;return Response.json({topics:[]});});render();effects();await flush();apiKey=null;
    await render().generate();assert.equal(requests,1);assert.equal(notices[0][1],'error');assert.match(notices[0][0],/OpenAI APIキー/);
  }finally{global.fetch=original;}
});

test('eligibility reload after deletion changes standard-topic button labels',async()=>{
  const original=global.fetch;
  try {
    let keys=['overview','current-work','principles','references'];
    reset(async()=>Response.json({topics:keys.map(topic_key=>({topic_key}))}));
    render();effects();await flush();assert.equal(render().canGenerate,false);
    keys=['overview'];await render().reload();
    assert.equal(render().buttonLabel,'不足分を会話から作る');assert.equal(render().missingStandardTopicKeys.length,3);
    keys=[];await render().reload();
    assert.equal(render().buttonLabel,'会話からMemoryを作る');assert.equal(render().missingStandardTopicKeys.length,4);
    assert.equal(render().canGenerate,true);
  }finally{global.fetch=original;}
});
