"use client";

import MarkdownRenderer from "./MarkdownRenderer";
import { Message, MessageNote } from "@/types";
import { useState, memo } from "react";

interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
  isLoading?: boolean;
  provider?: string;
  onRegenerate?: (targetProvider: "claude" | "gemini") => void;
  onTrimFrom?: (message: Message) => void;
  messageNotes?: MessageNote[];
  onAddMessageNote?: (messageId: string, content: string) => Promise<void>;
  onDeleteMessageNote?: (noteId: string) => void;
}

function MessageBubble({
  message,
  isLast,
  isLoading,
  provider,
  onRegenerate,
  onTrimFrom,
  messageNotes = [],
  onAddMessageNote,
  onDeleteMessageNote,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isMemo = message.provider === "memo"; // メモ判定
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [showNoteList, setShowNoteList] = useState(false);
  const [copied, setCopied] = useState(false); // コピー状態
  const myNotes = messageNotes.filter((n) => n.message_id === message.id);

  // コピーハンドラ
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation(); // バブルクリック（メモ入力）と競合しないよう止める
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

  const otherProvider = (message.provider === "claude" || message.provider === "unknown")
    ? "gemini" : "claude";
  const otherLabel = otherProvider === "claude" ? "Claude" : "Gemini";

  const handleSaveNote = async () => {
    if (!noteContent.trim() || !onAddMessageNote) return;
    await onAddMessageNote(message.id, noteContent.trim());
    setNoteContent("");
    setShowNoteInput(false);
    setShowNoteList(true);
  };

  // メモ・ユーザー → 右寄せ / AI → 左寄せ
  const alignRight = isMemo || isUser;

  return (
    <div
      className="animate-message"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: alignRight ? "flex-end" : "flex-start",
        marginBottom: "20px",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        const btn = (e.currentTarget as HTMLDivElement).querySelector(".trim-btn") as HTMLButtonElement | null;
        if (btn) btn.style.opacity = "1";
        const copyBtn = (e.currentTarget as HTMLDivElement).querySelector(".copy-btn") as HTMLButtonElement | null;
        if (copyBtn) copyBtn.style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        const btn = (e.currentTarget as HTMLDivElement).querySelector(".trim-btn") as HTMLButtonElement | null;
        if (btn) btn.style.opacity = "0";
        const copyBtn = (e.currentTarget as HTMLDivElement).querySelector(".copy-btn") as HTMLButtonElement | null;
        if (copyBtn && !copied) copyBtn.style.opacity = "0";
      }}
    >
      {/* ロールラベル */}
      <div style={{
        fontSize: "10px",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: isMemo ? "#b7791f" : "var(--ink-faint)",
        marginBottom: "5px",
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {alignRight ? (isMemo ? "📝 Memo" : "You") : aiLabel()}
      </div>

      {/* バブル＋メモアイコン行 */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", flexDirection: alignRight ? "row-reverse" : "row" }}>
        {/* バブル本体（クリックでメモ入力） */}
        <div style={{ position: "relative" }}>
          <div
            onClick={() => { setShowNoteInput((v) => !v); setShowNoteList(false); }}
            style={{
              maxWidth: "560px",
              borderRadius: isMemo
                ? "12px 12px 2px 12px"   // メモ：右寄せ形状
                : isUser
                ? "12px 12px 2px 12px"   // ユーザー
                : "12px 12px 12px 2px",  // AI
              padding: isUser || isMemo ? "10px 14px" : "14px 18px",
              // メモは黄色、ユーザーは既存の黒、AIは既存の白
              background: isMemo
                ? "#fefce8"
                : isUser
                ? "var(--bubble-user)"
                : "var(--bubble-ai)",
              color: isMemo
                ? "#78350f"
                : isUser
                ? "#f5f5f0"
                : "var(--ink)",
              border: isMemo
                ? "1px solid #fde68a"
                : isUser
                ? "none"
                : "1px solid var(--border)",
              fontSize: "14px",
              lineHeight: 1.6,
              boxShadow: isMemo
                ? "0 1px 4px rgba(251,191,36,0.15)"
                : isUser
                ? "0 2px 8px rgba(15,15,10,0.15)"
                : "0 1px 4px rgba(0,0,0,0.05)",
              fontFamily: "'DM Sans', sans-serif",
              whiteSpace: isMemo ? "pre-wrap" : undefined,
              cursor: "pointer",
            }}
          >
            {isMemo ? message.content : (
              <MarkdownRenderer content={message.content} />
            )}
          </div>

          {/* コピーボタン（ホバーで出現・全メッセージ共通） */}
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
        </div>

        {/* メモアイコン（メモがある場合） */}
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

      {/* メモ入力欄 */}
      {showNoteInput && (
        <div style={{ marginTop: "8px", width: "82%", display: "flex", flexDirection: "column", gap: "6px" }}>
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
        <div style={{ marginTop: "8px", width: "82%", display: "flex", flexDirection: "column", gap: "6px" }}>
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
          style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: "-80px", opacity: 0, padding: "3px 8px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", transition: "opacity 0.15s", whiteSpace: "nowrap" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e53e3e"; (e.currentTarget as HTMLButtonElement).style.color = "#e53e3e"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}
        >
          ✂️ 削除
        </button>
      )}

      {/* 再生成ボタン（メモには表示しない） */}
      {!isUser && !isMemo && isLast && !isLoading && onRegenerate && (
        <button
          onClick={() => onRegenerate(otherProvider)}
          style={{ marginTop: "6px", padding: "4px 10px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", transition: "all 0.15s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}
        >
          🔄 {otherLabel}で再生成
        </button>
      )}
    </div>
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
