const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installAliasResolver, installTsLoader } = require('./testBootstrap.cjs');
installAliasResolver(); installTsLoader();
const { database, thread, message } = require('./auto-summary-test-helpers.cjs');
const { selectAutoSummaryInput, finalizeAutoSummaryInput, parseAutoSummaryResponse, buildAutoSummaryInput, AUTO_SUMMARY_SYSTEM_PROMPT, AUTO_SUMMARY_PROMPT_VERSION } = require('../lib/project-memory/auto-summary.ts');
const { MAX_AUTO_SUMMARY_INPUT_CHARS, AUTO_SUMMARY_TRUNCATION_MARKER } = require('../lib/project-memory/auto-summary-limits.ts');
const select = db => selectAutoSummaryInput(db, 'u','p',['overview']);

test('three-valued roleplay and active predicates, providers, ownership and user preflight', async () => {
  const tables = { threads: [thread('false'),thread('null',null),thread('true',true),thread('one'),thread('filtered')], messages: [] };
  for (const id of ['false','null','true']) tables.messages.push(message(id,1,{is_active:null}),message(id,2));
  tables.messages.push(message('one',1));
  for (const extra of [{is_active:false},{provider:'memo'},{provider:'image_gen'},{role:'system'},{user_id:'other'}]) tables.messages.push(message('filtered',3,extra));
  const result = await select(database(tables));
  assert.equal(result.stats.threads_total,4); assert.equal(result.stats.threads_eligible,2);
  assert.deepEqual(new Set(result.considered_threads.map(t=>t.thread_id)),new Set(['false','null']));
  assert.equal(JSON.parse(result.input).threads[0].messages.length,2);
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
  // Two recent users qualify; tiny metadata/messages allow >1000 rows into the budget only with shorter timestamps.
  const messages = Array.from({length:1200},(_,n)=>message('t',n,{created_at:String(n).padStart(4,'0'),role:n<2?'user':'assistant'}));
  const db = database({threads:[thread('t')],messages});
  const result = await select(db); const input = JSON.parse(result.input);
  assert.ok(db.calls.filter(c=>c.range && c.table==='messages').length>1);
  assert.equal(input.threads[0].messages.at(-1).created_at,'1199');
  assert.ok(result.stats.input_chars<=60000);
  // Separate boundary fixture with short role/content/date to fit over 1000 messages.
  const short = messages.map((m,n)=>({...m,created_at:'1',message_number:1200-n}));
  const full = await select(database({threads:[thread('t')],messages:short}));
  assert.ok(full.considered_threads[0].included_message_count>1000);
  assert.ok(full.considered_threads[0].newest_included_message_id < full.considered_threads[0].oldest_included_message_id);
});
test('cut marker, escaping budget and no skipping an oversized next message', async () => {
  const messages = Array.from({length:12},(_,n)=>message('t',n,{content:'"\\\n'.repeat(3000)}));
  messages[0].content='old-small';
  const result = await select(database({threads:[thread('t')],messages}));
  const list = JSON.parse(result.input).threads[0].messages;
  assert.ok(result.stats.input_chars<=MAX_AUTO_SUMMARY_INPUT_CHARS);
  assert.ok(list.every(m=>m.content.length===8000+AUTO_SUMMARY_TRUNCATION_MARKER.length));
  assert.ok(list.every(m=>m.content.endsWith(AUTO_SUMMARY_TRUNCATION_MARKER)));
  assert.equal(result.stats.messages_truncated,list.length); assert.equal(result.stats.threads_truncated,1);
  assert.ok(!list.some(m=>m.content==='old-small'));
});
test('display comparator handles message_number and fallback; created_at always sent; complete threads not truncated', async () => {
  const result=await select(database({threads:[thread('t')],messages:[message('t',1,{message_number:3}),message('t',2,{message_number:1}),message('t',3,{message_number:null})]}));
  const list=JSON.parse(result.input).threads[0].messages;
  assert.deepEqual(list.map(m=>m.created_at),[message('t',2).created_at,message('t',1).created_at,message('t',3).created_at]);
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
  for(const phrase of ['untrusted data','Assistant messages','explicitly approved','created_at','complete by itself','predominant language']) assert.ok(AUTO_SUMMARY_SYSTEM_PROMPT.includes(phrase));
});

test('prompt v2 states newline, partial input, independent topics and role boundaries', () => {
  assert.equal(AUTO_SUMMARY_PROMPT_VERSION, 2);
  for (const phrase of ['actual line breaks', 'backslash + n (\\n)', 'not double escaping', 'only part of the conversations', 'observed conversation scope', 'avoid assertions about the entire Project', 'Avoid unnecessary duplication', 'allow minimal duplication']) assert.ok(AUTO_SUMMARY_SYSTEM_PROMPT.includes(phrase), phrase);
  const roles = JSON.parse(buildAutoSummaryInput(['overview','current-work','principles','references'], [])).requested_topics;
  const byKey = Object.fromEntries(roles.map(t => [t.topic_key,t.role]));
  assert.match(byKey.principles, /Only enduring rules and policies explicitly stated by the user/);
  assert.match(byKey.principles, /Exclude status reports, completion reports, specifications, and facts/);
  assert.match(byKey['current-work'], /status reports, and reports of completed fixes/);
  assert.match(byKey.overview, /specifications, and facts/);
  assert.match(byKey.references, /terminology, specifications, configuration values, and facts/);
  for (const role of Object.values(byKey)) assert.match(role, /Never treat AI proposals as established without explicit user approval/);
});
