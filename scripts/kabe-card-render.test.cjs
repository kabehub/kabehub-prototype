const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { installTsLoader } = require('./testBootstrap.cjs');
installTsLoader({ jsx: true });
const MarkdownRenderer = require('../components/MarkdownRenderer.tsx').default;
const Markdown = require('react-markdown').default;

const fence = (inner, opening = '```', closing = opening) => `${opening}kabe-card\n${inner}\n${closing}`;
const render = (content, variant = 'default') => renderToStaticMarkup(
  React.createElement(React.StrictMode, null, React.createElement(MarkdownRenderer, { content, variant }))
);
const countCards = (html) => (html.match(/data-kabe-card="true"/g) || []).length;
const fallbackCases = [
  ['unclosed', '```kabe-card\ntitle: A\nbody'],
  ['shorter closing', fence('title: A\nbody', '````', '```')],
  ['different closing character', fence('title: A\nbody', '~~~', '```')],
  ['four space closing indentation', fence('title: A\nbody', '```', '    ```')],
  ['missing title', fence('badge: OK\nbody')],
  ['empty title', fence('title: \nbody')],
  ['oversize title', fence(`title: ${'a'.repeat(61)}`)],
  ['oversize body', fence(`title: A\n${'a'.repeat(601)}`)],
  ['deep list conservative fallback', `- item\n\n    ${fence('title: A\nbody').replace(/\n/g, '\n    ')}`],
];
for (const [name, content] of fallbackCases) {
  test(`render fallback: ${name}`, () => {
    const html = render(content);
    assert.equal(countCards(html), 0);
    assert.match(html, />kabe-card<\/span>/);
    assert.match(html, /<pre/);
  });
}
test('render: closed card has accessible group and no copy/download controls', () => {
  const html = render(fence('title: A\nbadge: OK\nbody'));
  assert.equal(countCards(html), 1);
  assert.match(html, /class="not-prose"/);
  assert.match(html, /role="group" aria-label="A"/);
  assert.doesNotMatch(html, /<button|<pre/);
});
test('render: closed containers and measured CRLF input', () => {
  for (const content of [
    '> ' + fence('title: A\nbody').replace(/\n/g, '\n> '),
    '- ' + fence('title: A\nbody').replace(/\n/g, '\n  '),
    '1. ' + fence('title: A\nbody').replace(/\n/g, '\n   '),
    fence('title: A\nbody').replace(/\n/g, '\r\n'),
    fence('title: A\nbody', '```', '   ```'),
    fence('title: A\nbody', '~~~'),
    fence('title: A\nbody', '```', '````'),
  ]) assert.equal(countCards(render(content)), 1, content);
});
test('render: unsuccessful parse does not consume a slot; each render has its own limiter', () => {
  const content = Array.from({ length: 21 }, (_, i) => [
    fence('badge: invalid'), fence(`title: card ${i + 1}\nbody`),
  ]).flat().join('\n\n');
  for (let pass = 0; pass < 2; pass++) {
    const html = render(content);
    assert.equal(countCards(html), 20);
    assert.match(html, /aria-label="card 20"/);
    assert.doesNotMatch(html, /aria-label="card 21"/);
    assert.match(html, /title: card 21/);
    assert.equal((html.match(/>kabe-card<\/span>/g) || []).length, 22);
  }
});
test('render: inline markdown and shared inline code styling', () => {
  for (const variant of ['default', 'share']) {
    const html = render(fence('title: A\n**bold** *emphasis* ~~removed~~ [link](https://example.com) and `code`'), variant);
    assert.match(html, /<strong>bold<\/strong>/);
    assert.match(html, /<em>emphasis<\/em>/);
    assert.match(html, /<del>removed<\/del>/);
    assert.match(html, /<a href="https:\/\/example.com">link<\/a>/);
    const inlineCode = (s) => s.match(/<code[^>]*>code<\/code>/)[0];
    assert.equal(inlineCode(html), inlineCode(render('`code`', variant)));
  }
});
test('render: no header when badge/meta/tone are absent or empty/invalid', () => {
  for (const header of ['', '\nbadge:\nmeta:\ntone:', '\ntone: invalid']) {
    const html = render(fence(`title: A${header}`));
    assert.equal(countCards(html), 1);
    assert.doesNotMatch(html, /<svg|<p/);
  }
});
test('render: tone-only and badge-only/meta-only headers', () => {
  for (const header of ['tone: neutral', 'badge: OK', 'meta: 12:30']) {
    const html = render(fence(`title: A\n${header}`));
    assert.match(html, /<svg/);
    assert.match(html, /background:#f8fafc/);
    assert.match(html, /border-bottom:1px solid #e2e8f0/);
    assert.match(html, /stroke="#64748b"/);
  }
  assert.match(render(fence('title: A\nbadge: OK')), /color:#475569/);
});
test('render: specified tone palette', () => {
  for (const [tone, background, border, icon, label] of [
    ['positive', '#f0fdf4', '#bbf7d0', '#15803d', '#166534'],
    ['neutral', '#f8fafc', '#e2e8f0', '#64748b', '#475569'],
    ['warning', '#fffbeb', '#fde68a', '#b45309', '#92400e'],
    ['negative', '#fef2f2', '#fecaca', '#b91c1c', '#991b1b'],
  ]) {
    const html = render(fence(`title: A\nbadge: OK\ntone: ${tone}`));
    for (const style of [`background:${background}`, `border-bottom:1px solid ${border}`, `stroke="${icon}"`, `color:${label}`]) {
      assert.ok(html.includes(style), style);
    }
  }
});
test('render: share variant also renders cards', () => {
  assert.equal(countCards(render(fence('title: [redacted]\nbadge: OK\nbody'), 'share')), 1);
});
test('render: raw HTML and dangerous URLs do not create unsafe output elements/attributes', () => {
  const html = render(fence('title: A\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert%281%29)'));
  assert.equal(countCards(html), 1);
  // 出力のタグと属性を調べる。エスケープされた本文はタグとして数えない。
  const tags = html.match(/<[a-z][^>]*>/gi) || [];
  assert.ok(tags.length > 0);
  for (const tag of tags) {
    assert.doesNotMatch(tag, /^<img\b/i);
    assert.doesNotMatch(tag, /\s+on[^\s=/>]*\s*=/i);
    for (const [, href] of tag.matchAll(/\bhref="([^"]*)"/gi)) {
      assert.doesNotMatch(href, /javascript:/i);
    }
  }
  assert.match(html, />bad<\/a>/);
});
test('render: lists render while disallowed heading and code block elements unwrap and retain text', () => {
  const html = render(fence('title: A\n\n# heading text\n\n- list text\n\n~~~js\ncode text\n~~~'));
  assert.equal(countCards(html), 1);
  assert.doesNotMatch(html, /<h1|<pre|<img/);
  assert.match(html, /<ul\b/);
  assert.match(html, /<li\b/);
  for (const text of ['heading text', 'list text', 'code text']) assert.ok(html.includes(text));
});
test('render: other code languages retain labels, content and download eligibility', () => {
  for (const language of ['js', 'csv', 'txt', 'my-lang']) {
    const html = render(`\`\`\`${language}\nconst x = 1;\n\`\`\``);
    assert.equal(countCards(html), 0);
    assert.ok(html.includes(`>${language}</span>`));
    assert.match(html, /<code>const x = 1;<\/code>/);
    assert.match(html, /クリップボードにコピー/);
    assert.equal(html.includes('としてダウンロード'), language === 'csv' || language === 'txt');
  }
});
test('render: Step 0 positions still point into original unprocessed content', () => {
  const content = 'prefix\n\n> ```kabe-card\n> title: A\n> body\n> ```\n';
  let source;
  renderToStaticMarkup(React.createElement(Markdown, { components: {
    pre({ node, children }) {
      source = content.slice(node.position.start.offset, node.position.end.offset);
      return React.createElement('pre', null, children);
    },
  } }, content));
  assert.equal(source, '```kabe-card\n> title: A\n> body\n> ```');
  assert.equal(countCards(render(content)), 1);
});

test('render: card bullets keep each inline-markdown item in its own list item', () => {
  for (const variant of ['default', 'share']) {
    const html = render(fence('title: A\n- **A**: a\n- **B**: b\n- **C**: c'), variant);
    assert.equal(countCards(html), 1);
    assert.equal((html.match(/<ul\b/g) || []).length, 1);
    assert.equal((html.match(/<li\b/g) || []).length, 3);
    for (const [label, value] of [['A', 'a'], ['B', 'b'], ['C', 'c']]) {
      assert.ok(html.includes('<strong>' + label + '</strong>: ' + value + '</li>'));
    }
    assert.match(html, /<ul style="margin:2px 0;padding-left:1.25em;list-style-type:disc"/);
    assert.match(html, /<li style="margin:0"><strong>A<\/strong>: a<\/li>/);
  }
});

test('render: ordered card lists preserve item boundaries and a non-default start', () => {
  for (const variant of ['default', 'share']) {
    const html = render(fence('title: A\n1. x\n2. y'), variant);
    assert.equal((html.match(/<ol\b/g) || []).length, 1);
    assert.equal((html.match(/<li\b/g) || []).length, 2);
    assert.match(html, /<li[^>]*>x<\/li>/);
    assert.match(html, /<li[^>]*>y<\/li>/);
    assert.match(html, /<ol style="margin:2px 0;padding-left:1.5em;list-style-type:decimal"/);
    assert.match(render(fence('title: A\n3. x'), variant), /<ol start="3"/);
  }
});

test('render: nested card bullets retain both list levels', () => {
  for (const variant of ['default', 'share']) {
    const html = render(fence('title: A\n- a\n  - b'), variant);
    assert.equal((html.match(/<ul\b/g) || []).length, 2);
    assert.equal((html.match(/<li\b/g) || []).length, 2);
    assert.match(html, /<li[^>]*>a\s*<ul[^>]*>\s*<li[^>]*>b<\/li>\s*<\/ul>\s*<\/li>/);
  }
});

test('render: card paragraphs and bullet lists coexist', () => {
  for (const variant of ['default', 'share']) {
    const html = render(fence('title: A\n説明文\n\n- x\n- y'), variant);
    assert.match(html, /<p style="margin:0">説明文<\/p>/);
    assert.match(html, /<ul\b/);
    assert.equal((html.match(/<li\b/g) || []).length, 2);
  }
});

test('render: card task lists retain text without checkbox inputs', () => {
  for (const variant of ['default', 'share']) {
    const html = render(fence('title: A\n- [ ] todo'), variant);
    assert.doesNotMatch(html, /<input\b/);
    assert.match(html, /<li[^>]*>\s*todo<\/li>/);
  }
});

test('render: card lists keep unsafe URLs, images, event attributes and raw HTML out of DOM elements', () => {
  for (const variant of ['default', 'share']) {
    const html = render(fence('title: A\n- [x](javascript:alert(1))\n- ![alt](https://example.com/image.png)\n- <img src=x onerror=alert(1)>\n- <b>x</b>'), variant);
    assert.equal(countCards(html), 1);
    assert.doesNotMatch(html, /<img\b|<b\b/);
    assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
    const tags = html.match(/<[a-z][^>]*>/gi) || [];
    for (const tag of tags) {
      assert.doesNotMatch(tag, /\s+on[^\s=/>]*\s*=/i);
      for (const [, href] of tag.matchAll(/\bhref="([^"]*)"/gi)) assert.doesNotMatch(href, /javascript:/i);
    }
    assert.match(html, />x<\/a>/);
  }
});

const countBreaks = (html) => (html.match(/<br\s*\/?>/g) || []).length;

for (const variant of ['default', 'share']) {
  test(`render: simple card newlines become breaks (${variant})`, () => {
    const html = render(fence('title: A\n1行目\n2行目\n3行目'), variant);
    assert.equal(countBreaks(html), 2, html);
    for (const text of ['1行目', '2行目', '3行目']) assert.ok(html.includes(text), html);
  });

  test(`render: card paragraph breaks coexist with bullets (${variant})`, () => {
    const html = render(fence('title: A\n説明文A\n説明文B\n- 項目A\n- 項目B'), variant);
    const paragraph = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/);
    assert.ok(paragraph, html);
    assert.equal(countBreaks(paragraph[0]), 1, html);
    assert.equal((html.match(/<ul\b/g) || []).length, 1, html);
    assert.equal((html.match(/<li\b/g) || []).length, 2, html);
  });

  test(`render: indented card list continuation becomes a break (${variant})`, () => {
    const html = render(fence('title: A\n- 項目A\n  補足A\n- 項目B'), variant);
    assert.equal((html.match(/<li\b/g) || []).length, 2, html);
    assert.equal(countBreaks(html), 1, html);
    assert.match(html, /<li[^>]*>項目A<br\s*\/?>\s*補足A/);
  });

  test(`render: lazy card list continuation becomes a break (${variant})`, () => {
    const html = render(fence('title: A\n- 項目A\n補足A'), variant);
    assert.equal((html.match(/<li\b/g) || []).length, 1, html);
    assert.equal(countBreaks(html), 1, html);
    assert.match(html, /<li[^>]*>項目A<br\s*\/?>\s*補足A/);
  });

  test(`render: card task list continuation breaks without inputs (${variant})`, () => {
    const html = render(fence('title: A\n- [ ] todo\n  memo'), variant);
    assert.equal(countBreaks(html), 1, html);
    assert.doesNotMatch(html, /<input\b/);
  });

  test(`render: CRLF card newline becomes one break (${variant})`, () => {
    const html = render(fence('title: A\n1行目\n2行目').replace(/\n/g, '\r\n'), variant);
    assert.equal(countCards(html), 1, html);
    assert.equal(countBreaks(html), 1, html);
  });

  test(`render: nested card lists add no breaks (${variant})`, () => {
    const html = render(fence('title: A\n- a\n  - b'), variant);
    assert.equal((html.match(/<ul\b/g) || []).length, 2, html);
    assert.equal((html.match(/<li\b/g) || []).length, 2, html);
    assert.equal(countBreaks(html), 0, html);
  });

  test(`render: inline card code newlines add no breaks (${variant})`, () => {
    const html = render(fence('title: A\n`a\nb` と本文'), variant);
    assert.equal(countBreaks(html), 0, html);
    assert.match(html, /<code[^>]*>a b<\/code>/);
  });

  test(`render: explicit card hard break is not doubled (${variant})`, () => {
    const html = render(fence('title: A\n行末スペース2つ  \n次の行'), variant);
    assert.equal(countBreaks(html), 1, html);
  });

  test(`render: blank card line preserves separate paragraphs (${variant})`, () => {
    const html = render(fence('title: A\n段落A\n\n段落B'), variant);
    assert.equal((html.match(/<p\b/g) || []).length, 2, html);
    assert.equal(countBreaks(html), 0, html);
  });

  test(`render: ordinary markdown newlines add no breaks (${variant})`, () => {
    const html = render('通常本文A\n通常本文B', variant);
    assert.equal(countBreaks(html), 0, html);
  });

  test(`render: only card newlines break in mixed markdown (${variant})`, () => {
    const html = render('外A\n外B\n\n' + fence('title: A\n内A\n内B'), variant);
    assert.equal(countCards(html), 1, html);
    assert.equal(countBreaks(html), 1, html);
    assert.match(html, /外A\n外B<\/p>/);
    assert.match(html, /内A<br\s*\/?>\s*内B/);
  });
}
