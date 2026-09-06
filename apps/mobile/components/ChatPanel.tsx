"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildBranchLanes,
  buildChainBlocksByRootAnchor,
  buildCurrentLaneKeyByBranchRootId,
  buildMessageById,
  compareMessagesForDisplay,
  generateMessageSummary,
  getAnchorKey,
  normalizeTagName,
  resolveBranchBlockAnchor,
  resolveCurrentLaneKey,
  TAG_NAME_MAX_LENGTH,
  timeAgo,
  type BranchLane,
  type Message,
  type ModelId,
  type TextProvider,
  type Thread,
  type ThreadTag,
} from "@kabehub/shared";

import { mobileAccessTokenProvider } from "../lib/accessTokenProvider";
import { createMobileApiClient } from "../lib/api-client";
import ChatInput from "./ChatInput";
import ChatInputCentered from "./ChatInputCentered";
import MessageBubble, { ThinkingBubble } from "./MessageBubble";
import RoleplayBubble, {
  RoleplayThinkingBubble,
} from "./RoleplayBubble";
import { useToast } from "./Toast";

const EMPTY_STRING_ARRAY: string[] = [];
const apiClient = createMobileApiClient(mobileAccessTokenProvider);

export interface ChatPanelProps {
  thread: Thread | null;
  messages: Message[];
  displayName?: string | null;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: (
    content: string,
    modelId: ModelId,
    isDeepThinking?: boolean
  ) => void;
  isLoading: boolean;
  provider: TextProvider;
  onProviderChange: (provider: TextProvider) => void;
  onTitleUpdate: (id: string, title: string) => void;
  onRegenerate: (
    targetProvider: TextProvider,
    assistantMessage?: Message,
    modelId?: string
  ) => void;
  onTrimFrom: (message: Message) => void;
  onCopyThread: (threadId: string) => void | Promise<void>;
  searchMatchIds?: string[];
  searchMatchIndex?: number;
  onMatchNavigate?: (direction: "prev" | "next") => void;
  onClearSearch?: () => void;
  streamingContent?: string;
  githubProgressMessages?: string[];
  onAbort?: () => void;
  thinkingContents?: Record<string, string>;
  hasMobileSidebarButton?: boolean;
  onMobileSidebarOpen?: () => void;
}

export default function ChatPanel({
  thread,
  messages,
  displayName,
  inputValue,
  onInputChange,
  onSubmit,
  isLoading,
  provider,
  onProviderChange,
  onTitleUpdate,
  onRegenerate,
  onTrimFrom,
  onCopyThread,
  searchMatchIds = EMPTY_STRING_ARRAY,
  searchMatchIndex = 0,
  onMatchNavigate,
  onClearSearch,
  streamingContent = "",
  githubProgressMessages = EMPTY_STRING_ARRAY,
  onAbort,
  thinkingContents,
  hasMobileSidebarButton = false,
  onMobileSidebarOpen,
}: ChatPanelProps) {
  const { showToast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagSubmittingRef = useRef(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [tags, setTags] = useState<ThreadTag[]>([]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInputValue, setTagInputValue] = useState("");
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const threadId = thread?.id;

  const orderedMessages = useMemo(
    () => [...messages].sort(compareMessagesForDisplay),
    [messages]
  );
  const messageById = useMemo(
    () => buildMessageById(orderedMessages),
    [orderedMessages]
  );
  const dbActiveMessages = useMemo(
    () => orderedMessages.filter((message) => message.is_active !== false),
    [orderedMessages]
  );
  const chainBlocksByRootAnchor = useMemo(
    () => buildChainBlocksByRootAnchor(orderedMessages, messageById),
    [messageById, orderedMessages]
  );
  const currentLaneKeyByBranchRootId = useMemo(
    () =>
      buildCurrentLaneKeyByBranchRootId(
        chainBlocksByRootAnchor,
        orderedMessages
      ),
    [chainBlocksByRootAnchor, orderedMessages]
  );

  const activeLaneRead = useMemo(() => {
    const lanes: BranchLane[] = [];
    const anchorKeys = new Set<string>();

    Object.values(chainBlocksByRootAnchor).forEach((chain) => {
      const currentLaneKey = resolveCurrentLaneKey(chain, orderedMessages);
      if (!currentLaneKey) return;
      const anchor = resolveBranchBlockAnchor(
        currentLaneKey,
        dbActiveMessages
      );
      if (!anchor) return;
      anchorKeys.add(getAnchorKey(anchor));
      lanes.push(
        ...buildBranchLanes(
          chain.branchRootIds,
          currentLaneKey,
          orderedMessages,
          messageById
        ).filter((lane) => lane.isCurrent)
      );
    });

    return { lanes, anchorKeys };
  }, [
    chainBlocksByRootAnchor,
    dbActiveMessages,
    messageById,
    orderedMessages,
  ]);

  const visibleMessages = useMemo(
    () =>
      dbActiveMessages.filter((message) => {
        if (!message.branch_root_id || message.branch_index == null) {
          return true;
        }

        const currentLaneKey =
          currentLaneKeyByBranchRootId[message.branch_root_id];
        if (!currentLaneKey) return true;

        const currentLaneWasResolved = activeLaneRead.lanes.some(
          (lane) =>
            lane.isCurrent &&
            lane.branchRootId + ':' + lane.branchIndex === currentLaneKey
        );
        if (!currentLaneWasResolved) return true;

        return (
          message.branch_root_id + ':' + message.branch_index ===
          currentLaneKey
        );
      }),
    [activeLaneRead.lanes, currentLaneKeyByBranchRootId, dbActiveMessages]
  );

  const lastAssistantIndex = useMemo(
    () =>
      visibleMessages.reduce(
        (lastIndex, message, index) =>
          message.role === "assistant" ? index : lastIndex,
        -1
      ),
    [visibleMessages]
  );

  const messageNumbers = useMemo(() => {
    let messageNumber = 0;
    return visibleMessages.reduce<Record<string, number>>(
      (numbers, message) => {
        if (message.provider !== "memo") {
          messageNumber += 1;
          numbers[message.id] = messageNumber;
        }
        return numbers;
      },
      {}
    );
  }, [visibleMessages]);

  const latestSummary = useMemo(() => {
    const latest = visibleMessages.at(-1);
    return latest
      ? generateMessageSummary(latest.content)
      : thread
        ? timeAgo(thread.created_at)
        : "";
  }, [thread, visibleMessages]);

  useEffect(() => {
    setTags([]);
    setShowTagInput(false);
    setTagInputValue("");
    setShowDialog(false);
    setShowMoreMenu(false);

    if (!threadId) return;
    let active = true;

    apiClient
      .request(`/api/threads/${threadId}/tags`, {
        cache: "no-store",
      })
      .then((response) => {
        if (!response.ok) throw new Error("タグ取得失敗");
        return response.json();
      })
      .then((data: ThreadTag[]) => {
        if (active && Array.isArray(data)) setTags(data);
      })
      .catch(() => {
        // 読み取り専用: 取得失敗時はstateを更新しない。
      });

    return () => {
      active = false;
    };
  }, [threadId]);

  useEffect(() => {
    if (showTagInput) tagInputRef.current?.focus();
  }, [showTagInput]);

  const handleAddTag = async () => {
    if (!thread || tagSubmittingRef.current) return;
    const cleanName = normalizeTagName(tagInputValue);
    if (!cleanName) {
      setTagInputValue("");
      setShowTagInput(false);
      return;
    }
    if (cleanName.length > TAG_NAME_MAX_LENGTH) return;

    tagSubmittingRef.current = true;
    setTagInputValue("");
    setShowTagInput(false);

    try {
      const res = await apiClient.request(
        `/api/threads/${thread.id}/tags`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: cleanName }),
        }
      );
      if (!res.ok) {
        showToast("タグの追加に失敗しました", "error");
        return;
      }
      const data = await res.json();
      if (data && !data.duplicate && !data.error && data.id) {
        setTags((current) => [...current, data as ThreadTag]);
      }
    } catch (error) {
      console.error("タグ追加失敗:", error);
      showToast("タグの追加に失敗しました", "error");
    } finally {
      tagSubmittingRef.current = false;
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!thread) return;
    const removedTag = tags.find((tag) => tag.id === tagId);
    setTags((current) => current.filter((tag) => tag.id !== tagId));

    try {
      const res = await apiClient.request(
        `/api/threads/${thread.id}/tags`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagId }),
        }
      );
      if (!res.ok) throw new Error("タグ削除失敗");
    } catch (error) {
      console.error("タグ削除失敗:", error);
      if (removedTag) {
        setTags((current) =>
          current.some((tag) => tag.id === removedTag.id)
            ? current
            : [...current, removedTag]
        );
      }
      showToast("タグの削除に失敗しました", "error");
    }
  };

  const openTitleDialog = () => {
    setEditTitle(thread?.title ?? "");
    setShowDialog(true);
  };

  const handleSaveTitle = async () => {
    if (!thread || !editTitle.trim()) return;
    try {
      const res = await apiClient.request(`/api/threads/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      if (!res.ok) {
        showToast("タイトルの更新に失敗しました", "error");
        return;
      }
      onTitleUpdate(thread.id, editTitle.trim());
      setShowDialog(false);
    } catch {
      showToast("タイトルの更新に失敗しました", "error");
    }
  };

  const isInitialInputMode =
    (!thread || orderedMessages.length === 0) && !isLoading;
  const roleplayMode = thread?.roleplay_mode ?? false;
  const roleplayName = thread?.rp_char_name?.trim() || "AI";
  const roleplayIconUrl = thread?.rp_char_icon_url ?? null;

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div className="chat-header-primary">
          {hasMobileSidebarButton && (
            <button
              type="button"
              className="chat-icon-button"
              aria-label="会話一覧を開く"
              onClick={onMobileSidebarOpen}
            >
              ☰
            </button>
          )}

          {thread ? (
            <>
              <button
                type="button"
                className="chat-title-button"
                onClick={openTitleDialog}
              >
                <span className="chat-title">{thread.title}</span>
                <span className="chat-title-edit-icon" aria-hidden="true">
                  ✎
                </span>
              </button>
              <span className="chat-thread-meta">{latestSummary}</span>
              <div className="chat-more-wrap">
                <button
                  type="button"
                  className="chat-icon-button"
                  aria-label="その他の操作"
                  aria-expanded={showMoreMenu}
                  onClick={() => setShowMoreMenu((current) => !current)}
                >
                  ···
                </button>
                {showMoreMenu && (
                  <>
                    <button
                      type="button"
                      className="chat-menu-backdrop"
                      aria-label="メニューを閉じる"
                      onClick={() => setShowMoreMenu(false)}
                    />
                    <div className="chat-more-menu">
                      <button
                        type="button"
                        onClick={async () => {
                          setShowMoreMenu(false);
                          const confirmed = window.confirm(
                            "この会話をベースに新しいスレッドを作成します。よろしいですか？"
                          );
                          if (confirmed) await onCopyThread(thread.id);
                        }}
                      >
                        📋 この会話をコピー
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowMoreMenu(false);
                          openTitleDialog();
                        }}
                      >
                        ✎ タイトル編集
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="chat-empty-title">
              スレッドを選択するか、新規作成してください
            </p>
          )}
        </div>

        {thread && (
          <div className="chat-tags">
            <span aria-hidden="true">🏷️</span>
            {tags.map((tag) => (
              <span className="chat-tag" key={tag.id}>
                #{tag.name}
                <button
                  type="button"
                  aria-label={'タグ「' + tag.name + '」を削除'}
                  onClick={() => void handleDeleteTag(tag.id)}
                >
                  ×
                </button>
              </span>
            ))}
            {showTagInput ? (
              <input
                ref={tagInputRef}
                className="chat-tag-input"
                id="chat-tag-input"
                name="chat-tag-input"
                value={tagInputValue}
                maxLength={TAG_NAME_MAX_LENGTH}
                placeholder="#タグ名"
                onChange={(event) => {
                  const nextValue = event.target.value;
                  if (
                    normalizeTagName(nextValue).length <= TAG_NAME_MAX_LENGTH
                  ) {
                    setTagInputValue(nextValue);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleAddTag();
                  }
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setShowTagInput(false);
                    setTagInputValue("");
                  }
                }}
                onBlur={() => void handleAddTag()}
              />
            ) : (
              <button
                type="button"
                className="chat-add-tag"
                onClick={() => setShowTagInput(true)}
              >
                ＋ タグ追加
              </button>
            )}
          </div>
        )}
      </header>

      {searchMatchIds.length > 0 && (
        <nav className="chat-search-nav" aria-label="検索結果">
          <span>
            {searchMatchIndex + 1} / {searchMatchIds.length} 件
          </span>
          <button
            type="button"
            aria-label="前の検索結果"
            onClick={() => onMatchNavigate?.("prev")}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="次の検索結果"
            onClick={() => onMatchNavigate?.("next")}
          >
            ↓
          </button>
          <button type="button" onClick={onClearSearch}>
            × 解除
          </button>
        </nav>
      )}

      <div className="chat-body">
        <div
          className="chat-message-scroll"
          ref={scrollRef}
          data-active-lane-anchors={activeLaneRead.anchorKeys.size}
        >
          <div className="chat-message-list">
            {visibleMessages.map((message, index) => {
              const isHighlighted = searchMatchIds.includes(message.id);
              const isActiveMatch =
                searchMatchIds[searchMatchIndex] === message.id;
              const shellClassName = [
                "chat-message-shell",
                isHighlighted ? "chat-message-highlighted" : "",
                isActiveMatch ? "chat-message-active-match" : "",
                roleplayMode && message.role === "user"
                  ? "chat-roleplay-user-shell"
                  : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <div
                  className={shellClassName}
                  id={'msg-' + message.id}
                  key={message.id}
                >
                  {roleplayMode && message.role === "user" ? (
                    <article className="chat-roleplay-user-message">
                      {message.content}
                    </article>
                  ) : roleplayMode && message.role === "assistant" ? (
                    <RoleplayBubble
                      message={message}
                      charName={roleplayName}
                      charIconUrl={roleplayIconUrl}
                      isLast={index === lastAssistantIndex}
                      isLoading={isLoading}
                      provider={provider}
                      onRegenerate={onRegenerate}
                      onTrimFrom={onTrimFrom}
                      isHighlighted={isHighlighted}
                      isActiveMatch={isActiveMatch}
                      activeFlashKey={
                        isActiveMatch ? searchMatchIndex : undefined
                      }
                      messageNumber={messageNumbers[message.id]}
                    />
                  ) : (
                    <MessageBubble
                      message={message}
                      isLast={index === lastAssistantIndex}
                      isLoading={isLoading}
                      provider={provider}
                      onRegenerate={onRegenerate}
                      onTrimFrom={onTrimFrom}
                      isHighlighted={isHighlighted}
                      isActiveMatch={isActiveMatch}
                      activeFlashKey={
                        isActiveMatch ? searchMatchIndex : undefined
                      }
                      messageNumber={messageNumbers[message.id]}
                      thinkingContent={thinkingContents?.[message.id]}
                    />
                  )}
                </div>
              );
            })}

            {isLoading && !streamingContent && (
              roleplayMode ? (
                <RoleplayThinkingBubble
                  charName={roleplayName}
                  charIconUrl={roleplayIconUrl}
                />
              ) : (
                <ThinkingBubble />
              )
            )}
            {isLoading && streamingContent && (
              roleplayMode ? (
                <RoleplayThinkingBubble
                  charName={roleplayName}
                  charIconUrl={roleplayIconUrl}
                  streamingContent={streamingContent}
                />
              ) : (
                <article className="chat-streaming-message">
                  <span>生成中…</span>
                  <p>{streamingContent}</p>
                </article>
              )
            )}
          </div>
        </div>

        {isInitialInputMode && (
          <div className="chat-centered-input-wrap">
            <ChatInputCentered
              value={inputValue}
              onChange={onInputChange}
              onSubmit={onSubmit}
              isLoading={isLoading}
              provider={provider}
              onProviderChange={onProviderChange}
              displayName={displayName}
            />
          </div>
        )}
      </div>

      {!isInitialInputMode && (
        <footer className="chat-footer">
          {isLoading && githubProgressMessages.length > 0 && (
            <div className="chat-progress" role="status">
              <strong>処理中…</strong>
              {githubProgressMessages.map((message, index) => (
                <span key={index}>{message}</span>
              ))}
            </div>
          )}
          {isLoading && onAbort && (
            <button
              type="button"
              className="chat-abort-button"
              onClick={onAbort}
            >
              ■ 生成を中断
            </button>
          )}
          {!isLoading && (
            <ChatInput
              value={inputValue}
              onChange={onInputChange}
              onSubmit={onSubmit}
              isLoading={isLoading}
              provider={provider}
              onProviderChange={onProviderChange}
            />
          )}
        </footer>
      )}

      {showDialog && thread && (
        <div className="chat-dialog-backdrop" role="presentation">
          <form
            className="chat-dialog"
            aria-label="タイトル編集"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveTitle();
            }}
          >
            <h2>タイトル編集</h2>
            <input
              autoFocus
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
            />
            <div className="chat-dialog-actions">
              <button type="button" onClick={() => setShowDialog(false)}>
                キャンセル
              </button>
              <button type="submit" disabled={!editTitle.trim()}>
                保存
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
