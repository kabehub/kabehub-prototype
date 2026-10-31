const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { installTsLoader, installAliasResolver } = require('./testBootstrap.cjs');
installTsLoader({ jsx: true }); installAliasResolver();
const { buildSourceChipModel: model, visibleSourceItems, parseMessageSources } = require('../lib/sourceChips.ts');
const SourceChips = require('../components/SourceChips.tsx').default;
const WebSearchToggle = require('../components/WebSearchToggle.tsx').default;
const { MODEL_REGISTRY } = require('../lib/modelRegistry.ts');
const envelope = items => ({ v: 1, provider: 'claude', items });
const item = (url, title = 'Title', domain = 'FAKE.trusted.example') => ({ url, title, domain });
const render = sources => renderToStaticMarkup(React.createElement(SourceChips, { sources }));

test('SourceChips renders nothing for absent/invalid/empty sources and skips invalid elements', () => {
  for (const sources of [null, undefined, {}, envelope([]), { v: 2, provider: 'claude', items: [] }, envelope([{}, null, item('javascript:alert(1)'), item('data:text/html,x')])]) assert.equal(render(sources), '');
  assert.equal(model(envelope([{}, item('https://valid.example/')])).allItems.length, 1);
  for (const sources of [envelope([item('https://valid.example/')]), { v: 1, provider: 'openai', items: [] }]) assert.ok(parseMessageSources(sources));
  for (const sources of [{ v: 2, items: [] }, { v: 1, provider: 'claude', items: {} }, envelope([{ url: 'url', title: 2, domain: 'domain' }])]) assert.equal(parseMessageSources(sources), undefined);
});
test('domain comes from validated URL, same-domain URLs remain reachable and hidden count counts URLs', () => {
  const sources = envelope([item('https://WWW.untrusted.example/a'), item('https://untrusted.example/b')]);
  const result = model(sources);
  assert.equal(result.chips.length, 1); assert.equal(result.hiddenCount, 1);
  assert.equal(result.chips[0].domain, 'untrusted.example');
  assert.deepEqual(visibleSourceItems(result, false), result.chips);
  assert.deepEqual(visibleSourceItems(result, true).map(row => row.url), sources.items.map(row => new URL(row.url).href));
  const html = render(sources);
  assert.match(html, /\+1/); assert.match(html, /aria-expanded="false"/); assert.match(html, /untrusted\.example/);
  assert.doesNotMatch(html, /FAKE\.trusted/);
});
test('four chips maximum, all valid URLs up to 20 are available after expanding', () => {
  const sources = envelope(Array.from({ length: 24 }, (_, index) => item(`https://site${index}.example/path`)));
  const result = model(sources);
  assert.equal(result.chips.length, 4); assert.equal(result.allItems.length, 20); assert.equal(result.hiddenCount, 16);
  assert.equal(visibleSourceItems(result, true).length, 20);
  assert.equal(visibleSourceItems(result, false).length, 4);
  assert.match(render(sources), /\+16/);
});
test('links use required attributes, no images or HTML injection, and unsafe schemes never render', () => {
  const html = render(envelope([item('https://example.com/', '<script>alert("x")</script>'), item('javascript:alert(1)'), item('data:text/html,<script>x</script>')]));
  assert.match(html, /target="_blank"/); assert.match(html, /rel="noopener noreferrer nofollow"/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script|<img|href="javascript:|href="data:/);
  assert.match(html, /class="not-prose"/);
});
test('toggle keeps preference but disables unsupported/roleplay/loading states and uses the prescribed title', () => {
  for (const props of [{ modelId: 'unknown' }, { modelId: 'claude-sonnet-4-5', available: false }, { modelId: 'claude-sonnet-4-5', disabled: true }]) {
    const html = renderToStaticMarkup(React.createElement(WebSearchToggle, { provider: 'claude', preference: true, onChange() {}, ...props }));
    assert.match(html, /disabled=""/);
    if (props.available === false) assert.match(html, /なりきりモードではWeb検索は使えません/);
    if (props.modelId === 'unknown') assert.match(html, /このモデルはWeb検索に対応していません/);
  }
});

test('both real input UIs show search for Claude/OpenAI, keep thinking Claude-only and preserve order/OFF SSR', () => {
  const Input = require('../components/ChatInput.tsx').default;
  const Centered = require('../components/ChatInputCentered.tsx').default;
  // Even if a client browser has ON saved, the server snapshot must render OFF.
  global.window = { localStorage: { getItem: () => '1' } };
  try {
    for (const Component of [Input, Centered]) for (const provider of ['claude', 'gemini', 'openai']) {
      const props = { provider, value: '', onChange() {}, onSubmit() {}, onMemoSubmit() {}, onProviderChange() {}, isLoading: false };
      const html = renderToStaticMarkup(React.createElement(Component, props));
      assert.equal(html.includes('🌐 Web検索'), provider === 'claude' || provider === 'openai');
      assert.equal(html.includes('🧠 深く考える'), provider === 'claude');
      if (provider === 'claude') assert.ok(html.indexOf('🧠 深く考える') < html.indexOf('🌐 Web検索'));
      if (provider === 'claude' || provider === 'openai') {
        assert.match(html, /aria-pressed="false"/);
        const supportedButton = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]).find(text => text.includes('🌐 Web検索'));
        assert.doesNotMatch(supportedButton, /disabled=""/);
        assert.match(supportedButton, /必要に応じてWebを検索します/);
        const unavailable = renderToStaticMarkup(React.createElement(Component, { ...props, webSearchAvailable: false }));
        const button = [...unavailable.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]).find(text => text.includes('🌐 Web検索'));
        assert.match(button, /disabled=""/);
        assert.match(button, /なりきりモードではWeb検索は使えません/);
      }
    }
  } finally { delete global.window; }
});

test('toggle uses provider/model support and exact titles while preserving preference across disabled states', () => {
  const models = [['claude', 'claude-sonnet-4-5'], ...MODEL_REGISTRY.filter(m => m.kind === 'text' && m.provider === 'openai' && m.features?.webSearch === true).map(m => ['openai', m.id])];
  for (const [provider, modelId] of models) for (const preference of [false, true]) for (const available of [false, true]) for (const disabled of [false, true]) {
    const element = WebSearchToggle({ provider, modelId, preference, available, disabled, onChange() {} });
    assert.equal(element.props.disabled, !available || disabled);
    assert.equal(element.props['aria-pressed'], preference && available);
    assert.equal(element.props.title, available ? 'Web検索: 必要に応じてWebを検索します（トークン消費が増え、応答に時間がかかることがあります）' : 'なりきりモードではWeb検索は使えません');
  }
  for (const [provider, modelId] of [['openai', 'gpt-4o'], ['openai', 'gpt-5.5-pro'], ['openai', 'unknown'], ['gemini', 'gemini-3.8-flash'], ['image_gen', 'gpt-image-2.5-sunburst'], ['unknown', 'gpt-5.4-mini'], ['claude', 'gpt-5.4-mini']]) {
    const props = { provider, modelId, preference: true, onChange() {} };
    const element = WebSearchToggle(props);
    assert.equal(element.props.disabled, true); assert.equal(element.props['aria-pressed'], false);
    assert.equal(element.props.title, 'このモデルはWeb検索に対応していません');
    assert.equal(WebSearchToggle({ ...props, available: false }).props.title, 'なりきりモードではWeb検索は使えません');
    assert.equal(props.preference, true);
  }
});

test('supported Claude/OpenAI toggles call the existing shared preference setter with a boolean', () => {
  for (const [provider, modelId] of [['claude', 'claude-sonnet-4-5'], ['openai', 'gpt-5.4-mini']]) for (const preference of [false, true]) {
    const changes = [];
    WebSearchToggle({ provider, modelId, preference, onChange: value => changes.push(value) }).props.onClick();
    assert.deepEqual(changes, [!preference]); assert.equal(typeof changes[0], 'boolean');
  }
});

test('ChatInput image provider does not show search or thinking', () => {
  const Input = require('../components/ChatInput.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Input, { provider: 'image_gen', value: '', onChange() {}, onSubmit() {}, onMemoSubmit() {}, onProviderChange() {}, isLoading: false }));
  assert.equal(html.includes('🌐 Web検索'), false); assert.equal(html.includes('🧠 深く考える'), false);
});

test('both input provider-switch effects preserve Claude thinking and reset it on OpenAI/Gemini', () => {
  for (const [file, providerName, providers] of [
    ['components/ChatInput.tsx', 'provider', ['claude', 'openai', 'gemini', 'image_gen']],
    ['components/ChatInputCentered.tsx', 'activeProvider', ['claude', 'openai', 'gemini']],
  ]) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const effects = [];
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('setIsDeepThinking(false)') && node.arguments[1]?.getText(ast) === `[${providerName}]`) effects.push(node.arguments[0].getText(ast));
      ts.forEachChild(node, visit);
    }
    visit(ast); assert.equal(effects.length, 1);
    let thinking = true;
    const context = { [providerName]: 'claude', setIsDeepThinking: value => { thinking = value; } };
    vm.runInNewContext(`globalThis.effect = (${effects[0]});`, context);
    for (const provider of providers) {
      context[providerName] = 'claude'; thinking = true; context.effect(); assert.equal(thinking, true);
      context[providerName] = provider; context.effect(); assert.equal(thinking, provider === 'claude', file + '/' + provider);
    }
  }
});

test('MessageBubble displays sources only for non-memo assistants and leaves content untouched', () => {
  const original = Module._load;
  Module._load = function (name, parent, main) {
    if (name === '@/components/Toast') return { useToast: () => ({ showToast() {} }) };
    if (name === '@/lib/supabase/client') return { supabase: {} };
    return original.call(this, name, parent, main);
  };
  let Bubble;
  try { Bubble = require('../components/MessageBubble.tsx').default; } finally { Module._load = original; }
  for (const [role, provider, sources, expected] of [
    ['assistant', 'claude', envelope([item('https://source.example/')]), true],
    ['assistant', 'claude', undefined, false], ['user', 'user', envelope([item('https://source.example/')]), false],
    ['assistant', 'memo', envelope([item('https://source.example/')]), false],
  ]) {
    const html = renderToStaticMarkup(React.createElement(Bubble, { apiKeyStore: {}, message: { id: 'a', role, provider, content: 'Unchanged content', created_at: '2026-10-31', metadata: { sources } } }));
    assert.equal(html.includes('aria-label="出典"'), expected); assert.match(html, /Unchanged content/);
  }
});
