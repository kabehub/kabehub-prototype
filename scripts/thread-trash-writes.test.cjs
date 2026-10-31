const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function section(s,start,end){const a=s.indexOf(start);assert.ok(a>=0,start);const b=end?s.indexOf(end,a+start.length):s.length;assert.ok(b>=a,end);return s.slice(a,b);}
const route=(f,method)=>section(read(f),`export async function ${method}`,undefined);
function ordered(s,...terms){let at=-1;for(const term of terms){const next=s.indexOf(term,at+1);assert.ok(next>at,`missing/out-of-order ${term}`);at=next;}}
function ownsAndReads(s){assert.match(s,/\.select\(["'][^"']*deleted_at[^"']*["']\)/);assert.match(s,/\.eq\(["']user_id["'],\s*(?:userId|user\.id)\)/);assert.doesNotMatch(s,/\.is\(["']deleted_at["'],\s*null\)/);}
function preflight(s,id,effect){
  ordered(s,`getOwnedThreadTrashState(supabase, user.id, ${id})`,'if (writeThread?.deleted_at) return finalizeJson(...threadTrashResponse())',effect);
}
function actualResource(s,table,effect){
  assert.match(s,new RegExp(`from\\(${table}\\)[\\s\\S]*?\\.select\\("thread_id"\\)\\.eq\\("id", id\\)\\.eq\\("user_id", user.id\\)\\.maybeSingle\\(\\)`));
  preflight(s,'target.thread_id',effect);
  assert.doesNotMatch(s,/getOwnedThreadTrashState\(supabase, user\.id, params\.id\)/);
}

test('shared write preflight reads trash with owned id, never hides it as missing',()=>ownsAndReads(read('lib/threads/trash-errors.ts')));
for(const [file,id,effect] of [
  ['app/api/threads/[id]/messages/[messageId]/route.ts','params.id','.update(updates)'],
  ['app/api/messages/[id]/route.ts','target.thread_id','// 画像削除アクション'],
])test(`${file}: guard precedes message mutations/Storage`,()=>{
  const s=route(file,'PATCH');preflight(s,id,effect);
  if(id==='target.thread_id')assert.match(s,/\.select\("thread_id"\)\.eq\("id", params.id\)\.eq\("user_id", user.id\)/);
  assert.match(read(file),/if \(result\.trashed\) return finalizeJson\(\.\.\.threadTrashResponse\(\)\)/);
});
test('message delete helper resolves actual message parent before Lore archive, DB DELETE, Storage',()=>{
  const s=read('lib/messages/delete.ts');
  ordered(s,'.select("metadata, thread_id")','getOwnedThreadTrashState(supabase, userId, existing.thread_id)','if (parent?.deleted_at) return { ok: false, trashed: true }','let archiveQuery','let deleteQuery','await removeStoragePaths');
});
test('range DELETE reads owned deleted_at before reading/deleting messages and archiving Lore',()=>{
  const s=route('app/api/threads/[id]/messages/route.ts','DELETE');
  ownsAndReads(section(s,'const { data: thread','if (threadError)'));
  ordered(s,'if (thread.deleted_at) return finalizeJson(...threadTrashResponse())','data: targetMessages','.from("lore_embeddings")','.delete()');
});
test('resource POST and body-ID DELETE use their correct parent before mutation',()=>{
  const s=read('lib/threadResourceCrud.ts');
  const post=section(s,'async function POST','async function DELETE');preflight(post,'params.id','.insert(insertResult.payload)');
  ordered(post,'.insert(insertResult.payload)','if (writeThread && isThreadTrashedError(error)) return finalizeJson(...threadTrashResponse())');
  actualResource(section(s,'async function DELETE'),'config\\.table','.delete()');
  actualResource(route('app/api/threads/[id]/notes/route.ts','PATCH'),'"thread_notes"','.update({ content, updated_at:');
  for(const name of ['notes','message-notes','drafts'])assert.match(read(`app/api/threads/[id]/${name}/route.ts`),/export const DELETE = handlers\.DELETE/);
});
test('tags guard owned URL parent before POST duplicate query/INSERT and DELETE',()=>{
  const s=read('app/api/threads/[id]/tags/route.ts');
  preflight(section(s,'export async function POST','export async function DELETE'),'params.id','const { data: existing');
  preflight(section(s,'export async function DELETE'),'params.id','.delete()');
  assert.match(s,/if \(writeThread && isThreadTrashedError\(error\)\) return finalizeJson\(\.\.\.threadTrashResponse\(\)\)/);
});
test('PATCH threads uses bounded conditional UPDATE, checks errors before INSERT, and avoids empty UPDATE',()=>{
  const s=route('app/api/threads/[id]/route.ts','PATCH');
  assert.doesNotMatch(s,/\.upsert\(|\b(?:while|for)\s*\(/);
  assert.match(s,/if \(Object\.keys\(updates\)\.length === 0\) \{\s*return supabase\.from\("threads"\)\.select\("\*"\)/);
  assert.match(s,/\.update\(updates\)\.eq\("id", params.id\)\s*\.eq\("user_id", user.id\)\.is\("deleted_at", null\)\.select\(\)\.maybeSingle\(\)/);
  ordered(s,'const updated = await writeLive()','if (updated.error)','const existing = await getOwnedThreadTrashState','if (existing.error)','if (existing.data?.deleted_at)','const inserted = await');
  assert.equal((s.match(/return retryLiveOnce\(\)/g)??[]).length,2);
  const retry=section(s,'const retryLiveOnce =','const updated =');
  assert.equal((retry.match(/await writeLive\(\)/g)??[]).length,1);
  assert.doesNotMatch(retry,/retryLiveOnce\(|\.insert\(/);
  ordered(retry,'if (retry.error)','if (retry.data)','const check =','if (check.error)','if (check.data?.deleted_at)','status: 500');
  ordered(s,'inserted.error.code === "23505"','const raced = await getOwnedThreadTrashState','if (raced.error)','if (raced.data?.deleted_at)','if (raced.data) return retryLiveOnce()');
});
test('MCP POST reads deleted_at; timestamp UPDATE stays conditional; trigger maps to 409',()=>{
  const s=route('app/api/mcp/threads/[id]/messages/route.ts','POST');
  ownsAndReads(section(s,'const { data: thread','if (threadError)'));
  ordered(s,'if (!thread)','if (thread.deleted_at) return NextResponse.json(...threadTrashResponse())',".insert({ thread_id:");
  assert.match(s,/\.update\(\{ updated_at:[\s\S]*?\.is\("deleted_at", null\)/);
  assert.match(s,/isThreadTrashedError\(error\)/);
});
for(const file of ['app/api/image-gen/route.ts','app/api/extract-settings/route.ts'])test(`${file}: owned thread is read before external AI or Storage`,()=>{
  const s=route(file,'POST');
  ownsAndReads(section(s,'const { data: thread','if (threadError'));
  ordered(s,file.includes('image-gen')?'if (threadError || !thread)':'if (!thread)', 'if (thread.deleted_at) return finalizeJson(...threadTrashResponse())');
  if(file.includes('image-gen'))ordered(s,'if (thread.deleted_at)','let imageInput','.upload(');
  else ordered(s,'if (thread.deleted_at)','if (!provider)','await fetch(');
});
function arenaEnsure(s){
  assert.doesNotMatch(s,/\.is\(["']deleted_at["'],\s*null\)/);
  assert.equal((s.match(/\.select\("id, deleted_at"\)/g)??[]).length,2);
  ordered(s,'if (lookupError)','if (existingThread?.deleted_at)','if (existingThread) return','.insert(');
  ordered(s,'if (recheckError)','if (racedThread?.deleted_at)','if (racedThread) return');
}
test('arena handles initial + raced trash without INSERT; non-first preflight precedes intervention and callAI',()=>{
  const s=read('app/api/arena/route.ts');arenaEnsure(section(s,'async function ensureArenaThread','async function compensateCreatedArenaThread'));
  const turn=section(s,'let arenaThreadCreated =');
  ordered(turn,'} else {','getOwnedThreadTrashState(supabase, userId, threadId)','if (preflight.data?.deleted_at)','.insert({','await callAI(');
  const time=section(s,'if (body.mode === "timeTravel")','const {\n    threadId,');
  ordered(time,'getOwnedThreadTrashState(supabase, userId, threadId)','if (preflight.data?.deleted_at)','.delete()');
  assert.doesNotMatch(time,/\.insert\(/);
  const assistant=section(s,'if (assistantInsertError) {');
  assert.match(assistant,/return finalizeJson\(\{ message: assistantMessage, saved: false \}\)/);
  assert.doesNotMatch(assistant,/isThreadTrashedError|status: 409/);
  for(const variable of ['humanInsertError','interventionInsertError'])assert.match(s,new RegExp(`if \\(isThreadTrashedError\\(${variable}\\)\\) return finalizeJson\\(\\.\\.\\.threadTrashResponse\\(\\)\\)`));
});
for(const file of ['app/api/arena/route.ts','app/api/threads/[id]/copy/route.ts','app/api/threads/[id]/branch-to/route.ts','app/api/share/[token]/fork/route.ts'])test(`${file}: created-thread compensation DELETE is conditional, zero rows are not errors`,()=>{
  const s=section(read(file),'const { error: compensationError }', 'if (compensationError)');
  assert.match(s,/\.from\(["']threads["']\)\s*\.delete\(\)\s*\.is\("deleted_at", null\)/);
  assert.match(s,/\.eq\(["']id["'], (?:newThread\.id|threadId)\)/);
  assert.doesNotMatch(s,/\.single\(|\.select\(/);
});
for(const file of ['app/api/threads/[id]/messages/restore-branch/route.ts','app/api/chat/route.ts'])test(`${file}: exact RPC error rechecks owned trash; other P0001 remains 400`,()=>{
  const s=read(file);const name=file.includes('chat')?'rpcError':'error';
  const part=section(s,`if (${name}.code === "P0001" && ${name}.message === "thread not found")`);
  ordered(part,'getOwnedThreadTrashState(supabase,','if (recheck.error)','if (recheck.data?.deleted_at)');
  assert.match(part,/(?:status: 409|threadTrashResponse\(\))/);
  assert.match(s,/(?:rpcError\.code === "P0001" \? 400|if \(error.code === "P0001"\))/);
});
test('chat rejects trash before upsert/external generation; pre-stream user trigger failure maps, assistant persistence stays unchanged',()=>{
  const s=read('app/api/chat/route.ts');
  ordered(s,".select('project_id, user_id, deleted_at, roleplay_mode')",'if (thread?.deleted_at)','if (!thread) {','supabase.from("threads").upsert(');
  ordered(s,'if (confirmedThread.deleted_at)','thread = confirmedThread');
  assert.match(s,/if \(isThreadTrashedError\(insertError\)\)[\s\S]*?status: 409/);
  assert.doesNotMatch(section(s,'async function saveAssistantMessage','export async function POST'),/isThreadTrashedError|status: 409/);
});
test('batchTrain rechecks before persistence; skip bypasses learned flag',()=>{
  const s=section(read('lib/lore/batchTrain.ts'),'export async function runBatchTrain');
  ordered(s,'getOwnedThreadTrashState(supabase, userId, message.thread_id)','if (!parent.data || parent.data.deleted_at)','skippedCount: 1','continue;','await persistExtractedMemories','await markMessageLearnedBestEffort');
});
test('lore like owns both message and parent before trash, then role/duplicate/embedding',()=>{
  const s=read('app/api/lore/like/route.ts');
  assert.match(s,/\.select\("project_id, user_id, deleted_at"\)/);assert.doesNotMatch(s,/\.is\("deleted_at", null\)/);
  ordered(s,'if (msgError || !message)','if (!thread)','if (message.user_id !== user.id || thread.user_id !== user.id)','if (thread.deleted_at)','if (message.role !== "assistant")','const { data: existing','embedding = await createEmbedding');
});
test('purge is used only by trash DELETE and the expiry Cron; collects before conditional DELETE/RPC and Storage',()=>{
  const s=read('lib/threads/purge.ts');
  ordered(s,'for (let offset = 0; ;)','.order("id").range(offset, offset + pageSize - 1)','if (error) return fail','if (!data?.length) break','collectOwnedStoragePaths(data, userId)','offset += data.length','let deleted: boolean','if (!deleted) return','await removeStoragePaths');
  assert.match(s,/\.not\("deleted_at", "is", null\)\.select\("id"\)/);assert.match(s,/rpc\("purge_expired_thread", \{ p_thread_id: input.threadId \}\)/);assert.doesNotMatch(s,/recalc_fork_count|serviceRoleClient/);
  const allowed=new Set(['app/api/trash/threads/[id]/route.ts','app/api/cron/thread-trash-purge/route.ts']);
  const callers=[];
  function walk(dir){for(const item of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const f=`${dir}/${item.name}`;if(item.isDirectory())walk(f);else if(/\.tsx?$/.test(item.name)&&/threads\/purge|purgeThread\(/.test(read(f))){assert.ok(allowed.has(f),f);callers.push(f);}}}walk('app');
  assert.deepEqual(callers.sort(),[...allowed].sort());
});
test('negative fixtures detect absent guards, wrong URL parent and ensureArenaThread live filtering',()=>{
  const helper=section(read('lib/threadResourceCrud.ts'),'async function DELETE');
  actualResource(helper,'config\\.table','.delete()');
  assert.throws(()=>actualResource(helper.replaceAll('target.thread_id','params.id'),'config\\.table','.delete()'));
  assert.throws(()=>actualResource(helper.replace('if (writeThread?.deleted_at) return finalizeJson(...threadTrashResponse());',''),'config\\.table','.delete()'));
  const note=route('app/api/threads/[id]/notes/route.ts','PATCH');
  assert.throws(()=>actualResource(note.replaceAll('target.thread_id','params.id'),'"thread_notes"','.update({ content, updated_at:'));
  const ensure=section(read('app/api/arena/route.ts'),'async function ensureArenaThread','async function compensateCreatedArenaThread');
  assert.throws(()=>arenaEnsure(ensure.replace('.select("id, deleted_at")','.select("id, deleted_at").is("deleted_at", null)')));
  for(const q of ['"',"'"]) {const fixture=`db.from(${q}threads${q}).select(${q}id, deleted_at${q}).eq(${q}user_id${q}, userId)`;ownsAndReads(fixture);assert.throws(()=>ownsAndReads(fixture.replace('id, deleted_at','id')));}
});
test('image INSERT race changes only status; existing DB error body and Storage handling remain',()=>{
  const s=section(read('app/api/image-gen/route.ts'),'if (dbError) {');
  assert.match(s,/DB保存失敗: \$\{dbError.message\}/);
  assert.match(s,/status: isThreadTrashedError\(dbError\) \? 409 : 500/);
});
// Exempt routes, not files: historical records and generated responses keep
// their existing persistence contracts even when trash changes concurrently.
const exemptions=[
  ['POST /api/arena assistant INSERT failure','AI result already exists; preserve HTTP 200 saved:false'],
  ['POST /api/chat saveAssistantMessage during streaming','Preserve saved/logging behavior after stream starts; Phase 3'],
  ['POST/DELETE /api/threads/[id]/likes; POST /api/reports','Engagement/moderation records intentionally excluded in v207'],
  ['ai_usage_events; independent Lore/Project Memory edits','Audit history and independent memory, not raw-thread content writes'],
  ['DELETE /api/threads/[id]','Existing physical-delete route is explicitly reserved for Phase 3'],
];
test('exemptions name exact purpose and reason',()=>{for(const [route,reason] of exemptions)assert.ok(route&&reason);});
