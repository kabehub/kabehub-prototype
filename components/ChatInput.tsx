"use client";

import { useRef, useEffect, KeyboardEvent, useState } from "react";

interface AttachedFile {
  name: string;
  content: string;
  sizeKB: number;
}

// ── モデル定数（将来の拡張はここに1行追加するだけ）──────────────────
export type Provider = "claude" | "gemini" | "openai";

export type ClaudeModel = "claude-sonnet-4-5" | "claude-sonnet-4-6";
export type GeminiModel = "gemini-2.5-flash" | "gemini-2.5-pro";
export type OpenAIModel = "gpt-4o"; // 将来: "gpt-4o-mini" など

export type ModelId = ClaudeModel | GeminiModel | OpenAIModel;

export const MODEL_CONFIG = {
  claude: {
    label: "Claude",
    models: [
      { id: "claude-sonnet-4-5" as ClaudeModel, label: "Sonnet 4.5", badge: "標準" },
      { id: "claude-sonnet-4-6" as ClaudeModel, label: "Sonnet 4.6", badge: "高性能" },
    ],
    defaultModel: "claude-sonnet-4-5" as ClaudeModel,
    lsKey: "kabehub_claude_model",
  },
  gemini: {
    label: "Gemini",
    models: [
      { id: "gemini-2.5-flash" as GeminiModel, label: "2.5 Flash", badge: "標準" },
      { id: "gemini-2.5-pro" as GeminiModel, label: "2.5 Pro", badge: "高性能" },
    ],
    defaultModel: "gemini-2.5-flash" as GeminiModel,
    lsKey: "kabehub_gemini_model",
  },
  openai: {
    label: "ChatGPT",
    models: [
      { id: "gpt-4o" as OpenAIModel, label: "GPT-4o", badge: "標準" },
    ],
    defaultModel: "gpt-4o" as OpenAIModel,
    lsKey: "kabehub_openai_model",
  },
} as const satisfies Record<Provider, {
  label: string;
  models: readonly { id: ModelId; label: string; badge: string }[];
  defaultModel: ModelId;
  lsKey: string;
}>;

/** LocalStorageからモデルを読み込む（なければデフォルト値） */
export function loadModel(provider: Provider): ModelId {
  const config = MODEL_CONFIG[provider];
  const saved = typeof window !== "undefined" ? localStorage.getItem(config.lsKey) : null;
  const validIds = config.models.map((m) => m.id as string);
  return (saved && validIds.includes(saved) ? saved : config.defaultModel) as ModelId;
}

/** LocalStorageにモデルを保存 */
export function saveModel(provider: Provider, modelId: ModelId) {
  localStorage.setItem(MODEL_CONFIG[provider].lsKey, modelId);
}
// ─────────────────────────────────────────────────────────────────────────

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (content: string, modelId: ModelId) => void;
  onMemoSubmit: () => void;
  isLoading: boolean;
  disabled?: boolean;
  provider: Provider;
  onProviderChange: (p: Provider) => void;
}

const FILE_SIZE_LIMIT_KB = 500;
const PREVIEW_LINES = 5;

/** UTF-8で読んだ結果に文字化けが含まれるか判定 */
function hasMojibake(text: string): boolean {
  return text.includes("\uFFFD");
}

/** FileをUTF-8で読み、文字化けがあればShift-JISで読み直す */
function readFileWithFallback(
  file: File,
  onSuccess: (content: string) => void,
  onError: (msg: string) => void
) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const content = ev.target?.result as string;
    if (hasMojibake(content)) {
      const reader2 = new FileReader();
      reader2.onload = (ev2) => {
        onSuccess(ev2.target?.result as string);
      };
      reader2.onerror = () => onError("ファイルの読み込みに失敗しました");
      reader2.readAsText(file, "Shift-JIS");
    } else {
      onSuccess(content);
    }
  };
  reader.onerror = () => onError("ファイルの読み込みに失敗しました");
  reader.readAsText(file, "UTF-8");
}

// プロバイダーラベル
const PROVIDER_LABELS: Record<Provider, string> = {
  claude: "Claude",
  gemini: "Gemini",
  openai: "ChatGPT",
};

export default function ChatInput({
  value,
  onChange,
  onSubmit,
  onMemoSubmit,
  isLoading,
  disabled,
  provider,
  onProviderChange,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // モデル選択 state（LocalStorageから初期値を読み込む）
  const [selectedModel, setSelectedModel] = useState<ModelId>(() => loadModel(provider));

  // プロバイダーが変わったらそのプロバイダーの保存済みモデルを読み込む
  useEffect(() => {
    setSelectedModel(loadModel(provider));
  }, [provider]);

  const handleModelChange = (modelId: ModelId) => {
    setSelectedModel(modelId);
    saveModel(provider, modelId);
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = Math.min(scrollHeight, 240) + "px";
    }
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && (value.trim() || attachedFile)) handleSubmit();
    }
  };

  const processFile = (file: File) => {
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "txt" && ext !== "md") {
      setFileError("CSV または TXT ファイル または MD ファイルのみ対応しています");
      return;
    }

    const sizeKB = file.size / 1024;
    if (sizeKB > FILE_SIZE_LIMIT_KB) {
      setFileError(`ファイルサイズが ${FILE_SIZE_LIMIT_KB}KB を超えています（${Math.round(sizeKB)}KB）`);
      return;
    }

    readFileWithFallback(
      file,
      (content) => {
        setAttachedFile({ name: file.name, content, sizeKB });
        setIsPreviewExpanded(false);
      },
      (msg) => setFileError(msg)
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isLoading && !disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isLoading || disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
    setFileError(null);
    setIsPreviewExpanded(false);
  };

  const handleSubmit = () => {
    if (!value.trim() && !attachedFile) return;

    let finalContent = value;
    if (attachedFile) {
      const ext = attachedFile.name.split(".").pop()?.toLowerCase() ?? "txt";
      const lang = ext === "csv" ? "csv" : ext === "md" ? "markdown" : "text";
      finalContent = value.trim()
        ? `${value}\n\n\`\`\`${lang}\n${attachedFile.content}\n\`\`\``
        : `\`\`\`${lang}\n${attachedFile.content}\n\`\`\``;
    }

    onChange("");
    onSubmit(finalContent, selectedModel);
    setAttachedFile(null);
    setIsPreviewExpanded(false);
  };

  const previewLines = attachedFile?.content.split("\n").slice(0, PREVIEW_LINES) ?? [];
  const totalLines = attachedFile?.content.split("\n").length ?? 0;
  const hasMoreLines = totalLines > PREVIEW_LINES;

  return (
    <div
      style={{ padding: "16px 24px 20px", borderTop: "1px solid var(--border)", background: "var(--chat-bg)", position: "relative" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ドラッグ&ドロップ オーバーレイ */}
      {isDragging && (
        <div style={{
          position: "absolute",
          inset: 0,
          background: "rgba(196,98,45,0.08)",
          border: "2px dashed var(--accent)",
          borderRadius: "10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
          pointerEvents: "none",
        }}>
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
            color: "var(--accent)",
          }}>
            <span style={{ fontSize: "24px" }}>📎</span>
            <span style={{ fontSize: "13px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
              ここにドロップ
            </span>
            <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>CSV / TXT/ MD</span>
          </div>
        </div>
      )}

      {/* AI切り替えボタン＋モデル選択 */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
        {/* プロバイダー選択 */}
        {(["claude", "gemini", "openai"] as const).map((p) => (
          <button
            key={p}
            onClick={() => onProviderChange(p)}
            style={{
              padding: "4px 12px",
              borderRadius: "20px",
              border: "1px solid",
              borderColor: provider === p ? "var(--accent)" : "var(--border)",
              background: provider === p ? "var(--accent)" : "white",
              color: provider === p ? "white" : "var(--ink-muted)",
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              cursor: "pointer",
              transition: "all 0.15s",
              letterSpacing: "0.05em",
            }}
          >
            {PROVIDER_LABELS[p]}
          </button>
        ))}

        {/* セパレーター */}
        <span style={{ color: "var(--border)", fontSize: "12px", margin: "0 2px" }}>|</span>

        {/* モデル選択（現在のプロバイダーのモデルのみ表示） */}
        {MODEL_CONFIG[provider].models.map((m) => (
          <button
            key={m.id}
            onClick={() => handleModelChange(m.id)}
            title={m.badge}
            style={{
              padding: "4px 10px",
              borderRadius: "20px",
              border: "1px solid",
              borderColor: selectedModel === m.id ? "var(--accent)" : "var(--border)",
              background: selectedModel === m.id ? "rgba(196,98,45,0.12)" : "transparent",
              color: selectedModel === m.id ? "var(--accent)" : "var(--ink-muted)",
              fontSize: "10px",
              fontFamily: "'JetBrains Mono', monospace",
              cursor: "pointer",
              transition: "all 0.15s",
              letterSpacing: "0.03em",
            }}
          >
            {m.label}
            {m.badge === "高性能" && (
              <span style={{ marginLeft: "3px", fontSize: "8px", opacity: 0.7 }}>↑</span>
            )}
          </button>
        ))}
      </div>

      {/* ファイルプレビューエリア */}
      {attachedFile && (
        <div style={{
          marginBottom: "8px",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          background: "#fafafa",
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 10px",
            borderBottom: "1px solid var(--border)",
            background: "#f5f5f5",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{
                fontSize: "12px",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--ink)",
                fontWeight: 600,
              }}>
                {attachedFile.name}
              </span>
              <span style={{
                fontSize: "10px",
                color: "var(--ink-muted)",
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {Math.round(attachedFile.sizeKB * 10) / 10}KB · {totalLines}行
              </span>
            </div>
            <button
              onClick={handleRemoveFile}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ink-muted)",
                fontSize: "14px",
                padding: "0 2px",
                lineHeight: 1,
              }}
              title="添付を解除"
            >
              ✕
            </button>
          </div>

          <div style={{ padding: "8px 10px" }}>
            <pre style={{
              margin: 0,
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              color: "var(--ink-muted)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}>
              {isPreviewExpanded
                ? attachedFile.content
                : previewLines.join("\n")}
            </pre>
            {hasMoreLines && (
              <button
                onClick={() => setIsPreviewExpanded((v) => !v)}
                style={{
                  marginTop: "4px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--accent)",
                  fontSize: "11px",
                  fontFamily: "'JetBrains Mono', monospace",
                  padding: 0,
                }}
              >
                {isPreviewExpanded ? "▲ 折りたたむ" : `▼ さらに ${totalLines - PREVIEW_LINES} 行を表示`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ファイルサイズエラー */}
      {fileError && (
        <div style={{
          marginBottom: "8px",
          padding: "6px 10px",
          background: "#fff0f0",
          border: "1px solid #fca5a5",
          borderRadius: "6px",
          fontSize: "11px",
          color: "#b91c1c",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span>⚠️ {fileError}</span>
          <button
            onClick={() => setFileError(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c", fontSize: "12px" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 入力欄 */}
      <div
        style={{
          position: "relative",
          background: "white",
          border: isDragging ? "1px solid var(--accent)" : "1px solid var(--border)",
          borderRadius: "10px",
          boxShadow: isDragging ? "0 0 0 2px rgba(196,98,45,0.15)" : "0 2px 8px rgba(0,0,0,0.04)",
          transition: "box-shadow 0.2s, border-color 0.2s",
        }}
        onFocusCapture={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 0 2px rgba(196,98,45,0.15)";
          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent-muted)";
        }}
        onBlurCapture={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isLoading}
          placeholder={attachedFile ? "ファイルについて質問… (Enter で送信)" : "思考を入力… (Enter で送信 / Shift+Enter で改行)"}
          rows={3}
          style={{
            width: "100%",
            resize: "none",
            border: "none",
            outline: "none",
            background: "transparent",
            padding: "14px 48px 14px 16px",
            fontSize: "14px",
            fontFamily: "'DM Sans', sans-serif",
            color: "var(--ink)",
            lineHeight: 1.6,
            minHeight: "80px",
            maxHeight: "240px",
            overflowY: "auto",
          }}
        />
        {/* 送信ボタン（右下） */}
        <button
          onClick={handleSubmit}
          disabled={isLoading || (!value.trim() && !attachedFile) || disabled}
          style={{
            position: "absolute",
            right: "10px",
            bottom: "10px",
            width: "32px",
            height: "32px",
            borderRadius: "7px",
            border: "none",
            background: isLoading || (!value.trim() && !attachedFile) ? "var(--ink-faint)" : "var(--accent)",
            color: "white",
            cursor: isLoading || (!value.trim() && !attachedFile) ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s, transform 0.1s",
            fontSize: "14px",
          }}
          title="AIに送信 (Enter)"
        >
          {isLoading ? (
            <span style={{ fontSize: "10px", letterSpacing: "1px" }}>…</span>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 12V2M7 2L2 7M7 2L12 7" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      {/* 下部ボタン行 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* 📝 メモボタン */}
          <button
            onClick={onMemoSubmit}
            disabled={!value.trim() || isLoading || disabled}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 12px",
              borderRadius: "20px",
              border: "1px solid",
              borderColor: value.trim() && !isLoading ? "#d69e2e" : "var(--border)",
              background: value.trim() && !isLoading ? "#fefce8" : "transparent",
              color: value.trim() && !isLoading ? "#92400e" : "var(--ink-faint)",
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              cursor: value.trim() && !isLoading ? "pointer" : "default",
              transition: "all 0.15s",
              letterSpacing: "0.03em",
            }}
            title="AIに送らずメモとして記録"
          >
            📝 メモ
          </button>

          {/* 📎 ファイル添付ボタン */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || disabled}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 12px",
              borderRadius: "20px",
              border: "1px solid",
              borderColor: attachedFile ? "var(--accent)" : "var(--border)",
              background: attachedFile ? "rgba(196,98,45,0.08)" : "transparent",
              color: attachedFile ? "var(--accent)" : isLoading ? "var(--ink-faint)" : "var(--ink-muted)",
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              cursor: isLoading || disabled ? "default" : "pointer",
              transition: "all 0.15s",
              letterSpacing: "0.03em",
            }}
            title="CSV / TXT ファイルを添付"
          >
            📎 {attachedFile ? "添付中" : "ファイル"}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,.md"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </div>

        <div style={{ fontSize: "10px", color: "var(--ink-faint)", letterSpacing: "0.03em" }}>
          Enter で送信 · Shift+Enter で改行
        </div>
      </div>
    </div>
  );
}
