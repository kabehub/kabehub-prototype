"use client";

import type { Message, TextProvider } from "@kabehub/shared";

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
  isHighlighted?: boolean;
  isActiveMatch?: boolean;
  activeFlashKey?: number;
  messageNumber?: number;
  thinkingContent?: string;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <article className="chat-stub-message" data-message-role={message.role}>
      {message.content}
    </article>
  );
}

export function ThinkingBubble() {
  return <div className="chat-thinking">生成中…</div>;
}
