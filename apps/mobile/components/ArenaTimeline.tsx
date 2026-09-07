"use client";

import type { Message } from "@kabehub/shared";

import MarkdownRenderer from "./MarkdownRenderer";

import { MODEL_REGISTRY } from "@kabehub/shared";

export function getArenaMessageLabel(message: Message, providerLabel: string): string {
  if (!message.model_id) return providerLabel;
  const modelLabel = MODEL_REGISTRY.find((model) => model.id === message.model_id)?.label ?? message.model_id;
  return providerLabel + " / " + modelLabel;
}

export type Provider = "claude" | "gemini" | "openai" | "human";

export const PROVIDER_LABELS: Record<Provider, string> = {
  claude: "Claude",
  gemini: "Gemini",
  openai: "ChatGPT",
  human: "あなた",
};

export const PROVIDER_CLASS_NAMES: Record<Provider, string> = {
  claude: "arena-provider-claude",
  gemini: "arena-provider-gemini",
  openai: "arena-provider-openai",
  human: "arena-provider-human",
};

function isProvider(value: unknown): value is Provider {
  return (
    value === "claude" ||
    value === "gemini" ||
    value === "openai" ||
    value === "human"
  );
}

export function ArenaBubble({
  message,
  ai1Label,
  ai2Label,
  aiMessageIndex,
  ai3Label,
  playerCount = 2,
  playerIndex,
}: {
  message: Message;
  ai1Label: string;
  ai2Label: string;
  aiMessageIndex: number;
  ai3Label?: string;
  playerCount?: number;
  playerIndex?: number;
}) {
  const isUser = message.role === "user";
  const isIntervention = isUser && !message.content.startsWith("[Human");

  if (isIntervention) {
    return (
      <div className="arena-intervention-row">
        <div className="arena-intervention-bubble">
          <div className="arena-intervention-label">⚡ 神の介入</div>
          {message.content.replace("【神からの介入】", "")}
        </div>
      </div>
    );
  }

  const legacyPlayerIndex = aiMessageIndex >= 0 ? aiMessageIndex % playerCount : 0;
  const resolvedPlayerIndex = playerIndex ?? legacyPlayerIndex;

  if (isUser) {
    const displayContent = message.content.replace(/^\[Human[^\]]*\]\s*/, "");
    return (
      <div className="arena-message-row">
        <div className="arena-message-bubble arena-human-bubble arena-provider-human">
          <div className="arena-message-label">👤 あなた (AI{resolvedPlayerIndex + 1})</div>
          <MarkdownRenderer content={displayContent} />
        </div>
      </div>
    );
  }

  const providerLabels = [ai1Label, ai2Label, ai3Label ?? "AI3"];
  const providerLabel = providerLabels[resolvedPlayerIndex] ?? ai1Label;
  const label = getArenaMessageLabel(message, providerLabel) + ` (AI${resolvedPlayerIndex + 1})`;
  const providerClass = isProvider(message.provider)
    ? PROVIDER_CLASS_NAMES[message.provider]
    : "arena-provider-neutral";

  return (
    <div className="arena-message-row">
      <div className={`arena-message-bubble arena-ai-bubble ${providerClass}`}>
        <div className="arena-message-label">{label}</div>
        <MarkdownRenderer content={message.content} />
      </div>
    </div>
  );
}

export function ArenaThinking({ label }: { label: string; isAi1: boolean }) {
  return (
    <div className="arena-message-row" aria-live="polite">
      <div className="arena-thinking-bubble">
        <div className="arena-thinking-label">{label}</div>
        <div className="arena-thinking-dots" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="thinking-dot arena-thinking-dot"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ArenaTimeline({ messages }: { messages: Message[] }) {
  let aiIndex = 0;

  return (
    <>
      {messages.map((message) => {
        const isAiMessage = message.role === "assistant";
        const currentAiIndex = isAiMessage ? aiIndex : -1;
        if (isAiMessage) aiIndex += 1;

        const providerLabel = isProvider(message.provider)
          ? PROVIDER_LABELS[message.provider]
          : null;
        const ai1Label =
          currentAiIndex % 2 === 0 && providerLabel ? providerLabel : "AI1";
        const ai2Label =
          currentAiIndex % 2 !== 0 && providerLabel ? providerLabel : "AI2";

        return (
          <ArenaBubble
            key={message.id}
            message={message}
            ai1Label={ai1Label}
            ai2Label={ai2Label}
            aiMessageIndex={currentAiIndex}
          />
        );
      })}
    </>
  );
}
