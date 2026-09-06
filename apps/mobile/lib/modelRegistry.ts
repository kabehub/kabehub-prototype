import {
  buildLegacyModelConfig,
  type ModelId,
  type UIProvider,
} from "@kabehub/shared";

export function loadModel(provider: UIProvider): ModelId {
  const config = buildLegacyModelConfig()[provider];
  const saved =
    typeof window !== "undefined" ? localStorage.getItem(config.lsKey) : null;
  const validIds = config.models.map((model) => model.id);
  return saved && validIds.some((id) => id === saved)
    ? saved
    : config.defaultModel;
}

export function saveModel(provider: UIProvider, modelId: ModelId): void {
  localStorage.setItem(buildLegacyModelConfig()[provider].lsKey, modelId);
}
