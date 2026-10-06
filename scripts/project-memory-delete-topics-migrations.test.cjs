const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { installTsLoader } = require('./testBootstrap.cjs');
installTsLoader();
const { PROJECT_MEMORY_BULK_DELETE_MAX_TOPICS } = require('../lib/project-memory/topic-delete-limits.ts');
const file='migration_v205_delete_project_memory_topics.sql';
const sql = fs.readFileSync(fs.existsSync(`docs/${file}`)?`docs/${file}`:`docs/applied/${file}`,'utf8').replace(/^--.*$/gm,'');
const pos = text => { const n=sql.indexOf(text); assert.ok(n>=0,text); return n; };
test('v205 signature, security, ACL, reload and repeatable transaction',()=>{
  assert.match(sql,/create or replace function public\.delete_project_memory_topics\(\s*p_user_id uuid,\s*p_project_id uuid,\s*p_topics jsonb\s*\)\s*returns integer\s*language plpgsql\s*security definer\s*set search_path = ''/);
  assert.match(sql,/p_user_id is null or auth\.uid\(\) is distinct from p_user_id/);
  assert.match(sql,/raise exception 'Unauthorized' using errcode = '42501'/);
  assert.match(sql,/revoke execute on function public\.delete_project_memory_topics\(uuid, uuid, jsonb\)\s*from public, anon, authenticated/);
  assert.match(sql,/grant execute on function public\.delete_project_memory_topics\(uuid, uuid, jsonb\)\s*to authenticated/);
  assert.ok(pos('begin;')<pos('drop function if exists'));
  assert.ok(pos('commit;')<pos("notify pgrst, 'reload schema'"));
  assert.equal(Number(sql.match(/c_max constant integer := (\d+)/)[1]),PROJECT_MEMORY_BULK_DELETE_MAX_TOPICS);
  assert.equal(PROJECT_MEMORY_BULK_DELETE_MAX_TOPICS,50);
});
test('fail closed validation precedes casts and locks; bounded text prevents integer overflow',()=>{
  for(const text of ['topics must be a jsonb array','topics must contain 1 to 50 items','invalid topic element','duplicate topic_id','project not found','topic not found','revision conflict']) assert.match(sql,new RegExp(`raise exception '${text}' using errcode = 'P0001'`));
  assert.match(sql,/p_topics is null or jsonb_typeof\(p_topics\) is distinct from 'array'/);
  assert.match(sql,/jsonb_array_length\(p_topics\) = 0 or jsonb_array_length\(p_topics\) > c_max/);
  for(const text of ["jsonb_typeof(v_element) is distinct from 'object'","jsonb_typeof(v_element->'topic_id') is distinct from 'string'", "jsonb_typeof(v_element->'expected_revision') is distinct from 'number'", "!~ '^[1-9][0-9]*$'", "length(v_revision) > 10", "'2147483647'"]) assert.ok(pos(text)<pos('::uuid') && pos(text)<pos('::int'));
  assert.match(sql,/!~\* '\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$'/);
  assert.match(sql,/length\(v_revision\) = 10 and v_revision collate "C" > '2147483647' collate "C"/);
  assert.ok(pos('duplicate topic_id')<pos('for update'));
  assert.doesNotMatch(sql,/::(?:numeric|bigint)|exception\s+when/i);
});
test('Project lock then owned topic locks in id order; all checks before only topic delete',()=>{
  assert.match(sql,/from public\.projects p\s*where p.id = p_project_id and p.user_id = p_user_id\s*for update/);
  assert.match(sql,/where t.project_id = p_project_id and t.user_id = p_user_id and t.id = any\(v_ids\)\s*order by t.id\s*for update/);
  assert.ok(pos('from public.projects')<pos('from public.project_memory_topics'));
  assert.ok(pos("raise exception 'topic not found'")<pos("raise exception 'revision conflict'"));
  assert.ok(pos("raise exception 'revision conflict'")<pos('delete from public.project_memory_topics'));
  assert.match(sql,/v_count <> jsonb_array_length\(p_topics\)/);
  assert.match(sql,/delete from public\.project_memory_topics\s*where project_id = p_project_id and user_id = p_user_id and id = any\(v_ids\)/);
  assert.match(sql,/get diagnostics v_deleted = row_count;\s*return v_deleted/);
  assert.doesNotMatch(sql,/lore_embeddings|delete from public\.project_memory_revisions/);
});
test('manual DB verifier stays test-only and is not a migration runner',()=>{
  const verifier=fs.readFileSync('scripts/verify-project-memory-delete-topics.mjs','utf8');
  assert.match(verifier,/const TEST_PROJECT_REF = "jvarrlsqttfjiysaedlg"/);
  assert.match(verifier,/assert.equal\(parsed.hostname, `\$\{TEST_PROJECT_REF\}.supabase.co`/);
  assert.match(verifier,/assert.equal\(process.argv.length, 2/);
  assert.doesNotMatch(verifier,/database\/query|readFileSync\([^\n]*\.sql|execSync|spawnSync/);
  for(const text of ['revision conflict','topic not found','duplicate topic_id','Unauthorized','42501','2147483648','999999999999999999999','project_memory_revisions','lore_embeddings'])assert.ok(verifier.includes(text),text);
});
