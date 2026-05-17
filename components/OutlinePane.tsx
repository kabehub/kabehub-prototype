"use client";

import { useState, useEffect } from "react";
import { Message } from "@/types";
import { generateMessageSummary } from "@/lib/stringUtils";

interface OutlinePaneProps {
  messages: Message[];
  isOpen: boolean;
  onToggle: () => void;
}

export default function OutlinePane({ messages, isOpen, onToggle }: OutlinePaneProps) {
  const [isWide, setIsWide] = useState(true);

  useEffect(() => {
    const check = () => setIsWide(window.innerWidth >= 1280);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  let counter = 0;
  const items = messages
    .filter((msg) => msg.provider !== "memo")
    .map((msg) => {
      counter++;
      return { msg, num: counter };
    });

  const paneWidth = isOpen ? 220 : 0;

  const paneStyle: React.CSSProperties = isWide
    ? {
        width: paneWidth,
        minWidth: paneWidth,
        overflow: "hidden",
        transition: "width 0.2s ease, min-width 0.2s ease",
        borderLeft: isOpen ? "1px solid var(--border)" : "none",
        background: "white",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        flexShrink: 0,
      }
    : {
        position: "fixed",
        right: 0,
        top: 0,
        width: paneWidth,
        height: "100vh",
        overflow: "hidden",
        transition: "width 0.2s ease",
        borderLeft: isOpen ? "1px solid var(--border)" : "none",
        background: "white",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
      };

  const toggleBtnStyle: React.CSSProperties = {
    position: "fixed",
    right: isOpen ? 220 : 0,
    top: "50%",
    transform: "translateY(-50%)",
    width: 24,
    height: 48,
    background: "white",
    border: "1px solid var(--border)",
    borderRight: "none",
    borderRadius: "6px 0 0 6px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    color: "var(--ink-muted)",
    transition: "right 0.2s ease",
    zIndex: 101,
    boxShadow: "-2px 0 6px rgba(0,0,0,0.06)",
  };

  return (
    <>
      <button style={toggleBtnStyle} onClick={onToggle} title={isOpen ? "アウトラインを閉じる" : "アウトラインを開く"}>
        {isOpen ? "▶" : "◀"}
      </button>
      <div style={paneStyle}>
        {isOpen && (
          <>
            <div style={{
              padding: "12px 12px 8px",
              fontSize: "10px",
              fontFamily: "'JetBrains Mono', monospace",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--ink-faint)",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}>
              Outline
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
              {items.length === 0 && (
                <div style={{ padding: "16px 12px", fontSize: "11px", color: "var(--ink-faint)", fontFamily: "'DM Sans', sans-serif" }}>
                  メッセージがありません
                </div>
              )}
              {items.map(({ msg, num }) => (
                <button
                  key={msg.id}
                  onClick={() =>
                    document.getElementById("msg-" + msg.id)?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "5px 10px 5px 10px",
                    background: "none",
                    border: "none",
                    borderLeft: `2px solid ${msg.role === "user" ? "var(--accent)" : "var(--border)"}`,
                    cursor: "pointer",
                    fontSize: "11px",
                    fontFamily: "'DM Sans', sans-serif",
                    lineHeight: 1.4,
                    color: msg.role === "user" ? "var(--accent)" : "var(--ink-muted)",
                    marginBottom: "1px",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "#f7f7f5";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "none";
                  }}
                >
                  <span style={{
                    fontSize: "9px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "var(--ink-faint)",
                    display: "block",
                    marginBottom: "1px",
                  }}>
                    #{num}
                  </span>
                  {generateMessageSummary(msg.content)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
