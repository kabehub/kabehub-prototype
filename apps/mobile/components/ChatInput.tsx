"use client";

import type {
  ModelId as SharedModelId,
  TextProvider,
} from "@kabehub/shared";

export type ModelId = SharedModelId;
export type Provider = TextProvider;

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
  onProviderChange: (provider: Provider) => void;
}

export default function ChatInput(_props: ChatInputProps) {
  return (
    <div className="chat-stub-input" aria-label="メッセージ入力">
      入力欄は14-Cで実装されます
    </div>
  );
}
