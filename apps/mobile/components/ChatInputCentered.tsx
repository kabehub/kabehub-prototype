"use client";

import { useEffect, useRef, useState } from "react";
import {
  MODEL_CONFIG,
  canUseDeepThinking,
  getThinkingSupport,
  isThinkingUnsupported,
  loadModel,
  saveModel,
  type ChatInputProps,
  type ModelId,
  type Provider,
} from "./ChatInput";

export interface ChatInputCenteredProps extends ChatInputProps {
  displayName?: string | null;
}

const TEXT_PROVIDERS: readonly Provider[] = ["claude", "gemini", "openai"];

export default function ChatInputCentered({
  value,
  onChange,
  onSubmit,
  isLoading,
  disabled,
  provider,
  onProviderChange,
  displayName,
}: ChatInputCenteredProps) {
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
    <div className="chat-input-centered-shell">
      <div className="chat-input-centered-panel">
        <h2 className="chat-input-centered-heading">
          {displayName?.trim() || "ユーザー"}さん、壁打ちを始めましょう
        </h2>

        <div className="chat-input-centered-card">
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

          <textarea
            className="chat-input-textarea chat-input-centered-textarea"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled || isLoading}
            placeholder="思考を入力…"
            rows={1}
          />

          <div className="chat-input-centered-actions">
            <div className="chat-input-action-group">
              {provider === "claude" && (
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
                  onClick={() =>
                    setIsDeepThinking((current) => !current)
                  }
                >
                  🧠 深く考える
                </button>
              )}
            </div>

            <button
              type="button"
              className="chat-input-centered-send-button"
              disabled={cannotSubmit}
              onClick={handleSubmit}
            >
              送信
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
