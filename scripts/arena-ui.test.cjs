const assert = require("node:assert/strict");
const Module = require("node:module");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
let state = [], cursor = 0, sent = [], exportedBlob;
const hooks = {
  ...React,
  useState(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
    if (state[index] === "loading") state[index] = "signedIn";
    return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
  },
  useRef: value => ({ current: value }),
  useEffect() {},
  useMemo: fn => fn(),
  useCallback: fn => fn,
};
const client = { async request(url, init) {
  const body = JSON.parse(init.body); sent.push(body);
  return Response.json({ saved: true, ok: true, message: {
    id: String(sent.length), role: body.mode === "saveHumanMessage" ? "user" : "assistant",
    content: body.content ?? "generated", provider: body.currentProvider ?? "user",
    model_id: body.modelId ?? null, created_at: new Date().toISOString(),
  } });
} };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "react") return hooks;
  if (request.endsWith("/MarkdownRenderer")) return { __esModule: true, default: ({ content }) => React.createElement("p", null, content) };
  if (request.endsWith("/api-client")) return { webApiClient: client, createMobileApiClient: () => client };
  if (request.endsWith("/lib/apiKeyStore")) return { webApiKeyStore: { getKey: async () => null }, mobileApiKeyStore: { getKey: async () => null } };
  if (request.endsWith("/accessTokenProvider")) return { mobileAccessTokenProvider: {} };
  if (request.endsWith("/supabase/client")) return { supabase: {} };
  return originalLoad.call(this, request, parent, isMain);
};
installAliasResolver();
installTsLoader({ jsx: true, transformOutput(output, filename) {
  if (/[\\/]app[\\/]arena[\\/]page.tsx$/.test(filename)) {
    return output.replace('if (phase === "setup")', 'module.exports.controls = { runOneTurn, handleExportMd, handleHumanSubmit, setConfig, setMessages, setWaitingForHuman, setHumanInputText }; if (phase === "setup")');
  }
  return output;
} });
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function select(tree, label) {
  const matches = nodes(tree).filter(node => node.type === "select" && node.props["aria-label"] === label);
  assert.equal(matches.length, 1, label);
  return matches[0];
}
function change(node, value) { node.props.onChange({ target: { value } }); }
global.document = { createElement: () => ({ click() {} }) };
URL.createObjectURL = blob => { exportedBlob = blob; return "blob:test"; };
URL.revokeObjectURL = () => {};
global.alert = message => { throw new Error(message); };

(async () => {
  for (const prefix of ["..", "../apps/mobile"]) {
    state = []; sent = [];
    const page = require(prefix + "/app/arena/page.tsx");
    const { ArenaBubble, getArenaMessageLabel } = require(prefix + "/components/ArenaTimeline.tsx");
    const render = () => { cursor = 0; return page.default(); };
    let tree = render();
    assert.equal(select(tree, "AI 1のモデル").props.value, "claude-sonnet-5");
    change(select(tree, "AI 1のモデル"), "claude-fable-5-1");
    page.controls.setConfig(config => ({ ...config, ai3Enabled: true }));
    tree = render();
    assert.equal(select(tree, "AI 1のモデル").props.value, "claude-fable-5-1");
    assert.ok(nodes(select(tree, "AI 3のモデル")).some(node => node.props?.value === "gpt-6-astra"));
    // Provider changes reset only that slot, including removal for human players.
    for (const slot of [1, 2, 3]) {
      tree = render();
      const modelSelect = select(tree, "AI " + slot + "のモデル");
      const selects = nodes(tree).filter(node => node.type === "select");
      const providerSelect = selects[selects.indexOf(modelSelect) - 1];
      change(providerSelect, "human"); tree = render();
      assert.equal(nodes(tree).filter(node => node.props?.["aria-label"] === "AI " + slot + "のモデル").length, 0);
      change(providerSelect, "openai"); tree = render();
      assert.equal(select(tree, "AI " + slot + "のモデル").props.value, "gpt-5.4-mini");
      change(select(tree, "AI " + slot + "のモデル"), "gpt-6-astra");
      change(providerSelect, "claude"); tree = render();
      assert.equal(select(tree, "AI " + slot + "のモデル").props.value, "claude-sonnet-5");
    }
    const messages = [];
    for (let turn = 0; turn < 13; turn++) {
      const slot = turn % 3;
      const modelId = turn < 6 ? "claude-fable-5-1" : "claude-sonnet-5";
      const result = await page.controls.runOneTurn(messages, { provider: "claude", modelId, prompt: "" }, slot, false, "topic");
      assert.equal(result.message.arenaPlayerIndex, slot);
      assert.equal(sent.at(-1).currentPlayerIndex, slot);
      assert.equal(sent.at(-1).modelId, modelId);
      assert.deepEqual(sent.at(-1).history.map(m => m.playerIndex), messages.slice(-10).map(m => m.arenaPlayerIndex));
      messages.push(result.message);
    }
    assert.equal(sent.at(-1).history.length, 10);
    // Explicit slots survive count changes; legacy messages retain modulo inference.
    for (const count of [3, 2, 3]) {
      for (const message of messages) {
        const html = renderToStaticMarkup(React.createElement(ArenaBubble, {
          message, playerIndex: message.arenaPlayerIndex, aiMessageIndex: 0,
          ai1Label: "Claude", ai2Label: "Claude", ai3Label: "Claude", playerCount: count,
        }));
        assert.ok(html.includes("(AI" + (message.arenaPlayerIndex + 1) + ")"));
        assert.ok(html.includes(message.model_id === "claude-fable-5-1" ? "Fable 5.1" : "Sonnet 5"));
      }
    }
    assert.equal(getArenaMessageLabel({ model_id: null }, "Gemini"), "Gemini");
    assert.equal(getArenaMessageLabel({ model_id: "unknown-model" }, "Claude"), "Claude / unknown-model");
    const legacyHtml = renderToStaticMarkup(React.createElement(ArenaBubble, {
      message: { role: "assistant", content: "legacy", provider: "claude" },
      aiMessageIndex: 4, ai1Label: "Claude", ai2Label: "Gemini", playerCount: 3,
    }));
    assert.ok(legacyHtml.includes("Gemini (AI2)"));
    page.controls.setMessages(messages);
    page.controls.setWaitingForHuman(2);
    page.controls.setHumanInputText("human reply");
    render(); await page.controls.handleHumanSubmit();
    page.controls.setConfig(config => ({ ...config, ai3Enabled: false }));
    render(); page.controls.handleExportMd();
    const markdown = await exportedBlob.text();
    assert.ok(markdown.includes("Claude / Fable 5.1"));
    assert.ok(markdown.includes("Claude / Sonnet 5"));
    assert.ok(markdown.includes("[Human (AI3)] human reply"));
    console.log("ok - arena UI, payload, slots and export: " + prefix);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
