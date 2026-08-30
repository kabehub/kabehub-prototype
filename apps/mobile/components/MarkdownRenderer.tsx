"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { externalBrowser } from "../lib/externalBrowser";

interface MarkdownRendererProps {
  content: string;
  variant?: "default" | "share";
  className?: string;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.className = "markdown-clipboard-fallback";

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
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    try {
      const ok = await copyTextToClipboard(rawContent);
      if (!ok) throw new Error("copy command returned false");

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // 失敗時は成功表示に切り替えない。
      console.error("copy failed:", err);
    }
  };

  const blockClassName = [
    "markdown-code-block",
    variant === "share" && "markdown-code-block-share",
  ]
    .filter(Boolean)
    .join(" ");
  const copyButtonClassName = [
    "markdown-code-button",
    copied && "markdown-code-button-copied",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={blockClassName}>
      <div className="markdown-code-header">
        <span className="markdown-code-language">{lang || "code"}</span>
        <div className="markdown-code-actions">
          <button
            type="button"
            onClick={handleCopy}
            className={copyButtonClassName}
            title="クリップボードにコピー"
          >
            {copied ? "✓ コピー済み" : "📋 コピー"}
          </button>
          {isDownloadable && (
            <button
              type="button"
              onClick={handleDownload}
              className="markdown-code-button"
              title={`${lang?.toUpperCase()}としてダウンロード`}
            >
              📥 {lang?.toUpperCase()}
            </button>
          )}
        </div>
      </div>
      <pre className="markdown-code-content">
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
  const wrapperClass = [
    "markdown-body",
    isShare && "markdown-body-share",
    className,
  ]
    .filter(Boolean)
    .join(" ");

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
          code({ className: codeClassName, children, ...props }) {
            return (
              <code
                className={[
                  "markdown-inline-code",
                  isShare && "markdown-inline-code-share",
                  codeClassName,
                ]
                  .filter(Boolean)
                  .join(" ")}
                {...props}
              >
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div className="markdown-table-wrapper">
                <table className="markdown-table">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th
                className={[
                  "markdown-th",
                  isShare && "markdown-th-share",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {children}
              </th>
            );
          },
          td({ children }) {
            return <td className="markdown-td">{children}</td>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="markdown-blockquote">
                {children}
              </blockquote>
            );
          },
          h1({ children }) {
            return <h1 className="markdown-h1">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="markdown-h2">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="markdown-h3">{children}</h3>;
          },
          a({ href, children }) {
            if (href && /^https?:\/\//.test(href)) {
              return (
                <a
                  href={href}
                  onClick={(event) => {
                    event.preventDefault();
                    void externalBrowser.open(href);
                  }}
                  className="markdown-link"
                >
                  {children}
                </a>
              );
            }

            return (
              <a href={href} className="markdown-link">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
