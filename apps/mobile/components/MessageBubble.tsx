"use client";

import { useEffect, useRef, useState } from "react";
import type { Message, TextProvider } from "@kabehub/shared";

import MarkdownRenderer from "./MarkdownRenderer";

const USER_COLLAPSE_THRESHOLD = 128;
const REGEN_PROVIDERS = ["claude", "gemini", "openai"] as const;

export interface MessageBubbleProps {
  message: Message;
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
  thinkingContent?: string;
}

function providerLabel(provider: TextProvider): string {
  if (provider === "claude") return "Claude";
  if (provider === "gemini") return "Gemini";
  return "ChatGPT";
}

export default function MessageBubble({
  message,
  isLast = false,
  isLoading = false,
  provider,
  onRegenerate,
  onTrimFrom,
  isHighlighted = false,
  isActiveMatch = false,
  activeFlashKey,
  messageNumber,
  thinkingContent,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isMemo = message.provider === "memo";
  const isImageGen = message.provider === "image_gen";
  const shouldCollapseUserMessage = isUser && !isMemo && !isImageGen;
  const [copied, setCopied] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setIsCollapsed(true);

    if (!shouldCollapseUserMessage || !contentRef.current) {
      setNeedsCollapse(false);
      return;
    }

    const element = contentRef.current;
    const measure = () => {
      setNeedsCollapse(element.scrollHeight > USER_COLLAPSE_THRESHOLD + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [message.content, message.id, shouldCollapseUserMessage]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = null;
    }, 1500);
  };

  const aiLabel = () => {
    const resolvedProvider = message.provider ?? provider;
    const name =
      resolvedProvider === "claude" ||
      resolvedProvider === "gemini" ||
      resolvedProvider === "openai"
        ? providerLabel(resolvedProvider)
        : resolvedProvider === "image_gen"
          ? "🖼️ 画像生成"
          : "AI";
    const number = messageNumber ? " · #" + messageNumber : "";
    const model = message.model_id ? " · " + message.model_id : "";
    return name + number + model;
  };

  const rootClassName = [
    "chat-bubble",
    isUser ? "chat-bubble-user" : "chat-bubble-assistant",
    isMemo ? "chat-bubble-memo" : "",
    isImageGen ? "chat-bubble-image" : "",
    isHighlighted ? "chat-bubble-highlighted" : "",
    isActiveMatch ? "chat-bubble-active-match" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const userContentClassName = [
    "chat-bubble-user-content",
    needsCollapse && isCollapsed ? "chat-bubble-user-content-collapsed" : "",
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

      <header className="chat-bubble-header">
        <span className="chat-bubble-label">
          {isMemo
            ? "📝 Memo"
            : isUser
              ? messageNumber
                ? "You · #" + messageNumber
                : "You"
              : aiLabel()}
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

      {thinkingContent && !isUser && !isMemo && (
        <section className="chat-bubble-thinking">
          <button
            type="button"
            className="chat-bubble-thinking-toggle"
            aria-expanded={thinkingExpanded}
            onClick={() => setThinkingExpanded((current) => !current)}
          >
            🧠 思考プロセス {thinkingExpanded ? "▲" : "▼"}
          </button>
          {thinkingExpanded && (
            <div className="chat-bubble-thinking-content">
              {thinkingContent}
            </div>
          )}
        </section>
      )}

      <div className="chat-bubble-content">
        {isMemo ? (
          <div className="chat-bubble-memo-content">{message.content}</div>
        ) : isImageGen ? (
          <div className="chat-bubble-image-content">
            <p className="chat-bubble-image-placeholder">
              🖼️ 画像メッセージ（モバイル版では画像表示は今後対応予定）
            </p>
            <p className="chat-bubble-image-prompt">{message.content}</p>
          </div>
        ) : isUser ? (
          <div ref={contentRef} className={userContentClassName}>
            {message.content}
          </div>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}
      </div>

      {shouldCollapseUserMessage && needsCollapse && (
        <button
          type="button"
          className="chat-bubble-collapse-toggle"
          aria-expanded={!isCollapsed}
          onClick={() => setIsCollapsed((current) => !current)}
        >
          {isCollapsed ? "全文を表示" : "折りたたむ"}
        </button>
      )}

      <div className="chat-bubble-actions">
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

        {!isUser &&
          !isMemo &&
          !isImageGen &&
          isLast &&
          !isLoading &&
          onRegenerate && (
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

export function ThinkingBubble() {
  return (
    <div className="chat-thinking" role="status">
      生成中…
    </div>
  );
}
