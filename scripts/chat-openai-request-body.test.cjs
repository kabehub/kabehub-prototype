const assert = require('node:assert/strict');
const { test } = require('node:test');
const { invoke } = require('./helpers/openai-chat-harness.cjs');
const golden = require('./fixtures/openai-chat-off-bodies.json');
assert.equal(golden.baseline, '0ff977007b783378adac422e73893f63bce73fe8');
assert.equal(golden.cases.length, 96);
assert.equal(new Set(golden.cases.map(item => item.name)).size, 96);
// Immutable pre-implementation capture. Never generate expectations from this worktree.
// D37: Pro images intentionally preserve the baseline image_url bug until its separate fix.
for (const fixture of golden.cases) test(`OpenAI OFF golden bytes: ${fixture.name}`, async () => {
  const result = await invoke([], { body: { ...fixture.body, webSearch: fixture.body.webSearch } });
  assert.equal(result.response.status, 200);
  assert.equal(result.upstream.length, 1);
  assert.equal(result.upstream[0].url, fixture.url);
  assert.deepEqual(Buffer.from(result.upstream[0].body), Buffer.from(fixture.rawBody));
  assert.equal(result.upstream[0].signal, result.signal);
});
