"use client";

import { Thread } from "@/types";
import { useState, useCallback, useRef, useMemo } from "react";
import type { User } from "@supabase/supabase-js";

interface SidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string) => void;
  onSearch: (query: string, target: "title" | "message" | "both") => void;
  isSearching: boolean;
  user: User | null;
  onLogout: () => void;
  onUpdateFolder: (threadId: string, folderName: string | null) => void;
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

// フォルダ名でスレッドをグループ化
function groupThreadsByFolder(threads: Thread[]): { folderName: string | null; threads: Thread[] }[] {
  const map = new Map<string, Thread[]>();
  const nullKey = "__null__";

  for (const t of threads) {
    const key = t.folder_name ?? nullKey;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }

  // フォルダ名あり → アルファベット順、未分類は末尾
  const result: { folderName: string | null; threads: Thread[] }[] = [];
  const keys = Array.from(map.keys()).filter((k) => k !== nullKey).sort();
  for (const k of keys) {
    result.push({ folderName: k, threads: map.get(k)! });
  }
  if (map.has(nullKey)) {
    result.push({ folderName: null, threads: map.get(nullKey)! });
  }
  return result;
}

// フォルダ名一覧を取得（既存フォルダのオートコンプリート用）
function getUniqueFolderNames(threads: Thread[]): string[] {
  const names = threads
    .map((t) => t.folder_name)
    .filter((n): n is string => !!n);
  return Array.from(new Set(names)).sort();
}

// ---- フォルダ割り当てポップオーバー ----
interface FolderPopoverProps {
  thread: Thread;
  existingFolders: string[];
  onAssign: (folderName: string | null) => void;
  onClose: () => void;
}

function FolderPopover({ thread, existingFolders, onAssign, onClose }: FolderPopoverProps) {
  const [inputValue, setInputValue] = useState(thread.folder_name ?? "");

  const handleAssign = () => {
    const trimmed = inputValue.trim();
    onAssign(trimmed === "" ? null : trimmed);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAssign();
    if (e.key === "Escape") onClose();
  };

  return (
    <>
      {/* オーバーレイ */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 100 }}
      />
      {/* ポップオーバー本体 */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: "calc(100% + 6px)",
          top: 0,
          zIndex: 101,
          background: "white",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "10px",
          width: "180px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ fontSize: "10px", color: "var(--ink-muted)", marginBottom: "6px", fontWeight: 500 }}>
          フォルダを割り当て
        </div>

        {/* 既存フォルダのクイック選択 */}
        {existingFolders.length > 0 && (
          <div style={{ marginBottom: "6px", display: "flex", flexDirection: "column", gap: "2px" }}>
            {existingFolders.map((f) => (
              <button
                key={f}
                onClick={() => { onAssign(f); onClose(); }}
                style={{
                  padding: "4px 8px",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  background: thread.folder_name === f ? "var(--accent)" : "white",
                  color: thread.folder_name === f ? "white" : "var(--ink)",
                  fontSize: "11px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.12s",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                onMouseEnter={(e) => {
                  if (thread.folder_name !== f) {
                    (e.currentTarget as HTMLButtonElement).style.background = "var(--sidebar-bg)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (thread.folder_name !== f) {
                    (e.currentTarget as HTMLButtonElement).style.background = "white";
                  }
                }}
              >
                📁 {f}
              </button>
            ))}
          </div>
        )}

        {/* 新規フォルダ名入力 */}
        <input
          autoFocus
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="新しいフォルダ名…"
          style={{
            width: "100%",
            padding: "5px 8px",
            border: "1px solid var(--border)",
            borderRadius: "5px",
            fontSize: "11px",
            fontFamily: "'DM Sans', sans-serif",
            color: "var(--ink)",
            outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-muted)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />

        <div style={{ display: "flex", gap: "4px", marginTop: "6px" }}>
          <button
            onClick={handleAssign}
            style={{
              flex: 1,
              padding: "4px 0",
              border: "none",
              borderRadius: "4px",
              background: "var(--accent)",
              color: "white",
              fontSize: "10px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            決定
          </button>
          {thread.folder_name && (
            <button
              onClick={() => { onAssign(null); onClose(); }}
              style={{
                padding: "4px 8px",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                background: "white",
                color: "var(--ink-muted)",
                fontSize: "10px",
                cursor: "pointer",
              }}
              title="フォルダから外す"
            >
              解除
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ---- スレッド1行 ----
interface ThreadItemProps {
  thread: Thread;
  isActive: boolean;
  existingFolders: string[];
  onSelect: () => void;
  onDelete: () => void;
  onUpdateFolder: (folderName: string | null) => void;
}

function ThreadItem({ thread, isActive, existingFolders, onSelect, onDelete, onUpdateFolder }: ThreadItemProps) {
  const [showFolderPopover, setShowFolderPopover] = useState(false);
  const [hovered, setHovered] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={itemRef}
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        onClick={onSelect}
        style={{
          padding: "10px 10px",
          borderRadius: "6px",
          cursor: "pointer",
          background: isActive ? "var(--sidebar-active-bg)" : hovered ? "#f7f7f7" : "transparent",
          boxShadow: "none",
          marginBottom: "2px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "6px",
          transition: "background 0.1s",
          borderLeft: isActive ? "2px solid var(--sidebar-active-border)" : "2px solid transparent",
        }}
      >
        {/* タイトル + 時刻 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "12.5px", fontWeight: isActive ? 500 : 400, color: isActive ? "var(--sidebar-active-color)" : "var(--ink-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.4 }}>
            {thread.title}
          </div>
          <div style={{ fontSize: "10px", color: "var(--ink-faint)", marginTop: "2px" }}>
            {timeAgo(thread.created_at)}
          </div>
        </div>

        {/* アクションボタン群（ホバー時に表示） */}
        <div style={{ display: "flex", alignItems: "center", gap: "3px", flexShrink: 0, opacity: hovered ? 1 : 0, transition: "opacity 0.1s" }}>
          {/* フォルダ割り当てボタン */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowFolderPopover((v) => !v); }}
            title="フォルダに追加"
            style={{
              width: "20px",
              height: "20px",
              borderRadius: "4px",
              border: "1px solid",
              borderColor: thread.folder_name ? "var(--accent-muted)" : "var(--border)",
              background: thread.folder_name ? "#f0f4ff" : "white",
              color: thread.folder_name ? "var(--accent)" : "var(--ink-muted)",
              fontSize: "11px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              transition: "all 0.12s",
            }}
          >
            📁
          </button>

          {/* 削除ボタン */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`「${thread.title}」を削除しますか？`)) {
                onDelete();
              }
            }}
            title="削除"
            style={{
              width: "20px",
              height: "20px",
              borderRadius: "4px",
              border: "1px solid var(--border)",
              background: "white",
              color: "var(--ink-muted)",
              fontSize: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "#fee2e2";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#e53e3e";
              (e.currentTarget as HTMLButtonElement).style.color = "#e53e3e";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "white";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)";
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* フォルダポップオーバー */}
      {showFolderPopover && (
        <FolderPopover
          thread={thread}
          existingFolders={existingFolders}
          onAssign={onUpdateFolder}
          onClose={() => setShowFolderPopover(false)}
        />
      )}
    </div>
  );
}

// ---- 最近セクション ----
function RecentSection({ threads, activeThreadId, existingFolders, onSelectThread, onDeleteThread, onUpdateFolder }: {
  threads: Thread[];
  activeThreadId: string | null;
  existingFolders: string[];
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onUpdateFolder: (threadId: string, folderName: string | null) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const recentThreads = useMemo(() =>
    [...threads]
      .sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime())
      .slice(0, 3),
    [threads]
  );

  if (recentThreads.length === 0) return null;

  return (
    <div style={{ marginBottom: "4px" }}>
      <button
        onClick={() => setCollapsed((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: "5px", padding: "5px 8px", background: "none", border: "none", cursor: "pointer", borderRadius: "5px", transition: "background 0.1s" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.04)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
      >
        <span style={{ fontSize: "9px", color: "var(--ink-faint)", transition: "transform 0.15s", display: "inline-block", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>
        <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--ink-muted)", flex: 1, textAlign: "left" }}>最近</span>
      </button>
      {!collapsed && (
        <div style={{ paddingLeft: "12px" }}>
          {recentThreads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              isActive={activeThreadId === thread.id}
              existingFolders={existingFolders}
              onSelect={() => onSelectThread(thread.id)}
              onDelete={() => onDeleteThread(thread.id)}
              onUpdateFolder={(fn) => onUpdateFolder(thread.id, fn)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- フォルダセクション ----
interface FolderSectionProps {
  folderName: string | null;
  threads: Thread[];
  activeThreadId: string | null;
  existingFolders: string[];
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onUpdateFolder: (threadId: string, folderName: string | null) => void;
}

function FolderSection({ folderName, threads, activeThreadId, existingFolders, onSelectThread, onDeleteThread, onUpdateFolder, defaultCollapsed }: FolderSectionProps & { defaultCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div style={{ marginBottom: "4px" }}>
      {/* フォルダヘッダー */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "5px",
          padding: "5px 8px",
          background: "none",
          border: "none",
          cursor: "pointer",
          borderRadius: "5px",
          transition: "background 0.1s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.04)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
      >
        <span style={{ fontSize: "9px", color: "var(--ink-faint)", transition: "transform 0.15s", display: "inline-block", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
          ▼
        </span>
        <span style={{ fontSize: "11px" }}>
          {folderName ? "📁" : "📋"}
        </span>
        <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--ink-muted)", flex: 1, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {folderName ?? "未分類"}
        </span>
        <span style={{ fontSize: "10px", color: "var(--ink-faint)", flexShrink: 0 }}>
          {threads.length}
        </span>
      </button>

      {/* スレッド一覧 */}
      {!collapsed && (
        <div style={{ paddingLeft: "12px" }}>
          {threads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              isActive={activeThreadId === thread.id}
              existingFolders={existingFolders}
              onSelect={() => onSelectThread(thread.id)}
              onDelete={() => onDeleteThread(thread.id)}
              onUpdateFolder={(fn) => onUpdateFolder(thread.id, fn)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Sidebar メイン ----
export default function Sidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
  onSearch,
  isSearching,
  user,
  onLogout,
  onUpdateFolder,
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

  // 検索中はフラットリスト、通常時はフォルダグループ
  const grouped = useMemo(() => groupThreadsByFolder(threads), [threads]);
  const existingFolders = useMemo(() => getUniqueFolderNames(threads), [threads]);
  const showFlat = isSearching && searchQuery.trim() !== "";

  return (
    <aside
      style={{
        width: "22%",
        minWidth: "200px",
        maxWidth: "280px",
        background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--sidebar-border-color)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        userSelect: "none",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ fontFamily: "'Lora', serif", fontWeight: 600, fontSize: "16px", color: "var(--ink)", letterSpacing: "-0.02em", marginBottom: "10px" }}>
          KabeHub
        </div>
        <button
          onClick={onNewThread}
          title="新規スレッド"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 10px",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            background: "white",
            color: "var(--ink-muted)",
            fontSize: "12px",
            fontFamily: "'DM Sans', sans-serif",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)";
            (e.currentTarget as HTMLButtonElement).style.color = "white";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "white";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
          }}
        >
          <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span>
          <span>新しい壁打ち</span>
        </button>
      </div>

      {/* Thread list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
        {/* 最近セクション（検索中は非表示） */}
        {!showFlat && <RecentSection threads={threads} activeThreadId={activeThreadId} existingFolders={existingFolders} onSelectThread={onSelectThread} onDeleteThread={onDeleteThread} onUpdateFolder={onUpdateFolder} />}

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

        {/* 検索中：フラットリスト */}
        {showFlat && threads.map((thread) => (
          <ThreadItem
            key={thread.id}
            thread={thread}
            isActive={activeThreadId === thread.id}
            existingFolders={existingFolders}
            onSelect={() => onSelectThread(thread.id)}
            onDelete={() => onDeleteThread(thread.id)}
            onUpdateFolder={(fn) => onUpdateFolder(thread.id, fn)}
          />
        ))}

        {/* 通常時：フォルダグループ */}
        {!showFlat && grouped.map((group) => {
          const hasActive = group.threads.some((t) => t.id === activeThreadId);
          return (
            <FolderSection
              key={group.folderName ?? "__null__"}
              folderName={group.folderName}
              threads={group.threads}
              activeThreadId={activeThreadId}
              existingFolders={existingFolders}
              onSelectThread={onSelectThread}
              onDeleteThread={onDeleteThread}
              onUpdateFolder={onUpdateFolder}
              defaultCollapsed={!hasActive}
            />
          );
        })}
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

        {/* AI闘技場リンク */}
        <a
          href="/arena"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 8px",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            background: "white",
            color: "var(--ink-muted)",
            fontSize: "11px",
            fontFamily: "'JetBrains Mono', monospace",
            textDecoration: "none",
            marginBottom: "6px",
            transition: "all 0.12s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = "var(--sidebar-bg)";
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--ink)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = "white";
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--ink-muted)";
          }}
        >
          <span>⚔️</span>
          <span>AI闘技場</span>
        </a>

        {/* みんなの壁打ちリンク */}
        <a
          href="/explore"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 8px",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            background: "white",
            color: "var(--ink-muted)",
            fontSize: "11px",
            fontFamily: "'JetBrains Mono', monospace",
            textDecoration: "none",
            marginBottom: "8px",
            transition: "all 0.12s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = "var(--sidebar-bg)";
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--ink)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = "white";
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--ink-muted)";
          }}
        >
          <span>🌍</span>
          <span>みんなの壁打ち</span>
        </a>

        {/* フッター：スレッド数 + ユーザー情報・ログアウト */}
        <div style={{ marginTop: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "10px", color: "var(--ink-faint)", letterSpacing: "0.05em" }}>
            {isSearching
              ? `「${searchQuery}」— ${threads.length} 件`
              : `${threads.length} スレッド保存済み`}
          </div>
          {user && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <button
                onClick={() => window.location.href = '/settings'}
                title="設定"
                style={{ fontSize: "12px", color: "var(--ink-faint)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: "3px", transition: "color 0.15s", lineHeight: 1 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-faint)"; }}
              >
                ⚙️
              </button>
              <button
                onClick={onLogout}
                title={`ログアウト (${user.email})`}
                style={{ fontSize: "10px", color: "var(--ink-faint)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: "3px", transition: "color 0.15s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-faint)"; }}
              >
                ログアウト
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
