import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { KabeCard, KabeCardTone } from "@kabehub/shared";
import InlineMarkdownCode from "./InlineMarkdownCode";

const TONE_STYLES: Record<KabeCardTone, {
  background: string; border: string; icon: string; label: string;
}> = {
  positive: { background: "#f0fdf4", border: "#bbf7d0", icon: "#15803d", label: "#166534" },
  neutral: { background: "#f8fafc", border: "#e2e8f0", icon: "#64748b", label: "#475569" },
  warning: { background: "#fffbeb", border: "#fde68a", icon: "#b45309", label: "#92400e" },
  negative: { background: "#fef2f2", border: "#fecaca", icon: "#b91c1c", label: "#991b1b" },
};

export default function KabeCardView({
  card,
  variant = "default",
}: { card: KabeCard; variant?: "default" | "share" }) {
  const tone = card.tone ?? "neutral";
  const colors = TONE_STYLES[tone];
  const hasHeader = Boolean(card.badge || card.meta || card.tone);
  return (
    <div
      className="not-prose"
      data-kabe-card
      role="group"
      aria-label={card.title}
      style={{
        border: "1px solid var(--border, #e0d9cc)",
        borderRadius: "12px",
        overflow: "hidden",
        background: "#ffffff",
        margin: "12px 0",
      }}
    >
      {hasHeader && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
          padding: "7px 14px", background: colors.background,
          borderBottom: `1px solid ${colors.border}`,
        }}>
          <svg
            width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke={colors.icon} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ flex: "none" }}
          >
            {tone === "warning" ? <path d="M12 4l9 16H3z" /> : <circle cx="12" cy="12" r="9" />}
            {tone === "positive" && <path d="M8 12.5l3 3 5-6" />}
            {tone === "neutral" && <path d="M12 11v5M12 8h.01" />}
            {tone === "warning" && <path d="M12 10v4M12 17h.01" />}
            {tone === "negative" && <path d="M9 9l6 6M15 9l-6 6" />}
          </svg>
          {card.badge && <span style={{ fontSize: "12px", fontWeight: 700, color: colors.label }}>{card.badge}</span>}
          {card.meta && <span style={{ fontSize: "11px", color: "#4b5563", marginLeft: "auto" }}>{card.meta}</span>}
        </div>
      )}
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--ink, #1f2937)" }}>{card.title}</div>
        {card.body && (
          <div style={{ fontSize: "13px", lineHeight: 1.7, color: "var(--ink, #1f2937)" }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              allowedElements={["p", "strong", "em", "del", "a", "code", "br", "ul", "ol", "li"]}
              unwrapDisallowed
              components={{
                p({ children }) { return <p style={{ margin: 0 }}>{children}</p>; },
                ul({ children }) { return <ul style={{ margin: "2px 0", paddingLeft: "1.25em", listStyleType: "disc" }}>{children}</ul>; },
                ol({ children, start }) { return <ol start={typeof start === "number" ? start : undefined} style={{ margin: "2px 0", paddingLeft: "1.5em", listStyleType: "decimal" }}>{children}</ol>; },
                li({ children }) { return <li style={{ margin: 0 }}>{children}</li>; },
                code({ node: _node, ...props }) {
                  return <InlineMarkdownCode {...props} variant={variant} />;
                },
              }}
            >
              {card.body}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
