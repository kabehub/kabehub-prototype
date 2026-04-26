"use client";

// components/RoleplayBubble.tsx
// ✅ v63新規: なりきりモード用メッセージバブル（LINEライクレイアウト）
// AIキャラ: アイコン＋名前＋吹き出し（左寄せ）
// You: 既存 MessageBubble をそのまま使う（このコンポーネントは assistant のみ）

import MarkdownRenderer from "./MarkdownRenderer";
import { Message, MessageNote } from "@/types";
import { useState, memo } from "react";

interface RoleplayBubbleProps {
  message: Message;
  charName: string;
  charIconUrl: string | null;
  isLast?: boolean;
  isLoading?: boolean;
  provider?: string;
  onRegenerate?: (targetProvider: "claude" | "gemini" | "openai") => void;
  onTrimFrom?: (message: Message) => void;
  onUpdateMessage?: (messageId: string, updates: { content?: string; is_hidden?: boolean }) => Promise<void>;
  messageNotes?: MessageNote[];
  onAddMessageNote?: (messageId: string, content: string) => Promise<void>;
  onDeleteMessageNote?: (noteId: string) => void;
  onOpenRoleplaySettings?: () => void; // ✅ アイコンクリックで設定を開く
  isHighlighted?: boolean;
  isActiveMatch?: boolean;
  activeFlashKey?: number;
}

function RoleplayBubble({
  message,
  charName,
  charIconUrl,
  isLast,
  isLoading,
  provider,
  onRegenerate,
  onTrimFrom,
  onUpdateMessage,
  messageNotes = [],
  onAddMessageNote,
  onDeleteMessageNote,
  onOpenRoleplaySettings,
  isHighlighted = false,
  isActiveMatch = false,
  activeFlashKey,
}: RoleplayBubbleProps) {
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

  const ALL_PROVIDERS = ["claude", "gemini", "openai"] as const;
  const regenTargets = ALL_PROVIDERS.filter((p) => p !== message.provider);
  const regenLabel = (p: string) =>
    p === "claude" ? "Claude" : p === "gemini" ? "Gemini" : "ChatGPT";

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSaveNote = async () => {
    if (!noteContent.trim() || !onAddMessageNote) return;
    await onAddMessageNote(message.id, noteContent.trim());
    setNoteContent("");
    setShowNoteInput(false);
    setShowNoteList(true);
  };

  const handleToggleHidden = async () => {
    if (!onUpdateMessage || isSavingHidden) return;
    const next = !isHidden;
    setIsHidden(next);
    setIsSavingHidden(true);
    try {
      await onUpdateMessage(message.id, { is_hidden: next });
    } catch {
      setIsHidden(!next);
    } finally {
      setIsSavingHidden(false);
    }
  };

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

  const handleMaskSelection = () => {
    const textarea = document.getElementById(`rp-mask-editor-${message.id}`) as HTMLTextAreaElement | null;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) return;
    const selected = editContent.slice(start, end);
    const next = editContent.slice(0, start) + `[[${selected}]]` + editContent.slice(end);
    setEditContent(next);
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + selected.length + 4;
      textarea.focus();
    }, 0);
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
          const btn = (e.currentTarget as HTMLDivElement).querySelector(".rp-trim-btn") as HTMLButtonElement | null;
          if (btn) btn.style.opacity = "1";
          const copyBtn = (e.currentTarget as HTMLDivElement).querySelector(".rp-copy-btn") as HTMLButtonElement | null;
          if (copyBtn) copyBtn.style.opacity = "1";
          const maskBtn = (e.currentTarget as HTMLDivElement).querySelector(".rp-mask-btn") as HTMLButtonElement | null;
          if (maskBtn) maskBtn.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          const btn = (e.currentTarget as HTMLDivElement).querySelector(".rp-trim-btn") as HTMLButtonElement | null;
          if (btn) btn.style.opacity = "0";
          const copyBtn = (e.currentTarget as HTMLDivElement).querySelector(".rp-copy-btn") as HTMLButtonElement | null;
          if (copyBtn && !copied) copyBtn.style.opacity = "0";
          const maskBtn = (e.currentTarget as HTMLDivElement).querySelector(".rp-mask-btn") as HTMLButtonElement | null;
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

        {/* ── LINEライクレイアウト: アイコン + 名前 + 吹き出し ── */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", position: "relative", zIndex: 1, width: "100%" }}>

          {/* アイコン（40×40px 丸型）✅ クリックで設定を開く */}
          <div
            onClick={() => onOpenRoleplaySettings?.()}
            title="クリックしてキャラ設定を変更"
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              overflow: "hidden",
              flexShrink: 0,
              border: "1px solid var(--border)",
              background: "#f5f5f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              userSelect: "none",
              cursor: "pointer",
              transition: "opacity 0.15s, transform 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.opacity = "0.75";
              (e.currentTarget as HTMLDivElement).style.transform = "scale(1.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.opacity = "1";
              (e.currentTarget as HTMLDivElement).style.transform = "scale(1)";
            }}
          >
            {charIconUrl ? (
              <img
                src={charIconUrl}
                alt={charName}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              "🤖"
            )}
          </div>

          {/* 名前 + 吹き出し（縦並び） */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1, minWidth: 0 }}>
            {/* キャラ名 */}
            <div style={{
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.05em",
              color: "var(--ink-muted)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}>
              {charName}
              {isHidden && (
                <span style={{ fontSize: "9px", background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444", borderRadius: "3px", padding: "0 4px" }}>
                  🔒 非公開
                </span>
              )}
            </div>

            {/* 吹き出し本体 */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <div style={{ position: "relative", maxWidth: "680px", width: "100%" }}>
                <div
                  onClick={() => { setShowNoteInput((v) => !v); setShowNoteList(false); }}
                  style={{
                    borderRadius: "4px 12px 12px 12px",
                    padding: "12px 16px",
                    background: "#ffffff",
                    color: "var(--ink)",
                    border: "1px solid var(--border)",
                    fontSize: "14px",
                    lineHeight: 1.6,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                    opacity: isHidden ? 0.6 : 1,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                  }}
                >
                  <MarkdownRenderer content={message.content} />
                </div>

                {/* コピーボタン */}
                <button
                  className="rp-copy-btn"
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

                {/* 🔒 非公開トグルボタン */}
                {onUpdateMessage && (
                  <button
                    className="rp-mask-btn"
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
          </div>
        </div>

        {/* ✏️ マスク編集UI */}
        {onUpdateMessage && (
          <div style={{ marginTop: "4px", paddingLeft: "50px", position: "relative", zIndex: 1 }}>
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
                  テキストを選択して「マスク」を押すと <code style={{ background: "var(--border)", borderRadius: "3px", padding: "0 3px" }}>[[選択テキスト]]</code> に変換されます。
                </div>
                <textarea
                  id={`rp-mask-editor-${message.id}`}
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
                  <button onClick={() => setIsEditing(false)} style={{ padding: "3px 10px", borderRadius: "5px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", cursor: "pointer" }}>キャンセル</button>
                  <button onClick={handleMaskSelection} style={{ padding: "3px 10px", borderRadius: "5px", border: "1px solid #6b7280", background: "#f3f4f6", color: "#374151", fontSize: "11px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}>🔒 マスク</button>
                  <button onClick={handleSaveEdit} disabled={isSavingEdit} style={{ padding: "3px 10px", borderRadius: "5px", border: "none", background: "var(--accent)", color: "white", fontSize: "11px", cursor: isSavingEdit ? "default" : "pointer" }}>
                    {isSavingEdit ? "保存中…" : "保存"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* メモ入力欄 */}
        {showNoteInput && (
          <div style={{ marginTop: "8px", paddingLeft: "50px", width: "calc(82% + 50px)", display: "flex", flexDirection: "column", gap: "6px", position: "relative", zIndex: 1 }}>
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
          <div style={{ marginTop: "8px", paddingLeft: "50px", width: "calc(82% + 50px)", display: "flex", flexDirection: "column", gap: "6px", position: "relative", zIndex: 1 }}>
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
            className="rp-trim-btn"
            onClick={() => { if (window.confirm("このメッセージ以降を全て削除しますか？")) { onTrimFrom(message); } }}
            style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: "-80px", opacity: 0, padding: "3px 8px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", transition: "opacity 0.15s", whiteSpace: "nowrap", zIndex: 2 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e53e3e"; (e.currentTarget as HTMLButtonElement).style.color = "#e53e3e"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}
          >
            ✂️ 削除
          </button>
        )}

        {/* 再生成ボタン（プロバイダー名で表示。キャラ名は使わない） */}
        {isLast && !isLoading && onRegenerate && (
          <div style={{ display: "flex", gap: "6px", marginTop: "6px", paddingLeft: "50px", position: "relative", zIndex: 1 }}>
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

export default memo(RoleplayBubble);

// ✅ ストリーミング中に使うなりきり版ThinkingBubble
// ※ このコンポーネントはpropsを受け取らないためアイコンクリック機能は持たない
export function RoleplayThinkingBubble({
  charName,
  charIconUrl,
  streamingContent,
}: {
  charName: string;
  charIconUrl: string | null;
  streamingContent?: string;
}) {
  return (
    <div className="animate-message" style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "20px" }}>
      {/* アイコン（ストリーミング中はクリック不可） */}
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          overflow: "hidden",
          flexShrink: 0,
          border: "1px solid var(--border)",
          background: "#f5f5f5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "20px",
          userSelect: "none",
        }}
      >
        {charIconUrl ? (
          <img src={charIconUrl} alt={charName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          "🤖"
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
        {/* キャラ名 + 入力中インジケーター */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em", color: "var(--ink-muted)" }}>
            {charName}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <div style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: "var(--accent)",
              animation: "pulse 1s infinite",
            }} />
            <span style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", letterSpacing: "0.05em" }}>
              {streamingContent ? "入力中…" : "考え中…"}
            </span>
          </div>
        </div>

        {/* 吹き出し */}
        <div
          style={{
            borderRadius: "4px 12px 12px 12px",
            padding: "12px 16px",
            background: "#ffffff",
            border: "1px solid var(--border)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            maxWidth: "680px",
          }}
        >
          {streamingContent ? (
            <div style={{ fontSize: "14px", lineHeight: 1.75, color: "var(--ink)", whiteSpace: "pre-wrap", fontFamily: "'DM Sans', sans-serif" }}>
              {streamingContent}
            </div>
          ) : (
            <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
              {[0, 1, 2].map((i) => (
                <span key={i} className="thinking-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--ink-faint)", display: "block", animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
