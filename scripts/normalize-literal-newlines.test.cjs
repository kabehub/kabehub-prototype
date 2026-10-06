const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installTsLoader } = require('./testBootstrap.cjs');
installTsLoader();
const { normalizeLiteralNewlines: normalize } = require('../lib/project-memory/normalize-literal-newlines.ts');

const cases = [
  ['prose', '一行目\\n二行目', '一行目\n二行目'],
  ['Windows path', 'C:\\new\\file.txt', 'C:\\new\\file.txt'],
  ['English heading Goal', 'Goal:\\n- a\\n- b', 'Goal:\n- a\n- b'],
  ['English heading references', 'references:\\n- x', 'references:\n- x'],
  ['path after whitespace', 'URL: C:\\new\\f.txt 後\\n末尾', 'URL: C:\\new\\f.txt 後\n末尾'],
  ['drive after digit is prose', '1C:\\n末尾', '1C:\n末尾'],
  ['drive after punctuation', '(C:\\new\\file.txt) 後\\n末尾', '(C:\\new\\file.txt) 後\n末尾'],
  ['drive after full-width character', '先C:\\new\\file.txt 後\\n末尾', '先C:\\new\\file.txt 後\n末尾'],
  ['UNC path', '\\\\server\\new\\share', '\\\\server\\new\\share'],
  ['fenced code', '```js\nconst s = "\\n";\n```', '```js\nconst s = "\\n";\n```'],
  ['inline code', '`\\n`', '`\\n`'],
  ['escaped backslash', '\\\\n', '\\\\n'],
  ['identity', '普通の本文\n実際の改行も保持', '普通の本文\n実際の改行も保持'],
  ['mixed fence and prose', '前\\n```js\n"\\n"\n```後\\n末尾', '前\n```js\n"\\n"\n```後\n末尾'],
  ['path boundary', 'C:\\new\\file.txt 後\\n末尾', 'C:\\new\\file.txt 後\n末尾'],
  ['UNC boundary', '\\\\server\\new\\share 後\\n末尾', '\\\\server\\new\\share 後\n末尾'],
  ['unclosed fence', '前\\n```\\n末尾', '前\n```\\n末尾'],
  ['unclosed inline', '前\\n`\\n末尾', '前\n`\\n末尾'],
  ['ambiguous double backticks', '``\\n``後\\n末尾', '``\\n``後\n末尾'],
  ['longer delimiter inside fence', '```\\n````\\n```後\\n末尾', '```\\n````\\n```後\n末尾'],
];
for (const [name, input, expected] of cases) {
  test(name, () => {
    assert.equal(normalize(input), expected);
    assert.deepEqual(Buffer.from(normalize(input)), Buffer.from(expected));
    assert.equal(normalize(expected), expected, 'idempotent');
  });
}
