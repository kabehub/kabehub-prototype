const { test } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { installAliasResolver, installTsLoader } = require('./testBootstrap.cjs');
installAliasResolver();
installTsLoader();
const { buildExportContent, generateBulkExportZip } = require('../lib/exportUtils.ts');

const createdAt = new Date(2026, 10, 1, 9, 0).toISOString();
const thread = { id: 'thread-1', title: 'Fence export', created_at: createdAt };
const message = (content, overrides = {}) => ({
  id: 'message-1', thread_id: thread.id, role: 'assistant', provider: 'openai',
  content, created_at: createdAt, ...overrides,
});
const card = '```kabe-card\ntitle: A\nbody\n```';
const frontmatter = [
  '---', 'title: "Fence export"', 'source: kabehub', `created: ${createdAt}`,
  `modified: ${createdAt}`, 'tags:', '  - ai-conversation', '  - openai',
  'message_count: 1', 'system_prompt: ""', '---', '',
].join('\n');
const aiBlock = (heading, body) => `${frontmatter}\n# 💬 ${heading}\n*ChatGPT (ChatGPT) · 2026/11/01 09:00*\n\n${body}\n`;

// Independent structure check: only same-character fences of sufficient length
// close a block. Inputs to these tests contain closed fences; no repair is expected.
function trackFences(content) {
  let open = null;
  const headings = [];
  for (const line of content.split(/\r\n?|\n/)) {
    if (/^# (?:💬|🤖|✨|🙋|📝) /.test(line)) headings.push({ line, inside: open !== null });
    if (open) {
      const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (closing && closing[1][0] === open.character && closing[1].length >= open.length) open = null;
    } else {
      const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
        open = { character: opening[1][0], length: opening[1].length };
      }
    }
  }
  return { headings, open };
}

for (const [provider, emoji, label] of [
  ['openai', '💬', 'ChatGPT'], ['claude', '🤖', 'Claude'], ['gemini', '✨', 'Gemini'],
]) {
  test(`md2: leading card keeps its opening fence and uses ${label} heading`, () => {
    const output = buildExportContent('md2', thread, [message(card, { provider })]);
    assert.ok(output.includes(`\n# ${emoji} ${label}\n`));
    assert.ok(output.includes(`\n\n${card}\n`));
    assert.equal(trackFences(output).open, null);
  });
}

for (const [name, content] of [
  ['python', '```python\nprint(1)\n```'],
  ['tilde', '~~~kabe-card\ntitle: A\nbody\n~~~'],
  ['four backticks', '````markdown\n```python\nprint(1)\n```\n````'],
  ...[1, 2, 3].map(n => [`indent ${n}`, `${' '.repeat(n)}\`\`\`python\nprint(1)\n${' '.repeat(n)}\`\`\``]),
]) {
  test(`md2: ${name} opening fence is retained`, () => {
    assert.equal(buildExportContent('md2', thread, [message(content)]), aiBlock('ChatGPT', content));
  });
}

for (const [name, content, expectedHeading, expectedBody] of [
  ['ordinary text', 'Intro\nBody\n### Detail', 'Intro', 'Body\n## Detail'],
  ['Markdown heading', '# **Intro**\nBody', 'Intro', 'Body'],
  ['blank first line', '\nBody', '', 'Body'],
  ['four-space fence is outside the new condition', '    ```python\nprint(1)\n    ```', '    python', 'print(1)\n    ```'],
]) {
  test(`md2: ${name} preserves the complete legacy output`, () => {
    assert.equal(buildExportContent('md2', thread, [message(content)]), aiBlock(expectedHeading, expectedBody));
  });
}

test('md2: heading promotion still applies to all emitted body lines', () => {
  const content = '```markdown\n### Heading inside code\n```';
  assert.equal(buildExportContent('md2', thread, [message(content)]),
    aiBlock('ChatGPT', '```markdown\n## Heading inside code\n```'));
});

test('md2: user and memo retain their complete legacy output', () => {
  assert.equal(buildExportContent('md2', thread, [message(card, { role: 'user' })]),
    `${frontmatter}\n# 🙋 kabe-card\n*You · 2026/11/01 09:00*\n\n${card}\n`);
  const memoFrontmatter = frontmatter.replace('  - openai\n', '');
  assert.equal(buildExportContent('md2', thread, [message(card, { provider: 'memo' })]),
    `${memoFrontmatter}\n# 📝 メモ\n*2026/11/01 09:00*\n\n${card}\n`);
});

for (const [name, firstContent] of [
  ['three-backtick card', card],
  ['mixed three and four backticks', '````kabe-card\ntitle: A\n```js\nlet x=1\n```\n````'],
]) {
  test(`md2 structure: ${name} leaves every following message outside fences`, () => {
    const output = buildExportContent('md2', thread, [
      message(firstContent),
      message('Following answer\nNormal body', { id: 'message-2', provider: 'gemini' }),
      message('User follow-up', { id: 'message-3', role: 'user', provider: 'user' }),
    ]);
    const result = trackFences(output);
    assert.equal(result.headings.length, 3);
    for (const heading of result.headings) {
      assert.equal(heading.inside, false, `message heading inside a code fence: ${heading.line}`);
    }
    assert.equal(result.open, null, 'export must end outside a fence');
    assert.deepEqual(result.headings.map(h => h.line), [
      '# 💬 ChatGPT', '# ✨ Following answer', '# 🙋 User follow-up',
    ]);
  });
}

test('other exports: leading card keeps the complete legacy md, txt and CSV outputs', (t) => {
  assert.equal(buildExportContent('md', thread, [message(card)]),
    `${frontmatter}\n> [!NOTE] ChatGPT\n> \`\`\`kabe-card\n> title: A\n> body\n> \`\`\`\n`);
  t.mock.method(Date.prototype, 'toLocaleString', () => 'EXPORT_TIME');
  assert.equal(buildExportContent('txt', thread, [message(card)]), [
    '# Fence export', 'エクスポート日時: EXPORT_TIME', '='.repeat(40), '',
    '【ChatGPT】 2026/11/01 09:00', card, '', '-'.repeat(40), '',
  ].join('\n'));
  assert.equal(buildExportContent('csv', thread, [message(card)]),
    '\uFEFFtimestamp,role,provider,model_id,content\n2026/11/01 09:00,assistant,openai,,```kabe-card title: A body ```');
});

test('other exports: ZIP JSON preserves raw content and thread.md preserves legacy md', async () => {
  const data = { threads: [thread], messages: [message(card)], tags: [], notes: [],
    messageNotes: [], drafts: [], profiles: [], likes: [], exportedAt: createdAt };
  const blob = await generateBulkExportZip(data);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  assert.deepEqual(JSON.parse(await zip.file('kabehub_export.json').async('string')), {
    exported_at: createdAt, version: '1', profile: null, threads: data.threads,
    messages: data.messages, thread_tags: [], thread_notes: [], message_notes: [], drafts: [], likes: [],
  });
  assert.equal(await zip.file('threads/Fence-export-thread-1/thread.md').async('string'),
    `${frontmatter}\n> [!NOTE] ChatGPT\n> \`\`\`kabe-card\n> title: A\n> body\n> \`\`\`\n`);
});
