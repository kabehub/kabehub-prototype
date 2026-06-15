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

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);

  return ok;
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
    try {
      const ok = await copyTextToClipboard(rawContent);
      if (!ok) throw new Error("copy command returned false");

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("copy failed:", err);
    }
  };

  const headerBg = variant === "share" ? "#f1f5f9" : "#e2e8f0";
  const headerColor = variant === "share" ? "#475569" : "#334155";
  const codeBg = variant === "share" ? "#f8fafc" : "#eef1f5";
  const codeColor = variant === "share" ? "#1e293b" : "#334155";
  const borderColor = variant === "share" ? "#e2e8f0" : "#cbd5e1";
  const copyButtonBg = copied
    ? "#dcfce7"
    : variant === "share" ? "#e2e8f0" : "#cbd5e1";
  const copyButtonColor = copied
    ? "#16a34a"
    : variant === "share" ? "#475569" : "#334155";
  const downloadButtonBg = "#dbeafe";
  const downloadButtonColor = "#1d4ed8";
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
        border: `1px solid ${borderColor}`,
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
              background: copyButtonBg,
              color: copyButtonColor,
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
                background: downloadButtonBg,
                color: downloadButtonColor,
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
          pre({ children }) {
            const codeElement = React.Children.toArray(children).find(
              React.isValidElement
            );
            const codeProps = codeElement?.props as
              | { className?: string; children?: React.ReactNode }
              | undefined;

            return (
              <CodeBlock className={codeProps?.className} variant={variant}>
                {codeProps?.children}
              </CodeBlock>
            );
          },
          code({ className, children, ...props }) {
            return (
              <code
                className={className}
                style={{
                  background: isShare ? "#f1f5f9" : "#e8eef5",
                  color: isShare ? "#1e293b" : "#334155",
                  border: isShare ? "none" : "1px solid #cbd5e1",
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
          h1({ children }) {
            return (
              <h1 style={{
                fontFamily: "'Lora', serif",
                fontSize: "1.15em",
                fontWeight: 600,
                color: "var(--ink)",
                marginTop: "1.25em",
                marginBottom: "0.5em",
                lineHeight: 1.3,
              }}>
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 style={{
                fontFamily: "'Lora', serif",
                fontSize: "1.05em",
                fontWeight: 600,
                color: "var(--ink)",
                marginTop: "1.25em",
                marginBottom: "0.5em",
                lineHeight: 1.3,
              }}>
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 style={{
                fontFamily: "'Lora', serif",
                fontSize: "0.95em",
                fontWeight: 500,
                fontStyle: "italic",
                color: "var(--ink)",
                marginTop: "1em",
                marginBottom: "0.4em",
                lineHeight: 1.3,
              }}>
                {children}
              </h3>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
