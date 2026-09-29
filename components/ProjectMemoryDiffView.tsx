"use client";

import { useMemo } from "react";
import { diffLines } from "diff";

export default function ProjectMemoryDiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const parts = useMemo(() => diffLines(oldText, newText), [oldText, newText]);

  return (
    <div
      aria-label="変更差分"
      style={{
        border: "1px solid var(--border, #e5e7eb)",
        borderRadius: "7px",
        overflow: "hidden",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "11px",
        lineHeight: 1.6,
      }}
    >
      {parts.map((part, partIndex) => {
        const lines = part.value.match(/[^\n]*\n|[^\n]+$/g) ?? [part.value];
        const prefix = part.added ? "+" : part.removed ? "−" : " ";
        const background = part.added ? "#ecfdf5" : part.removed ? "#fef2f2" : "#ffffff";
        const color = part.added ? "#065f46" : part.removed ? "#991b1b" : "var(--ink-muted, #6b7280)";
        return lines.map((line, lineIndex) => (
          <div
            key={`${partIndex}-${lineIndex}`}
            style={{
              display: "grid",
              gridTemplateColumns: "22px minmax(0, 1fr)",
              background,
              color,
            }}
          >
            <span
              aria-hidden="true"
              style={{ textAlign: "center", userSelect: "none", opacity: 0.8 }}
            >
              {prefix}
            </span>
            <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {line}
            </span>
          </div>
        ));
      })}
    </div>
  );
}
