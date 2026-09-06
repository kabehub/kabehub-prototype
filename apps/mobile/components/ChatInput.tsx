"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildLegacyModelConfig,
  canToggleDeepThinking,
  getThinkingSupport,
  type ModelId as SharedModelId,
  type RegistryClaudeModel,
  type RegistryGeminiModel,
  type RegistryOpenAIModel,
  type TextProvider,
} from "@kabehub/shared";
import {
  loadModel as registryLoadModel,
  saveModel as registrySaveModel,
} from "../lib/modelRegistry";

export type ModelId = SharedModelId;
export type Provider = TextProvider;
export { getThinkingSupport };

export interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (
    content: string,
    modelId: ModelId,
    isDeepThinking?: boolean
  ) => void;
  isLoading: boolean;
  disabled?: boolean;
  provider: Provider;
  onProviderChange: (p: Provider) => void;
}

type ChatModelOption<M extends ModelId> = {
  id: M;
  label: string;
  badge: string;
};

type TextModelConfig<M extends ModelId> = {
  label: string;
  models: readonly ChatModelOption<M>[];
  defaultModel: M;
  lsKey: string;
};

type LegacyTextModelConfig = {
  claude: TextModelConfig<RegistryClaudeModel>;
  gemini: TextModelConfig<RegistryGeminiModel>;
  openai: TextModelConfig<RegistryOpenAIModel>;
};

const legacyModelConfig = buildLegacyModelConfig();

export const MODEL_CONFIG: LegacyTextModelConfig = {
  claude: legacyModelConfig.claude as TextModelConfig<RegistryClaudeModel>,
  gemini: legacyModelConfig.gemini as TextModelConfig<RegistryGeminiModel>,
  openai: legacyModelConfig.openai as TextModelConfig<RegistryOpenAIModel>,
};

export function loadModel(provider: Provider): ModelId {
  return registryLoadModel(provider);
}

export function saveModel(provider: Provider, modelId: ModelId): void {
  registrySaveModel(provider, modelId);
}

export function isThinkingUnsupported(modelId: ModelId): boolean {
  return !canToggleDeepThinking(modelId);
}

export function canUseDeepThinking(
  provider: Provider,
  modelId: ModelId
): boolean {
  return provider === "claude" && canToggleDeepThinking(modelId);
}

const TEXT_PROVIDERS: readonly Provider[] = ["claude", "gemini", "openai"];

export default function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  disabled,
  provider,
  onProviderChange,
}: ChatInputProps) {
  const modelMenuRootRef = useRef<HTMLDivElement | null>(null);
  const [openModelProvider, setOpenModelProvider] =
    useState<Provider | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelId>(
    () => MODEL_CONFIG[provider].defaultModel
  );
  const [isDeepThinking, setIsDeepThinking] = useState(false);

  useEffect(() => {
    setSelectedModel(loadModel(provider));
  }, [provider]);

  useEffect(() => {
    if (provider !== "claude") setIsDeepThinking(false);
  }, [provider]);

  useEffect(() => {
    if (!openModelProvider) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        modelMenuRootRef.current &&
        !modelMenuRootRef.current.contains(event.target as Node)
      ) {
        setOpenModelProvider(null);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpenModelProvider(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openModelProvider]);

  const handleProviderChange = (nextProvider: Provider) => {
    onProviderChange(nextProvider);
    setSelectedModel(loadModel(nextProvider));
    setOpenModelProvider((current) =>
      current === nextProvider ? null : nextProvider
    );
  };

  const handleModelChange = (
    targetProvider: Provider,
    modelId: ModelId
  ) => {
    setSelectedModel(modelId);
    saveModel(targetProvider, modelId);
    if (isThinkingUnsupported(modelId)) setIsDeepThinking(false);
    setOpenModelProvider(null);
  };

  const handleSubmit = () => {
    if (!value.trim()) return;

    const effectiveDeepThinking =
      isDeepThinking && canUseDeepThinking(provider, selectedModel);

    onChange("");
    onSubmit(value, selectedModel, effectiveDeepThinking);
  };

  const cannotSubmit = !value.trim() || isLoading || Boolean(disabled);
  const thinkingDisabled =
    isThinkingUnsupported(selectedModel) || isLoading || Boolean(disabled);

  return (
    <div className="chat-input-shell">
      <div className="chat-input-model-picker" ref={modelMenuRootRef}>
        <div className="chat-input-provider-row mobile-scroll-row">
          {TEXT_PROVIDERS.map((targetProvider) => {
            const isActive = provider === targetProvider;
            return (
              <button
                type="button"
                className={
                  isActive
                    ? "chat-input-provider-tab chat-input-provider-tab-active"
                    : "chat-input-provider-tab"
                }
                key={targetProvider}
                aria-expanded={openModelProvider === targetProvider}
                aria-haspopup="menu"
                onClick={() => handleProviderChange(targetProvider)}
              >
                {MODEL_CONFIG[targetProvider].label} ▾
              </button>
            );
          })}
        </div>

        {openModelProvider && (
          <div className="chat-input-model-menu" role="menu">
            <p className="chat-input-model-menu-title">
              {MODEL_CONFIG[openModelProvider].label} のモデルを選択
            </p>
            {MODEL_CONFIG[openModelProvider].models.map((model) => {
              const isSelected = selectedModel === model.id;
              return (
                <button
                  type="button"
                  className={
                    isSelected
                      ? "chat-input-model-option chat-input-model-option-selected"
                      : "chat-input-model-option"
                  }
                  key={model.id}
                  role="menuitemradio"
                  aria-checked={isSelected}
                  onClick={() =>
                    handleModelChange(openModelProvider, model.id)
                  }
                >
                  <span className="chat-input-model-option-marker">
                    {isSelected ? "●" : ""}
                  </span>
                  <span>{model.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="chat-input-composer">
        <textarea
          className="chat-input-textarea chat-input-composer-textarea"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled || isLoading}
          placeholder="思考を入力…"
          rows={1}
        />
        <button
          type="button"
          className="chat-input-send-button"
          aria-label="AIに送信"
          title="AIに送信"
          disabled={cannotSubmit}
          onClick={handleSubmit}
        >
          {isLoading ? (
            <span className="chat-input-send-progress">…</span>
          ) : (
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 14 14"
              fill="none"
            >
              <path
                d="M7 12V2M7 2L2 7M7 2L12 7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>

      {provider === "claude" && (
        <div className="chat-input-actions">
          <button
            type="button"
            className={
              isDeepThinking
                ? "chat-input-thinking-toggle chat-input-thinking-toggle-active"
                : "chat-input-thinking-toggle"
            }
            aria-pressed={isDeepThinking}
            disabled={thinkingDisabled}
            title={
              getThinkingSupport(selectedModel).note ??
              "Extended Thinking: AIが回答前に深く考えます"
            }
            onClick={() => setIsDeepThinking((current) => !current)}
          >
            🧠 深く考える
          </button>
        </div>
      )}
    </div>
  );
}
