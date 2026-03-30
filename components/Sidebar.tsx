"use client";

import { Thread } from "@/types";
import { useState, useCallback, useRef } from "react";

interface SidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string) => void;
  onSearch: (query: string, target: "title" | "message" | "both") => void;
  isSearching: boolean;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "今";
  if (mins < 60) return `${mins}分前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}時間前`;
  return `${Math.floor(hrs / 24)}日前`;
}

export default function Sidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
  onSearch,
  isSearching,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTarget, setSearchTarget] = useState<"title" | "message" | "both">("both");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(val, searchTarget);
    }, 300);
  }, [onSearch, searchTarget]);

  const handleTargetChange = useCallback((target: "title" | "message" | "both") => {
    setSearchTarget(target);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(searchQuery, target);
    }, 0);
  }, [onSearch, searchQuery]);

  const handleClear = useCallback(() => {
    setSearchQuery("");
    onSearch("", searchTarget);
  }, [onSearch, searchTarget]);

  return (
    <aside
      style={{
        width: "22%",
        minWidth: "200px",
        maxWidth: "280px",
        background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        userSelect: "none",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "20px 16px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontFamily: "'Lora', serif", fontWeight: 600, fontSize: "15px", color: "var(--ink)", letterSpacing: "-0.02em" }}>
            壁打ちエディタ
          </div>
          <div style={{ fontSize: "10px", color: "var(--ink-muted)", marginTop: "2px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            思考の記録
          </div>
        </div>
        <button
          onClick={onNewThread}
          title="新規スレッド"
          style={{ width: "28px", height: "28px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink)", fontSize: "18px", lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", flexShrink: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "white"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "white"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
        >
          +
        </button>
      </div>

      {/* Thread list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
        {threads.length === 0 && !isSearching && (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--ink-muted)", fontSize: "12px", lineHeight: 1.6 }}>
            まだ壁打ちがありません。
            <br />「＋」で新規作成。
          </div>
        )}
        {threads.length === 0 && isSearching && (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--ink-muted)", fontSize: "12px", lineHeight: 1.6 }}>
            「{searchQuery}」に一致する
            <br />スレッドはありません。
          </div>
        )}
        {threads.map((thread) => (
          <div
            key={thread.id}
            onClick={() => onSelectThread(thread.id)}
            style={{
              padding: "10px 10px",
              borderRadius: "6px",
              cursor: "pointer",
              background: activeThreadId === thread.id ? "white" : "transparent",
              boxShadow: activeThreadId === thread.id ? "0 1px 4px rgba(0,0,0,0.07)" : "none",
              marginBottom: "2px",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "8px",
              transition: "background 0.1s",
              borderLeft: activeThreadId === thread.id ? "2px solid var(--accent)" : "2px solid transparent",
            }}
            onMouseEnter={(e) => { if (activeThreadId !== thread.id) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.5)"; }}
            onMouseLeave={(e) => { if (activeThreadId !== thread.id) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "12.5px", fontWeight: activeThreadId === thread.id ? 500 : 400, color: activeThreadId === thread.id ? "var(--ink)" : "var(--ink-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.4 }}>
                {thread.title}
              </div>
              <div style={{ fontSize: "10px", color: "var(--ink-faint)", marginTop: "2px" }}>
                {timeAgo(thread.created_at)}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteThread(thread.id); }}
              title="削除"
              style={{ width: "18px", height: "18px", borderRadius: "3px", border: "none", background: "transparent", color: "var(--ink-faint)", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0, transition: "opacity 0.15s", padding: 0 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-faint)"; }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* 検索ボックス（左下固定枠） */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "12px 12px 10px", background: "var(--sidebar-bg)" }}>
        {/* 検索対象フィルター */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
          {(["both", "title", "message"] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleTargetChange(t)}
              style={{
                flex: 1,
                padding: "3px 0",
                borderRadius: "4px",
                border: "1px solid",
                borderColor: searchTarget === t ? "var(--accent)" : "var(--border)",
                background: searchTarget === t ? "var(--accent)" : "white",
                color: searchTarget === t ? "white" : "var(--ink-muted)",
                fontSize: "9px",
                fontFamily: "'JetBrains Mono', monospace",
                cursor: "pointer",
                transition: "all 0.15s",
                letterSpacing: "0.03em",
              }}
            >
              {t === "both" ? "すべて" : t === "title" ? "タイトル" : "本文"}
            </button>
          ))}
        </div>

        {/* 検索入力欄 */}
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: "var(--ink-faint)", pointerEvents: "none" }}>🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="スレッドを検索…"
            style={{
              width: "100%",
              padding: "7px 28px 7px 26px",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              fontSize: "11px",
              fontFamily: "'DM Sans', sans-serif",
              color: "var(--ink)",
              background: "white",
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-muted)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
          {searchQuery && (
            <button
              onClick={handleClear}
              style={{ position: "absolute", right: "7px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--ink-faint)", cursor: "pointer", fontSize: "12px", padding: 0, lineHeight: 1 }}
            >
              ×
            </button>
          )}
        </div>

        {/* フッター */}
        <div style={{ fontSize: "10px", color: "var(--ink-faint)", letterSpacing: "0.05em", marginTop: "8px" }}>
          {isSearching
            ? `「${searchQuery}」— ${threads.length} 件`
            : `${threads.length} スレッド保存済み`}
        </div>
      </div>
    </aside>
  );
}
