const assert = require('node:assert/strict');
const { test } = require('node:test');
const { installTsLoader } = require('./testBootstrap.cjs');
installTsLoader();
const { buildResponsesInput: build } = require('../lib/openai-responses-input.ts');
const image = { source: { media_type: 'image/png', data: 'aW1hZ2U=' } };
const messages = [{ role: 'user', content: 'question 日本語' }];

test('Responses input keeps text messages as strings without images', () => {
  assert.deepEqual(build({ messages }), messages);
  assert.deepEqual(build({ messages, imageBlocks: [] }), messages);
});

test('Responses input converts one image before the current user text', () => {
  assert.deepEqual(build({ messages, imageBlocks: [image] }), [{ role: 'user', content: [
    { type: 'input_image', image_url: 'data:image/png;base64,aW1hZ2U=' },
    { type: 'input_text', text: 'question 日本語' },
  ] }]);
});

test('Responses input preserves multiple image order and each media type in data URLs', () => {
  const images = [image, { source: { media_type: 'image/jpeg', data: 'anBlZw==' } },
    { source: { media_type: 'image/webp', data: 'd2VicA==' } }];
  const parts = build({ messages, imageBlocks: images })[0].content;
  assert.deepEqual(parts, [
    { type: 'input_image', image_url: 'data:image/png;base64,aW1hZ2U=' },
    { type: 'input_image', image_url: 'data:image/jpeg;base64,anBlZw==' },
    { type: 'input_image', image_url: 'data:image/webp;base64,d2VicA==' },
    { type: 'input_text', text: 'question 日本語' },
  ]);
  for (const part of parts) {
    assert.deepEqual(Object.keys(part), part.type === 'input_image' ? ['type', 'image_url'] : ['type', 'text']);
  }
});

for (const systemPrompt of [undefined, '', ' \r\n\t ']) {
  test(`Responses input omits blank system prompt: ${JSON.stringify(systemPrompt)}`, () => {
    assert.deepEqual(build({ systemPrompt, messages }), messages);
  });
}

test('Responses input trims the system prompt and prepends it once', () => {
  assert.deepEqual(build({ systemPrompt: ' \n system 日本語\nline 2 \t ', messages, imageBlocks: [image] }), [
    { role: 'system', content: 'system 日本語\nline 2' },
    { role: 'user', content: [
      { type: 'input_image', image_url: 'data:image/png;base64,aW1hZ2U=' },
      { type: 'input_text', text: 'question 日本語' },
    ] },
  ]);
});

test('Responses input does not attach images when the last message is assistant', () => {
  const history = [...messages, { role: 'assistant', content: 'answer' }];
  assert.deepEqual(build({ messages: history, imageBlocks: [image] }), history);
});

test('Responses input keeps earlier user and assistant history as strings', () => {
  const history = [...messages, { role: 'assistant', content: 'answer' }, { role: 'user', content: 'follow-up' }];
  const input = build({ messages: history, imageBlocks: [image] });
  assert.deepEqual(input.slice(0, 2), history.slice(0, 2));
  assert.ok(input.slice(0, 2).every(message => typeof message.content === 'string'));
  assert.deepEqual(input[2], { role: 'user', content: [
    { type: 'input_image', image_url: 'data:image/png;base64,aW1hZ2U=' },
    { type: 'input_text', text: 'follow-up' },
  ] });
});

test('Responses input keeps an empty input_text part after images', () => {
  assert.deepEqual(build({ messages: [{ role: 'user', content: '' }], imageBlocks: [image] }), [
    { role: 'user', content: [
      { type: 'input_image', image_url: 'data:image/png;base64,aW1hZ2U=' },
      { type: 'input_text', text: '' },
    ] },
  ]);
});

test('Responses input handles empty history without inventing an image message', () => {
  assert.deepEqual(build({ messages: [], imageBlocks: [image] }), []);
  assert.deepEqual(build({ systemPrompt: ' system ', messages: [], imageBlocks: [image] }), [
    { role: 'system', content: 'system' },
  ]);
});

test('Responses input does not mutate the input messages or images', () => {
  const args = { systemPrompt: ' system ', messages: [...messages, { role: 'assistant', content: 'answer' }, ...messages],
    imageBlocks: [structuredClone(image)] };
  const before = structuredClone(args);
  Object.freeze(args.messages);
  args.messages.forEach(Object.freeze);
  Object.freeze(args.imageBlocks);
  args.imageBlocks.forEach(block => { Object.freeze(block.source); Object.freeze(block); });
  const input = build(args);
  input[1].content = 'changed';
  input.at(-1).content[0].image_url = 'changed';
  assert.deepEqual(args, before);
});

test('Responses input emits string image_url values and never legacy image_url/text types', () => {
  const input = build({ messages, imageBlocks: [image, image] });
  const parts = input.flatMap(message => Array.isArray(message.content) ? message.content : []);
  assert.deepEqual(parts.map(part => part.type), ['input_image', 'input_image', 'input_text']);
  for (const part of parts) {
    assert.ok(!['image_url', 'text'].includes(part.type));
    if (part.type === 'input_image') assert.equal(typeof part.image_url, 'string');
  }
});
