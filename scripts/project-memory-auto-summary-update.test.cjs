const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { installTsLoader, installAliasResolver } = require('./testBootstrap.cjs');
installTsLoader(); installAliasResolver();
globalThis.AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage;
let llmContent, llmCalls = [], authStatus = 200, routeDb;
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '@/lib/lore/openai') return { chatCompleteMini: async (...args) => {
    llmCalls.push(args); if (llmContent instanceof Error) throw llmContent; return llmContent;
  } };
  if (request === '@/lib/supabase/route-auth') return { requireRouteUser: async () => authStatus === 200 ?
    { ok: true, user: { id: 'u' }, supabase: routeDb, finalizeJson: (v, init) => Response.json(v, init) } :
    { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: authStatus }) } };
  return originalLoad.call(this, request, parent, isMain);
};
const update = require('../lib/project-memory/auto-summary-update.ts');
const limits = require('../lib/project-memory/auto-summary-update-limits.ts');
const route = require('../app/api/projects/[projectId]/memory/update/preview/route.ts');
const { thread, message } = require('./auto-summary-test-helpers.cjs');

// Models the actual PostgREST predicates, ranges, keyset ordering and exact counts.
function database(tables, failTable) {
  const calls = [];
  const split = s => {
    let depth = 0, start = 0, result = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') depth++; if (s[i] === ')') depth--;
      if (s[i] === ',' && !depth) { result.push(s.slice(start, i)); start = i + 1; }
    }
    return [...result, s.slice(start)];
  };
  function matches(row, term) {
    if (term.startsWith('and(')) return split(term.slice(4, -1)).every(t => matches(row, t));
    const match = term.match(/^([^.]+)\.(is|eq|gt)\.(.*)$/);
    assert.ok(match, term);
    const [, key, op, raw] = match;
    const value = raw === 'true' ? true : raw === 'false' ? false : raw;
    return op === 'is' ? row[key] == null : op === 'eq' ? row[key] === value : row[key] > value;
  }
  return { calls, from(table) {
    let rows = [...(tables[table] ?? [])], options, columns, start = 0, end = Infinity;
    const call = { table, filters: [], orders: [] }; calls.push(call);
    const q = {
      select(v, opts) { columns = v; options = opts; call.columns = v; call.options = opts; return q; },
      eq(k,v) { call.filters.push(['eq',k,v]); rows = rows.filter(r => r[k] === v); return q; },
      neq(k,v) { call.filters.push(['neq',k,v]); rows = rows.filter(r => r[k] != null && r[k] !== v); return q; },
      in(k,v) { call.filters.push(['in',k,v]); rows = rows.filter(r => v.includes(r[k])); return q; },
      gt(k,v) { call.filters.push(['gt',k,v]); rows = rows.filter(r => r[k] > v); return q; },
      or(v) { call.filters.push(['or',v]); rows = rows.filter(r => split(v).some(t => matches(r,t))); return q; },
      order(k,opts = { ascending:true }) { call.orders.push([k,opts.ascending]); return q; },
      range(a,b) { start = a; end = b+1; call.range = [a,b]; return q; },
      limit(n) { end = n; call.limit = n; return q; },
      maybeSingle() { call.single = true; return Promise.resolve(resolve(true)); },
      then(a,b) { return Promise.resolve(resolve(false)).then(a,b); },
    };
    function resolve(single) {
      if (table === failTable) return { data:null, error:{ code:'DB_TEST' } };
      rows.sort((a,b) => { for (const [k,asc] of call.orders) {
        const n = a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0; if (n) return asc ? n : -n;
      } return 0; });
      const data = rows.slice(start,end).map(r => Object.fromEntries(columns.split(',').map(k => [k.trim(),r[k.trim()]])));
      return { data: options?.head ? null : single ? data[0] ?? null : data, count: rows.length, error:null };
    }
    return q;
  } };
}
const position = n => ({ created_at: message('t',n).created_at, id: message('t',n).id });
const topic = (key = 'overview', start = position(0)) => ({ id:key, topic_key:key, revision:2, content_md:'Original',
  origin:'auto_summary', starts:new Map([['t',start]]), baseline:{created_at:position(0).created_at,id:null} });
const cursor = (key='overview', id='t', n=0) => ({topic_id:key,thread_id:id,message_id:message(id,n).id,message_created_at:message(id,n).created_at});
function tables() { return {
  projects:[{id:'p',user_id:'u'}], threads:[thread('t')], messages:[message('t',1,{content:'New fact'})],
  project_memory_topics:[{id:'overview',topic_key:'overview',revision:2,content_md:'Original',project_id:'p',user_id:'u'}],
  project_memory_revisions:[{topic_id:'overview',revision:1,source_refs:[{type:'auto_summary',considered_threads:[{
    thread_id:'t',last_message_at:position(0).created_at,newest_included_message_id:position(0).id}]}]},
    {topic_id:'overview',revision:2,source_refs:[]}], project_memory_auto_summary_cursors:[cursor()],
}; }
const select = (db, ts = [topic()]) => update.selectAutoSummaryUpdateInput(db,'u','p',ts);
const load = db => update.loadAutoSummaryUpdateTopics(db,'u','p');
const inputMessages = s => JSON.parse(s.input).threads.flatMap(t => t.days.flatMap(d => d.m));
function invoke() { return route.POST(new Request('https://example.com/api/projects/p/memory/update/preview',
  {method:'POST',headers:{'x-openai-api-key':'key'}}),{params:Promise.resolve({projectId:'p'})}); }
function reset(data=tables(), failTable) {
  authStatus=200; routeDb=database(data,failTable); llmCalls=[];
  llmContent=JSON.stringify({topics:[{topic_key:'overview',needs_update:true,reason:'new fact',content_md:'Original\nNew fact'}]});
}

test('origin classifies all five labels using only the first ref', () => {
  for (const type of ['auto_summary','auto_summary_update','consolidation_run','instruction_edit']) assert.equal(update.classifyRevisionOrigin([{type}]),type);
  for (const refs of [[],null,[{type:'custom'}],[{}, {type:'auto_summary'}]]) assert.equal(update.classifyRevisionOrigin(refs),'manual_or_unknown');
});
test('parser accepts both exact discriminated shapes and normalizes identical content', () => {
  const topics=[topic(),topic('principles')];
  const decisions=[{topic_key:'overview',needs_update:false},{topic_key:'principles',needs_update:true,reason:'addition',content_md:'Updated'}];
  assert.deepEqual(update.parseAutoSummaryUpdateResponse(JSON.stringify({topics:decisions}),topics),decisions);
  assert.deepEqual(update.parseAutoSummaryUpdateResponse(JSON.stringify({topics:[{topic_key:'overview',needs_update:true,reason:'same',content_md:'Original'}]}),[topic()]),[{topic_key:'overview',needs_update:false}]);
});
for (const [name, rows] of [
  ['missing',[]], ['duplicate',[{topic_key:'overview',needs_update:false},{topic_key:'overview',needs_update:false}]],
  ['unknown',[{topic_key:'custom',needs_update:false}]], ['false content',[{topic_key:'overview',needs_update:false,content_md:'x'}]],
  ['empty reason',[{topic_key:'overview',needs_update:true,reason:' ',content_md:'x'}]],
  ['empty body',[{topic_key:'overview',needs_update:true,reason:'x',content_md:' '}]],
  ['extra property',[{topic_key:'overview',needs_update:true,reason:'x',content_md:'x',extra:1}]],
  ['nonboolean',[{topic_key:'overview',needs_update:1}]],
]) test(`parser fail-closes ${name}`, () => assert.throws(() => update.parseAutoSummaryUpdateResponse(JSON.stringify({topics:rows}),[topic()])));
test('parser rejects malformed envelopes and partial topic sets', () => {
  for (const value of ['{','null','{"topics":[],"other":1}','{"topics":{}}']) assert.throws(()=>update.parseAutoSummaryUpdateResponse(value,[topic()]));
  assert.throws(()=>update.parseAutoSummaryUpdateResponse('{"topics":[{"topic_key":"overview","needs_update":false}]}',[topic(),topic('principles')]));
});
test('input budget measures exact serialized UTF-16 at 60000 and 60001', () => {
  const overhead=update.buildAutoSummaryUpdateInput([{content_md:''}],[]).length;
  const existing=[{content_md:'😀'.repeat(100)+'x'.repeat(60000-overhead-200)}];
  const exact=update.buildAutoSummaryUpdateInput(existing,[]);
  assert.equal(exact,JSON.stringify({existing_topics:existing,threads:[]})); assert.equal(exact.length,60000);
  update.assertAutoSummaryUpdateInputBudget(exact);
  existing[0].content_md+='x'; assert.throws(()=>update.assertAutoSummaryUpdateInputBudget(update.buildAutoSummaryUpdateInput(existing,[])),update.AutoSummaryUpdateInputTooLarge);
});
test('selector uses per-thread minimum cursor and annotates each topic actual new input', async () => {
  const a=topic(), b=topic('references',position(2));
  b.starts.set('s',{created_at:position(0).created_at,id:null});
  a.starts.set('s',{created_at:position(3).created_at,id:null});
  const db=database({threads:[thread('t'),thread('s')],messages:[message('t',1),message('t',2),message('t',3),message('s',1)]});
  const s=await select(db,[a,b]);
  const t=JSON.parse(s.input).threads.find(t=>t.thread_id==='t');
  assert.deepEqual(t.days[0].m.map(m=>m.topic_keys),[['overview'],['overview'],['overview','references']]);
  assert.equal(s.stats.user_messages_available,4);
  assert.equal(s.checkpoint_topics[0].cursors.some(c=>c.thread_id==='s'),false);
  assert.equal(s.checkpoint_topics[1].cursors.some(c=>c.thread_id==='s'),true);
  assert.equal(update.minimumUpdateStart([a,b],'t').id,position(0).id);
  assert.equal(update.minimumUpdateStart([a,b],'s').created_at,position(0).created_at);
});
test('FIFO ties use id, including keyset page boundaries', async () => {
  const rows=Array.from({length:205},(_,i)=>message('t',i+1,{created_at:position(1).created_at})).reverse();
  const s=await select(database({threads:[thread('t')],messages:rows}));
  assert.deepEqual(inputMessages(s).map(m=>m.id),[...rows].reverse().map(m=>m.id));
  assert.equal(s.considered_threads[0].newest_included_message_id,message('t',205).id);
  assert.equal(s.considered_threads[0].newest_included_created_at,position(1).created_at);
});
test('position comparisons retain sub-millisecond timestamp precision', () => {
  assert.ok(update.compareUpdatePositions({created_at:'2026-01-01T00:00:00.000001Z',id:'z'}, {created_at:'2026-01-01T00:00:00.000002Z',id:'a'})<0);
  assert.ok(update.compareUpdatePositions({created_at:position(1).created_at,id:'z'}, {created_at:position(1).created_at,id:null})<0);
});
test('budget blocks FIFO head without skipping a smaller later message', async () => {
  const ts=[topic()]; ts[0].content_md='x'.repeat(58800);
  const db=database({threads:[thread('t')],messages:[message('t',1,{content:'a'}),message('t',2,{content:'😀'.repeat(1000)}),message('t',3,{content:'b'})]});
  const s=await select(db,ts);
  assert.deepEqual(inputMessages(s).map(m=>m.id),[message('t',1).id]);
  assert.equal(s.considered_threads[0].truncated,true);
  assert.deepEqual(s.checkpoint_topics[0].cursors,[{thread_id:'t',message_id:message('t',1).id}]);
});
test('existing bodies remain untruncated; oversized bodies and unfit first heads throw 413 error', async () => {
  const ts=[topic()]; ts[0].content_md='x'.repeat(60001);
  await assert.rejects(select(database({threads:[],messages:[]}),ts),update.AutoSummaryUpdateInputTooLarge);
  const base=JSON.parse((await select(database({threads:[],messages:[]}))).input).existing_topics;
  const overhead=update.buildAutoSummaryUpdateInput(base,[]).length-'Original'.length;
  ts[0].content_md='x'.repeat(60000-overhead);
  await assert.rejects(select(database({threads:[thread('t')],messages:[message('t',1)]}),ts),update.AutoSummaryUpdateInputTooLarge);
  const empty=await select(database({threads:[thread('t')],messages:[]}),ts);
  assert.equal(empty.stats.user_messages_included,0); assert.equal(empty.input.length,60000);
});
test('101 threads select oldest next unprocessed 100, then remaining candidate next run', async () => {
  const threads=Array.from({length:101},(_,i)=>thread('thread-'+i));
  const messages=threads.map((t,i)=>message(t.id,i+1));
  const ts=[topic()], db=database({threads,messages});
  const first=await select(db,ts);
  assert.equal(first.stats.user_messages_available,101);assert.equal(first.stats.user_messages_included,100);
  assert.deepEqual(first.considered_threads.map(c=>c.thread_id),threads.slice(0,100).map(t=>t.id));
  for (const c of first.considered_threads) ts[0].starts.set(c.thread_id,{created_at:c.newest_included_created_at,id:c.newest_included_message_id});
  const second=await select(database({threads,messages}),ts);
  assert.deepEqual(second.considered_threads.map(c=>c.thread_id),['thread-100']);
});
test('water filling gives every eligible thread input before repeating a heavy thread', async () => {
  const threads=[thread('t'),thread('s')];
  const messages=[...Array.from({length:20},(_,i)=>message('t',i+1,{content:'x'.repeat(1000)})),message('s',2,{content:'short'})];
  const ts=[topic()];ts[0].content_md='x'.repeat(56000);
  const s=await select(database({threads,messages}),ts);
  assert.equal(s.considered_threads.find(c=>c.thread_id==='s').included_message_count,1);
  assert.ok(s.considered_threads.find(c=>c.thread_id==='t').truncated);
});
test('thread and message eligibility matches bootstrap predicates but needs only one user message', async () => {
  const db=database({threads:[thread('t',null),thread('roleplay',true),{...thread('other'),project_id:'other'},{...thread('foreign'),user_id:'other'}],
    messages:[message('t',1,{is_active:null}),message('t',2,{provider:'memo'}),message('t',3,{provider:'image_gen'}),message('t',4,{role:'assistant'}),message('t',5,{is_active:false}),message('roleplay',6)]});
  const s=await select(db);assert.equal(s.stats.user_messages_available,1);assert.equal(s.stats.threads_total,1);
  assert.ok(db.calls.filter(c=>c.table==='messages').every(c=>c.filters.some(f=>f[0]==='eq'&&f[1]==='role'&&f[2]==='user')));
});
test('thread population pages past 1000 rows', async () => {
  const threads=Array.from({length:1001},(_,i)=>thread(String(i).padStart(4,'0')));
  const db=database({threads,messages:[message('1000',1)]});const s=await select(db);
  assert.equal(s.stats.threads_total,1001);assert.equal(s.considered_threads[0].thread_id,'1000');
  assert.deepEqual(db.calls.filter(c=>c.table==='threads').map(c=>c.range),[[0,499],[500,999],[1000,1499]]);
});
test('mask, code point truncation and JST helpers are used for new messages', async () => {
  const s=await select(database({threads:[thread('t')],messages:[message('t',1,{content:'a@example.com '+'😀'.repeat(1200),created_at:'2026-01-01T16:00:00.000Z'})]}));
  const sent=JSON.parse(s.input); assert.equal(sent.threads[0].days[0].d,'2026-01-02');
  const content=inputMessages(s)[0].content;assert.ok(!content.includes('a@example.com'));assert.equal(Array.from(content).length,1000);
});
test('stored cursor survives physical message deletion without message body lookup', async () => {
  const db=database(tables());const loaded=await load(db);
  assert.deepEqual(loaded.topics[0].starts.get('t'),position(0));
  assert.equal(db.calls.filter(c=>c.table==='messages').length,0);
  assert.equal(loaded.topics[0].origin,'manual_or_unknown');
});
test('cursor pagination retains all 1001 rows', async () => {
  const data=tables();data.project_memory_auto_summary_cursors=Array.from({length:1001},(_,i)=>cursor('overview',String(i).padStart(4,'0')));
  data.project_memory_revisions=[];const db=database(data);const loaded=await load(db);
  assert.equal(loaded.topics[0].starts.size,1001);assert.ok(loaded.topics[0].starts.has('1000'));
  assert.deepEqual(db.calls.filter(c=>c.table==='project_memory_auto_summary_cursors').map(c=>c.range),[[0,499],[500,999],[1000,1499]]);
});
test('revision 1 fallback finds inactive user source message and validates identity', async () => {
  const data=tables();data.project_memory_auto_summary_cursors=[];data.messages.push(message('t',0,{is_active:false}));
  const db=database(data), loaded=await load(db);assert.deepEqual(loaded.topics[0].starts.get('t'),position(0));
  assert.deepEqual(db.calls.find(c=>c.table==='messages').filters,[['eq','id',position(0).id]]);
});
test('deleted revision 1 message and unconsidered threads fall back to maximum last_message_at', async () => {
  const data=tables();data.project_memory_auto_summary_cursors=[];
  data.project_memory_revisions[0].source_refs[0].considered_threads.push({thread_id:'old',last_message_at:position(4).created_at,newest_included_message_id:'deleted'});
  const loaded=await load(database(data));assert.equal(loaded.topics[0].starts.size,0);
  assert.deepEqual(loaded.topics[0].baseline,{created_at:position(4).created_at,id:null});
  const s=await select(database({threads:[thread('t')],messages:[message('t',4),message('t',5)]}),loaded.topics);
  assert.deepEqual(inputMessages(s).map(m=>m.id),[position(5).id]);
});
for (const [name, edit] of [
  ['thread',m=>m.thread_id='other'], ['role',m=>m.role='assistant'], ['user',m=>m.user_id='other'],
  ['project',(m,data)=>data.threads[0].project_id='other'], ['thread owner',(m,data)=>data.threads[0].user_id='other'],
]) test(`revision 1 ${name} contradiction excludes only that topic`, async () => {
  const data=tables();data.project_memory_auto_summary_cursors=[];const m=message('t',0);edit(m,data);data.messages.push(m);
  data.threads.push(thread('other'));
  data.project_memory_topics.push({...data.project_memory_topics[0],id:'references',topic_key:'references'});
  data.project_memory_auto_summary_cursors.push(cursor('references'));
  const loaded=await load(database(data));assert.deepEqual(loaded.excluded_topics,[{topic_key:'overview',reason:'provenance_mismatch'}]);
  assert.deepEqual(loaded.topics.map(t=>t.topic_key),['references']);
});
test('exclusions distinguish no baseline, non-auto history and empty body; custom/foreign topics excluded by query', async () => {
  const data=tables();data.project_memory_auto_summary_cursors=[];data.project_memory_revisions=[];
  assert.deepEqual((await load(database(data))).excluded_topics,[{topic_key:'overview',reason:'no_baseline'}]);
  for (const refs of [[],[{type:'instruction_edit'}],[{}, {type:'auto_summary'}]]) {
    data.project_memory_revisions=[{topic_id:'overview',revision:1,source_refs:refs}];
    assert.equal((await load(database(data))).excluded_topics[0].reason,'no_auto_summary_history');
  }
  data.project_memory_topics[0].content_md='';assert.equal((await load(database(data))).excluded_topics[0].reason,'empty_topic');
  data.project_memory_topics=[{...data.project_memory_topics[0],topic_key:'custom'}, {...data.project_memory_topics[0],user_id:'foreign'}];
  assert.equal((await load(database(data))).topics.length,0);
});

test('route preview includes shared contracts, authoritative baseline and no writes', async () => {
  reset();const response=await invoke(), body=await response.json();assert.equal(response.status,200);assert.equal(body.result,'preview');
  assert.match(body.run_id,/^[\da-f-]{36}$/);assert.equal(typeof body.model,'string');assert.equal(body.prompt_version,2);
  assert.equal(body.proposals[0].current_content_md,'Original');assert.equal(body.proposals[0].origin,'manual_or_unknown');
  assert.equal(body.checkpoint_topics[0].cursors[0].message_id,position(1).id);assert.equal(body.considered_threads.length,1);
  assert.equal(body.stats.user_messages_available,1);assert.deepEqual(body.excluded_topics,[]);
  assert.equal(llmCalls.length,1);assert.deepEqual(llmCalls[0][3],{jsonMode:true,maxCompletionTokens:16384});
  // Mock exposes no insert/update/delete/upsert/rpc: any write fails this successful request.
  assert.ok(routeDb.calls.every(c=>c.columns));
});
test('route checkpoint_only retains checkpoints and all metadata for unchanged/normalized responses', async () => {
  for (const decision of [{topic_key:'overview',needs_update:false},{topic_key:'overview',needs_update:true,reason:'same',content_md:'Original'}]) {
    reset();llmContent=JSON.stringify({topics:[decision]});const body=await (await invoke()).json();
    assert.equal(body.result,'checkpoint_only');assert.deepEqual(body.proposals,[]);
    for (const key of ['checkpoint_topics','considered_threads','stats','excluded_topics','run_id','model','prompt_version']) assert.ok(key in body);
    assert.equal(body.checkpoint_topics[0].cursors.length,1);
  }
});
test('route not_applicable never calls LLM and distinguishes no topics/no new messages', async () => {
  const data=tables();data.project_memory_topics[0].content_md='';reset(data);
  let body=await (await invoke()).json();assert.equal(body.result,'not_applicable');assert.equal(body.reason,'no_updatable_topics');assert.equal(body.excluded_topics[0].reason,'empty_topic');assert.equal(llmCalls.length,0);
  reset({...tables(),messages:[]});body=await (await invoke()).json();assert.equal(body.reason,'no_new_messages');assert.equal(llmCalls.length,0);
  for (const k of ['run_id','model','prompt_version']) assert.ok(k in body);
});
test('route shared input does not checkpoint a topic ahead of selected messages', async () => {
  const data=tables();data.project_memory_topics.push({...data.project_memory_topics[0],id:'references',topic_key:'references'});
  data.project_memory_auto_summary_cursors.push(cursor('references','t',4));reset(data);
  llmContent=JSON.stringify({topics:[{topic_key:'overview',needs_update:false},{topic_key:'references',needs_update:false}]});
  const body=await (await invoke()).json();assert.equal(body.result,'checkpoint_only');
  assert.equal(body.checkpoint_topics.find(t=>t.topic_key==='overview').cursors.length,1);
  assert.deepEqual(body.checkpoint_topics.find(t=>t.topic_key==='references').cursors,[]);
});
test('route maps auth 401/403, project 404, and missing key 400', async () => {
  for (const status of [401,403]) {reset();authStatus=status;assert.equal((await invoke()).status,status);assert.equal(routeDb.calls.length,0);}
  reset({...tables(),projects:[]});assert.equal((await invoke()).status,404);assert.equal(llmCalls.length,0);
  reset();const res=await route.POST(new Request('https://example.com',{method:'POST'}),{params:Promise.resolve({projectId:'p'})});assert.equal(res.status,400);assert.equal(routeDb.calls.length,0);
});
test('route maps body over budget and unfit FIFO first message to 413 without LLM', async () => {
  for (const size of [60001,58000]) {
    const data=tables();data.project_memory_topics[0].content_md='x'.repeat(size);data.messages[0].content='😀'.repeat(1000);reset(data);
    const res=await invoke();assert.equal(res.status,413);assert.equal((await res.json()).error,'update_input_too_large');assert.equal(llmCalls.length,0);
  }
});
test('route fails closed on LLM failure, null or invalid/partial output with 502', async () => {
  for (const value of [new Error('upstream'),null,'{','{"topics":[]}']) {
    reset();llmContent=value;const res=await invoke();assert.equal(res.status,502);
    assert.equal((await res.json()).error,typeof value==='string'?'invalid_llm_response':'llm_failed');
  }
});
test('route DB errors map to 500 without LLM or writes', async () => {
  for (const table of ['projects','project_memory_topics','project_memory_revisions','project_memory_auto_summary_cursors','threads','messages']) {
    reset(tables(),table);assert.equal((await invoke()).status,500);assert.equal(llmCalls.length,0);
  }
});

// Gate count completions explicitly: no timers, randomness or wall-clock assertions.
function controlledProbes(data, completionOrder, outcomes = {}) {
  const db = database(data);
  const from = db.from.bind(db);
  const ids = data.threads.map(t => t.id).sort();
  const batches = new Map();
  const state = { active: 0, maximum: 0, started: [], completed: [] };
  db.from = table => {
    const query = from(table), call = db.calls[db.calls.length - 1];
    const then = query.then.bind(query);
    query.then = (resolve, reject) => {
      const id = call.filters.find(f => f[0] === 'eq' && f[1] === 'thread_id')?.[2];
      const first = table === 'messages' && call.limit === 1;
      const head = table === 'messages' && call.options?.head;
      if (first) {
        state.started.push(id); state.active++;
        state.maximum = Math.max(state.maximum, state.active);
      }
      return then(async result => {
        if (!head) return result;
        const batchIndex = Math.floor(ids.indexOf(id) / 4);
        let batch = batches.get(batchIndex);
        if (!batch) { batch = new Map(); batches.set(batchIndex, batch); }
        const gate = new Promise(release => batch.set(id, release));
        const batchIds = ids.slice(batchIndex * 4, batchIndex * 4 + 4);
        if (batch.size === batchIds.length) {
          queueMicrotask(async () => {
            for (const index of completionOrder) {
              const next = batchIds[index];
              if (next !== undefined) {
                batch.get(next)();
                await new Promise(resume => queueMicrotask(resume));
              }
            }
          });
        }
        await gate;
        state.active--; state.completed.push(id);
        const outcome = outcomes[id];
        if (outcome?.reject) throw outcome.reject;
        if (outcome?.error) return { ...result, error: outcome.error };
        if (outcome && 'count' in outcome) return { ...result, count: outcome.count };
        return result;
      }, reject).then(resolve, reject);
    };
    return query;
  };
  return { db, state };
}

test('probe batches overlap at most four threads and preserve first-then-count queries', async () => {
  const threads = Array.from({ length: 9 }, (_, i) => thread(`probe-${i}`));
  const controlled = controlledProbes({ threads, messages: threads.map(t => message(t.id, 1)) }, [3, 1, 2, 0]);
  const result = await select(controlled.db);
  assert.equal(controlled.state.maximum, 4);
  assert.equal(controlled.state.active, 0);
  assert.deepEqual(controlled.state.started, threads.map(t => t.id));
  assert.deepEqual(controlled.state.completed, ['probe-3','probe-1','probe-2','probe-0','probe-7','probe-5','probe-6','probe-4','probe-8']);
  assert.equal(result.stats.user_messages_available, 9);
  for (const t of threads) {
    const calls = controlled.db.calls.filter(c => c.table === 'messages' && c.filters.some(f => f[1] === 'thread_id' && f[2] === t.id));
    assert.equal(calls.length, 2);
    assert.equal(calls[0].limit, 1);
    assert.deepEqual(calls[0].orders, [['created_at', true], ['id', true]]);
    assert.deepEqual(calls[1].options, { count: 'exact', head: true });
    assert.deepEqual(calls[0].filters, calls[1].filters);
  }
});

test('fixed probe completion permutations preserve all returned values and oldest 100 selection', async () => {
  const threads = Array.from({ length: 105 }, (_, i) => thread(`ordered-${String(i).padStart(3, '0')}`));
  // Duplicate message positions across threads force the existing thread-id tie-break.
  const messages = threads.map((t, i) => message(t.id, 1, {
    id: `shared-${String(Math.floor((104 - i) / 2)).padStart(3, '0')}`,
    content: `Fact for ${t.id}`,
  }));
  const data = { threads: [...threads].reverse(), messages };
  const expected = await select(database(data));
  const expectedIds = [...messages].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : a.thread_id.localeCompare(b.thread_id))
    .slice(0, 100).map(m => m.thread_id);
  assert.deepEqual(expected.considered_threads.map(t => t.thread_id), expectedIds);
  for (const order of [[3, 1, 2, 0], [0, 2, 3, 1]]) {
    const controlled = controlledProbes(data, order);
    const actual = await select(controlled.db);
    assert.deepEqual(actual, expected);
    assert.equal(actual.input, expected.input);
    assert.equal(actual.stats.threads_eligible, 105);
    assert.equal(actual.considered_threads.length, 100);
    assert.equal(controlled.state.maximum, 4);
    assert.deepEqual(controlled.state.completed.slice(0, 4), order.map(i => threads[i].id));
  }
});

test('multiple probe DB failures choose earliest thread despite reverse rejection order; later batches never start', async () => {
  const threads = Array.from({ length: 7 }, (_, i) => thread(`failure-${i}`));
  const controlled = controlledProbes({ threads, messages: threads.map(t => message(t.id, 1)) }, [3, 2, 1, 0], {
    'failure-1': { error: { code: 'FIRST_THREAD_FAILURE' } },
    'failure-3': { error: { code: 'EARLY_COMPLETION_FAILURE' } },
  });
  await assert.rejects(select(controlled.db), error => {
    assert.ok(error instanceof update.AutoSummaryUpdateDbError);
    assert.equal(error.table, 'messages'); assert.equal(error.code, 'FIRST_THREAD_FAILURE');
    return true;
  });
  assert.deepEqual(controlled.state.completed, ['failure-3','failure-2','failure-1','failure-0']);
  assert.deepEqual(controlled.state.started, threads.slice(0, 4).map(t => t.id));
  assert.equal(controlled.state.active, 0);
});

test('probe rejects with the original reason object in thread order', async () => {
  const threads = Array.from({ length: 5 }, (_, i) => thread(`reject-${i}`));
  const first = new update.AutoSummaryUpdateDbError('messages', 'FIRST');
  const later = new update.AutoSummaryUpdateDbError('messages', 'LATER');
  const controlled = controlledProbes({ threads, messages: threads.map(t => message(t.id, 1)) }, [3, 2, 1, 0], {
    'reject-0': { reject: first }, 'reject-2': { reject: later },
  });
  await assert.rejects(select(controlled.db), error => error === first);
  assert.equal(controlled.state.started.length, 4);
});

test('invalid counts keep messages DB error and precede later-thread failures', async () => {
  for (const count of [null, undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '1']) {
    const threads = Array.from({ length: 5 }, (_, i) => thread(`count-${i}`));
    const controlled = controlledProbes({ threads, messages: threads.map(t => message(t.id, 1)) }, [3, 2, 1, 0], {
      'count-0': { count }, 'count-3': { error: { code: 'LATER_FAILURE' } },
    });
    await assert.rejects(select(controlled.db), error => {
      assert.ok(error instanceof update.AutoSummaryUpdateDbError);
      assert.equal(error.table, 'messages'); assert.equal(error.code, undefined); return true;
    });
    assert.equal(controlled.state.started.length, 4);
  }
});

test('threads without a first message issue no count query', async () => {
  const threads = Array.from({ length: 5 }, (_, i) => thread(`empty-${i}`));
  const db = database({ threads, messages: [message('empty-4', 1)] });
  const result = await select(db);
  assert.equal(result.stats.threads_eligible, 1);
  assert.equal(db.calls.filter(c => c.options?.head).length, 1);
});

test('shared title limit truncates by code point without splitting surrogate pairs', async () => {
  const { MAX_TITLE_CHARS, PREFLIGHT_CONCURRENCY } = require('../lib/project-memory/auto-summary.ts');
  assert.equal(MAX_TITLE_CHARS, 80); assert.equal(PREFLIGHT_CONCURRENCY, 4);
  const title = 'x'.repeat(MAX_TITLE_CHARS - 1) + '😀' + 'trailing';
  const result = await select(database({ threads: [{ ...thread('t'), title }], messages: [message('t', 1)] }));
  const actual = JSON.parse(result.input).threads[0].title;
  assert.equal(actual, 'x'.repeat(MAX_TITLE_CHARS - 1) + '😀');
  assert.equal(Array.from(actual).length, MAX_TITLE_CHARS);
});

test('update prompt v2 explicitly leaves topics unchanged without relevant new evidence or a needed change', () => {
  assert.equal(limits.AUTO_SUMMARY_UPDATE_PROMPT_VERSION, 2);
  assert.ok(update.AUTO_SUMMARY_UPDATE_SYSTEM_PROMPT.includes(
    'Return needs_update:false for any topic with no supporting evidence in new messages whose topic_keys include its own key, or whose existing content does not need to change.'
  ));
});
