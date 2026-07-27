// モデル台帳。T1時点では既存コードから参照されない純粋データ＋関数。

export type TextProvider = "claude" | "gemini" | "openai";
export type UIProvider = TextProvider | "image_gen";
export type ImageApiProvider = "openai" | "gemini" | "ideogram" | "openrouter";
export type ModelStatus = "active" | "hidden" | "deprecated" | "retired";
export type ModelId = string;

export type ModelPricing = {
  inputPerMTok: number;
  outputPerMTok: number;
};

export type PricingRule = ModelPricing & {
  from?: string;
  note?: string;
};

type ModelSurface = { chat: boolean; arena: boolean };
type ThinkingConfig =
  | { control: "unsupported" }
  | { control: "always_on"; note?: string }
  | { control: "toggleable"; requestType: "adaptive" | "enabled"; defaultOn: boolean; note?: string };

export type TextModelDef = {
  kind: "text";
  id: ModelId;
  provider: TextProvider;
  label: string;
  badge: string;
  status: ModelStatus;
  surfaces: ModelSurface;
  thinking: ThinkingConfig;
  pricing: PricingRule[];
};

export type ImageModelDef = {
  kind: "image";
  id: ModelId;
  provider: "image_gen";
  apiProvider: ImageApiProvider;
  label: string;
  badge: string;
  status: ModelStatus;
  img2img: boolean;
  pricing: PricingRule[];
};

export type ModelDef = TextModelDef | ImageModelDef;

const price = (inputPerMTok: number, outputPerMTok: number): PricingRule[] => [
  { inputPerMTok, outputPerMTok },
];

export const MODEL_REGISTRY = [
  { kind: "text", id: "claude-fable-5", provider: "claude", label: "Fable 5", badge: "最高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "always_on", note: "Fable 5はAdaptive Thinkingが自動適用されます" }, pricing: price(10.00, 50.00) },
  { kind: "text", id: "claude-sonnet-5", provider: "claude", label: "Sonnet 5", badge: "新標準", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "toggleable", requestType: "adaptive", defaultOn: true, note: "Sonnet 5はAdaptive Thinkingが標準で有効です" }, pricing: [
    { inputPerMTok: 2.00, outputPerMTok: 10.00, note: "導入価格" },
    { from: "2026-09-01T00:00:00.000Z", inputPerMTok: 3.00, outputPerMTok: 15.00 },
  ] },
  { kind: "text", id: "claude-opus-5", provider: "claude", label: "Opus 5", badge: "最高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "toggleable", requestType: "adaptive", defaultOn: true, note: "Opus 5はAdaptive Thinkingが標準で有効です" }, pricing: price(5.00, 25.00) },
  { kind: "text", id: "claude-opus-4-8", provider: "claude", label: "Opus 4.8", badge: "高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "toggleable", requestType: "adaptive", defaultOn: false }, pricing: price(5.00, 25.00) },
  { kind: "text", id: "claude-opus-4-7", provider: "claude", label: "Opus 4.7", badge: "高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "toggleable", requestType: "adaptive", defaultOn: false }, pricing: price(5.00, 25.00) },
  { kind: "text", id: "claude-opus-4-6", provider: "claude", label: "Opus 4.6", badge: "高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "toggleable", requestType: "adaptive", defaultOn: false }, pricing: price(5.00, 25.00) },
  { kind: "text", id: "claude-sonnet-4-5", provider: "claude", label: "Sonnet 4.5", badge: "標準", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "toggleable", requestType: "enabled", defaultOn: false }, pricing: price(3.00, 15.00) },
  { kind: "text", id: "claude-sonnet-4-6", provider: "claude", label: "Sonnet 4.6", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "toggleable", requestType: "adaptive", defaultOn: false }, pricing: price(3.00, 15.00) },
  { kind: "text", id: "claude-haiku-4-5-20251001", provider: "claude", label: "Haiku 4.5", badge: "軽量・爆速", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "toggleable", requestType: "enabled", defaultOn: false }, pricing: price(1.00, 5.00) },

  { kind: "text", id: "gemini-2.5-flash", provider: "gemini", label: "2.5 Flash", badge: "標準", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(0.30, 2.50) },
  { kind: "text", id: "gemini-2.5-pro", provider: "gemini", label: "2.5 Pro", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(1.25, 10.00) },
  { kind: "text", id: "gemini-3.5-flash", provider: "gemini", label: "3.5 Flash", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(1.50, 9.00) },
  { kind: "text", id: "gemini-3.1-flash-lite", provider: "gemini", label: "3.1 Flash Lite", badge: "軽量・爆速", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(0.25, 1.50) },
  { kind: "text", id: "gemini-3.6-flash", provider: "gemini", label: "3.6 Flash", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(1.50, 7.50) },
  { kind: "text", id: "gemini-3.5-flash-lite", provider: "gemini", label: "3.5 Flash Lite", badge: "軽量・爆速", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(0.30, 2.50) },

  { kind: "text", id: "gpt-4o", provider: "openai", label: "GPT-4o", badge: "旧世代", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(2.50, 10.00) },
  { kind: "text", id: "gpt-5.4-mini", provider: "openai", label: "GPT-5.4 mini", badge: "標準", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(0.75, 4.50) },
  { kind: "text", id: "gpt-5.4", provider: "openai", label: "GPT-5.4", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(2.50, 15.00) },
  { kind: "text", id: "gpt-5.5", provider: "openai", label: "GPT-5.5", badge: "最高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(5.00, 30.00) },
  { kind: "text", id: "gpt-5.5-pro", provider: "openai", label: "GPT-5.5 Pro", badge: "最上位", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(30.00, 180.00) },
  { kind: "text", id: "gpt-5.6-sol", provider: "openai", label: "GPT-5.6 Sol", badge: "最高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(5.00, 30.00) },
  { kind: "text", id: "gpt-5.6-terra", provider: "openai", label: "GPT-5.6 Terra", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(2.50, 15.00) },
  { kind: "text", id: "gpt-5.6-luna", provider: "openai", label: "GPT-5.6 Luna", badge: "軽量・爆速", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(1.00, 6.00) },

  { kind: "image", id: "gpt-image-2", provider: "image_gen", apiProvider: "openai", label: "GPT Image 2", badge: "OpenAI", status: "active", img2img: false, pricing: [] },
  { kind: "image", id: "gemini-2.5-flash-image", provider: "image_gen", apiProvider: "gemini", label: "Gemini Image", badge: "Google", status: "active", img2img: true, pricing: [] },
  { kind: "image", id: "ideogram-v3", provider: "image_gen", apiProvider: "ideogram", label: "Ideogram V3", badge: "Ideogram", status: "active", img2img: true, pricing: price(0, 0.08) },
  { kind: "image", id: "black-forest-labs/flux.2-pro", provider: "image_gen", apiProvider: "openrouter", label: "Flux 2 Pro", badge: "OpenRouter", status: "active", img2img: false, pricing: price(0, 0.055) },
  { kind: "image", id: "gemini-3.1-flash-image", provider: "image_gen", apiProvider: "gemini", label: "(UI非表示)", badge: "—", status: "hidden", img2img: true, pricing: price(0.50, 60.00) },
  { kind: "image", id: "gemini-3-pro-image", provider: "image_gen", apiProvider: "gemini", label: "(UI非表示)", badge: "—", status: "hidden", img2img: true, pricing: price(2.00, 120.00) },
] as const satisfies readonly ModelDef[];

export type ProviderConfig = {
  label: string;
  uiDefaultModelId: ModelId;
  chatFallbackModelId: ModelId;
  arenaFallbackModelId: ModelId;
  lsKey: string;
};

export type ImageProviderConfig = {
  label: string;
  defaultModelId: ModelId;
  lsKey: string;
};

export const PROVIDER_CONFIG: Record<TextProvider | "image_gen", ProviderConfig | ImageProviderConfig> = {
  claude: { label: "Claude", uiDefaultModelId: "claude-sonnet-5", chatFallbackModelId: "claude-sonnet-5", arenaFallbackModelId: "claude-sonnet-5", lsKey: "kabehub_claude_model" },
  gemini: { label: "Gemini", uiDefaultModelId: "gemini-2.5-flash", chatFallbackModelId: "gemini-2.5-flash", arenaFallbackModelId: "gemini-2.5-flash", lsKey: "kabehub_gemini_model" },
  openai: { label: "ChatGPT", uiDefaultModelId: "gpt-5.4-mini", chatFallbackModelId: "gpt-5.4-mini", arenaFallbackModelId: "gpt-5.4-mini", lsKey: "kabehub_openai_model" },
  image_gen: { label: "画像生成", defaultModelId: "gpt-image-2", lsKey: "kabehub_image_provider" },
} as const;

export const LEGACY_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4":          { inputPerMTok: 5.00,  outputPerMTok: 25.00 },
  "claude-sonnet-4":        { inputPerMTok: 3.00,  outputPerMTok: 15.00 },
  "claude-haiku-4":         { inputPerMTok: 1.00,  outputPerMTok:  5.00 },
  "claude-haiku-3.5":       { inputPerMTok: 0.80,  outputPerMTok:  4.00 },
  "gemini-2.5-flash-lite":  { inputPerMTok: 0.10,  outputPerMTok:  0.60 },
  "gpt-5.4-nano":           { inputPerMTok: 0.20,  outputPerMTok:  1.25 },
  "gpt-5-mini":             { inputPerMTok: 0.25,  outputPerMTok:  2.00 },
  "gpt-5":                  { inputPerMTok: 1.25,  outputPerMTok: 10.00 },
  "gpt-4o-mini":            { inputPerMTok: 0.15,  outputPerMTok:  0.60 },
};

export function normalizeModelId(modelId: string): string {
  return modelId.replace(/^(gemini|openai|claude)\//, "").toLowerCase();
}

function resolvePricingRules(rules: readonly PricingRule[], now: Date): ModelPricing | null {
  const applicable = rules.filter((rule) => !rule.from || now >= new Date(rule.from));
  const rule = applicable[applicable.length - 1];
  return rule ? { inputPerMTok: rule.inputPerMTok, outputPerMTok: rule.outputPerMTok } : null;
}

export function getPricing(modelId: string, now: Date = new Date()): ModelPricing | null {
  const normalized = normalizeModelId(modelId);
  const exactModel = MODEL_REGISTRY.find((model) => model.id === normalized);
  if (exactModel) {
    if (exactModel.pricing.length === 0) return null;
    return resolvePricingRules(exactModel.pricing, now);
  }

  type Candidate = { key: string; source: "registry" | "legacy"; pricing: readonly PricingRule[] | ModelPricing };
  const registryCandidates: Candidate[] = MODEL_REGISTRY
    .filter((model) => model.pricing.length > 0)
    .map((model) => ({ key: model.id, source: "registry" as const, pricing: model.pricing }));
  const legacyCandidates: Candidate[] = Object.entries(LEGACY_PRICING)
    .map(([key, pricing]) => ({ key, source: "legacy" as const, pricing }));
  const matched = [...registryCandidates, ...legacyCandidates]
    .filter((candidate) => normalized.startsWith(candidate.key))
    .sort((a, b) => b.key.length - a.key.length || (a.source === "registry" ? -1 : 1));
  const winner = matched[0];
  if (!winner) return null;
  return Array.isArray(winner.pricing)
    ? resolvePricingRules(winner.pricing as readonly PricingRule[], now)
    : winner.pricing as ModelPricing;
}

export function buildLegacyModelConfig() {
  const textConfig = (provider: TextProvider) => {
    const cfg = PROVIDER_CONFIG[provider] as ProviderConfig;
    return {
      label: cfg.label,
      models: MODEL_REGISTRY.filter((model): model is Extract<(typeof MODEL_REGISTRY)[number], { kind: "text" }> => model.kind === "text" && model.provider === provider && model.status === "active")
        .map(({ id, label, badge }) => ({ id, label, badge })),
      defaultModel: cfg.uiDefaultModelId,
      lsKey: cfg.lsKey,
    };
  };
  const imageCfg = PROVIDER_CONFIG.image_gen as ImageProviderConfig;
  return {
    claude: textConfig("claude"),
    gemini: textConfig("gemini"),
    openai: textConfig("openai"),
    image_gen: {
      label: imageCfg.label,
      models: MODEL_REGISTRY.filter((model): model is Extract<(typeof MODEL_REGISTRY)[number], { kind: "image" }> => model.kind === "image" && model.status === "active")
        .map(({ id, label, badge }) => ({ id, label, badge })),
      defaultModel: imageCfg.defaultModelId,
      lsKey: imageCfg.lsKey,
    },
  };
}

export function loadModel(provider: UIProvider): ModelId {
  const config = buildLegacyModelConfig()[provider];
  const saved = typeof window !== "undefined" ? localStorage.getItem(config.lsKey) : null;
  const validIds = config.models.map((model) => model.id);
  return saved && validIds.some((id) => id === saved) ? saved : config.defaultModel;
}

export function saveModel(provider: UIProvider, modelId: ModelId): void {
  localStorage.setItem(buildLegacyModelConfig()[provider].lsKey, modelId);
}

export function getDefaultModel(provider: TextProvider, surface: "ui" | "chat" | "arena"): ModelId {
  const cfg = PROVIDER_CONFIG[provider] as ProviderConfig;
  if (surface === "ui") return cfg.uiDefaultModelId;
  if (surface === "chat") return cfg.chatFallbackModelId;
  return cfg.arenaFallbackModelId;
}

export function isAllowedModel(provider: TextProvider, modelId: string, surface: "chat" | "arena"): boolean {
  return MODEL_REGISTRY.some((model) => model.kind === "text" && model.provider === provider && model.id === modelId && model.status === "active" && model.surfaces[surface]);
}

export function getThinkingSupport(modelId: string): ThinkingConfig & { note?: string } {
  const model = MODEL_REGISTRY.find((candidate): candidate is Extract<(typeof MODEL_REGISTRY)[number], { kind: "text" }> => candidate.kind === "text" && candidate.id === modelId);
  return model?.thinking ?? { control: "unsupported" };
}

export function canToggleDeepThinking(modelId: string): boolean {
  const cfg = getThinkingSupport(modelId);
  return cfg.control === "toggleable" && !cfg.defaultOn;
}

export function resolveClaudeRequestOverrides(
  modelId: string,
  manualDeepThinkingRequested: boolean
): { thinking?: Record<string, unknown>; max_tokens: number } {
  const cfg = getThinkingSupport(modelId);

  if (cfg.control === "always_on" || (cfg.control === "toggleable" && cfg.defaultOn)) {
    return { max_tokens: 16000 };
  }

  if (cfg.control === "toggleable" && manualDeepThinkingRequested) {
    return cfg.requestType === "enabled"
      ? { thinking: { type: "enabled", budget_tokens: 10000 }, max_tokens: 16000 }
      : { thinking: { type: "adaptive", display: "summarized" }, max_tokens: 16000 };
  }

  return { max_tokens: 8192 };
}

export function resolveImageModel(modelId: string): ImageModelDef | null {
  return MODEL_REGISTRY.find((model): model is Extract<(typeof MODEL_REGISTRY)[number], { kind: "image" }> => model.kind === "image" && model.id === modelId) ?? null;
}

export function isAllowedImageModel(apiProvider: ImageApiProvider, modelId: string): boolean {
  const model = resolveImageModel(modelId);
  return Boolean(model && model.apiProvider === apiProvider && model.status !== "retired");
}

export function getDefaultImageModel(apiProvider: ImageApiProvider): ModelId | null {
  return MODEL_REGISTRY.find((model) => model.kind === "image" && model.apiProvider === apiProvider && model.status === "active")?.id ?? null;
}

export type RegistryClaudeModel =
  Extract<(typeof MODEL_REGISTRY)[number], { kind: "text"; provider: "claude"; status: "active" }>["id"];

export type RegistryGeminiModel =
  Extract<(typeof MODEL_REGISTRY)[number], { kind: "text"; provider: "gemini"; status: "active" }>["id"];

export type RegistryOpenAIModel =
  Extract<(typeof MODEL_REGISTRY)[number], { kind: "text"; provider: "openai"; status: "active" }>["id"];

export type RegistryImageGenModel =
  Extract<(typeof MODEL_REGISTRY)[number], { kind: "image"; status: "active" }>["id"];
