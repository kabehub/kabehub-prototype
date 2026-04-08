"use client";

import MarkdownRenderer from "./MarkdownRenderer";
import { Message, MessageNote } from "@/types";
import { useState, memo } from "react";

interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
  isLoading?: boolean;
  provider?: string;
  onRegenerate?: (targetProvider: "claude" | "gemini" | "openai") => void;
  onTrimFrom?: (message: Message) => void;
  onUpdateMessage?: (messageId: string, updates: { content?: string; is_hidden?: boolean }) => Promise<void>;
  messageNotes?: MessageNote[];
  onAddMessageNote?: (messageId: string, content: string) => Promise<void>;
  onDeleteMessageNote?: (noteId: string) => void;
  isHighlighted?: boolean;
  isActiveMatch?: boolean;
  activeFlashKey?: number;
}

function MessageBubble({
  message,
  isLast,
  isLoading,
  provider,
  onRegenerate,
  onTrimFrom,
  onUpdateMessage,
  messageNotes = [],
  onAddMessageNote,
  onDeleteMessageNote,
  isHighlighted = false,
  isActiveMatch = false,
  activeFlashKey,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isMemo = message.provider === "memo";
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

  const myNotes = messageNotes.filter((n) => n.message_id === message.id);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const aiLabel = () => {
    const p = message.provider ?? provider ?? "AI";
    if (p === "claude") return "Claude";
    if (p === "gemini") return "Gemini";
    if (p === "openai") return "ChatGPT";
    if (p === "memo") return "メモ";
    return "AI";
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

  const alignRight = isMemo || isUser;

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
          const btn = (e.currentTarget as HTMLDivElement).querySelector(".trim-btn") as HTMLButtonElement | null;
          if (btn) btn.style.opacity = "1";
          const copyBtn = (e.currentTarget as HTMLDivElement).querySelector(".copy-btn") as HTMLButtonElement | null;
          if (copyBtn) copyBtn.style.opacity = "1";
          const maskBtn = (e.currentTarget as HTMLDivElement).querySelector(".mask-btn") as HTMLButtonElement | null;
          if (maskBtn) maskBtn.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          const btn = (e.currentTarget as HTMLDivElement).querySelector(".trim-btn") as HTMLButtonElement | null;
          if (btn) btn.style.opacity = "0";
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
          {isMemo ? "📝 Memo" : isUser ? "You" : aiLabel()}
          {isHidden && (
            <span style={{ fontSize: "9px", background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444", borderRadius: "3px", padding: "0 4px" }}>
              🔒 非公開
            </span>
          )}
        </div>

        {/* バブル＋メモアイコン行 */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", flexDirection: "row", position: "relative", zIndex: 1 }}>  
          <div style={{ position: "relative", width: "100%" }}>
            <div
              onClick={() => { setShowNoteInput((v) => !v); setShowNoteList(false); }}
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
                  : isUser
                  ? "1px solid #ececec"
                  : "1px solid var(--border)",
                fontSize: "14px",
                lineHeight: 1.6,
                boxShadow: "none",
                fontFamily: "'DM Sans', sans-serif",
                whiteSpace: isMemo ? "pre-wrap" : undefined,
                cursor: "pointer",
                opacity: isHidden ? 0.6 : 1,
              }}
            >
              {isMemo ? message.content : (
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

        {/* ✂️ 削除ボタン */}
        {!isLoading && onTrimFrom && (
          <button
            className="trim-btn"
            onClick={() => { if (window.confirm("このメッセージ以降を全て削除しますか？")) { onTrimFrom(message); } }}
            style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: "-80px", opacity: 0, padding: "3px 8px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", transition: "opacity 0.15s", whiteSpace: "nowrap", zIndex: 2 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e53e3e"; (e.currentTarget as HTMLButtonElement).style.color = "#e53e3e"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}
          >
            ✂️ 削除
          </button>
        )}

        {/* 再生成ボタン */}
        {!isUser && !isMemo && isLast && !isLoading && onRegenerate && (
          <div style={{ display: "flex", gap: "6px", marginTop: "6px", position: "relative", zIndex: 1 }}>
            {regenTargets.map((p) => (
              <button
                key={p}
                onClick={() => onRegenerate(p)}
                style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", transition: "all 0.15s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}
              >
                🔄 {regenLabel(p)}で再生成
              </button>
            ))}
          </div>
        )}
      </div>
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
