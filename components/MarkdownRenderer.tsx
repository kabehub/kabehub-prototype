"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  variant?: "default" | "share";
  className?: string;
}

// [[テキスト]] → ████ に変換（share variant のみ）
function applyMask(content: string): string {
  return content.replace(/\[\[(.+?)\]\]/g, "████");
}

function CodeBlock({
  className,
  children,
  variant,
}: {
  className?: string;
  children?: React.ReactNode;
  variant: "default" | "share";
}) {
  const [copied, setCopied] = useState(false);

  const match = /language-(\w+)/.exec(className || "");
  const lang = match?.[1]?.toLowerCase();
  const isDownloadable = lang === "csv" || lang === "txt";

  const rawContent = String(children).replace(/\n$/, "");

  const handleDownload = () => {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, "")
      .slice(0, 12);
    const filename = `kabehub_${timestamp}.${lang}`;

    const blob =
      lang === "csv"
        ? new Blob(["\uFEFF", rawContent], { type: "text/csv;charset=utf-8;" })
        : new Blob([rawContent], { type: "text/plain;charset=utf-8;" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(rawContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const headerBg = variant === "share" ? "#f1f5f9" : "#1e293b";
  const headerColor = variant === "share" ? "#475569" : "#94a3b8";
  const codeBg = variant === "share" ? "#f8fafc" : "#0f172a";
  const codeColor = variant === "share" ? "#1e293b" : "#e2e8f0";
  const buttonBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 8px",
    borderRadius: "4px",
    fontSize: "11px",
    fontFamily: "inherit",
    cursor: "pointer",
    border: "none",
    transition: "opacity 0.15s",
  };

  return (
    <div
      style={{
        borderRadius: "8px",
        overflow: "hidden",
        margin: "8px 0",
        border: variant === "share" ? "1px solid #e2e8f0" : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: headerBg,
          padding: "4px 10px",
          minHeight: "28px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontFamily: "'JetBrains Mono', monospace",
            color: headerColor,
            letterSpacing: "0.05em",
          }}
        >
          {lang || "code"}
        </span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            onClick={handleCopy}
            style={{
              ...buttonBase,
              background: copied
                ? variant === "share" ? "#dcfce7" : "#14532d"
                : variant === "share" ? "#e2e8f0" : "#334155",
              color: copied
                ? variant === "share" ? "#16a34a" : "#4ade80"
                : headerColor,
            }}
            title="クリップボードにコピー"
          >
            {copied ? "✓ コピー済み" : "📋 コピー"}
          </button>
          {isDownloadable && (
            <button
              onClick={handleDownload}
              style={{
                ...buttonBase,
                background: variant === "share" ? "#dbeafe" : "#1e3a5f",
                color: variant === "share" ? "#1d4ed8" : "#60a5fa",
              }}
              title={`${lang?.toUpperCase()}としてダウンロード`}
            >
              📥 {lang?.toUpperCase()}
            </button>
          )}
        </div>
      </div>
      <pre
        style={{
          background: codeBg,
          color: codeColor,
          margin: 0,
          padding: "12px 16px",
          overflowX: "auto",
          overflowY: "auto",
          maxHeight: "240px",
          fontSize: "13px",
          lineHeight: 1.6,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        }}
      >
        <code>{rawContent}</code>
      </pre>
    </div>
  );
}

export default function MarkdownRenderer({
  content,
  variant = "default",
  className,
}: MarkdownRendererProps) {
  const isShare = variant === "share";

  // share variant のみマスク記法を適用
  const processedContent = isShare ? applyMask(content) : content;

  const wrapperClass = [
    "prose prose-sm max-w-none",
    className,
  ]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div className={wrapperClass}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const isBlock = /language-(\w+)/.exec(className || "");
            if (isBlock) {
              return (
                <CodeBlock className={className} variant={variant}>
                  {children}
                </CodeBlock>
              );
            }
            return (
              <code
                style={{
                  background: isShare ? "#f1f5f9" : "#1e293b",
                  color: isShare ? "#1e293b" : "#e2e8f0",
                  borderRadius: "4px",
                  padding: "1px 5px",
                  fontSize: "0.875em",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
                {...props}
              >
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div style={{ overflowX: "auto", margin: "8px 0" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "13px" }}>
                  {children}
                </table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th style={{ border: "1px solid #374151", padding: "6px 12px", background: isShare ? "#f1f5f9" : "#1e293b", color: isShare ? "#1e293b" : "#e2e8f0", fontWeight: 600, textAlign: "left" }}>
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td style={{ border: "1px solid #374151", padding: "6px 12px" }}>
                {children}
              </td>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote style={{ borderLeft: "3px solid #6b7280", margin: "8px 0", paddingLeft: "12px", color: "#9ca3af", fontStyle: "italic" }}>
                {children}
              </blockquote>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
