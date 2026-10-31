const assert = require('node:assert/strict');
const { test } = require('node:test');
const { invoke, original } = require('./helpers/openai-chat-harness.cjs');
const f = require('./helpers/openai-responses-fixtures.cjs');
const { normalizeSources } = require('../packages/shared/src/webSearch.ts');
const { MODEL_REGISTRY } = require('../lib/modelRegistry.ts');
const sources = normalizeSources([f.annotation], 'openai');
const content = result => result.rows.filter(row => row.type === 'chunk').map(row => row.text).join('');
const snapshot = row => Object.fromEntries(Object.keys(original).map(key => [key, row[key]]));
const verifyOutput = result => {
  assert.equal(result.response.status, 200);
  if (result.json) return;
  assert.equal(result.kinds[0], 'meta'); assert.equal(result.kinds.at(-1), 'done');
  assert.ok(result.kinds.filter(k => k === 'searching').length <= 1);
  assert.ok(result.kinds.filter(k => k === 'citations').length <= 1);
  if (result.kinds.includes('citations')) assert.equal(result.kinds.at(-2), 'citations');
  assert.equal(result.upstream[0]?.signal, result.signal);
};

for (const model of MODEL_REGISTRY.filter(m => m.kind === 'text' && m.provider === 'openai' && !['gpt-4o', 'gpt-5.5-pro'].includes(m.id))) {
  test(`route search ON selects streaming Responses for ${model.id}`, async () => {
    const result = await invoke(f.answer(), { body: { modelId: model.id } });
    verifyOutput(result);
    assert.equal(result.upstream.length, 1); assert.equal(result.upstream[0].url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(result.upstream[0].body);
    assert.equal(body.stream, true); assert.equal(body.store, false); assert.equal(body.max_tool_calls, 3);
    assert.deepEqual(body.tools, [{ type: 'web_search' }]); assert.equal(Object.hasOwn(body, 'tool_choice'), false);
    assert.equal(Object.hasOwn(body, 'reasoning'), !!model.openai.reasoningEffort);
    if (model.openai.reasoningEffort) assert.deepEqual(body.reasoning, { effort: 'medium' });
    assert.deepEqual(result.saves[0].metadata, { sources });
  });
}
for (const [name, body, endpoint] of [
  ['omitted', { webSearch: undefined }, 'chat/completions'], ['false', { webSearch: false }, 'chat/completions'],
  ['string true', { webSearch: 'true' }, 'chat/completions'], ['4o ON', { modelId: 'gpt-4o' }, 'chat/completions'],
  ['Pro ON', { modelId: 'gpt-5.5-pro' }, 'responses'],
]) test(`route retains legacy endpoint/body fields: ${name}`, async () => {
  const result = await invoke([], { body }); verifyOutput(result);
  assert.equal(result.upstream[0].url, `https://api.openai.com/v1/${endpoint}`);
  const sent = JSON.parse(result.upstream[0].body);
  assert.equal(Object.hasOwn(sent, 'tools'), false);
  assert.equal(Object.hasOwn(sent, 'max_tool_calls'), false);
  if (name === 'Pro ON') assert.equal(Object.hasOwn(sent, 'stream'), false);
  assert.equal(result.kinds.includes('searching'), false); assert.equal(result.kinds.includes('citations'), false);
});
test('memo never invokes upstream and invalid OpenAI model is rejected', async () => {
  const memo = await invoke([], { body: { isMemo: true } }); assert.equal(memo.upstream.length, 0);
  const invalid = await invoke([], { body: { modelId: 'unknown' } }); assert.equal(invalid.response.status, 400); assert.equal(invalid.upstream.length, 0);
});

for (const [name, events, kinds, text] of [
  ['search then text', [f.search(), f.delta('answer'), f.added(), f.terminal()], ['meta', 'searching', 'chunk', 'citations', 'done'], 'answer'],
  ['no search', [f.delta('answer'), f.terminal('completed', undefined, { output: [] })], ['meta', 'chunk', 'done'], 'answer'],
  ['text then search', [f.delta('before'), f.search(), f.delta('after'), f.terminal()], ['meta', 'chunk', 'searching', 'chunk', 'citations', 'done'], 'beforeafter'],
]) test(`normal NDJSON ordering: ${name}`, async () => {
  const result = await invoke(events); verifyOutput(result); assert.deepEqual(result.kinds, kinds); assert.equal(content(result), text);
  assert.equal(result.saves[0].content, text); assert.ok(result.usage.every(u => u.status === 'completed'));
});
test('synthetic gpt-5.4 search with zero annotations emits searching but no citations or metadata', async () => {
  const result = await invoke([f.search(), f.delta(), f.terminal('completed', undefined, { output: f.output([]) })], { body: { modelId: 'gpt-5.4' } });
  verifyOutput(result); assert.deepEqual(result.kinds, ['meta', 'searching', 'chunk', 'done']);
  assert.equal(Object.hasOwn(result.saves[0], 'metadata'), false);
});
test('synthetic gpt-5.4 final output with seven annotations preserves all cited URLs', async () => {
  const annotations = Array.from({ length: 7 }, (_, i) => ({ ...f.annotation, url: `https://example.com/${i}?utm_source=openai` }));
  const result = await invoke([f.search(), f.delta(), f.terminal('completed', undefined, { output: f.output(annotations) })], { body: { modelId: 'gpt-5.4' } });
  assert.equal(result.saves[0].metadata.sources.items.length, 7); assert.equal(result.kinds.filter(k => k === 'citations').length, 1);
});
for (const temporary of [false, true]) for (const saveFails of [false, true]) test(`normal/REST/temporary sources and token exclusion: temporary=${temporary}, fallback=${saveFails}`, async () => {
  const result = await invoke(f.answer(), { saveFails, body: { isTemporary: temporary } }); verifyOutput(result);
  const saved = temporary ? result.json.assistantMessage : result.saves[0];
  assert.equal(saved.content, '回答 日本語'); assert.deepEqual(saved.metadata, { sources });
  assert.equal(JSON.stringify([saved, result.rest]).includes('kabe-ctl:'), false);
  if (temporary) { assert.equal(result.saves.length, 0); assert.equal(result.rest.length, 0); }
  else if (saveFails) { assert.equal(result.rest.length, 1); assert.deepEqual(result.rest[0].metadata, { sources }); assert.equal(result.rest[0].content, saved.content); }
});
for (const saveFails of [false, true]) test(`light success replaces only sources and search OFF removes old sources, fallback=${saveFails}`, async () => {
  const success = await invoke(f.answer(), { light: true, saveFails }); verifyOutput(success);
  assert.equal(success.saves[0].id, 'old-assistant'); assert.equal(success.saves[0].provider, 'openai');
  assert.deepEqual(success.saves[0].metadata, { copied_from_message_id: 'keep', sources });
  const off = await invoke([], { light: true, saveFails, body: { webSearch: false } });
  assert.deepEqual(off.saves[0].metadata, { copied_from_message_id: 'keep' });
  if (saveFails) assert.deepEqual(success.rest[0].metadata, success.saves[0].metadata);
});

const messages = {
  max_output_tokens: '出力の上限に達したため、回答が途中で終わりました。',
  content_filter: 'コンテンツフィルターにより、回答が途中で終わりました。',
  other: 'OpenAIの応答が完了しませんでした。',
};
for (const [reason, message] of Object.entries(messages)) for (const light of [false, true]) for (const saveFails of [false, true]) test(`incomplete persistence and fixed message: ${reason}, light=${light}, fallback=${saveFails}`, async () => {
  const result = await invoke([f.search(), f.delta('partial'), f.terminal('incomplete', reason)], { light, saveFails }); verifyOutput(result);
  assert.ok(content(result).includes(message)); assert.ok(result.usage.every(u => u.status === 'failed'));
  assert.ok(result.usage.every(u => u.inputTokens === 100 && u.cacheWriteInputTokens === 10));
  if (light) { assert.deepEqual(snapshot(result.saves[0]), original); assert.equal(result.kinds.includes('citations'), false); }
  else { assert.equal(result.saves[0].content, 'partial'); assert.deepEqual(result.saves[0].metadata, { sources }); assert.equal(result.kinds.at(-2), 'citations'); }
  if (saveFails) assert.deepEqual(snapshot(result.rest[0]), snapshot(result.saves[0]));
  assert.deepEqual(result.logs.filter(row => row[0] === 'externalApiFailed'), [['externalApiFailed', { service: 'openai', errorCode: 'UPSTREAM_STREAM_INCOMPLETE' }]]);
});
for (const [name, events, code] of [
  ['failed', [f.search(), f.delta('partial'), f.added(), f.terminal('failed')], 'UPSTREAM_STREAM_FAILED'],
  ['error', [f.search(), f.delta('partial'), f.added(), { type: 'error', error: { message: 'PRIVATE_ERROR' } }], 'UPSTREAM_STREAM_FAILED'],
  ['no terminal', [f.search(), f.delta('partial'), f.added()], 'UPSTREAM_STREAM_PROTOCOL'],
  ['duplicate completed', [f.search(), f.delta('partial'), f.terminal(), f.terminal()], 'UPSTREAM_STREAM_PROTOCOL'],
  ['late delta', [f.search(), f.delta('partial'), f.terminal(), f.delta('NEVER_SAVE')], 'UPSTREAM_STREAM_PROTOCOL'],
]) for (const light of [false, true]) test(`failed route preserves partial or restores light: ${name}, light=${light}`, async () => {
  const result = await invoke(events, { light }); verifyOutput(result);
  assert.ok(content(result).includes('OpenAIの応答が正常に完了しませんでした。'));
  assert.ok(result.usage.every(u => u.status === 'failed'));
  if (light) { assert.deepEqual(snapshot(result.saves[0]), original); assert.equal(result.kinds.includes('citations'), false); }
  else { assert.equal(result.saves[0].content, 'partial'); assert.deepEqual(result.saves[0].metadata, { sources }); }
  assert.deepEqual(result.logs.filter(row => row[0] === 'externalApiFailed'), [['externalApiFailed', { service: 'openai', errorCode: code }]]);
});
test('failed one-chunk response saves every delta, emits only client error text, preserves usage on REST fallback', async () => {
  const events = [f.search(), f.delta('a'), f.delta('b'), f.delta('c'), f.added(), f.terminal('failed')];
  const result = await invoke([], { saveFails: true, chunks: [Buffer.from(events.map(e => `data:${JSON.stringify(e)}\n`).join(''))] });
  verifyOutput(result); assert.equal(result.saves[0].content, 'abc'); assert.equal(result.rest[0].content, 'abc');
  assert.deepEqual(result.rest[0].metadata, { sources }); assert.ok(result.usage.every(u => u.inputTokens === 100));
});
for (const light of [false, true]) for (const saveFails of [false, true]) test(`abort retains sources or restores light without citations, light=${light}, fallback=${saveFails}`, async () => {
  const result = await invoke([f.search(), f.delta(), f.added()], { abort: true, light, saveFails }); verifyOutput(result);
  assert.equal(result.kinds.includes('citations'), false); assert.ok(result.usage.every(u => u.status === 'aborted'));
  assert.equal(result.logs.filter(row => row[0] === 'externalApiFailed').length, 0);
  if (light) assert.deepEqual(snapshot(result.saves[0]), original);
  else { assert.equal(result.saves[0].content, '回答 日本語'); assert.deepEqual(result.saves[0].metadata, { sources }); }
  if (saveFails) assert.deepEqual(snapshot(result.rest[0]), snapshot(result.saves[0]));
});
for (const terminal of ['failed', 'incomplete']) test(`temporary keeps existing error-replacement contract: ${terminal}`, async () => {
  const result = await invoke([f.search(), f.delta('PARTIAL_REPLACED'), f.terminal(terminal, 'max_output_tokens')], { body: { isTemporary: true } });
  assert.ok(result.json.assistantMessage.content.includes('エラー:'));
  assert.equal(result.json.assistantMessage.content.includes('PARTIAL_REPLACED'), false);
  assert.equal(Object.hasOwn(result.json.assistantMessage, 'metadata'), false);
  assert.equal(result.saves.length, 0); assert.equal(result.rest.length, 0);
});
test('HTTP 400 stays generic, logs metadata once, never discloses sensitive fields', async () => {
  const result = await invoke([], { httpStatus: 400 }); verifyOutput(result);
  assert.ok(content(result).includes('OpenAI APIへのリクエストに失敗しました'));
  assert.equal(content(result).includes('Web検索をオフ'), false);
  assert.deepEqual(result.logs.filter(row => row[0] === 'externalApiFailed'), [['externalApiFailed', { service: 'openai', status: 400, errorCode: 'UPSTREAM_API_ERROR' }]]);
});
test('protocol logs never include query, URLs, titles, citation text, API keys or upstream errors', async () => {
  const secretCitation = { ...f.annotation, title: 'PRIVATE_TITLE', cited_text: 'PRIVATE_CITATION', url: 'https://private.example/?PRIVATE_QUERY' };
  const result = await invoke([f.search(), f.delta(), f.added(secretCitation), { type: 'error', error: { message: 'PRIVATE_ERROR', type: 'PRIVATE_TYPE' } }], { body: { userContent: 'PRIVATE_PROMPT' } });
  const logs = JSON.stringify(result.logs);
  for (const secret of ['PRIVATE_', 'private.example', 'offline-key', 'kabe-ctl:']) assert.equal(logs.includes(secret), false);
  assert.equal(result.logs.filter(row => row[0] === 'externalApiFailed').length, 1);
});
