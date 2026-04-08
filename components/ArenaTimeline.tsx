"use client";

import MarkdownRenderer from "@/components/MarkdownRenderer";
import { Message } from "@/types";

// ── 型定義 ──────────────────────────────────────────────────────

export type Provider = "claude" | "gemini" | "openai" | "human";

export interface ArenaMeta {
  type: "arena";
  ai1Provider: Provider;
  ai2Provider: Provider;
  ai1Prompt?: string;
  ai2Prompt?: string;
  topic: string;
}

export const PROVIDER_LABELS: Record<Provider, string> = {
  claude: "Claude",
  gemini: "Gemini",
  openai: "ChatGPT",
  human: "あなた",
};

export const PROVIDER_COLORS: Record<Provider, { bg: string; border: string; text: string }> = {
  claude: { bg: "#f0f4ff", border: "#a5b4fc", text: "#3730a3" },
  gemini: { bg: "#f0fdf4", border: "#86efac", text: "#166534" },
  openai: { bg: "#fff7ed", border: "#fdba74", text: "#9a3412" },
  human: { bg: "#fdf4ff", border: "#e9d5ff", text: "#6b21a8" },
};

// ── ArenaBubble ─────────────────────────────────────────────────

export function ArenaBubble({
  message,
  ai1Label,
  ai2Label,
  aiMessageIndex,
  ai3Label,
  playerCount = 2,
}: {
  message: Message;
  ai1Label: string;
  ai2Label: string;
  aiMessageIndex: number;
  ai3Label?: string;
  playerCount?: number;
}) {
  const isUser = message.role === "user";
  const isIntervention = isUser && !message.content.startsWith("[Human");

  const provider = message.provider as Provider | "user" | "memo" | "unknown";
  const color =
    provider && provider !== "user" && provider !== "memo" && provider !== "unknown"
      ? PROVIDER_COLORS[provider as Provider]
      : null;

  // playerIndex: ラベル判定用（0=AI1, 1=AI2, 2=AI3）
  const playerIndex = aiMessageIndex >= 0 ? aiMessageIndex % playerCount : 0;

  // 表示位置: 発言順の偶奇で右左を交互に（2人でも3人でも同じリズム）
  // ── 神の介入（中央表示）
  if (isIntervention) {
    return (
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
        <div
          style={{
            background: "#fefce8",
            border: "1px solid #fde68a",
            borderRadius: "8px",
            padding: "8px 16px",
            fontSize: "13px",
            color: "#78350f",
            fontFamily: "'DM Sans', sans-serif",
            maxWidth: "480px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#b7791f",
              marginBottom: "4px",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            ⚡ 神の介入
          </div>
          {message.content.replace("【神からの介入】", "")}
        </div>
      </div>
    );
  }

  // ── 人間の発言（[Human...]プレフィックス付き user メッセージ）
  if (isUser) {
    const displayContent = message.content.replace(/^\[Human[^\]]*\]\s*/, "");
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          marginBottom: "16px",
          width: "100%",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "720px",
            padding: "10px 14px",
            borderRadius: "8px",
            background: "#f7f7f5",
            border: "1px solid #e8e8e8",
            borderLeft: "4px solid var(--accent, #c4622d)",
            fontSize: "14px",
            lineHeight: 1.6,
            color: "var(--ink)",
            fontFamily: "'DM Sans', sans-serif",
            boxShadow: "none",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: 600, color: "#888888", marginBottom: "6px", letterSpacing: "0.05em", fontFamily: "'JetBrains Mono', monospace" }}>
            👤 あなた (AI{playerIndex + 1})
          </div>
          <MarkdownRenderer content={displayContent} />
        </div>
      </div>
    );
  }

  // ── AI発言
  const labelTexts = [
    `${ai1Label} (AI1)`,
    `${ai2Label} (AI2)`,
    `${ai3Label ?? "AI3"} (AI3)`,
  ];
  const label = labelTexts[playerIndex] ?? labelTexts[0];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: "16px",
        width: "100%",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "720px",
          padding: "10px 14px",
          borderRadius: "8px",
          background: "#ffffff",
          border: "1px solid #e8e8e8",
          borderLeft: `4px solid ${color?.border ?? "#e8e8e8"}`,
          fontSize: "14px",
          lineHeight: 1.6,
          color: "var(--ink)",
          fontFamily: "'DM Sans', sans-serif",
          boxShadow: "none",
        }}
      >
        <div style={{
          fontSize: "11px",
          fontWeight: 600,
          color: color?.text ?? "#888888",
          marginBottom: "6px",
          letterSpacing: "0.05em",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {label}
        </div>
        <MarkdownRenderer content={message.content} />
      </div>
    </div>
  );
}

// ── ArenaThinking ────────────────────────────────────────────────

export function ArenaThinking({ label, isAi1 }: { label: string; isAi1: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: "16px",
        width: "100%",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "720px",
          borderRadius: "8px",
          padding: "14px 16px",
          background: "#ffffff",
          border: "1px solid #e8e8e8",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          boxShadow: "none",
        }}
      >
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#888888", letterSpacing: "0.05em", fontFamily: "'JetBrains Mono', monospace" }}>
          {label}
        </div>
        <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="thinking-dot"
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "var(--ink-faint)",
                display: "block",
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ArenaTimeline（観戦ページ用） ────────────────────────────────

export function ArenaTimeline({ messages }: { messages: Message[] }) {
  let aiIdx = 0;
  return (
    <>
      {messages.map((msg) => {
        const isAiMsg = msg.role === "assistant";
        const currentAiIdx = isAiMsg ? aiIdx : -1;
        if (isAiMsg) aiIdx++;

        const provider = msg.provider as Provider | "user" | "memo" | "unknown";
        const ai1Label =
          currentAiIdx % 2 === 0 && provider && PROVIDER_LABELS[provider as Provider]
            ? PROVIDER_LABELS[provider as Provider]
            : "AI1";
        const ai2Label =
          currentAiIdx % 2 !== 0 && provider && PROVIDER_LABELS[provider as Provider]
            ? PROVIDER_LABELS[provider as Provider]
            : "AI2";

        return (
          <ArenaBubble
            key={msg.id}
            message={msg}
            ai1Label={ai1Label}
            ai2Label={ai2Label}
            aiMessageIndex={currentAiIdx}
          />
        );
      })}
    </>
  );
}
