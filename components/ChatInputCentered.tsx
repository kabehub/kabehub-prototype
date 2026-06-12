"use client";

import { KeyboardEvent, useEffect, useMemo, useState } from "react";
import {
  MODEL_CONFIG,
  loadModel,
  saveModel,
  type ModelId,
  type Provider,
} from "./ChatInput";

interface ChatInputCenteredProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (content: string, modelId: ModelId) => void;
  isLoading: boolean;
  provider: Provider;
  onProviderChange: (p: Provider) => void;
  displayName?: string | null;
}

type TextProvider = Extract<Provider, "claude" | "gemini" | "openai">;

const TEXT_PROVIDERS: TextProvider[] = ["claude", "gemini", "openai"];

export default function ChatInputCentered({
  value,
  onChange,
  onSubmit,
  isLoading,
  provider,
  onProviderChange,
  displayName,
}: ChatInputCenteredProps) {
  const activeProvider: TextProvider = useMemo(
    () => (TEXT_PROVIDERS.includes(provider as TextProvider) ? (provider as TextProvider) : "claude"),
    [provider],
  );
  const [selectedModel, setSelectedModel] = useState<ModelId>(() => loadModel(activeProvider));
  const canSubmit = value.trim().length > 0 && !isLoading;

  useEffect(() => {
    setSelectedModel(loadModel(activeProvider));
  }, [activeProvider]);

  const handleProviderChange = (nextProvider: TextProvider) => {
    onProviderChange(nextProvider);
    setSelectedModel(loadModel(nextProvider));
  };

  const handleModelChange = (modelId: ModelId) => {
    setSelectedModel(modelId);
    saveModel(activeProvider, modelId);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(value.trim(), selectedModel);
    onChange("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
      }}
    >
      <div style={{ width: "min(720px, 100%)" }}>
        <h2
          style={{
            margin: "0 0 18px",
            fontFamily: "'Lora', serif",
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 500,
            color: "var(--ink)",
            textAlign: "center",
            lineHeight: 1.35,
          }}
        >
          {displayName?.trim() || "ユーザー"}さん、壁打ちを始めましょう
        </h2>

        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "8px",
            background: "white",
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
            padding: "14px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {TEXT_PROVIDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleProviderChange(p)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: `1px solid ${activeProvider === p ? "var(--accent)" : "var(--border)"}`,
                    background: activeProvider === p ? "var(--accent)" : "white",
                    color: activeProvider === p ? "white" : "var(--ink-muted)",
                    fontSize: "12px",
                    fontFamily: "'JetBrains Mono', monospace",
                    cursor: "pointer",
                  }}
                >
                  {MODEL_CONFIG[p].label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {MODEL_CONFIG[activeProvider].models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => handleModelChange(model.id)}
                  title={model.badge}
                  style={{
                    padding: "5px 10px",
                    borderRadius: "6px",
                    border: `1px solid ${selectedModel === model.id ? "var(--accent)" : "var(--border)"}`,
                    background: selectedModel === model.id ? "rgba(196,98,45,0.12)" : "transparent",
                    color: selectedModel === model.id ? "var(--accent)" : "var(--ink-muted)",
                    fontSize: "11px",
                    fontFamily: "'JetBrains Mono', monospace",
                    cursor: "pointer",
                  }}
                >
                  {model.label}
                </button>
              ))}
            </div>

            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="いま考えたいことを書く"
              rows={6}
              disabled={isLoading}
              style={{
                width: "100%",
                resize: "vertical",
                minHeight: "150px",
                maxHeight: "320px",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "14px",
                outline: "none",
                fontSize: "15px",
                lineHeight: 1.7,
                color: "var(--ink)",
                fontFamily: "'DM Sans', sans-serif",
                background: isLoading ? "#f7f7f7" : "white",
                boxSizing: "border-box",
              }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{
                  padding: "9px 18px",
                  borderRadius: "6px",
                  border: "1px solid var(--accent)",
                  background: canSubmit ? "var(--accent)" : "transparent",
                  color: canSubmit ? "white" : "var(--ink-faint)",
                  fontSize: "13px",
                  fontFamily: "'JetBrains Mono', monospace",
                  cursor: canSubmit ? "pointer" : "not-allowed",
                }}
              >
                送信
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
