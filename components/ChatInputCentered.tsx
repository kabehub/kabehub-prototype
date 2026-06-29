"use client";

import {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FILE_SIZE_LIMIT_KB,
  IMAGE_SIZE_LIMIT_MB,
  MAX_IMAGES,
  MAX_TEXT_FILES,
  MODEL_CONFIG,
  PREVIEW_LINES,
  compressImage,
  loadModel,
  readFileWithFallback,
  saveModel,
  type AttachedFile,
  type AttachedImageFile,
  type AttachedTextFile,
  type ModelId,
  type Provider,
} from "./ChatInput";

interface ChatInputCenteredProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (
    content: string,
    modelId: ModelId,
    attachedImages?: AttachedImageFile[],
    isDeepThinking?: boolean
  ) => void;
  onMemoSubmit: () => void;
  isLoading: boolean;
  provider: Provider;
  onProviderChange: (p: Provider) => void;
  displayName?: string | null;
}

type TextProvider = Extract<Provider, "claude" | "gemini" | "openai">;

const LS_ENTER_MODE = "kabehub_enter_mode" as const;
type EnterMode = "send" | "newline";

function loadEnterMode(): EnterMode {
  if (typeof window === "undefined") return "send";
  return localStorage.getItem(LS_ENTER_MODE) === "newline" ? "newline" : "send";
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

const TEXT_PROVIDERS: TextProvider[] = ["claude", "gemini", "openai"];

export default function ChatInputCentered({
  value,
  onChange,
  onSubmit,
  onMemoSubmit,
  isLoading,
  provider,
  onProviderChange,
  displayName,
}: ChatInputCenteredProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toolMenuRef = useRef<HTMLDivElement | null>(null);
  const modelMenuRootRef = useRef<HTMLDivElement | null>(null);
  const activeProvider: TextProvider = useMemo(
    () => (TEXT_PROVIDERS.includes(provider as TextProvider) ? (provider as TextProvider) : "claude"),
    [provider],
  );

  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [githubPanelOpen, setGithubPanelOpen] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [isToolMenuOpen, setIsToolMenuOpen] = useState(false);
  const [openModelProvider, setOpenModelProvider] = useState<Provider | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelId>(() => loadModel(activeProvider));
  const [isDeepThinking, setIsDeepThinking] = useState(false);

  const hasAnyFile = attachedFiles.length > 0;
  const canSubmit = (value.trim().length > 0 || hasAnyFile) && !isLoading && !isCompressing;
  const isDeepThinkingDisabled =
    selectedModel === "claude-haiku-4-5-20251001" || selectedModel === "claude-fable-5" || isLoading;

  useEffect(() => {
    setSelectedModel(loadModel(activeProvider));
  }, [activeProvider]);

  useEffect(() => {
    if (activeProvider !== "claude") setIsDeepThinking(false);
  }, [activeProvider]);

  useEffect(() => {
    if (!isToolMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (
        toolMenuRef.current &&
        !toolMenuRef.current.contains(event.target as Node)
      ) {
        setIsToolMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isToolMenuOpen]);

  useEffect(() => {
    if (!openModelProvider) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        modelMenuRootRef.current &&
        !modelMenuRootRef.current.contains(event.target as Node)
      ) {
        setOpenModelProvider(null);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpenModelProvider(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openModelProvider]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
    el.style.overflowY = el.scrollHeight > 320 ? "auto" : "hidden";
  }, [value]);

  const handleProviderChange = (nextProvider: TextProvider) => {
    onProviderChange(nextProvider);
    setSelectedModel(loadModel(nextProvider));
  };

  const handleModelChange = (modelId: ModelId) => {
    setSelectedModel(modelId);
    saveModel(activeProvider, modelId);
  };

  const processFiles = async (files: FileList | File[]) => {
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    const fileArray = Array.from(files);
    let currentImages = attachedFiles.filter((f) => f.kind === "image").length;
    let currentTexts = attachedFiles.filter((f) => f.kind === "text").length;

    for (const file of fileArray) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const isImage = file.type.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext ?? "");
      const isText = ext === "csv" || ext === "txt" || ext === "md";

      if (isImage) {
        if (currentImages >= MAX_IMAGES) {
          setFileError(`画像は最大${MAX_IMAGES}枚まで添付できます`);
          continue;
        }
        if (file.size > IMAGE_SIZE_LIMIT_MB * 1024 * 1024) {
          setFileError(`画像は${IMAGE_SIZE_LIMIT_MB}MB以下にしてください（${file.name}）`);
          continue;
        }
        setIsCompressing(true);
        const previewUrl = URL.createObjectURL(file);
        try {
          const { base64, mediaType, sizeKB } = await compressImage(file);
          const imageFile: AttachedImageFile = { kind: "image", name: file.name, base64, mediaType, previewUrl, sizeKB };
          setAttachedFiles((prev) => [...prev, imageFile]);
          currentImages++;
        } catch {
          URL.revokeObjectURL(previewUrl);
          setFileError(`画像の圧縮に失敗しました（${file.name}）`);
        } finally {
          setIsCompressing(false);
        }
      } else if (isText) {
        if (currentTexts >= MAX_TEXT_FILES) {
          setFileError(`テキストファイルは最大${MAX_TEXT_FILES}件まで添付できます`);
          continue;
        }
        const sizeKB = file.size / 1024;
        if (sizeKB > FILE_SIZE_LIMIT_KB) {
          setFileError(`ファイルサイズが${FILE_SIZE_LIMIT_KB}KBを超えています（${file.name}）`);
          continue;
        }
        await new Promise<void>((resolve) => {
          readFileWithFallback(
            file,
            (content) => {
              const textFile: AttachedTextFile = { kind: "text", name: file.name, content, sizeKB };
              setAttachedFiles((prev) => [...prev, textFile]);
              currentTexts++;
              resolve();
            },
            (msg) => {
              setFileError(msg);
              resolve();
            },
          );
        });
      } else {
        setFileError("対応形式: CSV / TXT / MD / PNG / JPEG / GIF / WebP");
      }
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processFiles(files);
      setIsToolMenuOpen(false);
    }
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (isLoading) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles = Array.from(items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);

    if (imageFiles.length === 0) return;

    e.preventDefault();
    await processFiles(imageFiles);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!isLoading) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isLoading) return;
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    await processFiles(files);
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles((prev) => {
      const target = prev[index];
      if (target.kind === "image") URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleGithubFetch = async () => {
    const trimmed = githubUrl.trim();
    if (!trimmed) return;

    setGithubLoading(true);
    setGithubError(null);

    try {
      const res = await fetch("/api/fetch-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const result: { content: string; truncated: boolean } | { error: string } = await res.json();

      if ("error" in result) {
        setGithubError(result.error);
        return;
      }

      const currentTextCount = attachedFiles.filter((f) => f.kind === "text").length;
      if (currentTextCount >= MAX_TEXT_FILES) {
        setGithubError(`テキストファイルは最大${MAX_TEXT_FILES}件まで添付できます`);
        return;
      }

      const fileName = trimmed.split("/").pop() ?? "file";
      const content = result.truncated
        ? result.content + "\n（※長いため一部省略）"
        : result.content;
      const sizeKB = Math.round((content.length / 1024) * 10) / 10;

      const githubFile: AttachedTextFile = {
        kind: "text",
        name: fileName,
        content,
        sizeKB,
      };

      setAttachedFiles((prev) => [...prev, githubFile]);
      setGithubUrl("");
      setGithubPanelOpen(false);
      setIsToolMenuOpen(false);
      setGithubError(null);
    } catch {
      setGithubError("ネットワークエラーが発生しました");
    } finally {
      setGithubLoading(false);
    }
  };

  const handleSubmit = () => {
    const textFiles = attachedFiles.filter((f): f is AttachedTextFile => f.kind === "text");
    const imageFiles = attachedFiles.filter((f): f is AttachedImageFile => f.kind === "image");
    if (!value.trim() && attachedFiles.length === 0) return;

    let finalContent = value;
    if (textFiles.length > 0) {
      const fileBlocks = textFiles.map((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase() ?? "txt";
        const lang = ext === "csv" ? "csv" : ext === "md" ? "markdown" : "text";
        return `\`\`\`${lang}\n${f.content}\n\`\`\``;
      });
      finalContent = value.trim()
        ? `${value}\n\n${fileBlocks.join("\n\n")}`
        : fileBlocks.join("\n\n");
    }

    onChange("");
    onSubmit(finalContent, selectedModel, imageFiles.length > 0 ? imageFiles : undefined, isDeepThinking);
    attachedFiles.filter((f) => f.kind === "image").forEach((f) => {
      URL.revokeObjectURL((f as AttachedImageFile).previewUrl);
    });
    setAttachedFiles([]);
    setIsPreviewExpanded(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.key === "Process") return;

    if (e.key !== "Enter") return;

    const enterMode = loadEnterMode();
    const isMobile = isMobileViewport();

    if (isMobile) return;

    if (enterMode === "send") {
      if (!e.shiftKey) {
        e.preventDefault();
        if (canSubmit) handleSubmit();
      }
    } else {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (canSubmit) handleSubmit();
      }
    }
  };

  const firstTextFile = attachedFiles.find((f): f is AttachedTextFile => f.kind === "text") ?? null;
  const previewLines = firstTextFile?.content.split("\n").slice(0, PREVIEW_LINES) ?? [];
  const totalLines = firstTextFile?.content.split("\n").length ?? 0;
  const hasMoreLines = totalLines > PREVIEW_LINES;
  const enterMode = loadEnterMode();
  const isMobile = isMobileViewport();
  const placeholder =
    provider === "image_gen"
      ? "画像生成のプロンプトを入力…"
      : isMobile
        ? hasAnyFile
          ? "ファイルについて質問…"
          : "思考を入力…"
        : enterMode === "send"
          ? hasAnyFile
            ? "ファイルについて質問… (Enter で送信 / Shift+Enter で改行)"
            : "思考を入力… (Enter で送信 / Shift+Enter で改行)"
          : hasAnyFile
            ? "ファイルについて質問… (Enter で改行 / Ctrl・⌘+Enter で送信)"
            : "思考を入力… (Enter で改行 / Ctrl・⌘+Enter で送信)";

  return (
    <div
      style={{
        width: "100%",
        padding: "0 clamp(12px, 3vw, 24px)",
        boxSizing: "border-box",
        position: "relative",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", color: "var(--accent)" }}>
            <span style={{ fontSize: "24px" }}>📎</span>
            <span style={{ fontSize: "13px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
              ここにドロップ
            </span>
          </div>
        </div>
      )}

      <div style={{ width: "min(720px, 100%)", margin: "0 auto" }}>
        <h2
          style={{
            margin: "0 0 18px",
            fontFamily: "'Lora', serif",
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 500,
            color: "var(--ink)",
            textAlign: "center",
            lineHeight: 1.35,
          }}
        >
          {displayName?.trim() || "ユーザー"}さん、壁打ちを始めましょう
        </h2>

        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "8px",
            background: "white",
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
            padding: "14px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div ref={modelMenuRootRef} style={{ position: "relative" }}>
              <div className="mobile-scroll-row" style={{ display: "flex", gap: "8px" }}>
                {TEXT_PROVIDERS.map((p) => {
                  const models = MODEL_CONFIG[p]?.models ?? [];
                  const hasModels = models.length > 0;

                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        handleProviderChange(p);
                        setIsToolMenuOpen(false);

                        if (!isMobile || !hasModels) {
                          setOpenModelProvider(null);
                          return;
                        }

                        setOpenModelProvider((current) => (current === p ? null : p));
                      }}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: `1px solid ${activeProvider === p ? "var(--accent)" : "var(--border)"}`,
                        background: activeProvider === p ? "var(--accent)" : "white",
                        color: activeProvider === p ? "white" : "var(--ink-muted)",
                        fontSize: "12px",
                        fontFamily: "'JetBrains Mono', monospace",
                        cursor: "pointer",
                        flex: "0 0 auto",
                      }}
                    >
                      {MODEL_CONFIG[p].label}{isMobile && hasModels ? " ▾" : ""}
                    </button>
                  );
                })}
              </div>

              {isMobile && openModelProvider && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    bottom: "calc(100% + 8px)",
                    top: "auto",
                    zIndex: 50,
                    background: "var(--surface, #ffffff)",
                    opacity: 1,
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    padding: "8px",
                    minWidth: "180px",
                    maxHeight: "240px",
                    overflowY: "auto",
                    WebkitOverflowScrolling: "touch",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                  }}
                >
                  <div style={{ fontSize: "10px", color: "var(--ink-faint)", padding: "0 4px 6px" }}>
                    {MODEL_CONFIG[openModelProvider].label} のモデルを選択
                  </div>
                  {MODEL_CONFIG[openModelProvider].models.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        handleModelChange(model.id);
                        setOpenModelProvider(null);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "6px 10px",
                        borderRadius: "6px",
                        border: "none",
                        background: selectedModel === model.id ? "rgba(196,98,45,0.1)" : "transparent",
                        color: selectedModel === model.id ? "var(--accent)" : "var(--ink)",
                        fontSize: "12px",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ display: "inline-block", width: "1.2em" }}>
                        {selectedModel === model.id ? "●" : ""}
                      </span>
                      {model.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!isMobile && (
              <div className="mobile-scroll-row" style={{ display: "flex", gap: "6px" }}>
                {MODEL_CONFIG[activeProvider].models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleModelChange(model.id)}
                    title={model.badge}
                    style={{
                      padding: "5px 10px",
                      borderRadius: "6px",
                      border: `1px solid ${selectedModel === model.id ? "var(--accent)" : "var(--border)"}`,
                      background: selectedModel === model.id ? "rgba(196,98,45,0.12)" : "transparent",
                      color: selectedModel === model.id ? "var(--accent)" : "var(--ink-muted)",
                      fontSize: "11px",
                      fontFamily: "'JetBrains Mono', monospace",
                      cursor: "pointer",
                      flex: "0 0 auto",
                    }}
                  >
                    {model.label}
                  </button>
                ))}
              </div>
            )}

            {githubPanelOpen && (
              <div style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input
                    type="text"
                    value={githubUrl}
                    onChange={(e) => { setGithubUrl(e.target.value); setGithubError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); handleGithubFetch(); }
                      if (e.key === "Escape") { setGithubPanelOpen(false); setGithubUrl(""); setGithubError(null); }
                    }}
                    placeholder="https://github.com/.../blob/main/..."
                    disabled={githubLoading}
                    autoFocus
                    style={{
                      flex: 1,
                      padding: "6px 10px",
                      border: `1px solid ${githubError ? "#e53e3e" : "var(--border)"}`,
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontFamily: "'JetBrains Mono', monospace",
                      outline: "none",
                      color: "var(--ink)",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = githubError ? "#e53e3e" : "var(--accent-muted)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = githubError ? "#e53e3e" : "var(--border)"; }}
                  />
                  <button
                    onClick={handleGithubFetch}
                    disabled={githubLoading || !githubUrl.trim()}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "none",
                      background: githubLoading || !githubUrl.trim() ? "var(--ink-faint)" : "var(--accent)",
                      color: "white",
                      fontSize: "11px",
                      fontFamily: "'JetBrains Mono', monospace",
                      cursor: githubLoading || !githubUrl.trim() ? "default" : "pointer",
                      whiteSpace: "nowrap",
                      transition: "background 0.15s",
                    }}
                  >
                    {githubLoading ? "読込中…" : "読み込む"}
                  </button>
                  <button
                    onClick={() => { setGithubPanelOpen(false); setGithubUrl(""); setGithubError(null); }}
                    disabled={githubLoading}
                    style={{
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--ink-muted)",
                      fontSize: "12px",
                      cursor: githubLoading ? "default" : "pointer",
                    }}
                    title="閉じる"
                  >
                    ×
                  </button>
                </div>
                {githubError && (
                  <div style={{
                    marginTop: "4px",
                    fontSize: "11px",
                    color: "#e53e3e",
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    {githubError}
                  </div>
                )}
              </div>
            )}

            {hasAnyFile && (
              <div style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: attachedFiles.some(f => f.kind === "text") ? "6px" : "0" }}>
                  {attachedFiles.map((f, i) => (
                    <div key={i} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "3px 8px 3px 4px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      background: f.kind === "image" ? "#f0f9ff" : "#fafafa",
                      fontSize: "11px",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {f.kind === "image" ? (
                        <img
                          src={f.previewUrl}
                          alt={f.name}
                          style={{ width: 28, height: 28, objectFit: "cover", borderRadius: "3px" }}
                        />
                      ) : (
                        <span style={{ fontSize: "14px" }}>📄</span>
                      )}
                      <span style={{ color: "var(--ink)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.name}
                      </span>
                      <span style={{ color: "var(--ink-muted)", fontSize: "10px" }}>
                        {Math.round(f.sizeKB * 10) / 10}KB
                      </span>
                      <button
                        onClick={() => handleRemoveFile(i)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", fontSize: "12px", padding: "0 0 0 2px", lineHeight: 1 }}
                        title="削除"
                      >✕</button>
                    </div>
                  ))}
                  {isCompressing && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: "5px",
                      padding: "3px 10px", borderRadius: "6px",
                      border: "1px dashed var(--border)", background: "#fafafa",
                      fontSize: "11px", color: "var(--ink-muted)", fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      ⏳ 圧縮中…
                    </div>
                  )}
                </div>

                {firstTextFile && (
                  <div style={{ border: "1px solid var(--border)", borderRadius: "8px", background: "#fafafa", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 10px", background: "#f5f5f5", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)" }}>
                        {firstTextFile.name} · {totalLines}行
                      </span>
                    </div>
                    <div style={{ padding: "8px 10px" }}>
                      <pre style={{ margin: 0, fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {isPreviewExpanded ? firstTextFile.content : previewLines.join("\n")}
                      </pre>
                      {hasMoreLines && (
                        <button
                          onClick={() => setIsPreviewExpanded((v) => !v)}
                          style={{ marginTop: "4px", background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", padding: 0 }}
                        >
                          {isPreviewExpanded ? "▲ 折りたたむ" : `▼ さらに ${totalLines - PREVIEW_LINES} 行を表示`}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

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

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={placeholder}
              rows={1}
              disabled={isLoading}
              style={{
                width: "100%",
                resize: "none",
                minHeight: "calc(1rem * var(--font-scale, 1) * 1.7 + 28px)",
                maxHeight: "320px",
                overflowY: "hidden",
                border: isDragging ? "1px solid var(--accent)" : "1px solid var(--border)",
                borderRadius: "8px",
                padding: "14px",
                outline: "none",
                fontSize: "15px",
                lineHeight: 1.7,
                color: "var(--ink)",
                fontFamily: "'DM Sans', sans-serif",
                background: isLoading ? "#f7f7f7" : "white",
                boxSizing: "border-box",
              }}
            />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                {isMobile && (
                  <div ref={toolMenuRef} style={{ position: "relative" }}>
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={isToolMenuOpen}
                      aria-label="ツールメニューを開く"
                      onClick={() => setIsToolMenuOpen((v) => !v)}
                      disabled={isLoading}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "30px",
                        height: "30px",
                        borderRadius: "20px",
                        border: "1px solid var(--border)",
                        background: isToolMenuOpen ? "rgba(196,98,45,0.08)" : "transparent",
                        color: isToolMenuOpen ? "var(--accent)" : isLoading ? "var(--ink-faint)" : "var(--ink-muted)",
                        fontSize: "18px",
                        fontFamily: "'JetBrains Mono', monospace",
                        cursor: isLoading ? "default" : "pointer",
                        transition: "all 0.15s",
                        lineHeight: 1,
                      }}
                    >
                      ＋
                    </button>

                    {isToolMenuOpen && (
                      <div
                        role="menu"
                        style={{
                          position: "absolute",
                          left: 0,
                          bottom: "calc(100% + 8px)",
                          zIndex: 50,
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: "10px",
                          padding: "8px",
                          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                        }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            fileInputRef.current?.click();
                            setIsToolMenuOpen(false);
                          }}
                          disabled={isLoading}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "4px 12px",
                            borderRadius: "20px",
                            border: "1px solid",
                            borderColor: hasAnyFile ? "var(--accent)" : "var(--border)",
                            background: hasAnyFile ? "rgba(196,98,45,0.08)" : "transparent",
                            color: hasAnyFile ? "var(--accent)" : isLoading ? "var(--ink-faint)" : "var(--ink-muted)",
                            fontSize: "11px",
                            fontFamily: "'JetBrains Mono', monospace",
                            cursor: isLoading ? "default" : "pointer",
                            transition: "all 0.15s",
                            letterSpacing: "0.03em",
                            whiteSpace: "nowrap",
                          }}
                          title="CSV / TXT / MD / 画像（PNG・JPEG・GIF・WebP）を添付"
                        >
                          📎 {hasAnyFile ? `添付中 (${attachedFiles.length})` : "ファイル"}
                        </button>

                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setGithubPanelOpen((prev) => !prev);
                            setGithubError(null);
                            setIsToolMenuOpen(false);
                          }}
                          disabled={isLoading}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "4px 12px",
                            borderRadius: "20px",
                            border: "1px solid",
                            borderColor: githubPanelOpen ? "var(--accent)" : "var(--border)",
                            background: githubPanelOpen ? "rgba(196,98,45,0.08)" : "transparent",
                            color: githubPanelOpen ? "var(--accent)" : isLoading ? "var(--ink-faint)" : "var(--ink-muted)",
                            fontSize: "11px",
                            fontFamily: "'JetBrains Mono', monospace",
                            cursor: isLoading ? "default" : "pointer",
                            transition: "all 0.15s",
                            letterSpacing: "0.03em",
                            whiteSpace: "nowrap",
                          }}
                          title="GitHub の公開ファイルを添付"
                        >
                          GitHub
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={onMemoSubmit}
                  disabled={!value.trim() || isLoading}
                  title="AIに送らずメモとして記録"
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
                >
                  📝 メモ
                </button>

                {activeProvider === "claude" && (
                  <button
                    onClick={() => setIsDeepThinking((v) => !v)}
                    disabled={isDeepThinkingDisabled}
                    title={
                      selectedModel === "claude-haiku-4-5-20251001" ? "Haiku 4.5は非対応です" :
                      selectedModel === "claude-fable-5" ? "Fable 5はExtended Thinkingに非対応です（Adaptive Thinkingは自動適用）" :
                      "Extended Thinking: AIが回答前に深く考えます"
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "4px 12px",
                      borderRadius: "20px",
                      border: "1px solid",
                      borderColor: isDeepThinking ? "var(--accent)" : "var(--border)",
                      background: isDeepThinking ? "rgba(196,98,45,0.12)" : "transparent",
                      color: isDeepThinking ? "var(--accent)" : isDeepThinkingDisabled ? "var(--ink-faint)" : "var(--ink-muted)",
                      fontSize: "11px",
                      fontFamily: "'JetBrains Mono', monospace",
                      cursor: isDeepThinkingDisabled ? "not-allowed" : "pointer",
                      transition: "all 0.15s",
                      letterSpacing: "0.03em",
                    }}
                  >
                    🧠 深く考える
                  </button>
                )}

                {!isMobile && (
                  <>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isLoading}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "4px 12px",
                        borderRadius: "20px",
                        border: "1px solid",
                        borderColor: hasAnyFile ? "var(--accent)" : "var(--border)",
                        background: hasAnyFile ? "rgba(196,98,45,0.08)" : "transparent",
                        color: hasAnyFile ? "var(--accent)" : isLoading ? "var(--ink-faint)" : "var(--ink-muted)",
                        fontSize: "11px",
                        fontFamily: "'JetBrains Mono', monospace",
                        cursor: isLoading ? "default" : "pointer",
                        transition: "all 0.15s",
                        letterSpacing: "0.03em",
                      }}
                      title="CSV / TXT / MD / 画像（PNG・JPEG・GIF・WebP）を添付"
                    >
                      📎 {hasAnyFile ? `添付中 (${attachedFiles.length})` : "ファイル"}
                    </button>

                    <button
                      onClick={() => {
                        setGithubPanelOpen((prev) => !prev);
                        setGithubError(null);
                      }}
                      disabled={isLoading}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "4px 12px",
                        borderRadius: "20px",
                        border: "1px solid",
                        borderColor: githubPanelOpen ? "var(--accent)" : "var(--border)",
                        background: githubPanelOpen ? "rgba(196,98,45,0.08)" : "transparent",
                        color: githubPanelOpen ? "var(--accent)" : isLoading ? "var(--ink-faint)" : "var(--ink-muted)",
                        fontSize: "11px",
                        fontFamily: "'JetBrains Mono', monospace",
                        cursor: isLoading ? "default" : "pointer",
                        transition: "all 0.15s",
                        letterSpacing: "0.03em",
                      }}
                      title="GitHub の公開ファイルを添付"
                    >
                      GitHub
                    </button>
                  </>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.md,image/png,image/jpeg,image/gif,image/webp"
                  multiple
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{
                  padding: "12px 23px",
                  borderRadius: "6px",
                  border: "1px solid var(--accent)",
                  background: canSubmit ? "var(--accent)" : "transparent",
                  color: canSubmit ? "white" : "var(--ink-faint)",
                  fontSize: "17px",
                  fontFamily: "'JetBrains Mono', monospace",
                  cursor: canSubmit ? "pointer" : "not-allowed",
                }}
              >
                送信
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
