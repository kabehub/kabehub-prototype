const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installAliasResolver, installTsLoader } = require('./testBootstrap.cjs');
installAliasResolver(); installTsLoader();
const { database, thread, message } = require('./auto-summary-test-helpers.cjs');
const { selectAutoSummaryInput, finalizeAutoSummaryInput, parseAutoSummaryResponse, buildAutoSummaryInput, autoSummaryJstDate, AUTO_SUMMARY_SYSTEM_PROMPT, AUTO_SUMMARY_PROMPT_VERSION } = require('../lib/project-memory/auto-summary.ts');
const { MAX_AUTO_SUMMARY_INPUT_CHARS, AUTO_SUMMARY_TRUNCATION_MARKER } = require('../lib/project-memory/auto-summary-limits.ts');
const select = db => selectAutoSummaryInput(db, 'u','p',['overview']);
const entries = thread => thread.days.flatMap(day => day.m);

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
      row(1,'2026-10-05T14:59:59Z','previous'),row(2,'2026-10-05T16:00:00Z','tie-first',{role:'assistant'}),
      row(5,'2026-10-05T15:30:00Z','early'),
    ],omitted:false},
    {thread_id:'b',title:'B',last_message_at:'2026-10-05T15:30:00Z',messages:[row(1,'2026-10-05T15:30:00Z','other')],omitted:false},
  ];
  const input=buildAutoSummaryInput(['overview'],threads);
  assert.ok(!input.includes('created_at'));assert.ok(!input.includes('last_message_at'));
  const byId=Object.fromEntries(JSON.parse(input).threads.map(t=>[t.thread_id,t]));
  assert.deepEqual(byId.a,{thread_id:'a',title:'A',days:[
    {d:'2026-10-05',m:[['user','previous']]},
    {d:'2026-10-06',m:[['user','early'],['assistant','tie-first'],['user','tie-last']]},
    {d:'2026-10-07',m:[['user','next']]},
  ]});
  assert.deepEqual(byId.b.days,[{d:'2026-10-06',m:[['user','other']]}]);
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
    if (!excess) assert.equal(result.input.length,60000);
  }
});

test('same greedy input fits at least as many messages as the legacy JSON representation', async () => {
  const messages=Array.from({length:100},(_,n)=>message('t',n,{content:'x'.repeat(950)}));
  const legacyInput = rows => JSON.stringify({
    requested_topics:JSON.parse(buildAutoSummaryInput(['overview'],[])).requested_topics,
    threads:[{thread_id:'t',title:'t',last_message_at:messages.at(-1).created_at,
      messages:[...rows].reverse().map(({role,content,created_at})=>({role,content,created_at}))}],
  });
  const legacy=[];
  for (const m of [...messages].reverse()) {
    if (60000-(legacy.length?legacyInput(legacy).length:buildAutoSummaryInput(['overview'],[]).length)<500) break;
    if (legacyInput([...legacy,m]).length>60000) break;
    legacy.push(m);
  }
  const result=await select(database({threads:[thread('t')],messages}));
  assert.ok(result.considered_threads[0].included_message_count>=legacy.length);
  assert.ok(result.considered_threads[0].included_message_count>legacy.length);
  assert.ok(result.input.length<=60000);
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
  assert.equal(result.stats.threads_included,100);
  assert.equal(result.considered_threads.at(-1).thread_id,'1100');
  assert.equal(result.considered_threads[0].thread_id,'1001');
  assert.equal(db.calls.filter(c=>c.table==='threads').length,3);
});
test('pages over 1000 messages, fetches newest first and restores shared display order', async () => {
  const messages = Array.from({length:1200},(_,n)=>message('t',n,{content:String(n),role:n<2?'user':'assistant'}));
  const db = database({threads:[thread('t')],messages});
  const result = await select(db); const input = JSON.parse(result.input);
  assert.ok(db.calls.filter(c=>c.range && c.table==='messages').length>1);
  assert.deepEqual(entries(input.threads[0]).at(-1),['assistant','1199']);
  assert.ok(result.stats.input_chars<=60000);
  // Equal timestamps retain the shared display comparator's ordering.
  const short = messages.map((m,n)=>({...m,created_at:message('t',0).created_at,message_number:1200-n}));
  const full = await select(database({threads:[thread('t')],messages:short}));
  assert.ok(full.considered_threads[0].included_message_count>1000);
  assert.ok(full.considered_threads[0].newest_included_message_id < full.considered_threads[0].oldest_included_message_id);
});
test('cut marker, escaping budget and no skipping an oversized next message', async () => {
  const messages = Array.from({length:12},(_,n)=>message('t',n,{content:'"\\\n'.repeat(3000)}));
  messages[0].content='old-small';
  const result = await select(database({threads:[thread('t')],messages}));
  const list = entries(JSON.parse(result.input).threads[0]);
  assert.ok(result.stats.input_chars<=MAX_AUTO_SUMMARY_INPUT_CHARS);
  assert.ok(list.every(m=>m[1].length===8000+AUTO_SUMMARY_TRUNCATION_MARKER.length));
  assert.ok(list.every(m=>m[1].endsWith(AUTO_SUMMARY_TRUNCATION_MARKER)));
  assert.equal(result.stats.messages_truncated,list.length); assert.equal(result.stats.threads_truncated,1);
  assert.ok(!list.some(m=>m[1]==='old-small'));
});
test('input uses creation time while provenance retains display order; complete threads not truncated', async () => {
  const result=await select(database({threads:[thread('t')],messages:[message('t',1,{message_number:3,content:'first'}),message('t',2,{message_number:1,content:'second'}),message('t',3,{message_number:null,content:'third'})]}));
  const list=entries(JSON.parse(result.input).threads[0]);
  assert.deepEqual(list.map(m=>m[1]),['first','second','third']);
  assert.equal(result.considered_threads[0].oldest_included_message_id,message('t',2).id);
  assert.equal(result.stats.threads_truncated,0);
});
test('final trim removes empty threads and recomputes canonical counts and cut flags', () => {
  const threads=[{thread_id:'old',title:'old',last_message_at:message('old',1).created_at,omitted:false,messages:[{...message('old',1,{content:'x'.repeat(60000)}),cut:true}]},
    {thread_id:'new',title:'new',last_message_at:message('new',2).created_at,omitted:false,messages:[{...message('new',2),cut:false}]}];
  const result=finalizeAutoSummaryInput(['overview'],threads,2,2);
  assert.equal(result.stats.threads_included,1); assert.equal(result.stats.messages_truncated,0);
  assert.equal(result.stats.threads_truncated,0); assert.equal(result.considered_threads[0].thread_id,'new');
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
  for(const phrase of ['untrusted data','Assistant messages','explicitly approved','array order is chronological','complete by itself','predominant language']) assert.ok(AUTO_SUMMARY_SYSTEM_PROMPT.includes(phrase));
});

test('prompt v5 preserves v4 empty evidence and principles rules', () => {
  assert.equal(AUTO_SUMMARY_PROMPT_VERSION, 5);
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
    '- Assistant messages are proposals, reasoning, or generated content. Never record them alone as established Project facts or decisions. Prefer explicit user statements or content explicitly approved by the user.',
    '- Return only the requested topic_key set. When there is no evidence for a topic, its content_md must be exactly an empty string (""). Never write a placeholder or a sentence explaining that evidence, instructions, or information are absent, unobserved, or unconfirmed (for example 「確認できません」「観測範囲にはありません」「該当なし」); an empty string is the only valid way to express this.',
    '- Each topic must be complete by itself and must not depend on another topic.',
    '- Avoid unnecessary duplication, but allow minimal duplication needed for each topic to be understood independently.',
    '- Input may contain only part of the conversations. Write within the observed conversation scope and avoid assertions about the entire Project.',
    '- Write actual line breaks in topic Markdown, not the two literal characters backslash + n (\\n). Use normal JSON escaping for actual line breaks, not double escaping.',
  ]) assert.ok(AUTO_SUMMARY_SYSTEM_PROMPT.includes(rule), rule);
});
