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
type ThinkingConfig = {
  mode: "none" | "extended" | "adaptive";
  note?: string;
};

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

export const MODEL_REGISTRY: readonly ModelDef[] = [
  { kind: "text", id: "claude-fable-5", provider: "claude", label: "Fable 5", badge: "最高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "adaptive", note: "Fable 5はExtended Thinkingに非対応です（Adaptive Thinkingは自動適用）" }, pricing: price(10.00, 50.00) },
  { kind: "text", id: "claude-sonnet-5", provider: "claude", label: "Sonnet 5", badge: "新標準", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "adaptive", note: "Sonnet 5はExtended Thinkingに非対応です（Adaptive Thinkingは自動適用）" }, pricing: [
    { inputPerMTok: 2.00, outputPerMTok: 10.00, note: "導入価格" },
    { from: "2026-09-01T00:00:00.000Z", inputPerMTok: 3.00, outputPerMTok: 15.00 },
  ] },
  { kind: "text", id: "claude-opus-4-8", provider: "claude", label: "Opus 4.8", badge: "最高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "extended" }, pricing: price(5.00, 25.00) },
  { kind: "text", id: "claude-opus-4-7", provider: "claude", label: "Opus 4.7", badge: "高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "extended" }, pricing: price(5.00, 25.00) },
  { kind: "text", id: "claude-opus-4-6", provider: "claude", label: "Opus 4.6", badge: "高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "extended" }, pricing: price(5.00, 25.00) },
  { kind: "text", id: "claude-sonnet-4-5", provider: "claude", label: "Sonnet 4.5", badge: "標準", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "extended" }, pricing: price(3.00, 15.00) },
  { kind: "text", id: "claude-sonnet-4-6", provider: "claude", label: "Sonnet 4.6", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "extended" }, pricing: price(3.00, 15.00) },
  { kind: "text", id: "claude-haiku-4-5-20251001", provider: "claude", label: "Haiku 4.5", badge: "軽量・爆速", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "none", note: "Haiku 4.5は非対応です" }, pricing: price(1.00, 5.00) },

  { kind: "text", id: "gemini-2.5-flash", provider: "gemini", label: "2.5 Flash", badge: "標準", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "none" }, pricing: price(0.30, 2.50) },
  { kind: "text", id: "gemini-2.5-pro", provider: "gemini", label: "2.5 Pro", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "none" }, pricing: price(1.25, 10.00) },
  { kind: "text", id: "gemini-3.5-flash", provider: "gemini", label: "3.5 Flash", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "none" }, pricing: price(1.50, 9.00) },
  { kind: "text", id: "gemini-3.1-flash-lite", provider: "gemini", label: "3.1 Flash Lite", badge: "軽量・爆速", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "none" }, pricing: price(0.25, 1.50) },

  { kind: "text", id: "gpt-4o", provider: "openai", label: "GPT-4o", badge: "旧世代", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "none" }, pricing: price(2.50, 10.00) },
  { kind: "text", id: "gpt-5.4-mini", provider: "openai", label: "GPT-5.4 mini", badge: "標準", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "none" }, pricing: price(0.75, 4.50) },
  { kind: "text", id: "gpt-5.4", provider: "openai", label: "GPT-5.4", badge: "高性能", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "none" }, pricing: price(2.50, 15.00) },
  { kind: "text", id: "gpt-5.5", provider: "openai", label: "GPT-5.5", badge: "最高精度", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "none" }, pricing: price(5.00, 30.00) },
  { kind: "text", id: "gpt-5.5-pro", provider: "openai", label: "GPT-5.5 Pro", badge: "最上位", status: "active", surfaces: { chat: true, arena: true }, thinking: { mode: "none" }, pricing: price(30.00, 180.00) },

  { kind: "image", id: "gpt-image-2", provider: "image_gen", apiProvider: "openai", label: "GPT Image 2", badge: "OpenAI", status: "active", img2img: false, pricing: [] },
  { kind: "image", id: "gemini-2.5-flash-image", provider: "image_gen", apiProvider: "gemini", label: "Gemini Image", badge: "Google", status: "active", img2img: true, pricing: [] },
  { kind: "image", id: "ideogram-v3", provider: "image_gen", apiProvider: "ideogram", label: "Ideogram V3", badge: "Ideogram", status: "active", img2img: true, pricing: price(0, 0.08) },
  { kind: "image", id: "black-forest-labs/flux.2-pro", provider: "image_gen", apiProvider: "openrouter", label: "Flux 2 Pro", badge: "OpenRouter", status: "active", img2img: false, pricing: price(0, 0.055) },
  { kind: "image", id: "gemini-3.1-flash-image", provider: "image_gen", apiProvider: "gemini", label: "(UI非表示)", badge: "—", status: "hidden", img2img: true, pricing: price(0.50, 60.00) },
  { kind: "image", id: "gemini-3-pro-image", provider: "image_gen", apiProvider: "gemini", label: "(UI非表示)", badge: "—", status: "hidden", img2img: true, pricing: price(2.00, 120.00) },
] as const;

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
  claude: { label: "Claude", uiDefaultModelId: "claude-sonnet-4-5", chatFallbackModelId: "claude-sonnet-4-5", arenaFallbackModelId: "claude-sonnet-4-5", lsKey: "kabehub_claude_model" },
  gemini: { label: "Gemini", uiDefaultModelId: "gemini-2.5-flash", chatFallbackModelId: "gemini-2.5-flash", arenaFallbackModelId: "gemini-2.5-flash", lsKey: "kabehub_gemini_model" },
  openai: { label: "ChatGPT", uiDefaultModelId: "gpt-5.4-mini", chatFallbackModelId: "gpt-4o", arenaFallbackModelId: "gpt-4o", lsKey: "kabehub_openai_model" },
  // TODO(T4/T5): S23で「gpt-5.4-miniに統一する」と決定済み。
  // chat/route.ts・arena/route.ts の DEFAULT_MODELS を getDefaultModel() に
  // 置き換えるタイミングで、openai の chatFallbackModelId / arenaFallbackModelId を
  // "gpt-5.4-mini" に変更すること。T1では現状再現のみ行い、ここでは変更しない。
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
      models: MODEL_REGISTRY.filter((model): model is TextModelDef => model.kind === "text" && model.provider === provider && model.status === "active")
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
      models: MODEL_REGISTRY.filter((model): model is ImageModelDef => model.kind === "image" && model.status === "active")
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
  return saved && validIds.includes(saved) ? saved : config.defaultModel;
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

export function getThinkingSupport(modelId: string): ThinkingConfig {
  const model = MODEL_REGISTRY.find((candidate): candidate is TextModelDef => candidate.kind === "text" && candidate.id === modelId);
  return model?.thinking ?? { mode: "none" };
}

export function supportsExtendedThinking(modelId: string): boolean {
  return getThinkingSupport(modelId).mode === "extended";
}

export function resolveImageModel(modelId: string): ImageModelDef | null {
  return MODEL_REGISTRY.find((model): model is ImageModelDef => model.kind === "image" && model.id === modelId) ?? null;
}

export function isAllowedImageModel(apiProvider: ImageApiProvider, modelId: string): boolean {
  const model = resolveImageModel(modelId);
  return Boolean(model && model.apiProvider === apiProvider && model.status !== "retired");
}
