import type { serviceRoleClient } from "@/lib/mcp-auth";
import {
  CLAUDE_CACHE_READ_MULTIPLIER,
  CLAUDE_CACHE_WRITE_MULTIPLIER,
  GEMINI_CACHE_READ_MULTIPLIER,
  getPricing,
  OPENAI_CACHE_WRITE_MULTIPLIER,
  resolveImageModel,
  supportsOpenAICacheWrite,
} from "@/lib/modelRegistry";
import * as logger from "@/lib/logger";

export type UsageProvider = "claude" | "gemini" | "openai" | "ideogram" | "openrouter";
export type UsageRequestType = "chat" | "image_gen" | "novel_check";
export type UsageCostSource = "computed" | "provider_reported" | "unavailable";
export type UsageEventStatus = "completed" | "aborted" | "failed";

export type UsageEventParams = {
  id: string;
  userId: string;
  threadId: string | null;
  messageId: string | null;
  provider: UsageProvider;
  modelId: string;
  requestType: UsageRequestType;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheCreationInputTokens?: number | null;
  cacheReadInputTokens?: number | null;
  cacheWriteInputTokens?: number | null;
  cachedInputTokens?: number | null;
  imageCount?: number | null;
  estimatedCostUsd: number | null;
  costSource: UsageCostSource;
  status: UsageEventStatus;
  pricedAt: Date;
};

export type TextUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheCreationInputTokens?: number | null;
  cacheReadInputTokens?: number | null;
  cacheWriteInputTokens?: number | null;
  cachedInputTokens?: number | null;
};

export type ImageUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  textInputTokens?: number | null;
  imageInputTokens?: number | null;
  cachedImageInputTokens?: number | null;
  textOutputTokens?: number | null;
  imageOutputTokens?: number | null;
  imageCount?: number | null;
  providerReportedCostUsd?: number | null;
};

export type UsageCost = {
  estimatedCostUsd: number | null;
  costSource: UsageCostSource;
};

const perMTok = (tokens: number, usdPerMTok: number): number =>
  (tokens / 1_000_000) * usdPerMTok;

function hasAnyToken(usage: TextUsage): boolean {
  return [
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheCreationInputTokens,
    usage.cacheReadInputTokens,
    usage.cacheWriteInputTokens,
    usage.cachedInputTokens,
  ].some((value) => value != null);
}

export function calculateTextUsageCost(
  provider: "claude" | "gemini" | "openai",
  modelId: string,
  usage: TextUsage,
  pricedAt: Date,
): UsageCost {
  if (!hasAnyToken(usage)) {
    return { estimatedCostUsd: null, costSource: "unavailable" };
  }

  const tier = getPricing(modelId, pricedAt, usage.inputTokens ?? undefined);
  if (!tier) {
    return { estimatedCostUsd: null, costSource: "unavailable" };
  }

  const inputTokens = Math.max(0, usage.inputTokens ?? 0);
  const outputTokens = Math.max(0, usage.outputTokens ?? 0);
  let cost = perMTok(outputTokens, tier.outputPerMTok);

  if (provider === "claude") {
    cost += perMTok(inputTokens, tier.inputPerMTok);
    cost += perMTok(
      Math.max(0, usage.cacheCreationInputTokens ?? 0),
      tier.inputPerMTok * CLAUDE_CACHE_WRITE_MULTIPLIER,
    );
    cost += perMTok(
      Math.max(0, usage.cacheReadInputTokens ?? 0),
      tier.inputPerMTok * CLAUDE_CACHE_READ_MULTIPLIER,
    );
  } else if (provider === "gemini") {
    const cachedTokens = Math.max(0, usage.cacheReadInputTokens ?? 0);
    const normalInputTokens = Math.max(0, inputTokens - cachedTokens);
    cost += perMTok(normalInputTokens, tier.inputPerMTok);
    cost += perMTok(cachedTokens, tier.inputPerMTok * GEMINI_CACHE_READ_MULTIPLIER);
  } else {
    const cachedTokens = Math.max(0, usage.cachedInputTokens ?? 0);
    const cacheWriteTokens = supportsOpenAICacheWrite(modelId)
      ? Math.max(0, usage.cacheWriteInputTokens ?? 0)
      : 0;
    if (cachedTokens > 0 && tier.cachedInputPerMTok === undefined) {
      return { estimatedCostUsd: null, costSource: "unavailable" };
    }
    const normalInputTokens = Math.max(0, inputTokens - cachedTokens - cacheWriteTokens);
    cost += perMTok(normalInputTokens, tier.inputPerMTok);
    cost += perMTok(cachedTokens, tier.cachedInputPerMTok ?? 0);
    cost += perMTok(
      cacheWriteTokens,
      tier.inputPerMTok * OPENAI_CACHE_WRITE_MULTIPLIER,
    );
  }

  return { estimatedCostUsd: cost, costSource: "computed" };
}

export function calculateImageUsageCost(modelId: string, usage: ImageUsage): UsageCost {
  const model = resolveImageModel(modelId);
  if (!model) return { estimatedCostUsd: null, costSource: "unavailable" };

  const pricing = model.imagePricing;
  if (pricing.kind === "provider_reported") {
    const reported = usage.providerReportedCostUsd;
    return typeof reported === "number" && Number.isFinite(reported) && reported >= 0
      ? { estimatedCostUsd: reported, costSource: "provider_reported" }
      : { estimatedCostUsd: null, costSource: "unavailable" };
  }

  if (pricing.kind === "per_image") {
    const imageCount = usage.imageCount;
    return typeof imageCount === "number" && imageCount > 0
      ? { estimatedCostUsd: pricing.usdPerImage * imageCount, costSource: "computed" }
      : { estimatedCostUsd: null, costSource: "unavailable" };
  }

  const modalityValues = [
    usage.textInputTokens,
    usage.imageInputTokens,
    usage.cachedImageInputTokens,
    usage.textOutputTokens,
    usage.imageOutputTokens,
  ];
  if (!modalityValues.some((value) => value != null)) {
    return { estimatedCostUsd: null, costSource: "unavailable" };
  }
  if (
    (usage.inputTokens ?? 0) > 0 &&
    usage.textInputTokens == null &&
    usage.imageInputTokens == null
  ) {
    return { estimatedCostUsd: null, costSource: "unavailable" };
  }
  if (
    (usage.outputTokens ?? 0) > 0 &&
    usage.textOutputTokens == null &&
    usage.imageOutputTokens == null
  ) {
    return { estimatedCostUsd: null, costSource: "unavailable" };
  }

  const positiveTokensMissingRate = (
    tokens: number | null | undefined,
    rate: number | undefined,
  ) => (tokens ?? 0) > 0 && rate === undefined;
  if (
    positiveTokensMissingRate(usage.textInputTokens, pricing.textInputPerMTok) ||
    positiveTokensMissingRate(usage.imageInputTokens, pricing.imageInputPerMTok) ||
    positiveTokensMissingRate(usage.cachedImageInputTokens, pricing.cachedImageInputPerMTok) ||
    positiveTokensMissingRate(usage.textOutputTokens, pricing.textOutputPerMTok) ||
    positiveTokensMissingRate(usage.imageOutputTokens, pricing.imageOutputPerMTok)
  ) {
    return { estimatedCostUsd: null, costSource: "unavailable" };
  }

  const cachedImageTokens = Math.max(0, usage.cachedImageInputTokens ?? 0);
  const normalImageTokens = Math.max(0, (usage.imageInputTokens ?? 0) - cachedImageTokens);
  const cost =
    perMTok(Math.max(0, usage.textInputTokens ?? 0), pricing.textInputPerMTok ?? 0) +
    perMTok(normalImageTokens, pricing.imageInputPerMTok ?? 0) +
    perMTok(cachedImageTokens, pricing.cachedImageInputPerMTok ?? 0) +
    perMTok(Math.max(0, usage.textOutputTokens ?? 0), pricing.textOutputPerMTok ?? 0) +
    perMTok(Math.max(0, usage.imageOutputTokens ?? 0), pricing.imageOutputPerMTok ?? 0);

  return { estimatedCostUsd: cost, costSource: "computed" };
}

export async function recordUsageEvent(
  supabase: ReturnType<typeof serviceRoleClient>,
  params: UsageEventParams,
): Promise<boolean> {
  try {
    const { error } = await supabase.from("ai_usage_events").upsert({
      id: params.id,
      user_id: params.userId,
      thread_id: params.threadId,
      message_id: params.messageId,
      provider: params.provider,
      model_id: params.modelId,
      request_type: params.requestType,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      cache_creation_input_tokens: params.cacheCreationInputTokens ?? null,
      cache_read_input_tokens: params.cacheReadInputTokens ?? null,
      cache_write_input_tokens: params.cacheWriteInputTokens ?? null,
      cached_input_tokens: params.cachedInputTokens ?? null,
      image_count: params.imageCount ?? null,
      estimated_cost_usd: params.estimatedCostUsd,
      cost_source: params.costSource,
      status: params.status,
      priced_at: params.pricedAt.toISOString(),
    }, { onConflict: "id" });

    if (error) {
      logger.dbOperationFailed({
        route: "ai-usage",
        operation: "upsert-usage-event",
        table: "ai_usage_events",
        errorCode: error.code,
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.dbOperationFailed({
      route: "ai-usage",
      operation: "upsert-usage-event",
      table: "ai_usage_events",
      errorType: err instanceof Error ? err.name : "unknown",
    });
    return false;
  }
}
