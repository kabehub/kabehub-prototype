const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installTsLoader } = require('./testBootstrap.cjs');
installTsLoader();
const {
  parseKabeCard, isKabeCardFenceClosed, createKabeCardLimiter,
  KABE_CARD_MAX_PER_MESSAGE, KABE_CARD_MAX_TITLE_LENGTH,
  KABE_CARD_MAX_BADGE_LENGTH, KABE_CARD_MAX_META_LENGTH, KABE_CARD_MAX_BODY_LENGTH,
  replaceKabeCards,
} = require('../packages/shared/src/kabeCard.ts');

const card = (overrides = {}) => ({
  title: 'A', badge: undefined, tone: undefined, meta: undefined, body: 'body', ...overrides,
});
const parseCases = [
  ['no blank line', 'title: A\nbody', card()],
  ['multiple boundary blank lines', 'title: A\n\n \nbody\n\n\t', card()],
  ['internal blank lines', 'title: A\n\nfirst\n\n\nlast\n', card({ body: 'first\n\n\nlast' })],
  ['colon in meta', 'title: A\nmeta: 12:30: JST\nbody', card({ meta: '12:30: JST' })],
  ['meta omitted', 'title: A\nbadge: OK\nbody', card({ badge: 'OK' })],
  ['badge omitted', 'title: A\nmeta: now\nbody', card({ meta: 'now' })],
  ['empty optional values', 'title: A\nbadge: \nmeta:\nbody', card()],
  ['invalid tone', 'title: A\ntone: unknown\nbody', card()],
  ['empty tone', 'title: A\ntone: \nbody', card()],
  ['tone omitted', 'title: A\nbody', card()],
  ['missing title', 'badge: OK\nbody', null],
  ['whitespace title', 'title: \t \nbody', null],
  ['duplicate keys use first', 'title: A\ntitle: B\nbadge: first\nbadge: second\nmeta: one\nmeta: two\ntone: warning\ntone: positive\nbody', card({ badge: 'first', meta: 'one', tone: 'warning' })],
  ['empty first title wins', 'title:\ntitle: A\nbody', null],
  ['empty first optional values win', 'title: A\nbadge:\nbadge: OK\nmeta:\nmeta: now\ntone:\ntone: positive\nbody', card()],
  ['unknown key ends header', 'title: A\nfoo: bar\nmeta: body text', card({ body: 'foo: bar\nmeta: body text' })],
  ['quote ends header', 'title: A\nquote: text\nbadge: body text', card({ body: 'quote: text\nbadge: body text' })],
  ['uppercase ends header', 'title: A\nTone: warning', card({ body: 'Tone: warning' })],
  ['leading blank means no header', '\ntitle: A', null],
  ['redacted is ordinary text', 'title: [redacted]\nbadge: [redacted]\nmeta: [redacted]\n[redacted]', card({ title: '[redacted]', badge: '[redacted]', meta: '[redacted]', body: '[redacted]' })],
  ['inline markdown stays intact', 'title: A\n**bold** and `code`', card({ body: '**bold** and `code`' })],
  ['CRLF', 'title: A\r\nmeta: 12:30\r\n\r\nfirst\r\n\r\nlast\r\n', card({ meta: '12:30', body: 'first\n\nlast' })],
  ['title only', 'title: A', card({ body: '' })],
  ['header only', 'title: A\nbadge: OK\ntone: neutral\nmeta: now\n', card({ badge: 'OK', tone: 'neutral', meta: 'now', body: '' })],
  ['trim values at first colon', 'title:  A:B  \nbadge: OK:done \nbody', card({ title: 'A:B', badge: 'OK:done' })],
];
for (const [name, input, expected] of parseCases) {
  test(`parse: ${name}`, () => assert.deepEqual(parseKabeCard(input), expected));
}
for (const tone of ['positive', 'neutral', 'warning', 'negative']) {
  test(`parse: allowed tone ${tone}`, () => {
    assert.equal(parseKabeCard(`title: A\ntone: ${tone}`).tone, tone);
  });
}
for (const [key, limit] of [
  ['title', KABE_CARD_MAX_TITLE_LENGTH], ['badge', KABE_CARD_MAX_BADGE_LENGTH],
  ['meta', KABE_CARD_MAX_META_LENGTH], ['body', KABE_CARD_MAX_BODY_LENGTH],
]) {
  for (const character of ['a', '😀']) {
    test(`parse: ${key} code point limit (${character})`, () => {
      const input = (n) => key === 'body' ? `title: A\n\n${character.repeat(n)}`
        : `${key === 'title' ? '' : 'title: A\n'}${key}: ${character.repeat(n)}`;
      assert.ok(parseKabeCard(input(limit)));
      assert.equal(parseKabeCard(input(limit + 1)), null);
    });
  }
}

const fenceCases = [
  ['three to three', '```kabe-card\ntitle: A\n```', true],
  ['three to four', '```kabe-card\ntitle: A\n````', true],
  ['four to three', '````kabe-card\ntitle: A\n```', false],
  ['backtick to tilde', '```kabe-card\ntitle: A\n~~~', false],
  ['tilde to tilde', '~~~kabe-card\ntitle: A\n~~~', true],
  ['tilde to backtick', '~~~kabe-card\ntitle: A\n```', false],
  ['no closing line', '```kabe-card\ntitle: A', false],
  ['opening only', '```kabe-card', false],
  ['opening and newline only', '```kabe-card\n', false],
  ['text after closing fence', '```kabe-card\ntitle: A\n```foo', false],
  ['trailing whitespace', '```kabe-card\ntitle: A\n``` \t\n\n', true],
  ['CRLF', '```kabe-card\r\ntitle: A\r\n```\r\n', true],
  ['three leading spaces', '```kabe-card\ntitle: A\n   ```', true],
  ['four leading spaces', '```kabe-card\ntitle: A\n    ```', false],
  ['leading tab', '```kabe-card\ntitle: A\n\t```', false],
  ['blockquote all lines', '> ```kabe-card\n> title: A\n> ```', true],
  ['nested blockquote', '> > ```kabe-card\n> > title: A\n> > ```', true],
  ['blockquote four spaces after marker', '> ```kabe-card\n> title: A\n>     ```', false],
  ['list close indentation two', '```kabe-card\n  title: A\n  ```', true],
  ['list close indentation four', '```kabe-card\n    title: A\n    ```', false],
  ['list close indentation six', '```kabe-card\n      title: A\n      ```', false],
];
// Step 0: pre.node.positionから得た実際のcontent.slice(start, end)。
const measuredSlices = [
  ['1 top closed', '```kabe-card\ntitle: A\nbody\n```', true],
  ['2 top unclosed', '```kabe-card\ntitle: A\nbody\n', false],
  ['3a quote closed', '```kabe-card\n> title: A\n> body\n> ```', true],
  ['3b quote unclosed', '```kabe-card\n> title: A\n> body', false],
  ['4a bullet closed', '```kabe-card\n  title: A\n  body\n  ```', true],
  ['4b bullet unclosed', '```kabe-card\n  title: A\n  body\n', false],
  ['4c ordered closed', '```kabe-card\n   title: A\n   body\n   ```', true],
  ['4d ordered unclosed', '```kabe-card\n   title: A\n   body\n', false],
  ['5 four to three', '````kabe-card\ntitle: A\nbody\n```\n', false],
  ['6 tilde to backtick', '~~~kabe-card\ntitle: A\nbody\n```\n', false],
  ['7 CRLF', '```kabe-card\r\ntitle: A\r\nbody\r\n```', true],
  ['8 four spaces', '```kabe-card\ntitle: A\nbody\n    ```\n', false],
  ['9 three spaces', '```kabe-card\ntitle: A\nbody\n   ```', true],
];
for (const [name, source, expected] of [...fenceCases, ...measuredSlices]) {
  test(`fence: ${name}`, () => assert.equal(isKabeCardFenceClosed(source), expected));
}

test('limiter: 20 allowed, 21st rejected, repeat calls stable', () => {
  assert.equal(KABE_CARD_MAX_PER_MESSAGE, 20);
  const allow = createKabeCardLimiter();
  for (let i = 1; i <= 22; i++) assert.equal(allow(i * 10), i <= 20);
  for (let i = 22; i >= 1; i--) assert.equal(allow(i * 10), i <= 20);
});
test('limiter: interleaved double calls do not consume another slot', () => {
  const allow = createKabeCardLimiter();
  for (let i = 0; i < 22; i++) {
    assert.equal(allow(i), i < 20);
    assert.equal(allow(i), i < 20);
  }
});
test('limiter: instances are independent and max is configurable', () => {
  const a = createKabeCardLimiter(1);
  const b = createKabeCardLimiter(2);
  assert.equal(a(0), true);
  assert.equal(a(1), false);
  assert.equal(b(1), true);
  assert.equal(b(0), true);
  assert.equal(b(2), false);
  assert.equal(createKabeCardLimiter(0)(0), false);
});

const cardFence = (inner, marker = '```', info = 'kabe-card') => `${marker}${info}\n${inner}\n${marker}`;
const replaceWithTitle = content => replaceKabeCards(content, parsed => `[${parsed.title}]`);

for (const [name, input, expected] of [
  ['one card', cardFence('title: A\nbody'), '[A]'],
  ['multiple cards', `${cardFence('title: A')}\n\n${cardFence('title: B')}`, '[A]\n\n[B]'],
  ['surrounding text', `Intro\n\n${cardFence('title: A\nbody')}\n\nOutro\n`, 'Intro\n\n[A]\n\nOutro\n'],
  ['empty body', cardFence('title: A\nbadge: OK\ntone: neutral\nmeta: now\n'), '[A]'],
  ['tilde fence', cardFence('title: A\nbody', '~~~'), '[A]'],
  ['four backticks with nested code', cardFence('title: A\n```js\nlet x=1\n```', '````'), '[A]'],
  ['first info word', cardFence('title: A', '```', ' kabe-card extra'), '[A]'],
  ['longer closing with indent and whitespace', '```kabe-card\ntitle: A\n   ```` \t', '[A]'],
  ['closing newline retained', '```kabe-card\ntitle: A\n```\n', '[A]\n'],
]) {
  test(`replace: ${name}`, () => assert.equal(replaceWithTitle(input), expected));
}

test('replace: callback receives the parsed card and its return value is literal', () => {
  const seen = [];
  const result = replaceKabeCards(cardFence('title: A\nbadge: OK\ntone: warning\nmeta: now\nbody'), value => {
    seen.push(value);
    return '$&\n$1';
  });
  assert.deepEqual(seen, [card({ badge: 'OK', tone: 'warning', meta: 'now' })]);
  assert.equal(result, '$&\n$1');
});

for (const [name, input] of [
  ['empty input', ''],
  ['ordinary CRLF text', 'Intro\r\nOutro\r\n'],
  ['missing title', cardFence('badge: OK\nbody')],
  ['title overflow', cardFence(`title: ${'a'.repeat(61)}`)],
  ['badge overflow', cardFence(`title: A\nbadge: ${'a'.repeat(31)}`)],
  ['meta overflow', cardFence(`title: A\nmeta: ${'a'.repeat(101)}`)],
  ['body overflow', cardFence(`title: A\n${'a'.repeat(601)}`)],
  ['unclosed card', '```kabe-card\ntitle: A\nbody'],
  ['different closing character', '```kabe-card\ntitle: A\n~~~'],
  ['short closing', '````kabe-card\ntitle: A\n```'],
  ['four-space closing', '```kabe-card\ntitle: A\n    ```'],
  ['other info word', cardFence('title: A', '```', 'kabe-card-extra')],
  ['outer other-language fence', `\`\`\`\`markdown\n${cardFence('title: A')}\n\`\`\`\``],
  ['outer language-less fence', `\`\`\`\`\n${cardFence('title: A')}\n\`\`\`\``],
  ['unclosed outer fence stops the scan', `\`\`\`\`markdown\n${cardFence('title: A')}`],
  // Intentional D71 difference: render: closed containers (kabe-card-render.test.cjs)
  // renders quoted/list cards, while this helper recognizes only column-zero cards.
  ['blockquote (renderer can render it)', cardFence('title: A\nbody').split('\n').map(l => `> ${l}`).join('\n')],
  ['list without item text (renderer can render it)', `- ${cardFence('title: A\nbody').replace(/\n/g, '\n  ')}`],
  ['indented list continuation', `- item\n\n${cardFence('title: A\nbody').split('\n').map(l => `    ${l}`).join('\n')}`],
]) {
  test(`replace: no valid top-level card preserves exact input: ${name}`, () => {
    let calls = 0;
    assert.equal(replaceKabeCards(input, () => { calls++; return 'unexpected'; }), input);
    assert.equal(calls, 0);
  });
}

for (const indentation of [1, 2, 3]) {
  test(`replace: ${indentation}-space outer fence shields a column-zero card example`, () => {
    const prefix = ' '.repeat(indentation);
    const outer = `${prefix}\`\`\`\`markdown\n${cardFence('title: example')}\n${prefix}\`\`\`\``;
    assert.equal(replaceWithTitle(`${outer}\n${cardFence('title: real')}`), `${outer}\n[real]`);
  });
  test(`replace: ${indentation}-space card is opaque, including nested column-zero fences`, () => {
    // The renderer may accept this indented card; the helper must skip its entire body.
    const prefix = ' '.repeat(indentation);
    const outer = `${prefix}\`\`\`\`kabe-card\ntitle: outer\n${cardFence('title: inner')}\n${prefix}\`\`\`\``;
    assert.equal(replaceWithTitle(`${outer}\n${cardFence('title: real')}`), `${outer}\n[real]`);
  });
}

for (const newline of ['\r\n', '\r', '\n']) {
  test(`replace: preserves original ${JSON.stringify(newline)} outside replacement`, () => {
    const input = `Intro\n\n${cardFence('title: A\nfirst\nsecond')}\n\nOutro\n`.replace(/\n/g, newline);
    const seen = [];
    const output = replaceKabeCards(input, parsed => { seen.push(parsed); return '[A]'; });
    assert.equal(output, `Intro${newline}${newline}[A]${newline}${newline}Outro${newline}`);
    assert.equal(seen[0].body, 'first\nsecond');
  });
}

test('replace: invalid backtick info is not an opening fence', () => {
  const invalidOpening = '```markdown `example`';
  assert.equal(replaceWithTitle(`${invalidOpening}\n${cardFence('title: A')}`), `${invalidOpening}\n[A]`);
});

test('replace: the first 20 valid cards are replaced and later cards retain raw text', () => {
  const inputs = Array.from({ length: 22 }, (_, i) => cardFence(`title: ${i + 1}`));
  assert.equal(replaceWithTitle(inputs.join('\n\n')),
    inputs.map((input, i) => i < 20 ? `[${i + 1}]` : input).join('\n\n'));
});

test('replace: five invalid cards do not consume the 20 valid slots', () => {
  const invalid = Array.from({ length: 5 }, () => cardFence('badge: invalid'));
  const valid = Array.from({ length: 20 }, (_, i) => cardFence(`title: ${i + 1}`));
  assert.equal(replaceWithTitle([...invalid, ...valid].join('\n\n')),
    [...invalid, ...valid.map((_, i) => `[${i + 1}]`)].join('\n\n'));
});

test('replace: D71 quoted 20 cards do not consume the top-level card budget', () => {
  // Contrast render: unsuccessful parse does not consume a slot / closed containers:
  // the renderer counts the quoted cards and falls back for the 21st card; this helper does not.
  const quoted = Array.from({ length: 20 }, (_, i) =>
    cardFence(`title: quoted ${i + 1}`).split('\n').map(l => `> ${l}`).join('\n')).join('\n\n');
  assert.equal(replaceWithTitle(`${quoted}\n\n${cardFence('title: top')}`), `${quoted}\n\n[top]`);
});
