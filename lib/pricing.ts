// lib/pricing.ts
// 料金は USD / 1M tokens (MTok)
// 出典: 各社公式料金ページ（2026年5月時点）

export type ModelPricing = {
  inputPerMTok: number;
  outputPerMTok: number;
};

/**
 * キーは model_id の前方一致で使う（長いキーが優先）。
 * DB に保存される model_id 例:
 *   "claude-sonnet-4-6", "claude-haiku-4-5-20251001",
 *   "gemini/gemini-2.5-flash", "openai/gpt-5.4-mini"
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // ── Claude ──────────────────────────────────────────────
  "claude-fable-5":         { inputPerMTok: 10.00, outputPerMTok: 50.00 },
  "claude-opus-4":          { inputPerMTok: 5.00,  outputPerMTok: 25.00 },
  // ⚠️ claude-sonnet-5 導入価格(〜2026/8/31): $2/$10。2026/9/1以降は $3/$15 に変更すること。
  // getPricing()で日付チェックによる自動切り替えを実装済み。
  "claude-sonnet-5":        { inputPerMTok: 2.00,  outputPerMTok: 10.00 },
  "claude-sonnet-4":        { inputPerMTok: 3.00,  outputPerMTok: 15.00 },
  "claude-haiku-4":         { inputPerMTok: 1.00,  outputPerMTok:  5.00 },
  "claude-haiku-3.5":       { inputPerMTok: 0.80,  outputPerMTok:  4.00 },

  // ── Gemini ──────────────────────────────────────────────
  "gemini-2.5-pro":         { inputPerMTok: 1.25,  outputPerMTok: 10.00 },
  "gemini-2.5-flash-lite":  { inputPerMTok: 0.10,  outputPerMTok:  0.60 },
  "gemini-2.5-flash":       { inputPerMTok: 0.30,  outputPerMTok:  2.50 },
  "gemini-3.5-flash":       { inputPerMTok: 1.50,  outputPerMTok:  9.00 },
  "gemini-3.1-flash-lite":  { inputPerMTok: 0.25,  outputPerMTok:  1.50 },
  "gemini-3.1-flash-image": { inputPerMTok: 0.50,  outputPerMTok: 60.00 },
  "gemini-3-pro-image":     { inputPerMTok: 2.00,  outputPerMTok: 120.00 },

  // ── OpenAI ──────────────────────────────────────────────
  "gpt-5.5":                { inputPerMTok: 5.00,  outputPerMTok: 30.00 },
  "gpt-5.5-pro":            { inputPerMTok: 30.00, outputPerMTok: 180.00 },
  "gpt-5.4-mini":           { inputPerMTok: 0.75,  outputPerMTok:  4.50 },
  "gpt-5.4-nano":           { inputPerMTok: 0.20,  outputPerMTok:  1.25 },
  "gpt-5.4":                { inputPerMTok: 2.50,  outputPerMTok: 15.00 },
  "gpt-5-mini":             { inputPerMTok: 0.25,  outputPerMTok:  2.00 },
  "gpt-5":                  { inputPerMTok: 1.25,  outputPerMTok: 10.00 },
  "gpt-4o-mini":            { inputPerMTok: 0.15,  outputPerMTok:  0.60 },
  "gpt-4o":                 { inputPerMTok: 2.50,  outputPerMTok: 10.00 },

  // ── 画像生成（トークン課金外・/stats では「—」表示）──────────────
  "ideogram-v3":                  { inputPerMTok: 0, outputPerMTok: 0.08 },
  "black-forest-labs/flux.2-pro": { inputPerMTok: 0, outputPerMTok: 0.055 },
};

/** "gemini/" "openai/" "claude/" プレフィックスを除去して正規化 */
function normalizeModelId(modelId: string): string {
  return modelId.replace(/^(gemini|openai|claude)\//, "").toLowerCase();
}

/**
 * model_id に対応する料金を返す。
 * 完全一致 → 前方一致（長いキー優先）の順で探す。見つからなければ null。
 */
export function getPricing(modelId: string): ModelPricing | null {
  const normalized = normalizeModelId(modelId);

  // claude-sonnet-5 は2026-08-31まで導入価格、以降は通常価格
  if (normalized.startsWith("claude-sonnet-5")) {
    return new Date() < new Date("2026-09-01")
      ? { inputPerMTok: 2.00, outputPerMTok: 10.00 }
      : { inputPerMTok: 3.00, outputPerMTok: 15.00 };
  }

  if (MODEL_PRICING[normalized]) return MODEL_PRICING[normalized];

  const match = Object.entries(MODEL_PRICING)
    .filter(([key]) => normalized.startsWith(key))
    .sort((a, b) => b[0].length - a[0].length)[0];

  return match ? match[1] : null;
}

/**
 * トークン数とmodel_idからコスト（USD）を計算。
 * トークンが null（v92以前のデータ）の場合は null を返す。
 */
export function calcCost(
  inputTokens: number | null,
  outputTokens: number | null,
  modelId: string
): number | null {
  if (inputTokens == null || outputTokens == null) return null;
  const pricing = getPricing(modelId);
  if (!pricing) return null;
  return (
    (inputTokens  / 1_000_000) * pricing.inputPerMTok +
    (outputTokens / 1_000_000) * pricing.outputPerMTok
  );
}

/** USD → 表示文字列。0.001 未満は "<$0.001" */
export function formatUSD(usd: number): string {
  if (usd < 0.001) return "<$0.001";
  if (usd < 0.01)  return `$${usd.toFixed(4)}`;
  if (usd < 1)     return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
