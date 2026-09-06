"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { User } from "@supabase/supabase-js";
import { timeAgo, type Thread } from "@kabehub/shared";

export interface SidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string) => void | Promise<void>;
  onSearch: (
    query: string,
    target: "title" | "message" | "both"
  ) => void | Promise<void>;
  isSearching: boolean;
  user: User;
  onLogout: () => void | Promise<void>;
  onUpdateFolder: (
    threadId: string,
    folderName: string | null
  ) => void | Promise<void>;
  onNewThreadInFolder: (folderName: string) => void | Promise<void>;
  isMobileOverlay?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

type SearchTarget = "title" | "message" | "both";

function groupThreadsByFolder(
  threads: Thread[]
): { folderName: string | null; threads: Thread[] }[] {
  const map = new Map<string, Thread[]>();
  const nullKey = "__null__";

  for (const thread of threads) {
    const key = thread.folder_name ?? nullKey;
    if (!map.has(key)) map.set(key, []);
    map.get(key)?.push(thread);
  }

  const result: { folderName: string | null; threads: Thread[] }[] = [];
  const folderNames = Array.from(map.keys())
    .filter((key) => key !== nullKey)
    .sort();

  for (const folderName of folderNames) {
    result.push({ folderName, threads: map.get(folderName) ?? [] });
  }
  if (map.has(nullKey)) {
    result.push({ folderName: null, threads: map.get(nullKey) ?? [] });
  }

  return result;
}

function getUniqueFolderNames(threads: Thread[]): string[] {
  const names = threads
    .map((thread) => thread.folder_name)
    .filter((folderName): folderName is string => Boolean(folderName));
  return Array.from(new Set(names)).sort();
}

interface FolderPopoverProps {
  thread: Thread;
  existingFolders: string[];
  onAssign: (folderName: string | null) => void | Promise<void>;
  onClose: () => void;
}

function FolderPopover({
  thread,
  existingFolders,
  onAssign,
  onClose,
}: FolderPopoverProps) {
  const [inputValue, setInputValue] = useState(thread.folder_name ?? "");

  const assignAndClose = (folderName: string | null) => {
    void onAssign(folderName);
    onClose();
  };

  const handleAssign = () => {
    const trimmed = inputValue.trim();
    assignAndClose(trimmed === "" ? null : trimmed);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAssign();
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <>
      <button
        type="button"
        className="chat-sidebar-popover-backdrop"
        aria-label="フォルダ割り当てを閉じる"
        onClick={onClose}
      />
      <div
        className="chat-sidebar-folder-popover"
        role="dialog"
        aria-label="フォルダを割り当て"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="chat-sidebar-popover-title">フォルダを割り当て</div>

        {existingFolders.length > 0 && (
          <div className="chat-sidebar-folder-options">
            {existingFolders.map((folderName) => (
              <button
                type="button"
                key={folderName}
                className={
                  thread.folder_name === folderName
                    ? "chat-sidebar-folder-option chat-sidebar-folder-option-active"
                    : "chat-sidebar-folder-option"
                }
                onClick={() => assignAndClose(folderName)}
              >
                <span aria-hidden="true">📁</span>
                <span className="chat-sidebar-ellipsis">{folderName}</span>
              </button>
            ))}
          </div>
        )}

        <input
          autoFocus
          type="text"
          className="chat-sidebar-folder-input"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="新しいフォルダ名…"
          aria-label="フォルダ名"
        />

        <div className="chat-sidebar-popover-actions">
          <button
            type="button"
            className="chat-sidebar-popover-submit"
            onClick={handleAssign}
          >
            決定
          </button>
          {thread.folder_name && (
            <button
              type="button"
              className="chat-sidebar-popover-remove"
              onClick={() => assignAndClose(null)}
            >
              解除
            </button>
          )}
        </div>
      </div>
    </>
  );
}

interface ThreadItemProps {
  thread: Thread;
  isActive: boolean;
  existingFolders: string[];
  onSelect: () => void;
  onDelete: () => void | Promise<void>;
  onUpdateFolder: (folderName: string | null) => void | Promise<void>;
}

function ThreadItem({
  thread,
  isActive,
  existingFolders,
  onSelect,
  onDelete,
  onUpdateFolder,
}: ThreadItemProps) {
  const [showFolderPopover, setShowFolderPopover] = useState(false);

  const selectThread = () => {
    const selection = window.getSelection();
    if (selection?.toString()) return;
    onSelect();
  };

  return (
    <div className="chat-sidebar-thread-item">
      <div
        className={
          isActive
            ? "chat-sidebar-thread-row chat-sidebar-thread-row-active"
            : "chat-sidebar-thread-row"
        }
        role="button"
        tabIndex={0}
        aria-current={isActive ? "page" : undefined}
        onClick={selectThread}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectThread();
          }
        }}
      >
        <div className="chat-sidebar-thread-copy">
          <div className="chat-sidebar-thread-title">{thread.title}</div>
          <div className="chat-sidebar-thread-time">
            {timeAgo(thread.created_at)}
          </div>
        </div>

        <div className="chat-sidebar-thread-actions">
          <button
            type="button"
            className={
              thread.folder_name
                ? "chat-sidebar-thread-action chat-sidebar-thread-folder-assigned"
                : "chat-sidebar-thread-action"
            }
            onClick={(event) => {
              event.stopPropagation();
              setShowFolderPopover((current) => !current);
            }}
            aria-label={`${thread.title}のフォルダを変更`}
            aria-expanded={showFolderPopover}
            title="フォルダに追加"
          >
            <span aria-hidden="true">📁</span>
          </button>
          <button
            type="button"
            className="chat-sidebar-thread-action chat-sidebar-thread-delete"
            onClick={(event) => {
              event.stopPropagation();
              if (window.confirm(`「${thread.title}」を削除しますか？`)) {
                void onDelete();
              }
            }}
            aria-label={`${thread.title}を削除`}
            title="削除"
          >
            ×
          </button>
        </div>
      </div>

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

interface ThreadSectionProps {
  threads: Thread[];
  activeThreadId: string | null;
  existingFolders: string[];
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void | Promise<void>;
  onUpdateFolder: (
    threadId: string,
    folderName: string | null
  ) => void | Promise<void>;
}

function RecentSection({
  threads,
  activeThreadId,
  existingFolders,
  onSelectThread,
  onDeleteThread,
  onUpdateFolder,
}: ThreadSectionProps) {
  const [isSectionCollapsed, setIsSectionCollapsed] = useState(false);
  const recentThreads = useMemo(
    () =>
      [...threads]
        .sort(
          (left, right) =>
            new Date(right.updated_at ?? right.created_at).getTime() -
            new Date(left.updated_at ?? left.created_at).getTime()
        )
        .slice(0, 3),
    [threads]
  );

  if (recentThreads.length === 0) return null;

  return (
    <section className="chat-sidebar-section">
      <button
        type="button"
        className="chat-sidebar-section-toggle"
        onClick={() => setIsSectionCollapsed((current) => !current)}
        aria-expanded={!isSectionCollapsed}
      >
        <span
          className={
            isSectionCollapsed
              ? "chat-sidebar-section-arrow chat-sidebar-section-arrow-collapsed"
              : "chat-sidebar-section-arrow"
          }
          aria-hidden="true"
        >
          ▼
        </span>
        <span className="chat-sidebar-section-name">最近</span>
      </button>
      {!isSectionCollapsed && (
        <div className="chat-sidebar-section-threads">
          {recentThreads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              isActive={activeThreadId === thread.id}
              existingFolders={existingFolders}
              onSelect={() => onSelectThread(thread.id)}
              onDelete={() => onDeleteThread(thread.id)}
              onUpdateFolder={(folderName) =>
                onUpdateFolder(thread.id, folderName)
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface FolderSectionProps extends ThreadSectionProps {
  folderName: string | null;
  defaultCollapsed: boolean;
  onNewThreadInFolder?: (
    folderName: string
  ) => void | Promise<void>;
}

function FolderSection({
  folderName,
  threads,
  activeThreadId,
  existingFolders,
  onSelectThread,
  onDeleteThread,
  onUpdateFolder,
  onNewThreadInFolder,
  defaultCollapsed,
}: FolderSectionProps) {
  const [isSectionCollapsed, setIsSectionCollapsed] =
    useState(defaultCollapsed);

  return (
    <section className="chat-sidebar-section">
      <div className="chat-sidebar-folder-heading">
        <button
          type="button"
          className="chat-sidebar-section-toggle"
          onClick={() => setIsSectionCollapsed((current) => !current)}
          aria-expanded={!isSectionCollapsed}
        >
          <span
            className={
              isSectionCollapsed
                ? "chat-sidebar-section-arrow chat-sidebar-section-arrow-collapsed"
                : "chat-sidebar-section-arrow"
            }
            aria-hidden="true"
          >
            ▼
          </span>
          <span className="chat-sidebar-folder-icon" aria-hidden="true">
            {folderName ? "📁" : "📋"}
          </span>
          <span className="chat-sidebar-section-name">
            {folderName ?? "未分類"}
          </span>
          <span className="chat-sidebar-section-count">{threads.length}</span>
        </button>

        {folderName && onNewThreadInFolder && (
          <button
            type="button"
            className="chat-sidebar-folder-add"
            onClick={() => void onNewThreadInFolder(folderName)}
            aria-label={`「${folderName}」に新しいスレッドを作成`}
            title={`「${folderName}」に新しいスレッドを作成`}
          >
            +
          </button>
        )}
      </div>

      {!isSectionCollapsed && (
        <div className="chat-sidebar-section-threads">
          {threads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              isActive={activeThreadId === thread.id}
              existingFolders={existingFolders}
              onSelect={() => onSelectThread(thread.id)}
              onDelete={() => onDeleteThread(thread.id)}
              onUpdateFolder={(nextFolderName) =>
                onUpdateFolder(thread.id, nextFolderName)
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

const searchTargets: { value: SearchTarget; label: string }[] = [
  { value: "both", label: "すべて" },
  { value: "title", label: "タイトル" },
  { value: "message", label: "本文" },
];

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
  onNewThreadInFolder,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTarget, setSearchTarget] = useState<SearchTarget>("both");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleNewThreadInFolder = useCallback(
    (folderName: string) => onNewThreadInFolder(folderName),
    [onNewThreadInFolder]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void onSearch(value, searchTarget);
      }, 300);
    },
    [onSearch, searchTarget]
  );

  const handleTargetChange = useCallback(
    (target: SearchTarget) => {
      setSearchTarget(target);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void onSearch(searchQuery, target);
      }, 0);
    },
    [onSearch, searchQuery]
  );

  const handleClear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    setSearchQuery("");
    void onSearch("", searchTarget);
  }, [onSearch, searchTarget]);

  const grouped = useMemo(() => groupThreadsByFolder(threads), [threads]);
  const existingFolders = useMemo(
    () => getUniqueFolderNames(threads),
    [threads]
  );
  const showFlat = isSearching && searchQuery.trim() !== "";

  return (
    <aside className="chat-sidebar" aria-label="会話一覧">
      <header className="chat-sidebar-header">
        <div className="chat-sidebar-logo">KabeHub</div>
        <button
          type="button"
          className="chat-sidebar-new-thread"
          onClick={onNewThread}
        >
          <span className="chat-sidebar-new-thread-icon" aria-hidden="true">
            +
          </span>
          <span>新しい壁打ち</span>
        </button>
      </header>

      <div className="chat-sidebar-thread-list">
        {!showFlat && (
          <RecentSection
            threads={threads}
            activeThreadId={activeThreadId}
            existingFolders={existingFolders}
            onSelectThread={onSelectThread}
            onDeleteThread={onDeleteThread}
            onUpdateFolder={onUpdateFolder}
          />
        )}

        {threads.length === 0 && !isSearching && (
          <div className="chat-sidebar-empty">
            まだ壁打ちがありません。
            <br />「＋」で新規作成。
          </div>
        )}
        {threads.length === 0 && isSearching && (
          <div className="chat-sidebar-empty">
            「{searchQuery}」に一致する
            <br />スレッドはありません。
          </div>
        )}

        {showFlat &&
          threads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              isActive={activeThreadId === thread.id}
              existingFolders={existingFolders}
              onSelect={() => onSelectThread(thread.id)}
              onDelete={() => onDeleteThread(thread.id)}
              onUpdateFolder={(folderName) =>
                onUpdateFolder(thread.id, folderName)
              }
            />
          ))}

        {!showFlat &&
          grouped.map((group) => {
            const hasActiveThread = group.threads.some(
              (thread) => thread.id === activeThreadId
            );
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
                onNewThreadInFolder={handleNewThreadInFolder}
                defaultCollapsed={!hasActiveThread}
              />
            );
          })}
      </div>

      <footer className="chat-sidebar-footer">
        <div className="chat-sidebar-search-targets" aria-label="検索対象">
          {searchTargets.map(({ value, label }) => (
            <button
              type="button"
              key={value}
              className={
                searchTarget === value
                  ? "chat-sidebar-search-target chat-sidebar-search-target-active"
                  : "chat-sidebar-search-target"
              }
              onClick={() => handleTargetChange(value)}
              aria-pressed={searchTarget === value}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="chat-sidebar-search-field">
          <span className="chat-sidebar-search-icon" aria-hidden="true">
            🔍
          </span>
          <input
            type="search"
            className="chat-sidebar-search-input"
            value={searchQuery}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="スレッドを検索…"
            aria-label="スレッドを検索"
          />
          {searchQuery && (
            <button
              type="button"
              className="chat-sidebar-search-clear"
              onClick={handleClear}
              aria-label="検索をクリア"
            >
              ×
            </button>
          )}
        </div>

        <nav className="chat-sidebar-nav" aria-label="関連機能">
          <a href="/arena" className="chat-sidebar-nav-link">
            <span aria-hidden="true">⚔️</span>
            <span>AI闘技場</span>
          </a>
          <a href="/novel-check" className="chat-sidebar-nav-link">
            <span aria-hidden="true">📖</span>
            <span>整合性チェック</span>
          </a>
        </nav>

        <div className="chat-sidebar-account-row">
          <div className="chat-sidebar-thread-count">
            {isSearching
              ? `「${searchQuery}」— ${threads.length} 件`
              : `${threads.length} スレッド保存済み`}
          </div>
          <div className="chat-sidebar-account-actions">
            <a
              href="/settings"
              className="chat-sidebar-account-link"
              aria-label="設定"
              title="設定"
            >
              ⚙️
            </a>
            <button
              type="button"
              className="chat-sidebar-logout"
              onClick={() => void onLogout()}
              title={`ログアウト (${user.email ?? "ユーザー"})`}
            >
              ログアウト
            </button>
          </div>
        </div>
      </footer>
    </aside>
  );
}
