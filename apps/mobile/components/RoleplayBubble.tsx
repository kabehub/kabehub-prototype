"use client";

import type { Message, TextProvider } from "@kabehub/shared";

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
  isHighlighted?: boolean;
  isActiveMatch?: boolean;
  activeFlashKey?: number;
  messageNumber?: number;
}

export default function RoleplayBubble({
  message,
  charName,
}: RoleplayBubbleProps) {
  return (
    <article className="chat-stub-roleplay-message">
      <strong>{charName}</strong>
      <p>{message.content}</p>
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
  streamingContent,
}: RoleplayThinkingBubbleProps) {
  return (
    <div className="chat-thinking">
      {charName}: {streamingContent || "生成中…"}
    </div>
  );
}
