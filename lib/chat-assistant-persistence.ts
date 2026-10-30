import { withSources, type MessageSources } from "@kabehub/shared";
import type { UsageEventStatus } from "@/lib/aiUsage";

export type AssistantSnapshot = {
  content: string;
  provider: string;
  model_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  metadata: Record<string, unknown> | null;
};

export function resolveAssistantPersistence(input: {
  isLightRegenerate: boolean;
  status: UsageEventStatus;
  original: AssistantSnapshot | null;
  accumulatedText: string;
  usedProvider: string;
  resolvedModelId: string;
  usage: { input_tokens: number | null; output_tokens: number | null };
  sources: MessageSources | undefined;
}): Omit<AssistantSnapshot, "metadata"> & { metadata?: Record<string, unknown> | null } {
  const { isLightRegenerate, status, original, accumulatedText, usedProvider, resolvedModelId, usage, sources } = input;
  if (isLightRegenerate && status !== "completed" && original) return { ...original };
  return {
    content: accumulatedText,
    provider: usedProvider,
    model_id: resolvedModelId,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    ...(isLightRegenerate
      ? { metadata: withSources(original?.metadata, sources) }
      : sources ? { metadata: { sources } } : {}),
  };
}

export function shouldEmitCitations(input: {
  aborted: boolean;
  isLightRegenerate: boolean;
  status: UsageEventStatus;
}): boolean {
  return !input.aborted && !(input.isLightRegenerate && input.status !== "completed");
}
