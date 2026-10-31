const assert = require('node:assert/strict');
const { test } = require('node:test');
const { invoke } = require('./helpers/openai-chat-harness.cjs');
const golden = require('./fixtures/openai-chat-off-bodies.json');
assert.equal(golden.baseline, '0ff977007b783378adac422e73893f63bce73fe8');
assert.equal(golden.cases.length, 96);
assert.equal(new Set(golden.cases.map(item => item.name)).size, 96);
// Immutable pre-implementation capture. Never generate expectations from this worktree.
// D37: Pro images now use Responses parts; the golden remains the buggy D37 baseline.
const proImageCase = /^gpt-5\.5-pro\/(omitted|false)\/image=true\/system=(false|true)$/;
assert.equal(golden.cases.filter(fixture => proImageCase.test(fixture.name)).length, 4);
for (const fixture of golden.cases) test(`OpenAI OFF golden bytes: ${fixture.name}`, async () => {
  let expectedRawBody = fixture.rawBody;
  if (proImageCase.test(fixture.name)) {
    const expected = JSON.parse(fixture.rawBody);
    const message = expected.input.at(-1);
    // D37 baseline: preserve the immutable capture's old Chat Completions parts.
    assert.equal(message.role, 'user');
    assert.deepEqual(message.content.map(part => part.type), ['image_url', 'text']);
    assert.equal(typeof message.content[0].image_url.url, 'string');
    message.content = message.content.map(part => part.type === 'image_url'
      ? { type: 'input_image', image_url: part.image_url.url }
      : { type: 'input_text', text: part.text });
    expectedRawBody = JSON.stringify(expected);
  }
  const result = await invoke([], { body: { ...fixture.body, webSearch: fixture.body.webSearch } });
  assert.equal(result.response.status, 200);
  assert.equal(result.upstream.length, 1);
  assert.equal(result.upstream[0].url, fixture.url);
  assert.deepEqual(Buffer.from(result.upstream[0].body), Buffer.from(expectedRawBody));
  if (proImageCase.test(fixture.name)) {
    assert.equal(result.upstream[0].url, 'https://api.openai.com/v1/responses');
    const parts = JSON.parse(result.upstream[0].body).input.at(-1).content;
    assert.deepEqual(parts.map(part => part.type), ['input_image', 'input_text']);
    for (const part of parts.filter(part => part.type === 'input_image')) {
      assert.equal(typeof part.image_url, 'string');
    }
  }
  assert.equal(result.upstream[0].signal, result.signal);
});
