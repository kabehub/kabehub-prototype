const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./testBootstrap.cjs').installTsLoader();
const { KABE_CARD_SYSTEM_PROMPT, shouldInjectKabeCardRules, appendKabeCardRules } = require('../lib/kabe-card-system-prompt.ts');

test('card system rules match the complete fixed LF text with no trailing newline', () => {
  const expected = [
    "## カード表示",
    "情報をまとめて見せたい場面（比較・候補の整理・注意点の一覧など）でだけ、カード記法を使ってよい。",
    "通常の会話・コード・短い回答には使わない。1回の返答で最大5枚。",
    "ユーザー・Project・スレッドの指示で表示形式が指定されている場合は、そちらを優先する。",
    "",
    "形式:",
    "```kabe-card",
    "title: 見出し",
    "badge: 短いラベル（任意）",
    "tone: positive | neutral | warning | negative（任意）",
    "meta: 補足情報（任意）",
    "本文（inline Markdownのみ）",
    "```",
    "",
    "ルール:",
    "- フェンスの言語名は必ず kabe-card",
    "- 先頭に key: value の行を並べ、その次の行から本文を書く（空行は不要）",
    "- 使えるキーは title / badge / tone / meta のみ。title は必須",
    "- フェンスは必ず閉じる",
  ].join("\n");
  assert.deepEqual(Buffer.from(KABE_CARD_SYSTEM_PROMPT), Buffer.from(expected));
  assert.ok(KABE_CARD_SYSTEM_PROMPT.startsWith('## カード表示'));
  assert.equal(KABE_CARD_SYSTEM_PROMPT.endsWith('\n'), false);
  assert.equal(KABE_CARD_SYSTEM_PROMPT.includes('\r'), false);
});

test('card injection requires strict true and rejects every excluded mode', () => {
  const base = { isMemo: false, isTemporary: false, isRoleplayThread: false, isNovelProject: false };
  for (const richDisplay of [undefined, null, false, 'true', 1, {}]) {
    assert.equal(shouldInjectKabeCardRules({ ...base, richDisplay }), false);
  }
  const flags = Object.keys(base);
  for (let mask = 0; mask < 16; mask++) {
    const input = { richDisplay: true, ...Object.fromEntries(flags.map((key, i) => [key, Boolean(mask & (1 << i))])) };
    assert.equal(shouldInjectKabeCardRules(input), mask === 0);
  }
});

test('appendKabeCardRules preserves OFF bytes and appends the rules only when enabled', () => {
  for (const stable of ['', 'stable', ' \r\n日本語\n ']) {
    assert.equal(appendKabeCardRules(stable, false), stable);
    assert.equal(appendKabeCardRules(stable, true), stable + '\n\n' + KABE_CARD_SYSTEM_PROMPT);
  }
});
