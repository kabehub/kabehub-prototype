"use client";

import { useRef, useEffect, KeyboardEvent } from "react";

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  onMemoSubmit: () => void; // 追加：メモ送信
  isLoading: boolean;
  disabled?: boolean;
  provider: "claude" | "gemini";
  onProviderChange: (p: "claude" | "gemini") => void;
}

export default function ChatInput({
  value,
  onChange,
  onSubmit,
  onMemoSubmit,
  isLoading,
  disabled,
  provider,
  onProviderChange,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = Math.min(scrollHeight, 240) + "px";
    }
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) onSubmit();
    }
  };

  return (
    <div style={{ padding: "16px 24px 20px", borderTop: "1px solid var(--border)", background: "var(--chat-bg)" }}>
      {/* AI切り替えボタン */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
        {(["claude", "gemini"] as const).map((p) => (
          <button
            key={p}
            onClick={() => onProviderChange(p)}
            style={{
              padding: "4px 12px",
              borderRadius: "20px",
              border: "1px solid",
              borderColor: provider === p ? "var(--accent)" : "var(--border)",
              background: provider === p ? "var(--accent)" : "white",
              color: provider === p ? "white" : "var(--ink-muted)",
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              cursor: "pointer",
              transition: "all 0.15s",
              letterSpacing: "0.05em",
            }}
          >
            {p === "claude" ? "Claude" : "Gemini"}
          </button>
        ))}
      </div>

      <div
        style={{
          position: "relative",
          background: "white",
          border: "1px solid var(--border)",
          borderRadius: "10px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          transition: "box-shadow 0.2s, border-color 0.2s",
        }}
        onFocusCapture={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 0 2px rgba(196,98,45,0.15)";
          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent-muted)";
        }}
        onBlurCapture={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isLoading}
          placeholder="思考を入力… (Enter で送信 / Shift+Enter で改行)"
          rows={3}
          style={{
            width: "100%",
            resize: "none",
            border: "none",
            outline: "none",
            background: "transparent",
            padding: "14px 48px 14px 16px",
            fontSize: "14px",
            fontFamily: "'DM Sans', sans-serif",
            color: "var(--ink)",
            lineHeight: 1.6,
            minHeight: "80px",
            maxHeight: "240px",
            overflowY: "auto",
          }}
        />
        {/* 送信ボタン（右下） */}
        <button
          onClick={onSubmit}
          disabled={isLoading || !value.trim() || disabled}
          style={{
            position: "absolute",
            right: "10px",
            bottom: "10px",
            width: "32px",
            height: "32px",
            borderRadius: "7px",
            border: "none",
            background: isLoading || !value.trim() ? "var(--ink-faint)" : "var(--accent)",
            color: "white",
            cursor: isLoading || !value.trim() ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s, transform 0.1s",
            fontSize: "14px",
          }}
          title="AIに送信 (Enter)"
        >
          {isLoading ? (
            <span style={{ fontSize: "10px", letterSpacing: "1px" }}>…</span>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 12V2M7 2L2 7M7 2L12 7" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      {/* 下部ボタン行：メモボタン（左）＋ ヒントテキスト（右） */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px" }}>
        {/* 📝 メモボタン */}
        <button
          onClick={onMemoSubmit}
          disabled={!value.trim() || isLoading || disabled}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            padding: "4px 12px",
            borderRadius: "20px",
            border: "1px solid",
            borderColor: value.trim() && !isLoading ? "#d69e2e" : "var(--border)",
            background: value.trim() && !isLoading ? "#fefce8" : "transparent",
            color: value.trim() && !isLoading ? "#92400e" : "var(--ink-faint)",
            fontSize: "11px",
            fontFamily: "'JetBrains Mono', monospace",
            cursor: value.trim() && !isLoading ? "pointer" : "default",
            transition: "all 0.15s",
            letterSpacing: "0.03em",
          }}
          title="AIに送らずメモとして記録"
        >
          📝 メモ
        </button>

        <div style={{ fontSize: "10px", color: "var(--ink-faint)", letterSpacing: "0.03em" }}>
          Enter で送信 · Shift+Enter で改行
        </div>
      </div>
    </div>
  );
}
