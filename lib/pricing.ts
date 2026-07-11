// lib/pricing.ts
// 料金は USD / 1M tokens (MTok)
// getPricing の実体は lib/modelRegistry.ts に一元化（T6でregistry化）

import { getPricing } from "@/lib/modelRegistry";

export type { ModelPricing } from "@/lib/modelRegistry";
export { getPricing };

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
