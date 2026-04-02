"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  /** メイン画面用（背景が暗い・白文字）か共有ページ用（白背景）か */
  variant?: "default" | "share";
}

export default function MarkdownRenderer({ content, variant = "default" }: MarkdownRendererProps) {
  const isShare = variant === "share";

  return (
    <div
      className={isShare ? "prose prose-sm max-w-none" : "prose-custom"}
      style={isShare ? {
        color: "#111827",
        fontSize: "14px",
        lineHeight: 1.8,
      } : undefined}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const isBlock = !!className?.includes("language-");
            if (isBlock) {
              return (
                <pre style={{
                  background: isShare ? "#f8fafc" : "#1e1e2e",
                  border: isShare ? "1px solid #e2e8f0" : "none",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  overflowX: "auto",
                  fontSize: "13px",
                  fontFamily: "'JetBrains Mono', monospace",
                  lineHeight: 1.6,
                  margin: "8px 0",
                }}>
                  <code style={{
                    color: isShare ? "#1e293b" : "#cdd6f4",
                    fontFamily: "'JetBrains Mono', monospace",
                    background: "none",
                    padding: 0,
                  }}>
                    {children}
                  </code>
                </pre>
              );
            }
            return (
              <code
                style={{
                  background: isShare ? "#f1f5f9" : "rgba(255,255,255,0.15)",
                  border: isShare ? "1px solid #e2e8f0" : "none",
                  borderRadius: "4px",
                  padding: "1px 5px",
                  fontSize: "13px",
                  fontFamily: "'JetBrains Mono', monospace",
                  color: isShare ? "#1e293b" : "inherit",
                }}
                {...props}
              >
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div style={{ overflowX: "auto", margin: "12px 0" }}>
                <table style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  fontSize: "13px",
                }}>
                  {children}
                </table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th style={{
                border: "1px solid #e2e8f0",
                padding: "6px 12px",
                background: isShare ? "#f8fafc" : "rgba(255,255,255,0.1)",
                fontWeight: 600,
                textAlign: "left",
              }}>
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td style={{
                border: "1px solid #e2e8f0",
                padding: "6px 12px",
              }}>
                {children}
              </td>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote style={{
                borderLeft: `3px solid ${isShare ? "#c4622d" : "rgba(255,255,255,0.3)"}`,
                paddingLeft: "12px",
                margin: "8px 0",
                color: isShare ? "#6b7280" : "rgba(255,255,255,0.7)",
                fontStyle: "italic",
              }}>
                {children}
              </blockquote>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
