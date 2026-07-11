// scripts/loadModel.test.cjs
// T0: components/ChatInput.tsx の loadModel/saveModel/MODEL_CONFIG/Thinking判定の
// 現状挙動を焼き付ける特性化テスト。
// プロダクションコード（components/ChatInput.tsx）は一切変更しない。
//
// 実行方法: node scripts/loadModel.test.cjs
//
// components/ChatInput.tsx の実行時importはReactのみで、Reactはpackage.jsonの
// dependenciesに存在する。@/typesはすべて import type / export type のため
// transpile時に消去され、実行時のrequire対象にはならない。
// Image/document/URL/FileReader/localStorage等のブラウザAPI参照は compressImage()・
// readFileWithFallback()・loadModel()・saveModel()・default export の ChatInput
// コンポーネント本体など、いずれも関数の中にあり、モジュール初期化時には実行されない。
// 本テストは ChatInput コンポーネントやブラウザAPI依存関数（compressImage等）を
// 一切呼び出さず、export済みの純粋な定数・関数（loadModel/saveModel/MODEL_CONFIG/
// THINKING_UNSUPPORTED_MODELS等）だけを検証する。

const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");

const rootDir = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(rootDir, request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

function compileTsx(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2018,
      esModuleInterop: true,
      // ChatInput()コンポーネント本体は呼び出さないため変換方式は動作に影響しないが、
      // react/jsx-runtime経由の変換（ReactJSX）の方が「未importのReactグローバル」に
      // 依存せず将来的なトップレベルJSX定数の追加にも耐性があるためこちらを採用
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
}
require.extensions[".ts"] = compileTsx;
require.extensions[".tsx"] = compileTsx;

const {
  loadModel,
  saveModel,
  MODEL_CONFIG,
  THINKING_UNSUPPORTED_MODELS,
  isThinkingUnsupported,
  canUseDeepThinking,
} = require("../components/ChatInput.tsx");

function makeMockLocalStorage() {
  const store = {};
  return {
    store,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v;
    },
  };
}

// ────────────────────────────────────────────────────────────
// ① SSR相当（windowが存在しない状態）
// ────────────────────────────────────────────────────────────
assert.equal(typeof window, "undefined");
assert.equal(loadModel("claude"), MODEL_CONFIG.claude.defaultModel);
assert.equal(loadModel("gemini"), MODEL_CONFIG.gemini.defaultModel);
assert.equal(loadModel("openai"), MODEL_CONFIG.openai.defaultModel);
assert.equal(loadModel("image_gen"), MODEL_CONFIG.image_gen.defaultModel);

// ────────────────────────────────────────────────────────────
// ② window/localStorageを用意したうえでの妥当性検証つきフォールバック
// ────────────────────────────────────────────────────────────
global.window = {};
global.localStorage = makeMockLocalStorage();

// LSが空 → デフォルト
assert.equal(loadModel("claude"), MODEL_CONFIG.claude.defaultModel);

// LSに現在の一覧に存在しない値（廃止/改名されたID）→ デフォルトへフォールバック
global.localStorage.setItem(MODEL_CONFIG.claude.lsKey, "claude-old-model");
assert.equal(loadModel("claude"), MODEL_CONFIG.claude.defaultModel);

// LSに有効な値 → その値がそのまま返る
global.localStorage.setItem(MODEL_CONFIG.claude.lsKey, "claude-opus-4-8");
assert.equal(loadModel("claude"), "claude-opus-4-8");

// providerごとに独立したLSキーで管理されている
global.localStorage.setItem(MODEL_CONFIG.gemini.lsKey, "gemini-3.5-flash");
assert.equal(loadModel("gemini"), "gemini-3.5-flash");
assert.equal(loadModel("claude"), "claude-opus-4-8"); // 他providerの変更に影響されない

// ────────────────────────────────────────────────────────────
// saveModel
// ────────────────────────────────────────────────────────────
saveModel("openai", "gpt-5.5-pro");
assert.equal(global.localStorage.store[MODEL_CONFIG.openai.lsKey], "gpt-5.5-pro");
assert.equal(loadModel("openai"), "gpt-5.5-pro");

// ────────────────────────────────────────────────────────────
// MODEL_CONFIG スナップショット（registry移行時の意図しない値変化を検出するための固定）
// defaultModel / lsKey
// ────────────────────────────────────────────────────────────
assert.equal(MODEL_CONFIG.claude.defaultModel, "claude-sonnet-4-5");
assert.equal(MODEL_CONFIG.claude.lsKey, "kabehub_claude_model");
assert.equal(MODEL_CONFIG.gemini.defaultModel, "gemini-2.5-flash");
assert.equal(MODEL_CONFIG.gemini.lsKey, "kabehub_gemini_model");
assert.equal(MODEL_CONFIG.openai.defaultModel, "gpt-5.4-mini");
assert.equal(MODEL_CONFIG.openai.lsKey, "kabehub_openai_model");
assert.equal(MODEL_CONFIG.image_gen.defaultModel, "gpt-image-2");
assert.equal(MODEL_CONFIG.image_gen.lsKey, "kabehub_image_provider");

// ────────────────────────────────────────────────────────────
// MODEL_CONFIG スナップショット（全4provider・ID・表示順を固定）
// registry移行(T3)でMODEL_CONFIGがregistry由来に載せ替わった際、
// モデルの欠落・順序入れ替わりを検知するための安全網
// ────────────────────────────────────────────────────────────
const modelIdsByProvider = Object.fromEntries(
  Object.entries(MODEL_CONFIG).map(([provider, config]) => [
    provider,
    config.models.map((model) => model.id),
  ])
);

assert.deepEqual(modelIdsByProvider, {
  claude: [
    "claude-fable-5",
    "claude-sonnet-5",
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-5",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
  ],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3.5-flash", "gemini-3.1-flash-lite"],
  openai: ["gpt-4o", "gpt-5.4-mini", "gpt-5.4", "gpt-5.5", "gpt-5.5-pro"],
  image_gen: [
    "gpt-image-2",
    "gemini-2.5-flash-image",
    "ideogram-v3",
    "black-forest-labs/flux.2-pro",
  ],
});

// ────────────────────────────────────────────────────────────
// Extended Thinking 非対応判定
// ────────────────────────────────────────────────────────────
assert.deepEqual(
  [...THINKING_UNSUPPORTED_MODELS].sort(),
  ["claude-fable-5", "claude-haiku-4-5-20251001", "claude-sonnet-5"].sort()
);
assert.equal(isThinkingUnsupported("claude-haiku-4-5-20251001"), true);
assert.equal(isThinkingUnsupported("claude-fable-5"), true);
assert.equal(isThinkingUnsupported("claude-sonnet-5"), true);
assert.equal(isThinkingUnsupported("claude-opus-4-8"), false);
assert.equal(isThinkingUnsupported("claude-sonnet-4-5"), false);

assert.equal(canUseDeepThinking("claude", "claude-opus-4-8"), true);
assert.equal(canUseDeepThinking("claude", "claude-sonnet-5"), false); // Thinking非対応3モデルの一つ
assert.equal(canUseDeepThinking("claude", "claude-fable-5"), false);
assert.equal(canUseDeepThinking("claude", "claude-haiku-4-5-20251001"), false);
assert.equal(canUseDeepThinking("gemini", "claude-opus-4-8"), false); // provider不一致（claude以外は常にfalse）

console.log("loadModel tests passed");

// ⚠️ 未カバー・既知の重複（コードコメントとして記録。registry化(T1)で解消予定）:
// JSX内の「深く考える」ボタンのtitle文言分岐は THINKING_UNSUPPORTED_MODELS とは別に
// モデルIDが直接3回ハードコードされており（selectedModel === "claude-haiku-4-5-20251001" 等）、
// ChatInput()コンポーネント本体（未呼び出し）の中にあるため本テストでは検証できない。
// 目視確認: 3つのIDが THINKING_UNSUPPORTED_MODELS の集合と一致していること（現状は一致している）。
