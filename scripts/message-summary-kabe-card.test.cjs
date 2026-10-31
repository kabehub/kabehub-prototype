const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installTsLoader } = require('./testBootstrap.cjs');
installTsLoader();
const shared = require('../packages/shared/src/stringUtils.ts');
const web = require('../lib/stringUtils.ts');
const fence = (inner = 'title: A\nbody', marker = '```') => `${marker}kabe-card\n${inner}\n${marker}`;

const cases = [
  ['card only', fence(), 'A'],
  ['four backticks', fence('title: A\nbody', '````'), 'A'],
  // D68: a nonempty legacy result always wins, even for valid card fences.
  ['tilde keeps legacy summary', fence('title: A\nbody', '~~~'), 'kabecard title: A body'],
  ['nested code keeps legacy summary', fence('title: A\n```js\nlet x=1\n```', '````'), 'js let x=1'],
  ['unclosed keeps legacy summary', '```kabe-card\ntitle: A\nbody', 'kabecard title: A body'],
  ['intro wins', `Intro\n${fence()}`, 'Intro'],
  ['outro wins', `${fence()}\nOutro`, 'Outro'],
  ['invalid closed card', fence('badge: OK\nbody'), ''],
  ['three cards use first title', [fence('title: First'), fence('title: Second'), fence('title: Third')].join('\n\n'), 'First'],
  ['long title uses legacy UTF-16 truncation', fence(`title: ${'a'.repeat(36)}`), `${'a'.repeat(35)}...`],
  ['title Markdown uses legacy cleanup', fence('title: **A** [link](https://example.com)'), 'A link'],
  ['first valid card after invalid card', `${fence('badge: invalid')}\n${fence('title: Valid')}`, 'Valid'],
  ['empty cleaned first title does not select second title', `${fence('title: ***')}\n${fence('title: Second')}`, ''],
  // D71: renderer supports list containers; replaceKabeCards intentionally does not.
  ['list card without preceding text', `- ${fence().replace(/\n/g, '\n  ')}`, ''],
  ['list text keeps legacy result', `- Item\n\n  ${fence().replace(/\n/g, '\n  ')}`, 'Item'],
  ['user-pasted card is role-independent (D64)', { role: 'user', content: fence('title: Pasted') }.content, 'Pasted'],
  ['empty string', '', ''],
  ['ordinary Markdown', '# **Hello** [world](https://example.com)\n- item', 'Hello world item'],
  ['ordinary code omitted', 'Before\n```js\nlet x=1\n```\nAfter', 'Before After'],
  ['whitespace', ' \r\n\t ', ''],
  ['ordinary long text', 'x'.repeat(40), `${'x'.repeat(35)}...`],
  ['CRLF card', fence('title: A\nbody').replace(/\n/g, '\r\n'), 'A'],
];

for (const [name, input, expected] of cases) {
  test(`summary: ${name}`, () => {
    assert.equal(shared.generateMessageSummary(input), expected);
    assert.equal(web.generateMessageSummary(input), expected);
    for (const maxLength of [0, 5, 35, 42]) {
      assert.equal(web.generateMessageSummary(input, maxLength), shared.generateMessageSummary(input, maxLength));
    }
  });
}

test('summary: fallback retains substring truncation at custom lengths', () => {
  assert.equal(shared.generateMessageSummary(fence('title: abcdef'), 3), 'abc...');
  const title = '😀'.repeat(20);
  assert.equal(shared.generateMessageSummary(fence(`title: ${title}`)), title.substring(0, 35) + '...');
});

test('summary: web facade keeps secret masking exports unchanged', () => {
  assert.equal(web.SECRET_MASK, '[redacted]');
  for (const input of ['plain', 'before [[secret]] after', 'before [[unclosed', '[[one]] [[two]]']) {
    assert.equal(web.maskSecretNotation(input), shared.maskSecretNotation(input));
  }
  assert.equal(web.maskSecretNotation('before [[secret]] after'), 'before [redacted] after');
  assert.equal(web.maskSecretNotation('before [[unclosed'), 'before [redacted]');
});
