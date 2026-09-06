"use client";

import { useEffect, useRef, useState } from "react";
import type { Message, TextProvider } from "@kabehub/shared";

import MarkdownRenderer from "./MarkdownRenderer";

const REGEN_PROVIDERS = ["claude", "gemini", "openai"] as const;

export interface RoleplayBubbleProps {
  message: Message;
  charName: string;
  charIconUrl: string | null;
  isLast?: boolean;
  isLoading?: boolean;
  provider?: TextProvider;
  onRegenerate?: (
    targetProvider: TextProvider,
    assistantMessage?: Message,
    modelId?: string
  ) => void;
  onTrimFrom?: (message: Message) => void;
  isHighlighted?: boolean;
  isActiveMatch?: boolean;
  activeFlashKey?: number;
  messageNumber?: number;
}

function providerLabel(provider: TextProvider): string {
  if (provider === "claude") return "Claude";
  if (provider === "gemini") return "Gemini";
  return "ChatGPT";
}

export default function RoleplayBubble({
  message,
  charName,
  charIconUrl,
  isLast = false,
  isLoading = false,
  onRegenerate,
  onTrimFrom,
  isHighlighted = false,
  isActiveMatch = false,
  activeFlashKey,
  messageNumber,
}: RoleplayBubbleProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = null;
    }, 1500);
  };

  const rootClassName = [
    "chat-roleplay-bubble",
    isHighlighted ? "chat-roleplay-bubble-highlighted" : "",
    isActiveMatch ? "chat-roleplay-bubble-active-match" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={rootClassName}>
      {isActiveMatch && activeFlashKey !== undefined && (
        <span
          key={activeFlashKey}
          className="chat-bubble-active-flash"
          aria-hidden="true"
        />
      )}

      <div className="chat-roleplay-bubble-layout">
        <div className="chat-roleplay-avatar" aria-hidden={!charIconUrl}>
          {charIconUrl ? (
            <img src={charIconUrl} alt={charName} />
          ) : (
            <span aria-hidden="true">🤖</span>
          )}
        </div>

        <div className="chat-roleplay-bubble-main">
          <header className="chat-roleplay-bubble-header">
            <span className="chat-roleplay-name">
              {charName}
              {messageNumber ? " · #" + messageNumber : ""}
            </span>
            <button
              type="button"
              className="chat-bubble-copy"
              aria-label="メッセージをコピー"
              onClick={() => void handleCopy()}
            >
              {copied ? "✓ コピー済み" : "📋 コピー"}
            </button>
          </header>

          <div className="chat-roleplay-bubble-content">
            <MarkdownRenderer content={message.content} />
          </div>
        </div>
      </div>

      <div className="chat-roleplay-actions">
        {!isLoading && onTrimFrom && (
          <button
            type="button"
            className="chat-bubble-action chat-bubble-delete"
            onClick={() => {
              if (window.confirm("このメッセージ以降を全て削除しますか？")) {
                onTrimFrom(message);
              }
            }}
          >
            ✂️ 削除
          </button>
        )}

        {isLast && !isLoading && onRegenerate && (
          <div className="chat-bubble-regenerate" aria-label="再生成先">
            {REGEN_PROVIDERS.map((targetProvider) => (
              <button
                type="button"
                className="chat-bubble-action"
                key={targetProvider}
                onClick={() => onRegenerate(targetProvider, message)}
              >
                🔄 {providerLabel(targetProvider)}で再生成
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export interface RoleplayThinkingBubbleProps {
  charName: string;
  charIconUrl: string | null;
  streamingContent?: string;
}

export function RoleplayThinkingBubble({
  charName,
  charIconUrl,
  streamingContent,
}: RoleplayThinkingBubbleProps) {
  return (
    <div className="chat-roleplay-thinking" role="status">
      <div className="chat-roleplay-avatar" aria-hidden={!charIconUrl}>
        {charIconUrl ? (
          <img src={charIconUrl} alt={charName} />
        ) : (
          <span aria-hidden="true">🤖</span>
        )}
      </div>
      <div className="chat-roleplay-thinking-main">
        <div className="chat-roleplay-thinking-label">
          <span>{charName}</span>
          <span>{streamingContent ? "入力中…" : "考え中…"}</span>
        </div>
        <div className="chat-roleplay-thinking-content">
          {streamingContent || (
            <span className="chat-roleplay-thinking-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
