import { calcCost } from "@/lib/pricing";

export type StatsMessageRow = {
  id: string;
  role: string;
  provider: string | null;
  model_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
  ai_usage_events?: { id: string }[] | null;
};

export type StatsUsageEventRow = {
  id: string;
  message_id: string | null;
  provider: string;
  model_id: string;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | string | null;
  cost_source: "computed" | "provider_reported" | "unavailable";
  priced_at: string;
};

export type ModelUsageStat = {
  key: string;
  count: number;
  input_tokens: number;
  output_tokens: number;
  cost: number | null;
  priced_count: number;
  unpriced_count: number;
};

export type AggregatedUsageStats = {
  sends: number;
  total_tokens: number;
  cost: number | null;
  priced_count: number;
  unpriced_count: number;
  by_model: ModelUsageStat[];
};

type MutableModelStat = Omit<ModelUsageStat, "key" | "cost"> & { cost: number };

function numericCost(value: number | string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function aggregateUsageStats(
  messages: readonly StatsMessageRow[],
  events: readonly StatsUsageEventRow[],
): AggregatedUsageStats {
  const sends = messages.filter((row) => row.role === "user" && row.provider !== "memo").length;
  const eventMessageIds = new Set(
    events.flatMap((event) => event.message_id ? [event.message_id] : []),
  );
  const modelMap = new Map<string, MutableModelStat>();
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  let pricedCount = 0;
  let unpricedCount = 0;

  const add = (
    key: string,
    inputTokens: number | null,
    outputTokens: number | null,
    cost: number | null,
  ) => {
    const current = modelMap.get(key) ?? {
      count: 0,
      input_tokens: 0,
      output_tokens: 0,
      cost: 0,
      priced_count: 0,
      unpriced_count: 0,
    };
    const input = Math.max(0, inputTokens ?? 0);
    const output = Math.max(0, outputTokens ?? 0);
    current.count += 1;
    current.input_tokens += input;
    current.output_tokens += output;
    totalInput += input;
    totalOutput += output;
    if (cost === null) {
      current.unpriced_count += 1;
      unpricedCount += 1;
    } else {
      current.cost += cost;
      current.priced_count += 1;
      totalCost += cost;
      pricedCount += 1;
    }
    modelMap.set(key, current);
  };

  for (const event of events) {
    const eventCost = event.cost_source === "unavailable"
      ? null
      : numericCost(event.estimated_cost_usd);
    add(
      `${event.provider}/${event.model_id}`,
      event.input_tokens,
      event.output_tokens,
      eventCost,
    );
  }

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const hasRelatedEvent =
      eventMessageIds.has(message.id) ||
      (message.ai_usage_events?.length ?? 0) > 0;
    if (hasRelatedEvent) continue;

    add(
      `${message.provider ?? "unknown"}/${message.model_id ?? "unknown"}`,
      message.input_tokens,
      message.output_tokens,
      calcCost(
        message.input_tokens,
        message.output_tokens,
        message.model_id ?? "unknown",
        new Date(message.created_at),
      ),
    );
  }

  const byModel = Array.from(modelMap.entries())
    .map(([key, value]) => ({
      key,
      count: value.count,
      input_tokens: value.input_tokens,
      output_tokens: value.output_tokens,
      cost: value.priced_count > 0 ? value.cost : null,
      priced_count: value.priced_count,
      unpriced_count: value.unpriced_count,
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return {
    sends,
    total_tokens: totalInput + totalOutput,
    cost: pricedCount > 0 ? totalCost : null,
    priced_count: pricedCount,
    unpriced_count: unpricedCount,
    by_model: byModel,
  };
}
