const assert = require('node:assert/strict');
const { test } = require('node:test');
const { installTsLoader } = require('./testBootstrap.cjs');
installTsLoader();
const { computeUpdateWarning, AUTO_SUMMARY_STANDARD_WARNING_CHARS } = require('../lib/project-memory/auto-summary-update-warning.ts');
const topic = (id, topic_key, content_md, include_in_chat = true) => ({ id, topic_key, content_md, include_in_chat });

test('standard warning counts only four exact standard keys with enabled nonempty bodies', () => {
  const topics = ['overview', 'principles', 'current-work', 'references'].map((key, i) => topic(String(i), key, 'あ😀'));
  topics.push(topic('custom', 'custom', 'x'.repeat(100)), topic('off', 'overview', 'x'.repeat(100), false), topic('blank', 'principles', ' \t\n'), topic('near', 'Overview', 'abc'));
  const result = computeUpdateWarning(topics, [], []);
  assert.equal(AUTO_SUMMARY_STANDARD_WARNING_CHARS, 7000);
  assert.equal(result.standardCharsBefore, 8); assert.equal(result.standardCharsAfter, 8); assert.equal(result.standardOverLimit, false);
  assert.equal(result.usedCharsAfter, 111); assert.equal(result.max, 8000); assert.deepEqual(result.newlyNotInjected, []);
});

test('7000 is allowed and 7001 strictly exceeds the warning threshold in code points', () => {
  const topics = [topic('one', 'overview', '😀'.repeat(7000))];
  assert.equal(computeUpdateWarning(topics, [], []).standardOverLimit, false);
  const result = computeUpdateWarning(topics, [{ topic_id: 'one', proposed_content_md: '😀'.repeat(7001) }], new Set(['one']));
  assert.equal(result.standardCharsBefore, 7000); assert.equal(result.standardCharsAfter, 7001); assert.equal(result.standardOverLimit, true);
});

test('only selected existing proposals change content and frozen inputs remain intact', () => {
  const topics = [topic('one', 'overview', 'abc'), topic('two', 'principles', 'def')];
  const proposals = [{ topic_id: 'one', proposed_content_md: '12345' }, { topic_id: 'two', proposed_content_md: 'x'.repeat(9000) }, { topic_id: 'missing', proposed_content_md: 'x'.repeat(9000) }];
  const before = structuredClone({ topics, proposals }); topics.forEach(Object.freeze); proposals.forEach(Object.freeze); Object.freeze(topics); Object.freeze(proposals);
  const result = computeUpdateWarning(topics, proposals, Object.freeze(['one', 'missing', 'no-proposal']));
  assert.equal(result.standardCharsBefore, 6); assert.equal(result.standardCharsAfter, 8); assert.deepEqual(result.newlyNotInjected, []);
  assert.deepEqual({ topics, proposals }, before);
});

test('newly excluded topics use id differences, preserve priority order and return after objects', () => {
  const topics = [topic('custom', 'custom', 'xx'), topic('reference', 'references', 'xx'), topic('overview', 'overview', 'xx'),
    topic('work', 'current-work', 'x'), topic('principle', 'principles', 'x'.repeat(7999)), topic('already', 'z', 'x'.repeat(9000)), topic('blank', 'y', ' ')];
  const proposals = [{ topic_id: 'principle', proposed_content_md: 'x'.repeat(8000) }, { topic_id: 'already', proposed_content_md: 'y'.repeat(9001) }, { topic_id: 'work', proposed_content_md: 'yyy' }];
  // work is included before, whereas overview/reference/custom/already/blank already miss the budget.
  const result = computeUpdateWarning(topics, proposals, new Set(proposals.map(p => p.topic_id)));
  assert.deepEqual(result.newlyNotInjected.map(t => t.id), ['work']); assert.equal(result.newlyNotInjected[0].content_md, 'yyy');
  assert.notEqual(result.newlyNotInjected[0], topics[3]); assert.equal(topics[3].content_md, 'x'); assert.equal(result.usedCharsAfter, 8000);
});

test('multiple newly excluded topics preserve summarizeChatInclusion order', () => {
  const topics = [topic('custom', 'custom', 'x'), topic('ref', 'references', 'x'), topic('over', 'overview', 'x'), topic('p', 'principles', 'x')];
  const result = computeUpdateWarning(topics, [{ topic_id: 'p', proposed_content_md: 'x'.repeat(8000) }], ['p']);
  assert.deepEqual(result.newlyNotInjected.map(t => t.id), ['over', 'ref', 'custom']);
});

test('empty input and unrelated selections produce ordinary warning information', () => {
  assert.deepEqual(computeUpdateWarning([], [{ topic_id: 'missing', proposed_content_md: 'x' }], ['missing']), {
    standardCharsBefore: 0, standardCharsAfter: 0, standardOverLimit: false, newlyNotInjected: [], usedCharsAfter: 0, max: 8000,
  });
});
