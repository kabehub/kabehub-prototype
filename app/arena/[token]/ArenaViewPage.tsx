"use client";

import { Message } from "@/types";
import {
  ArenaBubble,
  ArenaMeta,
  PROVIDER_LABELS,
  PROVIDER_COLORS,
  Provider,
} from "@/components/ArenaTimeline";

interface ArenaThread {
  id: string;
  title: string;
  metadata?: ArenaMeta;
}

interface Props {
  thread: ArenaThread;
  messages: Message[];
}

export default function ArenaViewPage({ thread, messages }: Props) {
  const meta = thread.metadata;

  const ai1Provider = meta?.ai1Provider ?? "claude";
  const ai2Provider = meta?.ai2Provider ?? "gemini";
  const ai1Label = PROVIDER_LABELS[ai1Provider] ?? "AI1";
  const ai2Label = PROVIDER_LABELS[ai2Provider] ?? "AI2";
  const topic = meta?.topic ?? thread.title ?? "";

  const ai1Color = PROVIDER_COLORS[ai1Provider as Provider];
  const ai2Color = PROVIDER_COLORS[ai2Provider as Provider];

  const totalTurns = Math.floor(messages.filter((m) => m.role === "assistant").length / 2);

  // ── Xシェア ──────────────────────────────────────────────────
  const xShareUrl = (() => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = `【AI闘技場】${ai1Label} vs ${ai2Label}\nお題：${topic}\n\n#KabeHub #AI闘技場`;
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  })();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", display: "flex", flexDirection: "column" }}>

      {/* ヘッダー */}
      <div style={{ position: "sticky", top: 0, background: "var(--paper)", borderBottom: "1px solid var(--border)", padding: "12px 24px", display: "flex", alignItems: "center", gap: "16px", zIndex: 10 }}>

        <a
          href="/arena"
          style={{ padding: "4px 10px", borderRadius: "5px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", textDecoration: "none" }}
        >
          ⚔️ 自分も対戦
        </a>

        {/* AI1 vs AI2 バッジ */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, justifyContent: "center" }}>
          <span style={{ padding: "3px 10px", borderRadius: "5px", border: `1px solid ${ai1Color.border}`, background: ai1Color.bg, color: ai1Color.text, fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>
            {ai1Label} (AI1)
          </span>
          <span style={{ fontSize: "13px", color: "var(--ink-faint)", fontWeight: 700 }}>⚔️</span>
          <span style={{ padding: "3px 10px", borderRadius: "5px", border: `1px solid ${ai2Color.border}`, background: ai2Color.bg, color: ai2Color.text, fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>
            {ai2Label} (AI2)
          </span>
          {totalTurns > 0 && (
            <span style={{ fontSize: "11px", color: "var(--ink-faint)", fontFamily: "'JetBrains Mono', monospace", marginLeft: "8px" }}>
              {totalTurns}ターン
            </span>
          )}
        </div>

        {/* Xシェアボタン */}
        <a
          href={xShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ padding: "4px 12px", borderRadius: "5px", border: "1px solid #1d9bf0", background: "#1d9bf0", color: "white", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" }}
        >
          𝕏 シェア
        </a>
      </div>

      {/* お題バナー */}
      <div style={{ maxWidth: "760px", width: "100%", margin: "0 auto", padding: "20px 24px 0" }}>
        <div style={{ background: "#f5f3ff", border: "1px solid #e9d5ff", borderRadius: "8px", padding: "12px 16px", fontSize: "14px", color: "#4c1d95", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
          <span style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "#7c3aed", display: "block", marginBottom: "4px", letterSpacing: "0.05em" }}>お題</span>
          {topic}
        </div>
      </div>

      {/* タイムライン */}
      <div style={{ flex: 1, maxWidth: "760px", width: "100%", margin: "0 auto", padding: "24px 24px 48px" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", marginTop: "60px", color: "var(--ink-muted)", fontSize: "13px", fontFamily: "'JetBrains Mono', monospace" }}>
            まだ発言がありません
          </div>
        )}
        {(() => {
          let aiIdx = 0;
          return messages.map((msg) => {
            const isAiMsg = msg.role === "assistant";
            const currentAiIdx = isAiMsg ? aiIdx : -1;
            if (isAiMsg) aiIdx++;
            return (
              <ArenaBubble
                key={msg.id}
                message={msg}
                ai1Label={ai1Label}
                ai2Label={ai2Label}
                aiMessageIndex={currentAiIdx}
              />
            );
          });
        })()}
      </div>

      {/* フッター */}
      <div style={{ textAlign: "center", padding: "16px", borderTop: "1px solid var(--border)", fontSize: "12px", color: "var(--ink-faint)", fontFamily: "'JetBrains Mono', monospace" }}>
        <a href="/" style={{ color: "var(--ink-muted)", textDecoration: "none" }}>KabeHub</a>
        {" "}— 思考のGitHub
      </div>
    </div>
  );
}
