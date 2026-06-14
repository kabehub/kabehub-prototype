"use client";

import MarkdownRenderer from "./MarkdownRenderer";
import { Message, MessageNote } from "@/types";
import { MODEL_CONFIG } from "./ChatInput";
import { useState, memo, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";

interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
  isLoading?: boolean;
  provider?: string;
  onRegenerate?: (
    targetProvider: "claude" | "gemini" | "openai",
    assistantMsg: Message,
    modelId?: string,
    mode?: "branch" | "light",
    editedUserContent?: string
  ) => void;
  onEditAndRegenerate?: (
    assistantMsg: Message,
    editedContent: string,
    targetProvider: "claude" | "gemini" | "openai",
    modelId?: string
  ) => void;
  prevUserContent?: string;
  editRegenAssistantMsg?: Message;
  canEditAndRegenerateFromUser?: boolean;
  onTrimFrom?: (message: Message) => void;
  onMemoize?: (message: Message) => void;
  onUpdateMessage?: (messageId: string, updates: { content?: string; is_hidden?: boolean }) => Promise<void>;
  messageNotes?: MessageNote[];
  onAddMessageNote?: (messageId: string, content: string) => Promise<void>;
  onDeleteMessageNote?: (noteId: string) => void;
  isHighlighted?: boolean;
  isActiveMatch?: boolean;
  activeFlashKey?: number;
  messageNumber?: number;
  thinkingContent?: string;
  onDiscuss?: (messageId: string) => void;
  onDeleteImage?: (message: Message) => void;
  onImageRef?: (messageId: string) => void;
  onSendMemoToAI?: (content: string) => void;
}

function MessageBubble({
  message,
  isLast,
  isLoading,
  provider,
  onRegenerate,
  onEditAndRegenerate,
  prevUserContent,
  editRegenAssistantMsg,
  canEditAndRegenerateFromUser,
  onTrimFrom,
  onMemoize,
  onUpdateMessage,
  messageNotes = [],
  onAddMessageNote,
  onDeleteMessageNote,
  isHighlighted = false,
  isActiveMatch = false,
  activeFlashKey,
  messageNumber,
  thinkingContent,
  onDiscuss,
  onDeleteImage,
  onImageRef,
  onSendMemoToAI,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isMemo = message.provider === "memo";
  const isImageGen = message.provider === "image_gen";
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [showNoteList, setShowNoteList] = useState(false);
  const [copied, setCopied] = useState(false);

  // マスク編集モード
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // is_hidden の楽観的更新用
  const [isHidden, setIsHidden] = useState(message.is_hidden ?? false);
  const [isSavingHidden, setIsSavingHidden] = useState(false);

  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [likeStatus, setLikeStatus] = useState<"idle" | "loading" | "done" | "already">("idle");

  // ⋮ コンテキストメニュー
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [isContainerHovered, setIsContainerHovered] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [regenSubOpen, setRegenSubOpen] = useState(false);
  const [subPos, setSubPos] = useState({ x: 0, y: 0 });
  const regenBtnRef = useRef<HTMLButtonElement>(null);
  const subMenuRef = useRef<HTMLDivElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [editRegenOpen, setEditRegenOpen] = useState(false);
  const [editRegenContent, setEditRegenContent] = useState("");
  const [editRegenMode, setEditRegenMode] = useState<"branch" | "light">("branch");
  const [editRegenProvider, setEditRegenProvider] = useState<"claude" | "gemini" | "openai">("claude");
  const [editRegenModelId, setEditRegenModelId] = useState<string | undefined>(undefined);
  const USER_COLLAPSE_THRESHOLD = 128;
  const shouldCollapseUserMessage = isUser && !isMemo && !isImageGen;
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsTouchDevice(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      const inMenu = menuRef.current?.contains(e.target as Node);
      const inSub = subMenuRef.current?.contains(e.target as Node);
      if (!inMenu && !inSub) {
        setMenuOpen(false);
        setRegenSubOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const showContextTrigger = isTouchDevice || isContainerHovered;

  const openSubMenu = () => {
    if (!regenBtnRef.current) return;
    const rect = regenBtnRef.current.getBoundingClientRect();
    if (isTouchDevice) {
      setSubPos({ x: rect.left, y: rect.bottom + 2 });
    } else {
      const subX = Math.min(rect.right + 4, window.innerWidth - 220);
      setSubPos({ x: subX, y: rect.top });
    }
    setRegenSubOpen(true);
  };

  // サブメニューが画面端にはみ出す場合にフリップ補正
  useEffect(() => {
    if (!regenSubOpen || !subMenuRef.current) return;
    const el = subMenuRef.current;
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();

      // 縦方向: 画面下にはみ出す場合は上方向にずらす
      if (rect.bottom > window.innerHeight) {
        el.style.top = Math.max(4, window.innerHeight - rect.height) + "px";
      }

      // 横方向: 画面右にはみ出す場合はメインメニューの左側に表示
      if (rect.right > window.innerWidth && menuRef.current) {
        const menuRect = menuRef.current.getBoundingClientRect();
        el.style.left = Math.max(4, menuRect.left - rect.width - 4) + "px";
      }
    });
  }, [regenSubOpen]);

  useEffect(() => {
    if (!isImageGen || !message.metadata?.storagePath || message.metadata?.image_deleted) return;
    // TODO: 将来的にAPI Route経由の画像配信に変更し、Next.js <Image> のキャッシュを効かせる
    supabase.storage
      .from("generated-images")
      .createSignedUrl(message.metadata.storagePath, 3600)
      .then(({ data }) => {
        if (data?.signedUrl) setImageUrl(data.signedUrl);
      });
  }, [isImageGen, message.metadata?.storagePath, message.metadata?.image_deleted]);

  useEffect(() => {
    if (!shouldCollapseUserMessage || !contentRef.current) return;

    const el = contentRef.current;

    const measure = () => {
      setNeedsCollapse(el.scrollHeight > USER_COLLAPSE_THRESHOLD + 1);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => observer.disconnect();
  }, [shouldCollapseUserMessage, message.content]);

  const handleOpenMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
    // メニューをボタンの右下に配置、画面端でクリップしないよう調整
    const x = Math.min(rect.right, window.innerWidth - 180);
    const y = rect.bottom + 4;
    setMenuPos({ x, y });
    setMenuOpen(true);
  };

  const myNotes = messageNotes.filter((n) => n.message_id === message.id);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = isImageGen ? message.content : message.content;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const aiLabel = (num?: number) => {
    const p = message.provider ?? provider ?? "AI";
    const providerName =
      p === "claude" ? "Claude" :
      p === "gemini" ? "Gemini" :
      p === "openai" ? "ChatGPT" :
      p === "memo" ? "メモ" :
      p === "image_gen" ? "🖼️ 画像生成" : "AI";
    const numStr = num ? ` · #${num}` : '';
    return message.model_id
      ? `${providerName}${numStr} · ${message.model_id}`
      : `${providerName}${numStr}`;
  };

  const ALL_PROVIDERS = ["claude", "gemini", "openai"] as const;
  const regenTargets = ALL_PROVIDERS.filter((p) => p !== message.provider);
  const regenLabel = (p: string) =>
    p === "claude" ? "Claude" : p === "gemini" ? "Gemini" : "ChatGPT";

  const handleSaveNote = async () => {
    if (!noteContent.trim() || !onAddMessageNote) return;
    await onAddMessageNote(message.id, noteContent.trim());
    setNoteContent("");
    setShowNoteInput(false);
    setShowNoteList(true);
  };

  // 🔒 is_hidden トグル
  const handleToggleHidden = async () => {
    if (!onUpdateMessage || isSavingHidden) return;
    const next = !isHidden;
    setIsHidden(next); // 楽観的更新
    setIsSavingHidden(true);
    try {
      await onUpdateMessage(message.id, { is_hidden: next });
    } catch {
      setIsHidden(!next); // ロールバック
    } finally {
      setIsSavingHidden(false);
    }
  };

  // ✏️ マスク編集保存
  const handleSaveEdit = async () => {
    if (!onUpdateMessage || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      await onUpdateMessage(message.id, { content: editContent });
      setIsEditing(false);
    } catch {
      alert("保存に失敗しました");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleLike = async () => {
    if (likeStatus !== "idle") return;
    const openaiKey = localStorage.getItem("kabehub_openai_key") ?? "";
    if (!openaiKey) {
      alert("OpenAI APIキーが設定されていません。");
      return;
    }
    setLikeStatus("loading");
    try {
      const res = await fetch("/api/lore/like", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-openai-api-key": openaiKey,
        },
        body: JSON.stringify({ messageId: message.id }),
      });
      const data = await res.json();
      if (data.alreadyLiked) {
        setLikeStatus("already");
      } else if (data.success) {
        setLikeStatus("done");
        setTimeout(() => setLikeStatus("idle"), 2000);
      } else {
        alert(data.error ?? "エラーが発生しました");
        setLikeStatus("idle");
      }
    } catch {
      alert("エラーが発生しました");
      setLikeStatus("idle");
    }
  };

  // テキスト選択 → [[選択テキスト]] に変換するヘルパー
  const handleMaskSelection = () => {
    const textarea = document.getElementById(`mask-editor-${message.id}`) as HTMLTextAreaElement | null;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) return; // 選択なし
    const selected = editContent.slice(start, end);
    const next = editContent.slice(0, start) + `[[${selected}]]` + editContent.slice(end);
    setEditContent(next);
    // カーソルを [[...]] の後ろに移動
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + selected.length + 4;
      textarea.focus();
    }, 0);
  };

  const menuItemStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "8px 14px",
    border: "none",
    background: "none",
    textAlign: "left",
    fontSize: "13px",
    fontFamily: "'DM Sans', sans-serif",
    color: "var(--ink)",
    cursor: "pointer",
    transition: "background 0.1s",
    whiteSpace: "nowrap",
  };

  const regenProvider =
    message.provider === "claude" || message.provider === "gemini" || message.provider === "openai"
      ? message.provider
      : "claude";

  const openEditRegenModal = (
    initialContent: string,
    defaultModelSource?: Message,
    mode: "branch" | "light" = "branch",
  ) => {
    setEditRegenContent(initialContent);
    setEditRegenMode(mode);
    const src = defaultModelSource ?? (!isUser ? message : undefined);
    const srcProvider =
      src?.provider === "claude" || src?.provider === "gemini" || src?.provider === "openai"
        ? src.provider
        : regenProvider;
    setEditRegenProvider(srcProvider);
    setEditRegenModelId(src?.model_id ?? undefined);
    setEditRegenOpen(true);
  };

  const submitEditRegen = () => {
    if (!editRegenContent.trim()) return;
    if (editRegenMode === "light") {
      if (!onRegenerate) return;
      onRegenerate(editRegenProvider, message, editRegenModelId, "light", editRegenContent.trim());
      setEditRegenOpen(false);
      return;
    }
    if (!onEditAndRegenerate) return;
    const target = (isUser && canEditAndRegenerateFromUser)
      ? message
      : (!isUser ? message : editRegenAssistantMsg);
    if (!target) return;
    onEditAndRegenerate(target, editRegenContent.trim(), editRegenProvider, editRegenModelId);
    setEditRegenOpen(false);
  };

  return (
    <>
      <div
        className="animate-message"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          marginBottom: "20px",
          position: "relative",
          borderRadius: "12px",
          transition: "background-color 0.3s",
          backgroundColor: isActiveMatch
            ? "transparent"
            : isHighlighted
            ? "rgba(251, 146, 60, 0.08)"
            : "transparent",
          opacity: isHidden ? 0.5 : 1,
        }}
        onMouseEnter={(e) => {
          setIsContainerHovered(true);
          const copyBtn = (e.currentTarget as HTMLDivElement).querySelector(".copy-btn") as HTMLButtonElement | null;
          if (copyBtn) copyBtn.style.opacity = "1";
          const maskBtn = (e.currentTarget as HTMLDivElement).querySelector(".mask-btn") as HTMLButtonElement | null;
          if (maskBtn) maskBtn.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          setIsContainerHovered(false);
          const copyBtn = (e.currentTarget as HTMLDivElement).querySelector(".copy-btn") as HTMLButtonElement | null;
          if (copyBtn && !copied) copyBtn.style.opacity = "0";
          const maskBtn = (e.currentTarget as HTMLDivElement).querySelector(".mask-btn") as HTMLButtonElement | null;
          if (maskBtn) maskBtn.style.opacity = "0";
        }}
      >
        {/* アクティブヒットのフラッシュオーバーレイ */}
        {isActiveMatch && activeFlashKey !== undefined && (
          <span
            key={activeFlashKey}
            className="kabehub-flash-active"
            style={{ position: "absolute", inset: 0, borderRadius: "12px", pointerEvents: "none", zIndex: 0 }}
          />
        )}

        {/* ロールラベル */}
        <div style={{
          fontSize: "10px",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: isMemo ? "#b7791f" : "var(--ink-faint)",
          marginBottom: "5px",
          fontFamily: "'JetBrains Mono', monospace",
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}>
          {isMemo ? "📝 Memo" : isUser ? (messageNumber ? `You · #${messageNumber}` : "You") : aiLabel(messageNumber)}
          {isHidden && (
            <span style={{ fontSize: "9px", background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444", borderRadius: "3px", padding: "0 4px" }}>
              🔒 非公開
            </span>
          )}
        </div>

        {/* 🧠 思考プロセス（Extended Thinking） */}
        {thinkingContent && !isUser && !isMemo && (
          <div style={{ marginBottom: "6px", position: "relative", zIndex: 1, maxWidth: "720px" }}>
            <button
              onClick={() => setThinkingExpanded(v => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 8px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                background: "#f3f4f6",
                color: "#6b7280",
                fontSize: "11px",
                fontFamily: "'JetBrains Mono', monospace",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              🧠 思考プロセス {thinkingExpanded ? "▲" : "▼"}
            </button>
            {thinkingExpanded && (
              <div style={{
                marginTop: "4px",
                padding: "10px 14px",
                background: "#f3f4f6",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "12px",
                fontFamily: "'DM Sans', sans-serif",
                color: "#374151",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                maxHeight: "400px",
                overflowY: "auto",
              }}>
                {thinkingContent}
              </div>
            )}
          </div>
        )}

        {/* バブル＋メモアイコン行 */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", flexDirection: "row", position: "relative", zIndex: 1 }}>
          <div style={{ position: "relative", width: "100%" }}>
            <div
              onClick={() => { const sel = window.getSelection(); if (sel && !sel.isCollapsed) return; setShowNoteInput((v) => !v); setShowNoteList(false); }}
              style={{
                width: "100%",
                maxWidth: "720px",
                borderRadius: "8px",
                padding: "12px 16px",
                background: isMemo
                  ? "#fefce8"
                  : isUser
                  ? "#f7f7f5"
                  : "#ffffff",
                color: isMemo ? "#78350f" : "var(--ink)",
                border: isMemo
                  ? "1px solid #fde68a"
                  : "1px solid var(--border)",
                borderLeft: isMemo
                  ? "1px solid #fde68a"
                  : isUser
                  ? "4px solid var(--accent)"
                  : "1px solid var(--border)",
                paddingLeft: isUser ? "14px" : "16px",

                fontSize: "14px",
                lineHeight: 1.6,
                boxShadow: "none",
                fontFamily: "'DM Sans', sans-serif",
                whiteSpace: isMemo ? "pre-wrap" : undefined,
                cursor: "pointer",
                opacity: isHidden ? 0.6 : 1,
              }}
            >
              {isMemo ? (
                message.content
              ) : isImageGen ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {message.metadata?.image_deleted ? (
                    <div style={{ color: "var(--ink-faint)", fontSize: "13px", fontStyle: "italic" }}>
                      🖼️ 画像は削除されました
                    </div>
                  ) : imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={message.content}
                      style={{ maxWidth: "100%", borderRadius: "6px", display: "block" }}
                    />
                  ) : (
                    <div style={{ color: "var(--ink-faint)", fontSize: "13px" }}>🖼️ 読み込み中...</div>
                  )}
                  {imageUrl && (onDiscuss || onImageRef) && (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {onDiscuss && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDiscuss(message.id); }}
                          style={{
                            alignSelf: "flex-start",
                            padding: "5px 12px",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                            background: "white",
                            color: "var(--ink-muted)",
                            fontSize: "11px",
                            fontFamily: "'JetBrains Mono', monospace",
                            cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
                            (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)";
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                            (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)";
                          }}
                        >
                          💬 Discuss with AI
                        </button>
                      )}
                      {onImageRef && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onImageRef(message.id); }}
                          style={{
                            alignSelf: "flex-start",
                            padding: "5px 12px",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                            background: "white",
                            color: "var(--ink-muted)",
                            fontSize: "11px",
                            fontFamily: "'JetBrains Mono', monospace",
                            cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = "#8b5cf6";
                            (e.currentTarget as HTMLButtonElement).style.color = "#8b5cf6";
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                            (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)";
                          }}
                        >
                          🎨 この画像をベースに生成
                        </button>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: "11px", color: "var(--ink-faint)", fontFamily: "'JetBrains Mono', monospace", marginTop: "4px" }}>
                    プロンプト: {message.content}
                  </div>
                </div>
              ) : isUser ? (
                <div style={{ position: "relative" }}>
                  <div
                    ref={contentRef}
                    style={{
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      lineHeight: 1.6,
                      maxHeight:
                        needsCollapse && isCollapsed
                          ? `${USER_COLLAPSE_THRESHOLD}px`
                          : "none",
                      overflow: "hidden",
                    }}
                  >
                    {message.content}
                  </div>

                  {needsCollapse && isCollapsed && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: "24px",
                        height: "36px",
                        background: "linear-gradient(transparent, #f7f7f5)",
                        pointerEvents: "none",
                      }}
                    />
                  )}

                  {needsCollapse && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsCollapsed((v) => !v);
                      }}
                      style={{
                        marginTop: "6px",
                        fontSize: "11px",
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "var(--accent)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {isCollapsed ? "▽ 続きを読む" : "△ 折りたたむ"}
                    </button>
                  )}
                </div>
              ) : (
                <MarkdownRenderer content={message.content} />
              )}
            </div>

            {/* コピーボタン */}
            <button
              className="copy-btn"
              onClick={handleCopy}
              style={{
                position: "absolute",
                top: "-10px",
                right: "-8px",
                opacity: 0,
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                border: "1px solid var(--border)",
                background: "white",
                color: copied ? "#38a169" : "var(--ink-muted)",
                fontSize: "11px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                transition: "opacity 0.15s, color 0.15s",
              }}
              title="コピー"
            >
              {copied ? "✓" : "📋"}
            </button>

            {/* 🔒 非公開トグルボタン（onUpdateMessage がある場合のみ表示） */}
            {onUpdateMessage && !isMemo && (
              <button
                className="mask-btn"
                onClick={(e) => { e.stopPropagation(); handleToggleHidden(); }}
                disabled={isSavingHidden}
                style={{
                  position: "absolute",
                  top: "-10px",
                  left: "-8px",
                  opacity: 0,
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  border: `1px solid ${isHidden ? "#fca5a5" : "var(--border)"}`,
                  background: isHidden ? "#fef2f2" : "white",
                  color: isHidden ? "#ef4444" : "var(--ink-muted)",
                  fontSize: "11px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                  transition: "opacity 0.15s, color 0.15s",
                }}
                title={isHidden ? "公開に戻す" : "共有ページで非公開にする"}
              >
                🔒
              </button>
            )}

            {/* ⋮ コンテキストメニュートリガー */}
            {!isLoading && (onTrimFrom || onMemoize || onRegenerate) && (
              <button
                onClick={handleOpenMenu}
                style={{
                  position: "absolute",
                  bottom: "-10px",
                  right: "-8px",
                  opacity: showContextTrigger ? 1 : 0,
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  border: "1px solid var(--border)",
                  background: "white",
                  color: "var(--ink-muted)",
                  fontSize: "16px",
                  lineHeight: 1,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                  transition: "opacity 0.15s",
                  zIndex: 2,
                }}
                title="操作メニュー"
              >
                ⋮
              </button>
            )}
          </div>

          {/* メモアイコン */}
          {myNotes.length > 0 && (
            <button
              onClick={() => { setShowNoteList((v) => !v); setShowNoteInput(false); }}
              style={{
                marginTop: "4px",
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                border: "1px solid var(--accent)",
                background: showNoteList ? "var(--accent)" : "white",
                color: showNoteList ? "white" : "var(--accent)",
                fontSize: "11px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "all 0.15s",
              }}
              title={`メモ ${myNotes.length}件`}
            >
              📝
            </button>
          )}
        </div>

        {message.provider === "memo" && onSendMemoToAI && (
          <div style={{ marginTop: "8px", display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => onSendMemoToAI(message.content)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 10px",
                borderRadius: "6px",
                border: "1px solid #d69e2e",
                background: "#fefce8",
                color: "#92400e",
                fontSize: "11px",
                cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              ▶ AIに投げる
            </button>
          </div>
        )}

        {/* ✏️ マスク編集UI（onUpdateMessage がある場合のみ表示） */}
        {onUpdateMessage && !isMemo && (
          <div style={{ marginTop: "4px", position: "relative", zIndex: 1 }}>
            {!isEditing ? (
              <button
                onClick={() => { setEditContent(message.content); setIsEditing(true); }}
                style={{
                  fontSize: "10px",
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "var(--ink-faint)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 4px",
                  borderRadius: "4px",
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-faint)"; }}
              >
                ✏️ 部分マスク編集
              </button>
            ) : (
              <div style={{ width: "560px", maxWidth: "100%", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", lineHeight: 1.6 }}>
                  テキストを選択して「マスク」を押すと <code style={{ background: "var(--border)", borderRadius: "3px", padding: "0 3px" }}>[[選択テキスト]]</code> に変換されます。共有ページでは ████ に表示されます。
                </div>
                <textarea
                  id={`mask-editor-${message.id}`}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={6}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid var(--accent)",
                    borderRadius: "7px",
                    fontSize: "13px",
                    fontFamily: "'DM Sans', sans-serif",
                    color: "var(--ink)",
                    background: "white",
                    outline: "none",
                    resize: "vertical",
                    boxSizing: "border-box",
                    lineHeight: 1.6,
                  }}
                />
                <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setIsEditing(false)}
                    style={{ padding: "3px 10px", borderRadius: "5px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", cursor: "pointer" }}
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleMaskSelection}
                    style={{ padding: "3px 10px", borderRadius: "5px", border: "1px solid #6b7280", background: "#f3f4f6", color: "#374151", fontSize: "11px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    🔒 マスク
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={isSavingEdit}
                    style={{ padding: "3px 10px", borderRadius: "5px", border: "none", background: "var(--accent)", color: "white", fontSize: "11px", cursor: isSavingEdit ? "default" : "pointer" }}
                  >
                    {isSavingEdit ? "保存中…" : "保存"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 👍 記憶に追加ボタン（assistantのみ） */}
        {!isUser && !isMemo && !isImageGen && (
          <div style={{ marginTop: "4px", position: "relative", zIndex: 1 }}>
            <button
              onClick={handleLike}
              disabled={likeStatus === "loading" || likeStatus === "already"}
              style={{
                fontSize: "10px",
                fontFamily: "'JetBrains Mono', monospace",
                color: (likeStatus === "done" || likeStatus === "already") ? "#38a169" : "var(--ink-faint)",
                background: "none",
                border: "none",
                cursor: (likeStatus === "loading" || likeStatus === "already") ? "default" : "pointer",
                padding: "2px 4px",
                borderRadius: "4px",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (likeStatus === "idle") (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                if (likeStatus === "idle") (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-faint)";
              }}
            >
              {likeStatus === "loading" ? "⏳ 保存中…" : (likeStatus === "done" || likeStatus === "already") ? "✓ 記憶済み" : "👍 記憶に追加"}
            </button>
          </div>
        )}

        {/* メモ入力欄 */}
        {showNoteInput && (
          <div style={{ marginTop: "8px", width: "82%", display: "flex", flexDirection: "column", gap: "6px", position: "relative", zIndex: 1 }}>
            <textarea
              autoFocus
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSaveNote(); if (e.key === "Escape") setShowNoteInput(false); }}
              placeholder="このメッセージへのメモ… (Cmd/Ctrl+Enter で保存)"
              style={{
                width: "100%",
                minHeight: "60px",
                padding: "8px 10px",
                border: "1px solid var(--accent)",
                borderRadius: "7px",
                fontSize: "13px",
                fontFamily: "'DM Sans', sans-serif",
                resize: "vertical",
                outline: "none",
                color: "var(--ink)",
                boxSizing: "border-box",
                background: "white",
              }}
            />
            <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowNoteInput(false)} style={{ padding: "3px 10px", borderRadius: "5px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", cursor: "pointer" }}>キャンセル</button>
              <button onClick={handleSaveNote} disabled={!noteContent.trim()} style={{ padding: "3px 10px", borderRadius: "5px", border: "none", background: noteContent.trim() ? "var(--accent)" : "var(--border)", color: noteContent.trim() ? "white" : "var(--ink-faint)", fontSize: "11px", cursor: noteContent.trim() ? "pointer" : "default" }}>保存</button>
            </div>
          </div>
        )}

        {/* メモ一覧 */}
        {showNoteList && myNotes.length > 0 && (
          <div style={{ marginTop: "8px", width: "82%", display: "flex", flexDirection: "column", gap: "6px", position: "relative", zIndex: 1 }}>
            {myNotes.map((note) => (
              <div key={note.id} style={{ background: "#fffbeb", border: "1px solid #f6e05e", borderRadius: "8px", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                <div style={{ fontSize: "13px", color: "var(--ink)", whiteSpace: "pre-wrap", lineHeight: 1.6, flex: 1 }}>{note.content}</div>
                <button
                  onClick={() => onDeleteMessageNote?.(note.id)}
                  style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "10px", cursor: "pointer", flexShrink: 0 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e53e3e"; (e.currentTarget as HTMLButtonElement).style.color = "#e53e3e"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        {/* 再生成ボタン（isLast の場合のみ） */}
        {!isUser && !isMemo && isLast && !isLoading && onRegenerate && (
          <div style={{ display: "flex", gap: "6px", marginTop: "6px", position: "relative", zIndex: 1 }}>
            <button
              onClick={() => openEditRegenModal(prevUserContent ?? "", message, "light")}
              style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid var(--accent)", background: "white", color: "var(--accent)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", transition: "all 0.15s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "white"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "white"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
            >
              上書き再生成
            </button>
            {regenTargets.map((p) => (
              <button
                key={p}
                onClick={() => onRegenerate(p, message)}
                style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", transition: "all 0.15s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}
              >
                🔄 {regenLabel(p)}で再生成
              </button>
            ))}
            {onEditAndRegenerate && (
              <button
                onClick={() => openEditRegenModal(prevUserContent ?? "", message)}
                style={{
                  padding: "4px 10px", borderRadius: "6px",
                  border: "1px solid var(--accent)", background: "white",
                  color: "var(--accent)", fontSize: "11px",
                  fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "4px", transition: "all 0.15s"
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)";
                  (e.currentTarget as HTMLButtonElement).style.color = "white";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "white";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)";
                }}
              >
                ✏️ 編集して再生成
              </button>
            )}
          </div>
        )}
      </div>

      {/* ⋮ コンテキストメニュー（position: fixed） */}
      {menuOpen && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: menuPos.y,
            left: menuPos.x,
            zIndex: 9999,
            background: "white",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            minWidth: "160px",
            overflow: "hidden",
          }}
        >
          {/* 再生成（assistantのみ） — サブメニュートリガー */}
          {!isUser && !isMemo && onRegenerate && (
            <button
              ref={regenBtnRef}
              onClick={isTouchDevice ? () => { regenSubOpen ? setRegenSubOpen(false) : openSubMenu(); } : openSubMenu}
              style={{ ...menuItemStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f7f7f5"; if (!isTouchDevice) openSubMenu(); }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
            >
              <span>🔄 再生成</span>
              <span style={{ fontSize: "10px", color: "var(--ink-faint)", marginLeft: "16px" }}>▶</span>
            </button>
          )}
          {isUser && !isMemo && onEditAndRegenerate && editRegenAssistantMsg && canEditAndRegenerateFromUser && (
            <button
              onClick={() => {
                setMenuOpen(false);
                setRegenSubOpen(false);
                openEditRegenModal(message.content, editRegenAssistantMsg);
              }}
              style={menuItemStyle}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "#f7f7f5";
                setRegenSubOpen(false);
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "none";
              }}
            >
              ✏️ 編集して再生成
            </button>
          )}
          {/* メモ化（userとassistantのみ、memoは除外） */}
          {!isMemo && onMemoize && (
            <button
              onClick={() => { setMenuOpen(false); setRegenSubOpen(false); onMemoize(message); }}
              style={menuItemStyle}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f7f7f5"; setRegenSubOpen(false); }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
            >
              📝 メモ化
            </button>
          )}
          {/* 削除（このメッセージ以降を全て削除 / 画像削除 / tombstone除去） */}
          {onTrimFrom && (
            <button
              onClick={() => {
                setMenuOpen(false);
                setRegenSubOpen(false);
                if (isImageGen && !message.metadata?.image_deleted) {
                  if (window.confirm("画像ファイルを削除しますか？プロンプトテキストはスレッドに残ります。")) {
                    onDeleteImage?.(message);
                  }
                } else if (isImageGen && message.metadata?.image_deleted) {
                  if (window.confirm("この会話履歴をスレッドから削除しますか？")) {
                    onTrimFrom(message);
                  }
                } else {
                  if (window.confirm("このメッセージ以降を全て削除しますか？")) {
                    onTrimFrom(message);
                  }
                }
              }}
              style={{
                ...menuItemStyle,
                color: "#e53e3e",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "#fff5f5";
                setRegenSubOpen(false);
              }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
            >
              {isImageGen && !message.metadata?.image_deleted
                ? "🗑️ 画像を削除"
                : isImageGen && message.metadata?.image_deleted
                ? "🗑️ 削除（スレッドから除去）"
                : "🗑️ 削除"}
            </button>
          )}
        </div>
      )}

      {/* 🔄 再生成 サブメニュー（position: fixed） */}
      {menuOpen && regenSubOpen && (
        <div
          ref={subMenuRef}
          style={{
            position: "fixed",
            top: subPos.y,
            left: subPos.x,
            zIndex: 10000,
            background: "white",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            minWidth: "210px",
            maxHeight: "80vh",
            overflowY: "auto",
          }}
        >
          {(Object.keys(MODEL_CONFIG) as Array<keyof typeof MODEL_CONFIG>).filter(k => k !== "image_gen").map((providerKey, sectionIdx) => {
            const config = MODEL_CONFIG[providerKey];
            return (
              <div key={providerKey}>
                <div style={{
                  padding: "5px 14px 3px",
                  fontSize: "10px",
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "var(--ink-faint)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background: "#f9f9f8",
                  ...(sectionIdx > 0 ? { borderTop: "1px solid var(--border)" } : {}),
                }}>
                  {config.label}
                </div>
                {config.models.map((model) => {
                  const isCurrent = message.model_id === model.id;
                  return (
                    <button
                      key={model.id}
                      onClick={() => {
                        setMenuOpen(false);
                        setRegenSubOpen(false);
                        onRegenerate!(providerKey, message, model.id);
                      }}
                      style={{
                        ...menuItemStyle,
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        paddingLeft: "20px",
                        background: isCurrent ? "#f0f9ff" : "none",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = isCurrent ? "#e0f2fe" : "#f7f7f5"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = isCurrent ? "#f0f9ff" : "none"; }}
                    >
                      <span style={{ flex: 1 }}>{model.label}</span>
                      <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "3px", background: "#f3f4f6", color: "#6b7280", fontFamily: "'JetBrains Mono', monospace" }}>{model.badge}</span>
                      {isCurrent && (
                        <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "3px", background: "#dbeafe", color: "#2563eb", fontFamily: "'JetBrains Mono', monospace", marginLeft: "2px" }}>現在</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {editRegenOpen && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 10001,
            background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditRegenOpen(false); }}
        >
          <div style={{
            background: "white", borderRadius: "12px",
            padding: "24px", width: "560px", maxWidth: "90vw",
            display: "flex", flexDirection: "column", gap: "16px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}>
            <div style={{ fontSize: "14px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)" }}>
              {editRegenMode === "light" ? "✏️ プロンプトを編集して上書き再生成" : "✏️ プロンプトを編集して再生成"}
            </div>
            <div style={{ fontSize: "11px", color: "var(--ink-faint)", fontFamily: "'JetBrains Mono', monospace" }}>
              {editRegenMode === "light"
                ? "世界線は分かれません。あなたの発言とAIの回答を、この場で上書きします。"
                : "元の回答を分岐として保存し、編集後のプロンプトで再生成します。"}
            </div>

            <textarea
              autoFocus
              value={editRegenContent}
              onChange={(e) => setEditRegenContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
                if (e.nativeEvent.isComposing) return;
                e.preventDefault();
                submitEditRegen();
              }}
              rows={6}
              style={{
                width: "100%", padding: "10px 12px",
                border: "1px solid var(--accent)", borderRadius: "8px",
                fontSize: "13px", fontFamily: "'DM Sans', sans-serif",
                color: "var(--ink)", resize: "vertical", outline: "none",
                boxSizing: "border-box", lineHeight: 1.6,
              }}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ fontSize: "11px", color: "var(--ink-faint)", fontFamily: "'JetBrains Mono', monospace" }}>
                送信先
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {(Object.keys(MODEL_CONFIG) as Array<keyof typeof MODEL_CONFIG>)
                  .filter(k => k !== "image_gen")
                  .map((providerKey) => {
                    const config = MODEL_CONFIG[providerKey];
                    return config.models.map((model) => {
                      const isSelected = editRegenProvider === providerKey && editRegenModelId === model.id;
                      return (
                        <button
                          key={model.id}
                          onClick={() => {
                            setEditRegenProvider(providerKey as "claude" | "gemini" | "openai");
                            setEditRegenModelId(model.id);
                          }}
                          style={{
                            padding: "4px 10px", borderRadius: "6px", fontSize: "11px",
                            fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
                            border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                            background: isSelected ? "var(--accent)" : "white",
                            color: isSelected ? "white" : "var(--ink-muted)",
                          }}
                        >
                          {model.label}
                        </button>
                      );
                    });
                  })}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setEditRegenOpen(false)}
                style={{
                  padding: "6px 16px", borderRadius: "6px",
                  border: "1px solid var(--border)", background: "white",
                  color: "var(--ink-muted)", fontSize: "12px", cursor: "pointer"
                }}
              >
                キャンセル
              </button>
              <button
                onClick={submitEditRegen}
                disabled={!editRegenContent.trim()}
                style={{
                  padding: "6px 16px", borderRadius: "6px", border: "none",
                  background: editRegenContent.trim() ? "var(--accent)" : "var(--border)",
                  color: "white", fontSize: "12px",
                  cursor: editRegenContent.trim() ? "pointer" : "default",
                }}
              >
                {editRegenMode === "light" ? "上書き再生成" : "再生成"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default memo(MessageBubble);

export function ThinkingBubble() {
  return (
    <div className="animate-message" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", marginBottom: "20px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: "5px", fontFamily: "'JetBrains Mono', monospace" }}>AI</div>
      <div style={{ borderRadius: "12px 12px 12px 2px", padding: "14px 18px", background: "var(--bubble-ai)", border: "1px solid var(--border)", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", display: "flex", gap: "5px", alignItems: "center" }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="thinking-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--ink-faint)", display: "block", animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  );
}

interface BranchBubbleProps {
  messages: Message[];
  onRestore?: (message: Message) => void;
}

export function BranchBubble({ messages, onRestore }: BranchBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const restoreMessage =
    [...messages].reverse().find((msg) => msg.role === "assistant" && msg.branch_root_id && msg.branch_index != null) ??
    messages.find((msg) => msg.branch_root_id && msg.branch_index != null);
  const labelMessage =
    restoreMessage ??
    messages.find((msg) => msg.role === "assistant") ??
    messages[0];

  const providerLabel =
    labelMessage?.provider === "claude" ? "Claude" :
    labelMessage?.provider === "gemini" ? "Gemini" :
    labelMessage?.provider === "openai" ? "ChatGPT" : "AI";

  const modelLabel = labelMessage?.model_id ? ` · ${labelMessage.model_id}` : "";

  return (
    <div style={{
      marginBottom: "8px",
      borderRadius: "8px",
      border: "1px dashed var(--border)",
      background: "#fafaf9",
      overflow: "hidden",
    }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 12px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: "10px", color: "var(--ink-faint)" }}>
          {expanded ? "▼" : "▶"}
        </span>
        <span style={{
          fontSize: "10px",
          fontFamily: "'JetBrains Mono', monospace",
          color: "var(--ink-faint)",
          letterSpacing: "0.05em",
        }}>
          ボツ案 · {providerLabel}{modelLabel}{messages.length > 1 ? ` · ${messages.length}件` : ""}
        </span>
        <span style={{
          marginLeft: "auto",
          fontSize: "10px",
          color: "var(--ink-faint)",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {expanded ? "閉じる" : "展開"}
        </span>
      </div>

      {expanded && (
        <div style={{
          padding: "10px 14px 12px",
          borderTop: "1px dashed var(--border)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: restoreMessage ? "10px" : 0 }}>
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              const roleLabel = isUser ? "You" : "AI";
              return (
                <div key={msg.id} style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isUser ? "flex-end" : "flex-start",
                  gap: "3px",
                }}>
                  <div style={{
                    fontSize: "9px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "var(--ink-faint)",
                    letterSpacing: "0.05em",
                  }}>
                    {roleLabel}
                  </div>
                  <div style={{
                    maxWidth: "720px",
                    borderRadius: "8px",
                    padding: "9px 12px",
                    background: isUser ? "#f7f7f5" : "white",
                    border: "1px solid var(--border)",
                    borderLeft: isUser ? "4px solid var(--ink-faint)" : "1px solid var(--border)",
                    fontSize: "13px",
                    lineHeight: 1.7,
                    color: "var(--ink-muted)",
                    fontFamily: "'DM Sans', sans-serif",
                    whiteSpace: "pre-wrap",
                    opacity: 0.75,
                  }}>
                    {msg.content}
                  </div>
                </div>
              );
            })}
          </div>
          {restoreMessage && (
            <button
              onClick={(e) => { e.stopPropagation(); onRestore?.(restoreMessage); }}
              style={{
                padding: "4px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: "white",
                color: "var(--ink-muted)",
                fontSize: "11px",
                fontFamily: "'JetBrains Mono', monospace",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)";
              }}
            >
              ↩ この回答を採用する
            </button>
          )}
        </div>
      )}
    </div>
  );
}
