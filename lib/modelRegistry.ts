// モデル台帳。T1時点では既存コードから参照されない純粋データ＋関数。

export type TextProvider = "claude" | "gemini" | "openai";
export type UIProvider = TextProvider | "image_gen";
export type ImageApiProvider = "openai" | "gemini" | "ideogram" | "openrouter";
export type ModelStatus = "active" | "hidden" | "deprecated" | "retired";
export type ModelId = string;

export type PriceTier = {
  promptTokensAbove?: number;
  inputPerMTok: number;
  cachedInputPerMTok?: number;
  outputPerMTok: number;
};

export type PricingEpoch = {
  from?: string;
  note?: string;
  tiers: readonly PriceTier[];
};

export type TextPricing = readonly PricingEpoch[];
export type ModelPricing = PriceTier;

export type ImagePricing =
  | {
      kind: "token_modalities";
      textInputPerMTok?: number;
      imageInputPerMTok?: number;
      cachedImageInputPerMTok?: number;
      textOutputPerMTok?: number;
      imageOutputPerMTok?: number;
    }
  | { kind: "per_image"; usdPerImage: number }
  | { kind: "provider_reported" };

export const CLAUDE_CACHE_WRITE_MULTIPLIER = 1.25;
export const CLAUDE_CACHE_READ_MULTIPLIER = 0.1;
export const OPENAI_CACHE_WRITE_MULTIPLIER = 1.25;
export const GEMINI_CACHE_READ_MULTIPLIER = 0.1;

type ModelSurface = { chat: boolean; arena: boolean };
type ThinkingConfig =
  | { control: "unsupported" }
  | { control: "always_on"; note?: string }
  | { control: "toggleable"; requestType: "adaptive" | "enabled"; defaultOn: boolean; note?: string };

type NovelCheckFeature = {
  label: string;
  estimatedInputPerMTok: number;
};

type ImagePageMetadata = {
  label: string;
  badge: string;
};

type TextModelBase = {
  kind: "text";
  id: ModelId;
  label: string;
  badge: string;
  status: ModelStatus;
  surfaces: ModelSurface;
  thinking: ThinkingConfig;
  pricing: TextPricing;
  features?: { novelCheck?: NovelCheckFeature };
};

type OpenAICacheCapability = { supportsCacheWrite?: boolean };
type ChatCompletionsReasoningEffort = "low" | "medium" | "high" | "xhigh";

export type OpenAICapability = OpenAICacheCapability & (
  | { api: "chat_completions"; tokenParam: "max_tokens" | "max_completion_tokens"; reasoningEffort?: ChatCompletionsReasoningEffort }
  | { api: "responses" }
);

type ClaudeTextModelDef = TextModelBase & { provider: "claude" };
type GeminiTextModelDef = TextModelBase & { provider: "gemini" };
type OpenAITextModelDef = TextModelBase & { provider: "openai"; openai: OpenAICapability };

export type TextModelDef = ClaudeTextModelDef | GeminiTextModelDef | OpenAITextModelDef;

export type ImageModelDef = {
  kind: "image";
  id: ModelId;
  provider: "image_gen";
  apiProvider: ImageApiProvider;
  label: string;
  badge: string;
  status: ModelStatus;
  img2img: boolean;
  imagePricing: ImagePricing;
  imagePage?: ImagePageMetadata;
};

export type ModelDef = TextModelDef | ImageModelDef;

const price = (
  inputPerMTok: number,
  outputPerMTok: number,
  cachedInputPerMTok?: number,
): TextPricing => [
  { tiers: [{ inputPerMTok, outputPerMTok, ...(cachedInputPerMTok !== undefined ? { cachedInputPerMTok } : {}) }] },
];

export const MODEL_REGISTRY = [
  { kind: "text", id: "claude-fable-5", provider: "claude", label: "Fable 5", badge: "最高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "always_on", note: "Fable 5はAdaptive Thinkingが自動適用されます" }, pricing: price(10.00, 50.00) },
  { kind: "text", id: "claude-fable-5-1", provider: "claude", label: "Fable 5.1", badge: "最高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "always_on", note: "Fable 5.1はAdaptive Thinkingが自動適用されます" }, pricing: price(10.00, 50.00, 0.25) },
  { kind: "text", id: "claude-sonnet-5", provider: "claude", label: "Sonnet 5", badge: "新標準", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "toggleable", requestType: "adaptive", defaultOn: true, note: "Sonnet 5はAdaptive Thinkingが標準で有効です" }, pricing: [
    { note: "導入価格", tiers: [{ inputPerMTok: 2.00, outputPerMTok: 10.00 }] },
    { from: "2026-09-01T00:00:00.000Z", tiers: [{ inputPerMTok: 3.00, outputPerMTok: 15.00 }] },
  ] },
  { kind: "text", id: "claude-opus-5", provider: "claude", label: "Opus 5", badge: "最高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "toggleable", requestType: "adaptive", defaultOn: true, note: "Opus 5はAdaptive Thinkingが標準で有効です" }, pricing: price(5.00, 25.00) },
  { kind: "text", id: "claude-opus-4-8", provider: "claude", label: "Opus 4.8", badge: "高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "toggleable", requestType: "adaptive", defaultOn: false }, pricing: price(5.00, 25.00) },
  { kind: "text", id: "claude-opus-4-7", provider: "claude", label: "Opus 4.7", badge: "高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "toggleable", requestType: "adaptive", defaultOn: false }, pricing: price(5.00, 25.00) },
  { kind: "text", id: "claude-opus-4-6", provider: "claude", label: "Opus 4.6", badge: "高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "toggleable", requestType: "adaptive", defaultOn: false }, pricing: price(5.00, 25.00) },
  { kind: "text", id: "claude-sonnet-4-5", provider: "claude", label: "Sonnet 4.5", badge: "標準", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "toggleable", requestType: "enabled", defaultOn: false }, pricing: price(3.00, 15.00) },
  { kind: "text", id: "claude-sonnet-4-6", provider: "claude", label: "Sonnet 4.6", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "toggleable", requestType: "adaptive", defaultOn: false }, pricing: price(3.00, 15.00) },
  { kind: "text", id: "claude-haiku-4-5-20251001", provider: "claude", label: "Haiku 4.5", badge: "軽量・爆速", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "toggleable", requestType: "enabled", defaultOn: false }, pricing: price(1.00, 5.00) },

  { kind: "text", id: "gemini-2.5-flash", provider: "gemini", label: "2.5 Flash", badge: "標準", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(0.30, 2.50), features: { novelCheck: { label: "2.5 Flash", estimatedInputPerMTok: 0.075 } } },
  { kind: "text", id: "gemini-2.5-pro", provider: "gemini", label: "2.5 Pro", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: [
    { tiers: [
      { inputPerMTok: 1.25, outputPerMTok: 10.00 },
      { promptTokensAbove: 200_000, inputPerMTok: 2.50, outputPerMTok: 15.00 },
    ] },
  ], features: { novelCheck: { label: "2.5 Pro", estimatedInputPerMTok: 1.25 } } },
  { kind: "text", id: "gemini-3.5-flash", provider: "gemini", label: "3.5 Flash", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(1.50, 9.00) },
  { kind: "text", id: "gemini-3.1-flash-lite", provider: "gemini", label: "3.1 Flash Lite", badge: "軽量・爆速", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(0.25, 1.50) },
  { kind: "text", id: "gemini-3.6-flash", provider: "gemini", label: "3.6 Flash", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: [
    { note: "導入価格（〜2026-12-31）", tiers: [{ inputPerMTok: 0.75, outputPerMTok: 3.75 }] },
    { from: "2027-01-01T00:00:00.000Z", tiers: [{ inputPerMTok: 1.50, outputPerMTok: 7.50 }] },
  ] },
  { kind: "text", id: "gemini-3.7-flash", provider: "gemini", label: "3.7 Flash", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: [
    { note: "導入価格（〜2026-12-31）", tiers: [{ inputPerMTok: 0.75, outputPerMTok: 3.75 }] },
    { from: "2027-01-01T00:00:00.000Z", tiers: [{ inputPerMTok: 1.50, outputPerMTok: 7.50 }] },
  ] },
  { kind: "text", id: "gemini-3.8-flash", provider: "gemini", label: "3.8 Flash", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: [
    { note: "導入価格（〜2026-12-31）", tiers: [{ inputPerMTok: 0.75, outputPerMTok: 3.75 }] },
    { from: "2027-01-01T00:00:00.000Z", tiers: [{ inputPerMTok: 1.50, outputPerMTok: 7.50 }] },
  ] },
  { kind: "text", id: "gemini-3.5-flash-lite", provider: "gemini", label: "3.5 Flash Lite", badge: "軽量・爆速", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(0.30, 2.50) },

  { kind: "text", id: "gpt-4o", provider: "openai", label: "GPT-4o", badge: "旧世代", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(2.50, 10.00, 1.25), openai: { api: "chat_completions", tokenParam: "max_tokens" } },
  { kind: "text", id: "gpt-5.4-mini", provider: "openai", label: "GPT-5.4 mini", badge: "標準", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(0.75, 4.50, 0.075), openai: { api: "chat_completions", tokenParam: "max_completion_tokens" } },
  { kind: "text", id: "gpt-5.4", provider: "openai", label: "GPT-5.4", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(2.50, 15.00, 0.25), openai: { api: "chat_completions", tokenParam: "max_completion_tokens" } },
  { kind: "text", id: "gpt-5.5", provider: "openai", label: "GPT-5.5", badge: "最高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(5.00, 30.00, 0.50), openai: { api: "chat_completions", tokenParam: "max_completion_tokens" } },
  { kind: "text", id: "gpt-5.5-pro", provider: "openai", label: "GPT-5.5 Pro", badge: "最上位", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(30.00, 180.00), openai: { api: "responses" } },
  { kind: "text", id: "gpt-5.6-sol", provider: "openai", label: "GPT-5.6 Sol", badge: "最高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: price(5.00, 30.00, 0.50), openai: { api: "chat_completions", tokenParam: "max_completion_tokens", supportsCacheWrite: true } },
  { kind: "text", id: "gpt-5.6-terra", provider: "openai", label: "GPT-5.6 Terra", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: [
    { tiers: [{ inputPerMTok: 2.50, cachedInputPerMTok: 0.25, outputPerMTok: 15.00 }] },
    { from: "2026-07-30T00:00:00.000Z", tiers: [{ inputPerMTok: 2.00, cachedInputPerMTok: 0.20, outputPerMTok: 12.00 }] },
  ], openai: { api: "chat_completions", tokenParam: "max_completion_tokens", supportsCacheWrite: true } },
  { kind: "text", id: "gpt-5.6-luna", provider: "openai", label: "GPT-5.6 Luna", badge: "軽量・爆速", status: "active", surfaces: { chat: true, arena: true }, thinking: { control: "unsupported" }, pricing: [
    { tiers: [{ inputPerMTok: 1.00, cachedInputPerMTok: 0.10, outputPerMTok: 6.00 }] },
    { from: "2026-07-30T00:00:00.000Z", tiers: [{ inputPerMTok: 0.20, cachedInputPerMTok: 0.02, outputPerMTok: 1.20 }] },
  ], openai: { api: "chat_completions", tokenParam: "max_completion_tokens", supportsCacheWrite: true } },
  { kind: "text", id: "gpt-6-astra", provider: "openai", label: "GPT-6 Astra", badge: "最高性能", status: "active", surfaces: { chat: true, arena: false }, thinking: { control: "unsupported" }, pricing: [
    { tiers: [
      { inputPerMTok: 10.00, cachedInputPerMTok: 1.00, outputPerMTok: 50.00 },
      { promptTokensAbove: 272_000, inputPerMTok: 20.00, cachedInputPerMTok: 2.00, outputPerMTok: 75.00 },
    ] },
  ], openai: { api: "chat_completions", tokenParam: "max_completion_tokens", reasoningEffort: "medium", supportsCacheWrite: true } },

  { kind: "image", id: "gpt-image-2", provider: "image_gen", apiProvider: "openai", label: "GPT Image 2", badge: "OpenAI", status: "active", img2img: false, imagePricing: { kind: "token_modalities", textInputPerMTok: 5.00, imageInputPerMTok: 8.00, cachedImageInputPerMTok: 2.00, imageOutputPerMTok: 30.00 } },
  { kind: "image", id: "gemini-2.5-flash-image", provider: "image_gen", apiProvider: "gemini", label: "Gemini Image", badge: "Google", status: "active", img2img: true, imagePricing: { kind: "token_modalities", textInputPerMTok: 0.30, imageInputPerMTok: 0.30, textOutputPerMTok: 2.50, imageOutputPerMTok: 30.00 }, imagePage: { label: "2.5 Flash Image", badge: "既存" } },
  { kind: "image", id: "ideogram-v3", provider: "image_gen", apiProvider: "ideogram", label: "Ideogram V3", badge: "Ideogram", status: "active", img2img: true, imagePricing: { kind: "per_image", usdPerImage: 0.03 } },
  { kind: "image", id: "black-forest-labs/flux.2-pro", provider: "image_gen", apiProvider: "openrouter", label: "Flux 2 Pro", badge: "OpenRouter", status: "active", img2img: false, imagePricing: { kind: "provider_reported" } },
  { kind: "image", id: "gemini-3.1-flash-image", provider: "image_gen", apiProvider: "gemini", label: "(UI非表示)", badge: "—", status: "hidden", img2img: true, imagePricing: { kind: "token_modalities", textInputPerMTok: 0.50, imageInputPerMTok: 0.50, textOutputPerMTok: 3.00, imageOutputPerMTok: 60.00 }, imagePage: { label: "3.1 Flash Image", badge: "新" } },
  { kind: "image", id: "gemini-3-pro-image", provider: "image_gen", apiProvider: "gemini", label: "(UI非表示)", badge: "—", status: "hidden", img2img: true, imagePricing: { kind: "token_modalities", textInputPerMTok: 2.00, imageInputPerMTok: 2.00, textOutputPerMTok: 12.00, imageOutputPerMTok: 120.00 }, imagePage: { label: "3 Pro Image", badge: "高性能" } },
] as const satisfies readonly ModelDef[];

// Responses API呼び出し時の出力上限。Chat・Arena共通（同一モデル・同一エンドポイントのため同一概念として統合）
export const OPENAI_RESPONSES_CONFIG = { maxOutputTokens: 8192 } as const;

// Chat Completions分岐の出力上限。Chat機能専用の運用値。
// Arena routeは元々token parameter・出力上限を送っていないため、この値はChat routeにのみ適用する。
export const CHAT_OPENAI_CONFIG = { maxOutputTokens: 8192 } as const;

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

function resolvePricingEpochs(
  epochs: TextPricing,
  at: Date,
  promptTokens?: number,
): PriceTier | null {
  const applicable = epochs.filter((epoch) => !epoch.from || at >= new Date(epoch.from));
  const epoch = applicable.reduce<PricingEpoch | null>((latest, candidate) => {
    if (!latest) return candidate;
    const latestTime = latest.from ? new Date(latest.from).getTime() : Number.NEGATIVE_INFINITY;
    const candidateTime = candidate.from ? new Date(candidate.from).getTime() : Number.NEGATIVE_INFINITY;
    return candidateTime >= latestTime ? candidate : latest;
  }, null);
  if (!epoch) return null;

  const baseTier = epoch.tiers.find((tier) => tier.promptTokensAbove === undefined) ?? null;
  if (promptTokens === undefined) return baseTier;
  return epoch.tiers.reduce<PriceTier | null>((selected, tier) => {
    if (tier.promptTokensAbove === undefined || promptTokens <= tier.promptTokensAbove) {
      return selected;
    }
    if (selected?.promptTokensAbove !== undefined && selected.promptTokensAbove > tier.promptTokensAbove) {
      return selected;
    }
    return tier;
  }, baseTier);
}

export function getPricing(modelId: string, at: Date = new Date(), promptTokens?: number): PriceTier | null {
  const normalized = normalizeModelId(modelId);
  const exactModel = MODEL_REGISTRY.find((model) => model.id === normalized);
  if (exactModel) {
    if (exactModel.kind === "image") return null;
    return resolvePricingEpochs(exactModel.pricing, at, promptTokens);
  }

  type Candidate = { key: string; source: "registry" | "legacy"; pricing: TextPricing | ModelPricing };
  const registryCandidates: Candidate[] = MODEL_REGISTRY
    .filter((model): model is Extract<(typeof MODEL_REGISTRY)[number], { kind: "text" }> => model.kind === "text")
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
    ? resolvePricingEpochs(winner.pricing as TextPricing, at, promptTokens)
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

export const NOVEL_CHECK_CONFIG = {
  defaultModelId: "gemini-2.5-flash",
  estimatedTokensPerCharacter: 1.2,
  maxOutputTokens: 8192,
} as const;

type NovelCheckRegistryModel =
  Extract<(typeof MODEL_REGISTRY)[number], { kind: "text"; features: { novelCheck: NovelCheckFeature } }>;

export function getNovelCheckModels(): { id: string; label: string; estimatedInputPerMTok: number }[] {
  return MODEL_REGISTRY
    .filter((model): model is NovelCheckRegistryModel =>
      model.kind === "text" &&
      "features" in model &&
      model.features?.novelCheck !== undefined
    )
    .map((model) => ({
      id: model.id,
      label: model.features.novelCheck.label,
      estimatedInputPerMTok: model.features.novelCheck.estimatedInputPerMTok,
    }));
}

export function isAllowedNovelCheckModel(modelId: string): boolean {
  return getNovelCheckModels().some((model) => model.id === modelId);
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

export type RegistryImagePageModel =
  Extract<(typeof MODEL_REGISTRY)[number], { kind: "image"; imagePage: ImagePageMetadata }>["id"];

type ImagePageRegistryModel =
  Extract<(typeof MODEL_REGISTRY)[number], { kind: "image"; imagePage: ImagePageMetadata }>;

export const IMAGE_PAGE_CONFIG = {
  defaultGeminiModelId: "gemini-2.5-flash-image",
} as const satisfies { defaultGeminiModelId: RegistryImagePageModel };

export function getImagePageModels(apiProvider: ImageApiProvider): { id: RegistryImagePageModel; label: string; badge: string }[] {
  return MODEL_REGISTRY
    .filter((model): model is ImagePageRegistryModel =>
      model.kind === "image" &&
      model.apiProvider === apiProvider &&
      "imagePage" in model &&
      model.imagePage !== undefined
    )
    .map((model) => ({
      id: model.id,
      label: model.imagePage.label,
      badge: model.imagePage.badge,
    }));
}

export type RegistryClaudeModel =
  Extract<(typeof MODEL_REGISTRY)[number], { kind: "text"; provider: "claude"; status: "active" }>["id"];

export type RegistryGeminiModel =
  Extract<(typeof MODEL_REGISTRY)[number], { kind: "text"; provider: "gemini"; status: "active" }>["id"];

export type RegistryOpenAIModel =
  Extract<(typeof MODEL_REGISTRY)[number], { kind: "text"; provider: "openai"; status: "active" }>["id"];

type OpenAIRegistryModel = Extract<(typeof MODEL_REGISTRY)[number], { kind: "text"; provider: "openai" }>;

export function getOpenAICapability(modelId: RegistryOpenAIModel): OpenAICapability {
  const model = MODEL_REGISTRY.find(
    (candidate): candidate is OpenAIRegistryModel =>
      candidate.kind === "text" && candidate.provider === "openai" && candidate.id === modelId
  );
  if (!model) {
    throw new Error(`OpenAI capability is missing for model: ${modelId}`);
  }
  return model.openai;
}

export function supportsOpenAICacheWrite(modelId: string): boolean {
  const normalized = normalizeModelId(modelId);
  const model = MODEL_REGISTRY.find(
    (candidate): candidate is OpenAIRegistryModel =>
      candidate.kind === "text" &&
      candidate.provider === "openai" &&
      candidate.id === normalized
  );
  return Boolean(
    model &&
    "supportsCacheWrite" in model.openai &&
    model.openai.supportsCacheWrite === true
  );
}

type TextModelByProvider = {
  claude: RegistryClaudeModel;
  gemini: RegistryGeminiModel;
  openai: RegistryOpenAIModel;
};

export const EXTRACT_SETTINGS_CONFIG = {
  claude: "claude-sonnet-4-6",
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o",
} as const satisfies TextModelByProvider;

export type RegistryTextModel =
  | RegistryClaudeModel
  | RegistryGeminiModel
  | RegistryOpenAIModel;

export function buildDefaultModels(surface: "chat" | "arena"): Record<string, RegistryTextModel> {
  return {
    claude: getDefaultModel("claude", surface) as RegistryClaudeModel,
    gemini: getDefaultModel("gemini", surface) as RegistryGeminiModel,
    openai: getDefaultModel("openai", surface) as RegistryOpenAIModel,
  };
}

export function createModelGuards(surface: "chat" | "arena") {
  return {
    isClaudeModel: (modelId: string): modelId is RegistryClaudeModel => isAllowedModel("claude", modelId, surface),
    isGeminiModel: (modelId: string): modelId is RegistryGeminiModel => isAllowedModel("gemini", modelId, surface),
    isOpenAIModel: (modelId: string): modelId is RegistryOpenAIModel => isAllowedModel("openai", modelId, surface),
  };
}

export type RegistryImageGenModel =
  Extract<(typeof MODEL_REGISTRY)[number], { kind: "image"; status: "active" }>["id"];
