import { MODEL_REGISTRY, normalizeModelId } from "@/lib/modelRegistry";
import type { Message } from "@/types";

export type Provider = "claude" | "gemini" | "openai" | "human";

export const PROVIDER_LABELS: Record<Provider, string> = {
  claude: "Claude",
  gemini: "Gemini",
  openai: "ChatGPT",
  human: "あなた",
};

export const PROVIDER_COLORS: Record<Provider, { bg: string; border: string; text: string }> = {
  claude: { bg: "#f0f4ff", border: "#a5b4fc", text: "#3730a3" },
  gemini: { bg: "#f0fdf4", border: "#86efac", text: "#166534" },
  openai: { bg: "#fff7ed", border: "#fdba74", text: "#9a3412" },
  human: { bg: "#fdf4ff", border: "#e9d5ff", text: "#6b21a8" },
};

const NEUTRAL_COLOR = { bg: "#f6f6f2", border: "#d8d8cf", text: "#6b6b63" };

export function getModelDisplayLabel(modelId: string): string {
  const normalizedId = normalizeModelId(modelId);
  // 過去の発言はstatusに関係なく解決する。UI用プレースホルダーは表示しない。
  const model = MODEL_REGISTRY.find((entry) => entry.id === normalizedId);
  return model && model.label !== "(UI非表示)" ? model.label : modelId;
}

export function getMessageDisplayInfo(
  message: Pick<Message, "role" | "provider" | "model_id">,
  fallbackProvider?: string,
): {
  providerLabel: string;
  modelLabel: string | null;
  colorKey: Provider | "neutral";
  color: { bg: string; border: string; text: string };
} {
  if (message.role === "user") {
    return { providerLabel: "You", modelLabel: null, colorKey: "human", color: PROVIDER_COLORS.human };
  }

  const provider = message.provider ?? fallbackProvider;
  const modelLabel = message.model_id ? getModelDisplayLabel(message.model_id) : null;
  if (provider === "claude" || provider === "gemini" || provider === "openai") {
    return { providerLabel: PROVIDER_LABELS[provider], modelLabel, colorKey: provider, color: PROVIDER_COLORS[provider] };
  }
  if (provider === "memo") {
    return { providerLabel: "メモ", modelLabel: null, colorKey: "neutral", color: NEUTRAL_COLOR };
  }
  return {
    providerLabel: provider === "image_gen" ? "画像生成" : "AI",
    modelLabel,
    colorKey: "neutral",
    color: NEUTRAL_COLOR,
  };
}
