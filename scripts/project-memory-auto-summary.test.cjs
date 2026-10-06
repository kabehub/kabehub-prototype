const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installAliasResolver, installTsLoader } = require('./testBootstrap.cjs');
installAliasResolver(); installTsLoader();
const { database, thread, message } = require('./auto-summary-test-helpers.cjs');
const { selectAutoSummaryInput, finalizeAutoSummaryInput, parseAutoSummaryResponse, buildAutoSummaryInput, autoSummaryJstDate, truncateAutoSummaryMessage, selectAutoSummaryThreads, autoSummaryMessageIncrement, nextAutoSummaryWaterfillThread, MIN_THREAD_MESSAGE_BUDGET, AutoSummaryDbError, AUTO_SUMMARY_SYSTEM_PROMPT, AUTO_SUMMARY_PROMPT_VERSION } = require('../lib/project-memory/auto-summary.ts');
const { MAX_AUTO_SUMMARY_INPUT_CHARS, MAX_AUTO_SUMMARY_MESSAGE_CHARS, MAX_AUTO_SUMMARY_THREADS, AUTO_SUMMARY_TRUNCATION_MARKER } = require('../lib/project-memory/auto-summary-limits.ts');
const select = db => selectAutoSummaryInput(db, 'u','p',['overview']);
const entries = thread => thread.days.flatMap(day => day.m);

test('v7 adds exactly two sensitive-content rules to the verbatim v6 prompt snapshot',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const rules=[
    '- Never record secrets (API keys, tokens, passwords, private keys) or personal identifiers (email addresses, phone numbers, postal addresses, government IDs, bank or card numbers) in any topic, even if they appear in the input. Omit them entirely; do not write masked forms, placeholders, or a note that something was omitted.',
    '- The token "[redacted]" in a message marks removed sensitive content. Do not mention it, and do not infer what it replaced.',
  ];
  const source=fs.readFileSync(require.resolve('../lib/project-memory/auto-summary.ts'),'utf8').replace(/\r\n/g,'\n');
  let prompt=source.slice(source.indexOf('const TOPIC_ROLES:'),source.indexOf('\ntype ThreadRow'));
  for(const rule of rules){assert.ok(AUTO_SUMMARY_SYSTEM_PROMPT.includes(rule));assert.equal(prompt.split(rule).length,2);prompt=prompt.replace(rule+'\n','');}
  assert.equal(prompt,fs.readFileSync(path.join(__dirname,'fixtures/auto-summary-prompt-v6.txt'),'utf8').replace(/\r\n/g,'\n'));
});

test('DB input masks bodies and titles before cuts, with exact masked JSON budgets and coverage', async()=>{
  const email='person@example.com', key='sk-ant-'+'SECRETFRAGMENT'.repeat(12);
  const titleEmail='title@example.com';
  const rows=Array.from({length:120},(_,i)=>message('s',i,{
    content: '前'.repeat(560)+email+' '+key+'後'.repeat(1500)+key+'末'.repeat(300),
  }));
  const result=await select(database({threads:[{...thread('s'),title:'題'.repeat(70)+titleEmail}],messages:rows}));
  const input=JSON.parse(result.input);
  assert.equal(input.threads[0].title,'題'.repeat(70)+'[redacted]');
  assert.ok(result.input.includes('[redacted]'));
  for(const secret of [email,titleEmail,key,'sk-ant-','SECRETFRAGMENT'])assert.ok(!result.input.includes(secret),secret);
  assert.equal(result.stats.input_chars,JSON.stringify(input).length);
  assert.ok(result.stats.input_chars<=60000);
  assert.equal(Object.keys(result.stats).length,9);
  assert.equal(result.stats.user_messages_available,120);
  assert.equal(result.stats.user_messages_included,entries(input.threads[0]).length);
  assert.equal(result.stats.user_messages_included,result.considered_threads.reduce((n,t)=>n+t.included_message_count,0));
  assert.ok(result.stats.user_messages_included<120);
});

test('masking protects both truncation edges and the original 1000-character boundary',async()=>{
  const key='sk-ant-'+'UNIQUESECRET'.repeat(20);
  for(const prefix of [550,990,1500]){
    const content='前'.repeat(prefix)+key+'後'.repeat(prefix===1500?350:1500);
    const result=await select(database({threads:[thread('s')],messages:[message('s',1,{content}),message('s',2,{content})]}));
    for(const text of entries(JSON.parse(result.input).threads[0])){
      assert.ok(!text.includes('sk-ant-'));assert.ok(!text.includes('UNIQUESECRET'));
      assert.ok(Array.from(text).length<=1000);
      assert.ok(text.includes(AUTO_SUMMARY_TRUNCATION_MARKER));
      if(prefix!==990)assert.ok(text.includes('[redacted]'));
    }
  }
});

test('JSON increments and final budgets use masked content for both shrinking and growing replacements',()=>{
  const {maskAutoSummarySecrets}=require('../lib/project-memory/auto-summary-redact.ts');
  const t={thread_id:'s',title:maskAutoSummarySecrets('a@b.co'),messages:[],omitted:false,last_message_at:message('s',2).created_at};
  let length=buildAutoSummaryInput(['overview'],[t]).length;
  for(const [i,raw] of ['a@b.co','sk-ant-'+'a'.repeat(100),'"\\\n😀 person@example.com'].entries()){
    const m={...message('s',i,{content:maskAutoSummarySecrets(raw)}),cut:false};
    length+=autoSummaryMessageIncrement(t,m,i>0,i>0?1:0);t.messages.push(m);
    assert.equal(length,buildAutoSummaryInput(['overview'],[t]).length);
  }
  const result=finalizeAutoSummaryInput(['overview'],[t],1,1);
  assert.equal(result.stats.input_chars,length);assert.equal(Object.keys(result.stats).length,9);
  assert.equal(result.stats.user_messages_included,3);assert.equal(result.stats.user_messages_available,3);
});

test('pure JST date conversion covers midnight, offsets, month and year boundaries', () => {
  for (const [timestamp, expected] of [
    ['2026-10-05T14:59:59.999Z','2026-10-05'],
    ['2026-10-05T15:00:00.000Z','2026-10-06'],
    ['2026-10-05T15:30:00Z','2026-10-06'],
    ['2026-10-05T23:59:59+09:00','2026-10-05'],
    ['2026-10-06T00:00:00+09:00','2026-10-06'],
    ['2026-01-31T15:00:00Z','2026-02-01'],
    ['2026-12-31T14:59:59Z','2026-12-31'],
    ['2026-12-31T15:00:00Z','2027-01-01'],
  ]) assert.equal(autoSummaryJstDate(timestamp),expected,timestamp);
});

test('compact days group independently per thread and sort dates and timestamps with display-order ties', () => {
  const row = (n, created_at, content, extra={}) => ({...message('a',n,{created_at,content,...extra}),cut:false});
  const threads = [
    {thread_id:'a',title:'A',last_message_at:'2026-10-06T16:00:00Z',messages:[
      row(4,'2026-10-06T16:00:00Z','next'),row(3,'2026-10-05T16:00:00Z','tie-last'),
      row(1,'2026-10-05T14:59:59Z','previous'),row(2,'2026-10-05T16:00:00Z','tie-first'),
      row(6,'2026-10-05T16:00:00Z','ASSISTANT SECRET',{role:'assistant'}),
      row(5,'2026-10-05T15:30:00Z','early'),
    ],omitted:false},
    {thread_id:'b',title:'B',last_message_at:'2026-10-05T15:30:00Z',messages:[row(1,'2026-10-05T15:30:00Z','other')],omitted:false},
  ];
  const input=buildAutoSummaryInput(['overview'],threads);
  assert.ok(!input.includes('created_at'));assert.ok(!input.includes('last_message_at'));
  const byId=Object.fromEntries(JSON.parse(input).threads.map(t=>[t.thread_id,t]));
  assert.deepEqual(byId.a,{thread_id:'a',title:'A',days:[
    {d:'2026-10-05',m:['previous']},
    {d:'2026-10-06',m:['early','tie-first','tie-last']},
    {d:'2026-10-07',m:['next']},
  ]});
  assert.deepEqual(byId.b.days,[{d:'2026-10-06',m:['other']}]);
  assert.ok(!input.includes('ASSISTANT SECRET'));
});

test('final serialization budget accepts exactly 60000 and trims one character over, recomputing stats', () => {
  const fixture=()=>[{thread_id:'t',title:'T',last_message_at:message('t',2).created_at,omitted:false,messages:[
    {...message('t',1,{content:'old'}),cut:true}, {...message('t',2,{content:''}),cut:false},
  ]}];
  for (const excess of [0,1]) {
    const threads=fixture();
    threads[0].messages[1].content='x'.repeat(60000-buildAutoSummaryInput(['overview'],threads).length+excess);
    assert.equal(buildAutoSummaryInput(['overview'],threads).length,60000+excess);
    const result=finalizeAutoSummaryInput(['overview'],threads,3,2);
    assert.ok(result.input.length<=60000);
    assert.equal(result.stats.input_chars,result.input.length);
    assert.equal(result.stats.threads_total,3);assert.equal(result.stats.threads_eligible,2);
    assert.equal(result.stats.threads_included,1);
    assert.equal(result.stats.threads_truncated,1);
    assert.equal(result.stats.messages_truncated,excess?0:1);
    assert.equal(result.considered_threads[0].included_message_count,excess?1:2);
    assert.equal(result.stats.user_messages_included,excess?1:2);
    assert.equal(result.stats.user_messages_available,2);
    if (!excess) assert.equal(result.input.length,60000);
  }
});

const includedThread = (id, title=id) => ({thread_id:id,title,last_message_at:message(id,1).created_at,messages:[],omitted:false});
const skeleton = (keys, threads) => JSON.stringify({requested_topics:JSON.parse(buildAutoSummaryInput(keys,[])).requested_topics,
  threads:threads.map(({thread_id,title})=>({thread_id,title,days:[]}))}).length;

test('N reserves serialized skeleton plus 1500 per thread, including exact and one-over boundaries', () => {
  assert.equal(MIN_THREAD_MESSAGE_BUDGET,1500);assert.equal(MAX_AUTO_SUMMARY_THREADS,100);
  const keys=['overview'];
  const candidates=Array.from({length:100},(_,n)=>includedThread(String(n),'😀'.repeat(80)));
  const selected=selectAutoSummaryThreads(keys,candidates);
  assert.ok(skeleton(keys,selected)+selected.length*1500<=60000);
  assert.ok(skeleton(keys,candidates.slice(0,selected.length+1))+(selected.length+1)*1500>60000);
  assert.ok(selected.length<Math.floor(60000/1500));
  assert.deepEqual(selected,candidates.slice(0,selected.length));
  // A long ID lets the real production budget land on either side of the boundary.
  for (const excess of [0,1]) {
    const fixture=[includedThread('a'),includedThread('b'),includedThread('c')];
    fixture[1].thread_id+='x'.repeat(60000-skeleton(keys,fixture.slice(0,2))-2*1500+excess);
    assert.equal(skeleton(keys,fixture.slice(0,2))+2*1500,60000+excess);
    assert.equal(selectAutoSummaryThreads(keys,fixture).length,excess?1:2);
  }
  assert.ok(selectAutoSummaryThreads([],Array.from({length:200},(_,n)=>includedThread(String(n)))).length<=100);
});

test('message cap counts code points and keeps both ends with marker included at 1001', async () => {
  assert.equal(MAX_AUTO_SUMMARY_MESSAGE_CHARS,1000);
  for (const content of ['x'.repeat(1000),'😀'.repeat(1000),'a'.repeat(999)+'😀']) {
    assert.deepEqual(truncateAutoSummaryMessage(content),{content,cut:false});
  }
  const content='😀'.repeat(600)+'界'.repeat(400)+'🚀';
  const cut=truncateAutoSummaryMessage(content);
  assert.equal(cut.cut,true);assert.equal(Array.from(cut.content).length,1000);
  assert.ok(cut.content.startsWith('😀'));assert.ok(cut.content.endsWith('🚀'));
  assert.equal(cut.content.split(AUTO_SUMMARY_TRUNCATION_MARKER).length,2);
  const [head,tail]=cut.content.split(AUTO_SUMMARY_TRUNCATION_MARKER);
  assert.ok(content.startsWith(head));assert.ok(content.endsWith(tail));
  assert.ok(Array.from(head).length>Array.from(tail).length);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(cut.content));
  const result=await select(database({threads:[{...thread('t'),title:'😀'.repeat(81)}],messages:[
    message('t',1,{content:'😀'.repeat(1000)}),message('t',2,{content}),
  ]}));
  assert.equal(JSON.parse(result.input).threads[0].title,'😀'.repeat(80));
  assert.equal(result.stats.messages_truncated,1);assert.equal(result.stats.threads_truncated,1);
});

test('incremental cost equals actual JSON length for wrappers, day transitions, escaping and emoji', () => {
  const threads=[includedThread('a"\\','title\n😀'),includedThread('b')];
  let length=buildAutoSummaryInput(['overview'],threads).length;
  let populated=0;
  const days=threads.map(()=>new Set());
  for (const [i,n,content,created_at] of [
    [0,1,'```\n"\\\u0000😀\n```','2026-10-05T15:00:00Z'],
    [1,1,'other','2026-10-05T15:30:00Z'],
    [0,2,'same day','2026-10-05T16:00:00Z'],
    [0,3,'older day','2026-10-05T14:00:00Z'],
    [1,2,'','2026-10-05T15:30:00Z'],
    [1,3,'😀'.repeat(1000),'2026-10-06T15:00:00Z'],
  ]) {
    const row={...message(threads[i].thread_id,n,{content,created_at}),cut:false};
    const day=autoSummaryJstDate(created_at);
    length+=autoSummaryMessageIncrement(threads[i],row,days[i].has(day),populated);
    if (!threads[i].messages.length) populated++;
    threads[i].messages.push(row);days[i].add(day);
    assert.equal(length,buildAutoSummaryInput(['overview'],threads).length);
  }
});

test('waterfill chooses minimum character total and newest thread for ties, skipping completed states', () => {
  const states=[{name:'newest',chars:0,done:false},{name:'older',chars:0,done:false},{name:'oldest',chars:0,done:false}];
  const order=[];
  for (const cost of [1000,100,200,50,900]) {
    const next=nextAutoSummaryWaterfillThread(states);order.push(next.name);next.chars+=cost;
  }
  assert.deepEqual(order,['newest','older','oldest','older','older']);
  states[1].done=true;assert.equal(nextAutoSummaryWaterfillThread(states),states[2]);
  states.forEach(s=>s.done=true);assert.equal(nextAutoSummaryWaterfillThread(states),undefined);
});

test('assistant rows never enter input, user preflight/latest/body share all predicates', async () => {
  const messages=[message('a',1,{content:'first'}),message('a',2,{content:'second'}),
    message('a',999,{role:'assistant',content:'ASSISTANT SECRET'}),
    message('b',3,{content:'other first'}),message('b',4,{content:'other second'})];
  const db=database({threads:[thread('a'),thread('b')],messages});
  const result=await select(db);const input=JSON.parse(result.input);
  assert.deepEqual(input.threads.map(t=>t.thread_id),['a','b']);
  assert.deepEqual(input.threads.map(entries),[['first','second'],['other first','other second']]);
  assert.ok(!result.input.includes('ASSISTANT SECRET'));
  assert.ok(input.threads.every(t=>entries(t).every(m=>typeof m==='string')));
  assert.ok(!JSON.stringify(input.threads).includes('"role"'));
  assert.ok(!JSON.stringify(input.threads).includes('"user"'));
  assert.equal(result.considered_threads[0].last_message_at,message('a',2).created_at);
  assert.equal(result.stats.user_messages_included,4);assert.equal(result.stats.user_messages_available,4);
  for (const head of db.calls.filter(c=>c.head)) {
    assert.equal(head.count,'exact');assert.equal(head.select,'id');
    const id=head.filters.find(([op,key])=>op==='eq' && key==='thread_id')[2];
    const body=db.calls.find(c=>c.table==='messages' && c.range && c.filters.some(([op,key,value])=>op==='eq' && key==='thread_id' && value===id));
    assert.deepEqual(head.filters,body.filters);
    assert.deepEqual(head.filters,[['eq','thread_id',id],['eq','user_id','u'],['in','role',['user','assistant']],
      ['neq','provider','memo'],['neq','provider','image_gen'],['or','is_active.is.null,is_active.eq.true'],['eq','role','user']]);
  }
  for (const call of db.calls.filter(c=>c.table==='messages')) {
    assert.ok(call.filters.some(([op,key,value])=>op==='eq' && key==='role' && value==='user'));
    assert.ok(call.filters.some(([op,key])=>op==='eq' && key==='user_id'));
    assert.ok(call.filters.some(([op,key])=>op==='eq' && key==='thread_id'));
    if (call.range) assert.deepEqual(call.orders,[['created_at',false],['id',false]]);
  }
});

test('thousands of long messages cannot starve adopted short threads; pages stay lazy and newest intervals contiguous', async () => {
  const threads=[thread('huge'),...Array.from({length:25},(_,n)=>thread(`short-${n}`))];
  const messages=Array.from({length:3000},(_,n)=>message('huge',10000+n,{content:`${n}:`+'x'.repeat(2000)}));
  for (const t of threads.slice(1)) messages.push(message(t.id,1,{content:'one'}),message(t.id,2,{content:'two'}));
  const db=database({threads,messages});const result=await select(db);
  assert.equal(result.stats.threads_included,26);assert.ok(result.input.length<=60000);
  const huge=result.considered_threads.find(t=>t.thread_id==='huge');
  assert.ok(huge.included_message_count>1);assert.ok(huge.included_message_count<100);
  assert.equal(huge.oldest_included_message_id,message('huge',13000-huge.included_message_count).id);
  assert.equal(huge.newest_included_message_id,message('huge',12999).id);assert.equal(huge.truncated,true);
  assert.equal(result.stats.messages_truncated,huge.included_message_count);
  assert.equal(result.stats.user_messages_included,huge.included_message_count+50);
  assert.equal(result.stats.user_messages_available,3050);
  for (const t of result.considered_threads.filter(t=>t.thread_id!=='huge')) {
    assert.equal(t.included_message_count,2);assert.equal(t.truncated,false);
  }
  const pages=db.calls.filter(c=>c.table==='messages' && c.range);
  assert.equal(pages.length,26);assert.ok(pages.every(c=>c.range[0]===0));
  assert.equal(db.calls.filter(c=>c.head).length,26);
});

test('actual selection accepts exact budget and rejects one-over only for that thread, continuing other threads', async () => {
  for (const excess of [0,1]) {
    const a=Array.from({length:100},(_,n)=>message('a',1000+n,{content:'x'.repeat(1000)}));
    const b=Array.from({length:100},(_,n)=>message('b',n,{content:'x'.repeat(1000)}));
    // Before the next B row, A has 30 messages and B has 29 (newest wins ties).
    const fixture=[{...includedThread('a'),last_message_at:a.at(-1).created_at,messages:a.slice(70).map(m=>({...m,cut:false}))},
      {...includedThread('b'),last_message_at:b.at(-1).created_at,messages:b.slice(71).map(m=>({...m,cut:false}))}];
    const remaining=60000-buildAutoSummaryInput(['overview'],fixture).length;
    assert.ok(remaining>20 && remaining<=1000);
    b[70].content='z'.repeat(remaining-3+excess);
    fixture[1].messages.push({...b[70],cut:false});
    assert.equal(buildAutoSummaryInput(['overview'],fixture).length,60000+excess);
    a[69].content='continue';
    const result=await select(database({threads:[thread('a'),thread('b')],messages:[...a,...b]}));
    const byId=Object.fromEntries(JSON.parse(result.input).threads.map(t=>[t.thread_id,entries(t)]));
    assert.equal(byId.a.length,excess?31:30);
    assert.equal(byId.b.length,excess?29:30);
    assert.equal(byId.a.includes('continue'),!!excess);
    assert.equal(byId.b.includes(b[70].content),!excess);
    assert.ok(result.considered_threads.every(t=>t.truncated));
    assert.ok(result.input.length<=60000);assert.equal(result.stats.input_chars,result.input.length);
    if (!excess) assert.equal(result.input.length,60000);
  }
});

test('empty messages, giant messages and exactly full pages all terminate without skipping rows', async () => {
  for (const messages of [
    [message('t',1,{content:'old'}),message('t',2,{content:'😀'.repeat(100000)})],
    Array.from({length:100},(_,n)=>message('t',n)),
    Array.from({length:230},(_,n)=>message('t',n,{created_at:message('t',1).created_at})),
  ]) {
    const db=database({threads:[thread('t')],messages});const result=await select(db);
    assert.equal(result.considered_threads[0].included_message_count,messages.length);
    assert.equal(result.stats.messages_truncated,messages.length===2?1:0);
    assert.equal(db.calls.filter(c=>c.table==='messages' && c.range).length,Math.floor(messages.length/100)+1);
    assert.ok(result.input.length<=60000);
    if (messages.length===230) {
      assert.equal(result.considered_threads[0].oldest_included_message_id,message('t',0).id);
      assert.equal(result.considered_threads[0].newest_included_message_id,message('t',229).id);
    }
  }
});

test('three-valued roleplay and active predicates, providers, ownership and user preflight', async () => {
  const tables = { threads: [thread('false'),thread('null',null),thread('true',true),thread('one'),thread('filtered')], messages: [] };
  for (const id of ['false','null','true']) tables.messages.push(message(id,1,{is_active:null}),message(id,2));
  tables.messages.push(message('one',1));
  for (const extra of [{is_active:false},{provider:'memo'},{provider:'image_gen'},{role:'system'},{user_id:'other'}]) tables.messages.push(message('filtered',3,extra));
  const result = await select(database(tables));
  assert.equal(result.stats.threads_total,4); assert.equal(result.stats.threads_eligible,2);
  assert.deepEqual(new Set(result.considered_threads.map(t=>t.thread_id)),new Set(['false','null']));
  assert.equal(entries(JSON.parse(result.input).threads[0]).length,2);
});
test('paginates more than 1000 threads and prioritizes actual latest message rather than updated_at', async () => {
  const threads = Array.from({length:1101},(_,i)=>thread(String(i).padStart(4,'0')));
  const messages = threads.flatMap((t,i)=>[message(t.id,i*2),message(t.id,i*2+1)]);
  const db = database({threads,messages}); const result = await select(db);
  assert.equal(result.stats.threads_total,1101); assert.equal(result.stats.threads_eligible,1101);
  const candidates=[...threads].reverse().map((t,i)=>({...includedThread(t.id),last_message_at:messages[messages.length-1-i*2].created_at}));
  const count=selectAutoSummaryThreads(['overview'],candidates).length;
  assert.equal(result.stats.threads_included,count);
  assert.equal(result.considered_threads.at(-1).thread_id,'1100');
  assert.equal(result.considered_threads[0].thread_id,String(1101-count).padStart(4,'0'));
  assert.equal(db.calls.filter(c=>c.table==='threads').length,3);
  const headIds=db.calls.filter(c=>c.head).map(c=>c.filters.find(([op,key])=>op==='eq' && key==='thread_id')[2]);
  assert.deepEqual(new Set(headIds),new Set(result.considered_threads.map(t=>t.thread_id)));
  assert.equal(headIds.length,count);
  assert.equal(result.stats.user_messages_available,count*2);
  assert.equal(result.stats.user_messages_included,count*2);
});
test('pages over 1000 messages, fetches newest first and restores shared display order', async () => {
  const messages = Array.from({length:1200},(_,n)=>message('t',n,{content:String(n)}));
  const db = database({threads:[thread('t')],messages});
  const result = await select(db); const input = JSON.parse(result.input);
  assert.ok(db.calls.filter(c=>c.range && c.table==='messages').length>1);
  assert.equal(entries(input.threads[0]).at(-1),'1199');
  assert.equal(db.calls.filter(c=>c.range && c.table==='messages').length,13);
  assert.ok(result.stats.input_chars<=60000);
  // Equal timestamps retain the shared display comparator's ordering.
  const short = messages.map((m,n)=>({...m,created_at:message('t',0).created_at,message_number:1200-n}));
  const full = await select(database({threads:[thread('t')],messages:short}));
  assert.ok(full.considered_threads[0].included_message_count>1000);
  assert.ok(full.considered_threads[0].newest_included_message_id < full.considered_threads[0].oldest_included_message_id);
});
test('cut marker, escaping budget and no skipping an oversized next message', async () => {
  const messages = Array.from({length:100},(_,n)=>message('t',n,{content:'"\\\n'.repeat(3000)}));
  messages[0].content='old-small';
  const result = await select(database({threads:[thread('t')],messages}));
  const list = entries(JSON.parse(result.input).threads[0]);
  assert.ok(result.stats.input_chars<=MAX_AUTO_SUMMARY_INPUT_CHARS);
  assert.ok(list.every(m=>Array.from(m).length===1000));
  assert.ok(list.every(m=>m.includes(AUTO_SUMMARY_TRUNCATION_MARKER)));
  assert.equal(result.stats.messages_truncated,list.length); assert.equal(result.stats.threads_truncated,1);
  assert.ok(!list.includes('old-small'));
  const count=result.considered_threads[0].included_message_count;
  assert.equal(result.considered_threads[0].oldest_included_message_id,message('t',100-count).id);
});
test('input uses creation time while provenance retains display order; complete threads not truncated', async () => {
  const result=await select(database({threads:[thread('t')],messages:[message('t',1,{message_number:3,content:'first'}),message('t',2,{message_number:1,content:'second'}),message('t',3,{message_number:null,content:'third'})]}));
  const list=entries(JSON.parse(result.input).threads[0]);
  assert.deepEqual(list,['first','second','third']);
  assert.equal(result.considered_threads[0].oldest_included_message_id,message('t',2).id);
  assert.equal(result.stats.threads_truncated,0);
});
test('final trim removes empty threads and recomputes canonical counts and cut flags', () => {
  const threads=[{thread_id:'old',title:'old',last_message_at:message('old',1).created_at,omitted:false,messages:[{...message('old',1,{content:'x'.repeat(60000)}),cut:true}]},
    {thread_id:'new',title:'new',last_message_at:message('new',2).created_at,omitted:false,messages:[{...message('new',2),cut:false}]}];
  const result=finalizeAutoSummaryInput(['overview'],threads,2,2);
  assert.equal(result.stats.threads_included,1); assert.equal(result.stats.messages_truncated,0);
  assert.equal(result.stats.threads_truncated,0); assert.equal(result.considered_threads[0].thread_id,'new');
  assert.equal(result.stats.user_messages_included,1);assert.equal(result.stats.user_messages_available,1);
});

test('finalize coverage retains pre-trim fallback, clamps deleted counts, and excludes removed/unused threads', () => {
  const fixture=()=>[
    {...includedThread('t'),messages:[{...message('t',1,{content:'x'.repeat(60000)}),cut:true},{...message('t',2),cut:false}]},
    {...includedThread('empty')},
  ];
  for (const counts of [undefined,new Map(),new Map([['t',0],['empty',999]]),new Map([['t',3000],['empty',999]])]) {
    const result=finalizeAutoSummaryInput(['overview'],fixture(),2,2,counts);
    assert.equal(result.stats.user_messages_included,1);
    assert.equal(result.stats.user_messages_available,counts?.has('t')?Math.max(counts.get('t'),1):2);
    assert.equal(result.considered_threads[0].included_message_count,1);
    assert.equal(result.stats.messages_truncated,0);assert.equal(result.stats.threads_truncated,1);
  }
  const threads=fixture();threads[0].messages.pop();
  const empty=finalizeAutoSummaryInput(['overview'],threads,2,2,new Map([['t',3000],['empty',999]]));
  assert.equal(empty.stats.user_messages_included,0);assert.equal(empty.stats.user_messages_available,0);
});

test('head query model counts filtered rows ignoring range/limit and coverage uses the same predicates', async () => {
  const messages=[message('t',1,{is_active:null}),message('t',2),
    ...[{role:'assistant'},{role:'system'},{provider:'memo'},{provider:'image_gen'},{provider:null},{is_active:false},{user_id:'other'}].map((extra,n)=>message('t',3+n,extra))];
  const db=database({threads:[thread('t')],messages});
  const result=await select(db);
  assert.equal(result.stats.user_messages_available,2);assert.equal(result.stats.user_messages_included,2);
  const head=await db.from('messages').select('id',{head:true,count:'exact'}).eq('thread_id','t').eq('role','user').limit(1).range(0,0);
  assert.equal(head.data,null);assert.equal(head.count,7);assert.equal(head.error,null);
});

test('head-only errors or invalid counts throw AutoSummaryDbError; deleted counts stay at least included', async () => {
  const tables={threads:[thread('t')],messages:[message('t',1),message('t',2)]};
  for (const headResult of [{error:{code:'HEAD_ERROR'}},...[null,undefined,-1,0.5,Number.MAX_SAFE_INTEGER+1,NaN,Infinity,'2'].map(count=>({count}))]) {
    await assert.rejects(select(database(tables,undefined,headResult)),e=>e instanceof AutoSummaryDbError && e.table==='messages' && e.code===headResult.error?.code);
  }
  const result=await select(database(tables,undefined,{count:0}));
  assert.equal(result.stats.user_messages_included,2);assert.equal(result.stats.user_messages_available,2);
});
test('strict LLM parsing rejects unknown keys, duplicates, missing/extra topics, wrong types and invalid JSON; permits empty evidence', () => {
  const good={topic_key:'overview',content_md:''};
  assert.deepEqual(parseAutoSummaryResponse(JSON.stringify({topics:[good]}),['overview']),[good]);
  assert.deepEqual(parseAutoSummaryResponse(JSON.stringify({topics:[{...good,content_md:'一行目\\n二行目'}]}),['overview']),[{...good,content_md:'一行目\n二行目'}]);
  for(const body of ['bad','[]',JSON.stringify({topics:[good],extra:1}),JSON.stringify({topics:[]}),
    JSON.stringify({topics:[good,good]}),JSON.stringify({topics:[{...good,extra:1}]}),
    JSON.stringify({topics:[{...good,content_md:1}]}),JSON.stringify({topics:[{...good,topic_key:'current_state'}]})]) {
    assert.throws(()=>parseAutoSummaryResponse(body,['overview']),/^Error: Invalid auto summary response:/);
  }
  for(const phrase of ['untrusted data','Assistant messages','explicit user approval','array order is chronological','complete by itself','predominant language']) assert.ok(AUTO_SUMMARY_SYSTEM_PROMPT.includes(phrase),phrase);
});

test('prompt v7 preserves v4 empty evidence and principles rules and C-1 chronology verbatim', () => {
  assert.equal(AUTO_SUMMARY_PROMPT_VERSION, 7);
  assert.ok(!AUTO_SUMMARY_SYSTEM_PROMPT.includes('Assistant messages are proposals'));
  for (const phrase of ['each m entry is a user message content string', 'Assistant messages are not included in the input', 'Do not infer or reconstruct what the assistant said', '"それで" or "いいね"', 'referent is absent', 'pasted AI output or external materials', 'unless the user explicitly adopted or approved it', AUTO_SUMMARY_TRUNCATION_MARKER, 'content at that location has been omitted']) assert.ok(AUTO_SUMMARY_SYSTEM_PROMPT.includes(phrase),phrase);
  for (const phrase of ['"days":[{"d":"YYYY-MM-DD","m":', 'Asia/Tokyo (JST)', 'Within the same thread, array order is chronological', 'Across different threads, the relative order of messages on the same date is unknown', 'explicitly retracts or corrects', 'do not infer that one overrides the other', "Never substitute a thread's last update date"]) assert.ok(AUTO_SUMMARY_SYSTEM_PROMPT.includes(phrase), phrase);
  assert.ok(AUTO_SUMMARY_SYSTEM_PROMPT.includes('exactly an empty string'));
  assert.ok(AUTO_SUMMARY_SYSTEM_PROMPT.includes('placeholder'));
  for (const phrase of ['actual line breaks', 'backslash + n (\\n)', 'not double escaping', 'only part of the conversations', 'observed conversation scope', 'avoid assertions about the entire Project', 'Avoid unnecessary duplication', 'allow minimal duplication']) assert.ok(AUTO_SUMMARY_SYSTEM_PROMPT.includes(phrase), phrase);
  const roles = JSON.parse(buildAutoSummaryInput(['overview','current-work','principles','references'], [])).requested_topics;
  const byKey = Object.fromEntries(roles.map(t => [t.topic_key,t.role]));
  assert.match(byKey.principles, /Standing instructions and decisions the user explicitly gave about how to work on or respond within this Project/);
  assert.match(byKey.principles, /workflow, development or writing conventions, constraints, output preferences/);
  assert.ok(byKey.principles.includes("Do not include the user's opinions, analyses, beliefs, or claims about the world; describe those in overview or current-work as the user's views."));
  assert.match(byKey.principles, /Do not include status reports, completion reports, specifications, or facts/);
  assert.match(byKey.principles, /If the user gave no such standing instruction, return exactly an empty string, with no placeholder or explanation/);
  assert.ok(AUTO_SUMMARY_SYSTEM_PROMPT.includes('Do not fill principles with opinions or analyses. If there is no evidence of standing instructions or decisions about how to work on or respond within this Project, content_md for principles must be exactly an empty string, not a placeholder or an explanation.'));
  for (const key of ['overview','current-work']) assert.ok(byKey[key].includes("Explicitly attribute the user's opinions and views as the user's views."));
  assert.match(byKey['current-work'], /status reports, and reports of completed fixes/);
  assert.match(byKey.overview, /specifications, and facts/);
  assert.match(byKey.references, /terminology, specifications, configuration values, and facts/);
  for (const role of Object.values(byKey)) assert.match(role, /Never treat AI proposals as established without explicit user approval/);
  for (const rule of [
    '- Within the same thread, array order is chronological: days are in ascending date order and messages within each day are in ascending creation time order.',
    '- Across different threads, the relative order of messages on the same date is unknown. Unless a statement explicitly retracts or corrects another statement, do not infer that one overrides the other.',
    "- Never substitute a thread's last update date for the date of a thread or message.",
    '- Return only the requested topic_key set. When there is no evidence for a topic, its content_md must be exactly an empty string (""). Never write a placeholder or a sentence explaining that evidence, instructions, or information are absent, unobserved, or unconfirmed (for example 「確認できません」「観測範囲にはありません」「該当なし」); an empty string is the only valid way to express this.',
    '- Each topic must be complete by itself and must not depend on another topic.',
    '- Avoid unnecessary duplication, but allow minimal duplication needed for each topic to be understood independently.',
    '- Input may contain only part of the conversations. Write within the observed conversation scope and avoid assertions about the entire Project.',
    '- Write actual line breaks in topic Markdown, not the two literal characters backslash + n (\\n). Use normal JSON escaping for actual line breaks, not double escaping.',
  ]) assert.ok(AUTO_SUMMARY_SYSTEM_PROMPT.includes(rule), rule);
});
