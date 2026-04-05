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
  // aiMessageIndex: 0=右, 1=左, 2=右, 3=左, 4=右…
  // -1（神の介入）は中央表示なので下のisIntervention分岐で処理済み
  const isRight = aiMessageIndex >= 0 ? aiMessageIndex % 2 === 0 : true;

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
    const humanColor = PROVIDER_COLORS["human"];
    const displayContent = message.content.replace(/^\[Human[^\]]*\]\s*/, "");
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: isRight ? "flex-end" : "flex-start",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: humanColor.text,
            marginBottom: "5px",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          👤 あなた (AI{playerIndex + 1})
        </div>
        <div
          style={{
            maxWidth: "520px",
            borderRadius: isRight ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
            padding: "14px 18px",
            background: humanColor.bg,
            border: `1px solid ${humanColor.border}`,
            fontSize: "14px",
            lineHeight: 1.6,
            color: "var(--ink)",
            fontFamily: "'DM Sans', sans-serif",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}
        >
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
        flexDirection: "column",
        alignItems: isRight ? "flex-end" : "flex-start",
        marginBottom: "20px",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: color?.text ?? "var(--ink-faint)",
          marginBottom: "5px",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {label}
      </div>
      <div
        style={{
          maxWidth: "520px",
          borderRadius: isRight ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
          padding: "14px 18px",
          background: color?.bg ?? "var(--bubble-ai)",
          border: `1px solid ${color?.border ?? "var(--border)"}`,
          fontSize: "14px",
          lineHeight: 1.6,
          color: "var(--ink)",
          fontFamily: "'DM Sans', sans-serif",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
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
        flexDirection: "column",
        alignItems: isAi1 ? "flex-end" : "flex-start",
        marginBottom: "20px",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-faint)",
          marginBottom: "5px",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {label}
      </div>
      <div
        style={{
          borderRadius: isAi1 ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
          padding: "14px 18px",
          background: "var(--bubble-ai)",
          border: "1px solid var(--border)",
          display: "flex",
          gap: "5px",
          alignItems: "center",
        }}
      >
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
