"use client";

import type { ChatInputProps } from "./ChatInput";

export interface ChatInputCenteredProps extends ChatInputProps {
  displayName?: string | null;
}

export default function ChatInputCentered(_props: ChatInputCenteredProps) {
  return (
    <div className="chat-stub-input chat-stub-input-centered">
      中央入力欄は14-Cで実装されます
    </div>
  );
}
