// scripts/pricing.test.cjs
// T6完了後の lib/pricing.ts（registry re-export後）の挙動を検証する。
//
// 実行方法: node scripts/pricing.test.cjs
//
// 共通のテストbootstrapでTypeScriptをその場コンパイルしてrequireする。

const assert = require("node:assert/strict");
const { installAliasResolver, installTsLoader } = require("./testBootstrap.cjs");

// "@/xxx" エイリアスの解決（lib/pricing.ts自体は@/を使わないが、既存テストとの方式統一のため用意）
installTsLoader();
installAliasResolver();

const { getPricing, calcCost, formatUSD } = require("../lib/pricing.ts");

// ────────────────────────────────────────────────────────────
// 完全一致
// ────────────────────────────────────────────────────────────
assert.deepEqual(getPricing("gpt-4o"), { inputPerMTok: 2.5, outputPerMTok: 10.0 });
assert.deepEqual(getPricing("gemini-2.5-pro"), { inputPerMTok: 1.25, outputPerMTok: 10.0 });
assert.deepEqual(getPricing("claude-opus-5"), { inputPerMTok: 5.0, outputPerMTok: 25.0 });
assert.deepEqual(getPricing("ideogram-v3"), { inputPerMTok: 0, outputPerMTok: 0.08 });
assert.deepEqual(getPricing("black-forest-labs/flux.2-pro"), { inputPerMTok: 0, outputPerMTok: 0.055 });

// ────────────────────────────────────────────────────────────
// 前方一致・長いキー優先
// ────────────────────────────────────────────────────────────
// "gpt-5.4-mini" (0.75/4.50) vs "gpt-5.4" (2.50/15.00) → 長い方が勝つ
assert.deepEqual(getPricing("gpt-5.4-mini-preview"), { inputPerMTok: 0.75, outputPerMTok: 4.5 });
// "gpt-5-mini" (0.25/2.00) vs "gpt-5" (1.25/10.00) → 長い方が勝つ
assert.deepEqual(getPricing("gpt-5-mini-2026"), { inputPerMTok: 0.25, outputPerMTok: 2.0 });
// "gpt-5.4-nano" (0.20/1.25) vs "gpt-5.4" vs "gpt-5" の三つ巴 → 最長が勝つ
assert.deepEqual(getPricing("gpt-5.4-nano-x"), { inputPerMTok: 0.2, outputPerMTok: 1.25 });
// "claude-opus-4" (5.00/25.00) が新モデルにもマッチする現行仕様（短縮キー前方一致の事故ポイント）
assert.deepEqual(getPricing("claude-opus-4-8"), { inputPerMTok: 5.0, outputPerMTok: 25.0 });
assert.deepEqual(getPricing("claude-opus-4-7"), { inputPerMTok: 5.0, outputPerMTok: 25.0 });
// "claude-haiku-4" と "claude-haiku-3.5" は互いに前方一致しないため競合しないが、
// 「4-5-...」のような新IDが誤って3.5側に落ちないことを確認
assert.deepEqual(getPricing("claude-haiku-4-5-20251001"), { inputPerMTok: 1.0, outputPerMTok: 5.0 });
assert.deepEqual(getPricing("claude-haiku-3.5-turbo"), { inputPerMTok: 0.8, outputPerMTok: 4.0 });

// ────────────────────────────────────────────────────────────
// prefix正規化（gemini/ openai/ claude/ の除去＋小文字化）
// ────────────────────────────────────────────────────────────
assert.deepEqual(getPricing("gemini/gemini-2.5-flash"), { inputPerMTok: 0.3, outputPerMTok: 2.5 });
assert.deepEqual(getPricing("openai/gpt-5.4-mini"), { inputPerMTok: 0.75, outputPerMTok: 4.5 });
assert.deepEqual(getPricing("claude/claude-sonnet-4-6"), { inputPerMTok: 3.0, outputPerMTok: 15.0 });
// prefixが小文字である限り、続く部分の大文字は正しく小文字化される
assert.deepEqual(getPricing("openai/GPT-4O-MINI"), { inputPerMTok: 0.15, outputPerMTok: 0.6 });

// ⚠️ 既知の現状挙動（意図的なバグかは不明・T0では変更せず固定するのみ）:
// normalizeModelIdの正規表現 /^(gemini|openai|claude)\// は大文字小文字を区別しないフラグ(i)が無いため、
// prefix部分自体が大文字だとstripされない。結果 "openai/..." が残ったまま小文字化されるだけになり、
// MODEL_PRICINGのどのキーとも一致せず null が返る。
assert.equal(getPricing("OpenAI/gpt-4o-mini"), null);

// ────────────────────────────────────────────────────────────
// 該当なし
// ────────────────────────────────────────────────────────────
assert.equal(getPricing("unknown-model-xyz"), null);

// registry化に伴う意図的な挙動変更（S24 T6・案B採用）:
// gemini-2.5-flash-image は画像生成モデルのためトークン課金のpricingを持たない。
// 旧実装ではMODEL_PRICINGに専用エントリが無く、前方一致でgemini-2.5-flashの
// 単価($0.30/$2.50)に誤ってヒットしていた。T1のregistryでpricing:[]として
// 完全一致→終端させることで、この誤ヒットを解消した。
assert.equal(getPricing("gemini-2.5-flash-image"), null);
assert.equal(getPricing("gemini/gemini-2.5-flash-image"), null);

// ────────────────────────────────────────────────────────────
// claude-sonnet-5 の日付分岐（now引数を明示して実行日に依存させない）
// ────────────────────────────────────────────────────────────
const introPriceEnd = new Date("2026-08-31T23:59:59.999Z");
const regularPriceStart = new Date("2026-09-01T00:00:00.000Z");
assert.deepEqual(getPricing("claude-sonnet-5", introPriceEnd), { inputPerMTok: 2.0, outputPerMTok: 10.0 });
assert.deepEqual(getPricing("claude-sonnet-5-20260615", introPriceEnd), { inputPerMTok: 2.0, outputPerMTok: 10.0 });
assert.deepEqual(getPricing("claude-sonnet-5", regularPriceStart), { inputPerMTok: 3.0, outputPerMTok: 15.0 });
assert.deepEqual(getPricing("claude-sonnet-5-20260615", regularPriceStart), { inputPerMTok: 3.0, outputPerMTok: 15.0 });

// ────────────────────────────────────────────────────────────
// calcCost
// ────────────────────────────────────────────────────────────
assert.equal(calcCost(null, 100, "gpt-4o"), null); // v92以前データ（inputTokens null）
assert.equal(calcCost(100, null, "gpt-4o"), null); // v92以前データ（outputTokens null）
assert.equal(calcCost(1_000_000, 1_000_000, "gpt-4o"), 12.5); // (1*2.5)+(1*10.0)
assert.equal(calcCost(100, 100, "unknown-model-xyz"), null); // pricing不明
// getPricingの後方互換探索（prefix除去→長いキー優先）を経由したエンドツーエンド確認:
// "openai/" 除去 → "gpt-5.4-mini-preview" → 前方一致で "gpt-5.4-mini"（$0.75/$4.50）が
// "gpt-5.4"（$2.50/$15.00）より優先される → (1*0.75)+(1*4.50) = 5.25
assert.equal(calcCost(1_000_000, 1_000_000, "openai/gpt-5.4-mini-preview"), 5.25);

// ────────────────────────────────────────────────────────────
// formatUSD
// ────────────────────────────────────────────────────────────
assert.equal(formatUSD(0.0009), "<$0.001");
assert.equal(formatUSD(0.005), "$0.0050");
assert.equal(formatUSD(0.5), "$0.500");
assert.equal(formatUSD(5), "$5.00");

console.log("pricing tests passed");
