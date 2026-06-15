"use client";

import { useRef, useEffect, KeyboardEvent, useState } from "react";
import type { ClaudeModel, GeminiModel, OpenAIModel, ImageGenModel, ModelId, Provider } from "@/types";
export type { ClaudeModel, GeminiModel, OpenAIModel, ImageGenModel, ModelId, Provider } from "@/types";

// ── 添付ファイル型（Discriminated Union）──────────────────────────────────
export type AttachedTextFile = {
  kind: "text";
  name: string;
  content: string;
  sizeKB: number;
};

export type AttachedImageFile = {
  kind: "image";
  name: string;
  base64: string;       // プレフィックスなし・JPEG圧縮済み
  mediaType: "image/jpeg"; // 常にJPEG（Canvas圧縮の都合）
  previewUrl: string;   // サムネイル表示用 ObjectURL
  sizeKB: number;       // 圧縮後サイズ
};

export type AttachedFile = AttachedTextFile | AttachedImageFile;

// ── Canvas APIによる画像圧縮（ゼロ依存・Gemini指摘3点対応済み）────────────
// 1. mediaTypeをimage/jpegに固定（出力がJPEGのため）
// 2. 透過PNG等の「背景真っ黒」を白塗りで防止
// 3. ObjectURLのメモリリークをrevokeObjectURLで解放
export async function compressImage(file: File): Promise<{ base64: string; mediaType: "image/jpeg"; sizeKB: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1024;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d")!;
      // 透過PNG/GIF → JPEG変換時の黒背景を防ぐため白で塗りつぶす
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // メモリリーク対策
      URL.revokeObjectURL(img.src);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      const base64 = dataUrl.split(",")[1]; // プレフィックス除去
      const sizeKB = Math.round((base64.length * 0.75) / 1024 * 10) / 10;
      resolve({ base64, mediaType: "image/jpeg", sizeKB });
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("画像の読み込みに失敗しました"));
    };
    img.src = URL.createObjectURL(file);
  });
}

// ── モデル定数（将来の拡張はここに1行追加するだけ）──────────────────
export const MODEL_CONFIG = {
  claude: {
    label: "Claude",
    models: [
      { id: "claude-fable-5" as ClaudeModel,             label: "Fable 5",    badge: "最高精度" },
      { id: "claude-opus-4-8" as ClaudeModel,           label: "Opus 4.8",   badge: "最高精度" },
      { id: "claude-opus-4-7" as ClaudeModel,           label: "Opus 4.7",   badge: "高精度" },
      { id: "claude-opus-4-6" as ClaudeModel,           label: "Opus 4.6",   badge: "高精度" },
      { id: "claude-sonnet-4-5" as ClaudeModel,         label: "Sonnet 4.5", badge: "標準" },
      { id: "claude-sonnet-4-6" as ClaudeModel,         label: "Sonnet 4.6", badge: "高性能" },
      { id: "claude-haiku-4-5-20251001" as ClaudeModel, label: "Haiku 4.5",  badge: "軽量・爆速" },
    ],
    defaultModel: "claude-sonnet-4-5" as ClaudeModel,
    lsKey: "kabehub_claude_model",
  },
  gemini: {
    label: "Gemini",
    models: [
      { id: "gemini-2.5-flash" as GeminiModel, label: "2.5 Flash", badge: "標準" },
      { id: "gemini-2.5-pro" as GeminiModel, label: "2.5 Pro", badge: "高性能" },
      { id: "gemini-3.5-flash" as GeminiModel, label: "3.5 Flash", badge: "高性能" },
      { id: "gemini-3.1-flash-lite" as GeminiModel, label: "3.1 Flash Lite", badge: "軽量・爆速" },
    ],
    defaultModel: "gemini-2.5-flash" as GeminiModel,
    lsKey: "kabehub_gemini_model",
  },
  openai: {
    label: "ChatGPT",
    models: [
      { id: "gpt-4o" as OpenAIModel, label: "GPT-4o", badge: "旧世代" },
      { id: "gpt-5.4-mini" as OpenAIModel, label: "GPT-5.4 mini", badge: "標準" },
      { id: "gpt-5.4" as OpenAIModel, label: "GPT-5.4", badge: "高性能" },
      { id: "gpt-5.5" as OpenAIModel, label: "GPT-5.5", badge: "最高精度" },
      { id: "gpt-5.5-pro" as OpenAIModel, label: "GPT-5.5 Pro", badge: "最上位" },
    ],
    defaultModel: "gpt-5.4-mini" as OpenAIModel,
    lsKey: "kabehub_openai_model",
  },
  image_gen: {
    label: "画像生成",
    models: [
      { id: "gpt-image-2" as ImageGenModel, label: "GPT Image 2", badge: "OpenAI" },
      { id: "gemini-2.5-flash-image" as ImageGenModel, label: "Gemini Image", badge: "Google" },
      { id: "ideogram-v3" as ImageGenModel, label: "Ideogram V3", badge: "Ideogram" },
      { id: "black-forest-labs/flux.2-pro" as ImageGenModel, label: "Flux 2 Pro", badge: "OpenRouter" },
    ],
    defaultModel: "gpt-image-2" as ImageGenModel,
    lsKey: "kabehub_image_provider",
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
  onSubmit: (content: string, modelId: ModelId, attachedImages?: AttachedImageFile[], isDeepThinking?: boolean) => void;
  onMemoSubmit: () => void;
  isLoading: boolean;
  disabled?: boolean;
  provider: Provider;
  onProviderChange: (p: Provider) => void;
  onImageGenerate?: (prompt: string, imageProvider?: string, imageRefId?: string, imageRefUpload?: { base64: string; mimeType: string; previewUrl: string }) => void;
  imageContextId?: string | null;
  isImagePinned?: boolean;
  onImagePinToggle?: () => void;
  onImageContextClear?: () => void;
  imageRefId?: string | null;
  onImageRefClear?: () => void;
  imageRefUpload?: { base64: string; mimeType: string; previewUrl: string } | null;
  onImageRefUpload?: (data: { base64: string; mimeType: string; previewUrl: string }) => void;
  onImageRefUploadClear?: () => void;
}

export const FILE_SIZE_LIMIT_KB = 500;
export const IMAGE_SIZE_LIMIT_MB = 5;
export const MAX_IMAGES = 3;      // 画像の上限枚数
export const MAX_TEXT_FILES = 3;  // テキストファイルの上限数
export const PREVIEW_LINES = 5;

/** UTF-8で読んだ結果に文字化けが含まれるか判定 */
export function hasMojibake(text: string): boolean {
  return text.includes("\uFFFD");
}

/** FileをUTF-8で読み、文字化けがあればShift-JISで読み直す */
export function readFileWithFallback(
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
  image_gen: "🎨 画像",
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
  onImageGenerate,
  imageContextId,
  isImagePinned,
  onImagePinToggle,
  onImageContextClear,
  imageRefId,
  onImageRefClear,
  imageRefUpload,
  onImageRefUpload,
  onImageRefUploadClear,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRefUploadInputRef = useRef<HTMLInputElement>(null);

  // 複数ファイル対応（テキスト＋画像の混在）
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  // GitHub 一時添付
  const [githubPanelOpen, setGithubPanelOpen] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

  // モデル選択 state（LocalStorageから初期値を読み込む）
  const [selectedModel, setSelectedModel] = useState<ModelId>(() => loadModel(provider));
  const [isDeepThinking, setIsDeepThinking] = useState(false);

  // imageRefUpload の ObjectURL をコンポーネントアンマウント時に解放
  useEffect(() => {
    return () => {
      if (imageRefUpload?.previewUrl) {
        URL.revokeObjectURL(imageRefUpload.previewUrl)
      }
    }
  }, [imageRefUpload?.previewUrl])

  // プロバイダーが変わったらそのプロバイダーの保存済みモデルを読み込む
  useEffect(() => {
    setSelectedModel(loadModel(provider));
  }, [provider]);

  // Claude以外に切り替わったらDeep Thinkingをリセット
  useEffect(() => {
    if (provider !== "claude") setIsDeepThinking(false);
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

  const handleNewline = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = value.substring(0, start) + "\n" + value.substring(end);
    onChange(newValue);
    setTimeout(() => {
      textarea.selectionStart = start + 1;
      textarea.selectionEnd = start + 1;
      textarea.focus();
    }, 0);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && !isCompressing && (value.trim() || attachedFiles.length > 0)) handleSubmit();
    }
  };

  // ── Ctrl+V スクショ貼り付け対応 ──────────────────────────────────────────
  // textareaのonPasteに直接アタッチすることで、他の入力欄への誤反応を防ぐ
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isLoading || disabled) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    // クリップボードから画像ファイルだけを抽出
    const imageFiles = Array.from(items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);

    // 画像が含まれていない場合は何もしない（通常のテキストペーストはそのまま通す）
    if (imageFiles.length === 0) return;

    // 画像が含まれている場合のみデフォルト挙動（文字列挿入）を抑制
    e.preventDefault();
    await processFiles(imageFiles);
  };

  /** 複数ファイルを処理（テキスト＋画像の混在対応） */
  const processFiles = async (files: FileList | File[]) => {
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    const fileArray = Array.from(files);
    // 現在の添付数をスナップショット（setStateは非同期のため）
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
        // サムネイル用ObjectURLは元ファイルから即時生成（圧縮前でも表示に問題なし）
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
            (msg) => { setFileError(msg); resolve(); }
          );
        });
      } else {
        setFileError("対応形式: CSV / TXT / MD / PNG / JPEG / GIF / WebP");
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) await processFiles(files);
  };

  const handleImageRefUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (imageRefUploadInputRef.current) imageRefUploadInputRef.current.value = ''

    if (file.size > 10 * 1024 * 1024) {
      setFileError('参照画像は10MB以下にしてください')
      return
    }

    const previewUrl = URL.createObjectURL(file)
    try {
      setIsCompressing(true)
      const { base64, mediaType, sizeKB } = await compressImage(file)
      if (sizeKB > 3 * 1024) {
        URL.revokeObjectURL(previewUrl)
        setFileError('参照画像の圧縮後サイズが大きすぎます。より小さい画像を使用してください')
        return
      }
      onImageRefUpload?.({ base64, mimeType: mediaType, previewUrl })
    } catch {
      URL.revokeObjectURL(previewUrl)
      setFileError('参照画像の読み込みに失敗しました')
    } finally {
      setIsCompressing(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isLoading && !disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isLoading || disabled) return;
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    if (provider === 'image_gen') {
      const imageFile = Array.from(files).find(f => f.type.startsWith('image/'))
      if (imageFile) {
        if (imageFile.size > 10 * 1024 * 1024) {
          setFileError('参照画像は10MB以下にしてください')
          return
        }
        const previewUrl = URL.createObjectURL(imageFile)
        try {
          setIsCompressing(true)
          const { base64, mediaType, sizeKB } = await compressImage(imageFile)
          if (sizeKB > 3 * 1024) {
            URL.revokeObjectURL(previewUrl)
            setFileError('参照画像の圧縮後サイズが大きすぎます。より小さい画像を使用してください')
            return
          }
          onImageRefUpload?.({ base64, mimeType: mediaType, previewUrl })
        } catch {
          URL.revokeObjectURL(previewUrl)
          setFileError('参照画像の読み込みに失敗しました')
        } finally {
          setIsCompressing(false)
        }
      }
      return
    }

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

      // テキストファイル上限チェック
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
      setGithubError(null);
    } catch {
      setGithubError("ネットワークエラーが発生しました");
    } finally {
      setGithubLoading(false);
    }
  };

  const handleSubmit = () => {
    // /image コマンド処理
    if (value.trim().startsWith('/image ')) {
      const rest = value.trim().slice('/image '.length).trim()
      const PROVIDERS = ['gemini', 'openai', 'ideogram', 'flux']
      const tokens = rest.split(' ')
      let imageProvider: string | undefined
      let prompt: string

      if (tokens[0] && PROVIDERS.includes(tokens[0].toLowerCase())) {
        imageProvider = tokens[0].toLowerCase()
        prompt = tokens.slice(1).join(' ').trim()
      } else {
        imageProvider = undefined
        prompt = rest
      }

      if (prompt && onImageGenerate) {
        onChange('')
        onImageGenerate(prompt, imageProvider)
      }
      return
    }

    // 画像生成モード
    if (provider === "image_gen") {
      if (value.trim() && onImageGenerate) {
        const MODEL_TO_PROVIDER: Record<string, string> = {
          "gpt-image-2": "openai",
          "gemini-2.5-flash-image": "gemini",
          "ideogram-v3": "ideogram",
          "black-forest-labs/flux.2-pro": "openrouter",
        }
        const imageProvider = MODEL_TO_PROVIDER[selectedModel as string] ?? "openai"
        onChange('')
        onImageGenerate(value.trim(), imageProvider, imageRefId ?? undefined, imageRefUpload ?? undefined)
      }
      return
    }

    const textFiles = attachedFiles.filter((f): f is AttachedTextFile => f.kind === "text");
    const imageFiles = attachedFiles.filter((f): f is AttachedImageFile => f.kind === "image");
    if (!value.trim() && attachedFiles.length === 0) return;

    // テキストファイルの内容をメッセージ本文に埋め込む
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
    // ObjectURLを解放してからstateをクリア
    attachedFiles.filter((f) => f.kind === "image").forEach((f) => {
      URL.revokeObjectURL((f as AttachedImageFile).previewUrl);
    });
    setAttachedFiles([]);
    setIsPreviewExpanded(false);
  };

  // テキストファイルのプレビュー用（最初のテキストファイルのみ表示）
  const firstTextFile = attachedFiles.find((f): f is AttachedTextFile => f.kind === "text") ?? null;
  const previewLines = firstTextFile?.content.split("\n").slice(0, PREVIEW_LINES) ?? [];
  const totalLines = firstTextFile?.content.split("\n").length ?? 0;
  const hasMoreLines = totalLines > PREVIEW_LINES;
  const hasAnyFile = attachedFiles.length > 0;

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
            <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>CSV / TXT / MD / 画像</span>
          </div>
        </div>
      )}

      {/* AI切り替えボタン＋モデル選択 */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
        {/* プロバイダー選択 */}
        {(["claude", "gemini", "openai", "image_gen"] as const).map((p) => (
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
        {MODEL_CONFIG[provider].models.map((m) => {
          const isImg2imgDisabled = (!!imageRefId || !!imageRefUpload) && (m.id === "gpt-image-2" || m.id === "black-forest-labs/flux.2-pro")
          return (
            <button
              key={m.id}
              onClick={() => !isImg2imgDisabled && handleModelChange(m.id)}
              title={isImg2imgDisabled ? "このモデルはimg2imgに非対応です" : m.badge}
              disabled={isImg2imgDisabled}
              style={{
                padding: "4px 10px",
                borderRadius: "20px",
                border: "1px solid",
                borderColor: isImg2imgDisabled ? "var(--border)" : selectedModel === m.id ? "var(--accent)" : "var(--border)",
                background: isImg2imgDisabled ? "transparent" : selectedModel === m.id ? "rgba(196,98,45,0.12)" : "transparent",
                color: isImg2imgDisabled ? "var(--ink-faint)" : selectedModel === m.id ? "var(--accent)" : "var(--ink-muted)",
                fontSize: "10px",
                fontFamily: "'JetBrains Mono', monospace",
                cursor: isImg2imgDisabled ? "not-allowed" : "pointer",
                transition: "all 0.15s",
                letterSpacing: "0.03em",
                opacity: isImg2imgDisabled ? 0.4 : 1,
              }}
            >
              {m.label}
              {m.badge === "高性能" && !isImg2imgDisabled && (
                <span style={{ marginLeft: "3px", fontSize: "8px", opacity: 0.7 }}>↑</span>
              )}
            </button>
          )
        })}
      </div>

      {/* 画像コンテキストピル */}
      {imageContextId && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "8px",
          padding: "4px 10px",
          borderRadius: "6px",
          border: `1px solid ${isImagePinned ? "var(--accent)" : "var(--border)"}`,
          background: isImagePinned ? "rgba(196,98,45,0.08)" : "#f0f9ff",
          fontSize: "11px",
          fontFamily: "'JetBrains Mono', monospace",
          alignSelf: "flex-start",
        }}>
          <span style={{ color: isImagePinned ? "var(--accent)" : "var(--ink-muted)" }}>
            🖼️ 画像を参照中{isImagePinned ? "（固定）" : ""}
          </span>
          <button
            onClick={onImagePinToggle}
            title={isImagePinned ? "固定を解除" : "送信後も保持する"}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              padding: "0 2px",
              color: isImagePinned ? "var(--accent)" : "var(--ink-faint)",
              transition: "color 0.15s",
            }}
          >
            📌
          </button>
          <button
            onClick={onImageContextClear}
            title="参照を解除"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              padding: "0 2px",
              color: "var(--ink-faint)",
              transition: "color 0.15s",
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* img2img 参照画像ピル（チャット内生成画像） */}
      {imageRefId && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "8px",
          padding: "4px 10px",
          borderRadius: "6px",
          border: "1px solid #c4b5fd",
          background: "#f5f3ff",
          fontSize: "11px",
          fontFamily: "'JetBrains Mono', monospace",
          alignSelf: "flex-start",
        }}>
          <span style={{ color: "#7c3aed" }}>🎨 参照画像あり（img2img）</span>
          <button
            onClick={onImageRefClear}
            title="参照を解除"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              padding: "0 2px",
              color: "#7c3aed",
              opacity: 0.7,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.7"; }}
          >
            ×
          </button>
        </div>
      )}

      {/* img2img ローカルアップロード参照画像ピル */}
      {imageRefUpload && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "8px",
          padding: "4px 10px",
          borderRadius: "6px",
          border: "1px solid #c4b5fd",
          background: "#f5f3ff",
          fontSize: "11px",
          fontFamily: "'JetBrains Mono', monospace",
          alignSelf: "flex-start",
        }}>
          <img src={imageRefUpload.previewUrl} alt="参照画像" style={{ width: 16, height: 16, objectFit: "cover", borderRadius: "2px" }} />
          <span style={{ color: "#7c3aed" }}>🖼️ ローカル参照画像（img2img）</span>
          <button
            onClick={onImageRefUploadClear}
            title="参照を解除"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              padding: "0 2px",
              color: "#7c3aed",
              opacity: 0.7,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.7"; }}
          >
            ×
          </button>
        </div>
      )}

      {/* GitHub 一時添付パネル */}
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

      {/* 添付ファイルプレビューエリア（画像サムネイル＋テキストファイル） */}
      {hasAnyFile && (
        <div style={{ marginBottom: "8px" }}>
          {/* 添付一覧（画像サムネイル＋テキストファイル名）*/}
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

          {/* テキストファイルのコンテンツプレビュー（最初の1件のみ） */}
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
          onPaste={handlePaste}
          disabled={disabled || isLoading}
          placeholder={provider === "image_gen" ? "画像生成のプロンプトを入力… (Enter で生成)" : hasAnyFile ? "ファイルについて質問… (Enter で送信)" : "思考を入力… (Enter で送信 / Shift+Enter で改行)"}
          rows={3}
          style={{
            width: "100%",
            resize: "none",
            border: "none",
            outline: "none",
            background: "transparent",
            padding: "14px 84px 14px 16px",
            fontSize: "14px",
            fontFamily: "'DM Sans', sans-serif",
            color: "var(--ink)",
            lineHeight: 1.6,
            minHeight: "80px",
            maxHeight: "240px",
            overflowY: "auto",
          }}
        />
        {/* 改行ボタン（送信ボタン左隣） */}
        <button
          onClick={handleNewline}
          disabled={disabled || isLoading}
          style={{
            position: "absolute",
            right: "48px",
            bottom: "10px",
            width: "26px",
            height: "26px",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            background: "transparent",
            color: disabled || isLoading ? "var(--ink-faint)" : "var(--ink-muted)",
            cursor: disabled || isLoading ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            transition: "background 0.15s, color 0.15s",
          }}
          title="改行を挿入"
          onMouseEnter={(e) => {
            if (!disabled && !isLoading) {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--ink-faint)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--ink)";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = disabled || isLoading ? "var(--ink-faint)" : "var(--ink-muted)";
          }}
        >
          ↵
        </button>
        {/* 送信ボタン（右下） */}
        <button
          onClick={handleSubmit}
          disabled={isLoading || isCompressing || (!value.trim() && attachedFiles.length === 0) || disabled}
          style={{
            position: "absolute",
            right: "10px",
            bottom: "10px",
            width: "32px",
            height: "32px",
            borderRadius: "7px",
            border: "none",
            background: isLoading || isCompressing || (!value.trim() && attachedFiles.length === 0) ? "var(--ink-faint)" : "var(--accent)",
            color: "white",
            cursor: isLoading || isCompressing || (!value.trim() && attachedFiles.length === 0) ? "default" : "pointer",
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
          {provider !== "image_gen" && (
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
          )}

          {/* 🧠 深く考えるボタン（Claudeのみ） */}
          {provider === "claude" && (
            <button
              onClick={() => setIsDeepThinking((v) => !v)}
              disabled={selectedModel === "claude-haiku-4-5-20251001" || selectedModel === "claude-fable-5" || isLoading || !!disabled}
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
                color: isDeepThinking ? "var(--accent)" : selectedModel === "claude-haiku-4-5-20251001" || selectedModel === "claude-fable-5" || isLoading ? "var(--ink-faint)" : "var(--ink-muted)",
                fontSize: "11px",
                fontFamily: "'JetBrains Mono', monospace",
                cursor: selectedModel === "claude-haiku-4-5-20251001" || selectedModel === "claude-fable-5" || isLoading || disabled ? "not-allowed" : "pointer",
                transition: "all 0.15s",
                letterSpacing: "0.03em",
              }}
            >
              🧠 深く考える
            </button>
          )}

          {/* 🖼️ 参照画像ボタン（image_gen モード時のみ） */}
          {provider === "image_gen" && (
            <button
              onClick={() => imageRefUploadInputRef.current?.click()}
              disabled={isLoading || disabled}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 12px",
                borderRadius: "20px",
                border: "1px solid",
                borderColor: imageRefUpload ? "#c4b5fd" : "var(--border)",
                background: imageRefUpload ? "#f5f3ff" : "transparent",
                color: imageRefUpload ? "#7c3aed" : isLoading ? "var(--ink-faint)" : "var(--ink-muted)",
                fontSize: "11px",
                fontFamily: "'JetBrains Mono', monospace",
                cursor: isLoading || disabled ? "default" : "pointer",
                transition: "all 0.15s",
                letterSpacing: "0.03em",
              }}
              title="ローカル画像をimg2imgの参照元として使用"
            >
              🖼️ 参照画像
            </button>
          )}

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
              borderColor: hasAnyFile ? "var(--accent)" : "var(--border)",
              background: hasAnyFile ? "rgba(196,98,45,0.08)" : "transparent",
              color: hasAnyFile ? "var(--accent)" : isLoading ? "var(--ink-faint)" : "var(--ink-muted)",
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              cursor: isLoading || disabled ? "default" : "pointer",
              transition: "all 0.15s",
              letterSpacing: "0.03em",
            }}
            title="CSV / TXT / MD / 画像（PNG・JPEG・GIF・WebP）を添付"
          >
            📎 {hasAnyFile ? `添付中 (${attachedFiles.length})` : "ファイル"}
          </button>

          {/* GitHub 一時添付ボタン */}
          {provider !== "image_gen" && (
            <button
              onClick={() => {
                setGithubPanelOpen((prev) => !prev);
                setGithubError(null);
              }}
              disabled={isLoading || disabled}
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
                cursor: isLoading || disabled ? "default" : "pointer",
                transition: "all 0.15s",
                letterSpacing: "0.03em",
              }}
              title="GitHub の公開ファイルを添付"
            >
              GitHub
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,.md,image/png,image/jpeg,image/gif,image/webp"
            multiple
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          <input
            ref={imageRefUploadInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={handleImageRefUploadChange}
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
