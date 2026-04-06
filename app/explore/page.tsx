"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { GENRES } from "@/lib/genres";

// ---- 型定義 ----
interface ExploreThread {
  id: string;
  title: string;
  share_token: string | null;
  created_at: string;
  updated_at: string | null;
  allow_prompt_fork: boolean;
  handle: string | null;
  display_name: string | null;
  tags: string[];
  message_count: number;
  fork_count: number;
  like_count: number;
  liked_by_me: boolean;
  genre: string | null; // 👈 追加
}

// ---- ユーティリティ ----
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "今";
  if (mins < 60) return `${mins}分前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}時間前`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}日前`;
  return new Date(dateStr).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

// ---- ☆いいねボタン ----
// ✅ 変更後（内部stateで管理）
function LikeButton({
  threadId,
  likeCount,
  likedByMe: initialLikedByMe,
  onToggle,
}: {
  threadId: string;
  likeCount: number;
  likedByMe: boolean;
  onToggle: (threadId: string, liked: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [liked, setLiked] = useState(initialLikedByMe);
  const [count, setCount] = useState(likeCount);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    // 楽観的更新
    const newLiked = !liked;
    setLiked(newLiked);
    setCount((prev) => prev + (newLiked ? 1 : -1));
    try {
      const method = liked ? "DELETE" : "POST";
      const res = await fetch(`/api/threads/${threadId}/likes`, { method });
      if (res.status === 401) {
        window.location.href = `/login?next=/explore`;
        return;
      }
      if (!res.ok) {
        // 失敗したら戻す
        setLiked(liked);
        setCount((prev) => prev + (newLiked ? -1 : 1));
      } else {
        onToggle(threadId, newLiked);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title={liked ? "いいねを取り消す" : "いいね"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "3px",
        padding: "2px 6px",
        border: "none",
        background: "none",
        cursor: loading ? "default" : "pointer",
        fontSize: "11px",
        fontFamily: "'JetBrains Mono', monospace",
        color: liked ? "#d97706" : "var(--ink-muted)",
        transition: "color 0.15s",
        borderRadius: "4px",
      }}
      onMouseEnter={(e) => {
        if (!loading) (e.currentTarget as HTMLButtonElement).style.color = "#d97706";
      }}
      onMouseLeave={(e) => {
        if (!loading)
          (e.currentTarget as HTMLButtonElement).style.color = liked ? "#d97706" : "var(--ink-muted)";
      }}
    >
      <span style={{ fontSize: "13px" }}>{liked ? "★" : "☆"}</span>
      <span>{count}</span>
    </button>
  );
}

// ---- スレッドカード ----
function ThreadCard({
  thread,
  onFork,
  forking,
  selectedTag,
  onTagClick,
  onLikeToggle,
}: {
  thread: ExploreThread;
  onFork: (thread: ExploreThread) => void;
  forking: boolean;
  selectedTag: string;
  onTagClick: (tag: string) => void;
  onLikeToggle: (threadId: string, liked: boolean) => void;
}) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      {/* タイトル + シークレットバッジ */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: "'Lora', serif",
              fontSize: "15px",
              fontWeight: 500,
              color: "var(--ink)",
              lineHeight: 1.4,
              marginBottom: "4px",
            }}
          >
            {thread.title}
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "var(--ink-muted)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {thread.display_name || thread.handle
              ? `@${thread.handle ?? "unknown"}`
              : "匿名"}{" "}
            · {timeAgo(thread.updated_at ?? thread.created_at)}
          </div>
        </div>
        {!thread.allow_prompt_fork && (
          <span
            title="システムプロンプトは非公開です"
            style={{
              fontSize: "10px",
              fontFamily: "'JetBrains Mono', monospace",
              color: "#92400e",
              background: "#fef3c7",
              border: "1px solid #fde68a",
              borderRadius: "4px",
              padding: "2px 6px",
              flexShrink: 0,
              marginTop: "2px",
            }}
          >
            🔒 シークレット
          </span>
        )}
      </div>

      {/* タグ */}
      {thread.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {thread.tags.map((tag) => {
            const isActive = selectedTag === tag;
            return (
              <button
                key={tag}
                onClick={() => onTagClick(tag)}
                title={isActive ? "クリックで絞り込み解除" : `#${tag} で絞り込む`}
                style={{
                  fontSize: "10px",
                  fontFamily: "'JetBrains Mono', monospace",
                  color: isActive ? "white" : "#7c3aed",
                  background: isActive ? "#7c3aed" : "#f5f3ff",
                  border: `1px solid ${isActive ? "#7c3aed" : "#e9d5ff"}`,
                  borderRadius: "4px",
                  padding: "1px 7px",
                  cursor: "pointer",
                  transition: "all 0.12s",
                }}
              >
                #{tag}
              </button>
            );
          })}
        </div>
      )}

      {/* フッター：メッセージ数・フォーク数・いいね・アクション */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "2px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "11px",
            color: "var(--ink-muted)",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <span title="メッセージ数">💬 {thread.message_count}</span>
          <span title="フォーク数">📋 {thread.fork_count}</span>
          <LikeButton
            threadId={thread.id}
            likeCount={thread.like_count}
            likedByMe={thread.liked_by_me}
            onToggle={onLikeToggle}
          />
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {thread.share_token && (
            <a
              href={`/share/${thread.share_token}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "5px 12px",
                borderRadius: "5px",
                border: "1px solid var(--border)",
                background: "white",
                color: "var(--ink)",
                fontSize: "11px",
                fontFamily: "'JetBrains Mono', monospace",
                cursor: "pointer",
                textDecoration: "none",
                transition: "all 0.12s",
                display: "inline-flex",
                alignItems: "center",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = "var(--sidebar-bg)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = "white";
              }}
            >
              👁 閲覧
            </a>
          )}
          <button
            onClick={() => onFork(thread)}
            disabled={forking || !thread.share_token}
            style={{
              padding: "5px 12px",
              borderRadius: "5px",
              border: "1px solid #7c3aed",
              background: forking ? "#f5f3ff" : "white",
              color: "#7c3aed",
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              cursor: forking ? "default" : "pointer",
              transition: "all 0.12s",
            }}
            onMouseEnter={(e) => {
              if (!forking) {
                (e.currentTarget as HTMLButtonElement).style.background = "#7c3aed";
                (e.currentTarget as HTMLButtonElement).style.color = "white";
              }
            }}
            onMouseLeave={(e) => {
              if (!forking) {
                (e.currentTarget as HTMLButtonElement).style.background = "white";
                (e.currentTarget as HTMLButtonElement).style.color = "#7c3aed";
              }
            }}
          >
            📋 フォーク
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- メインコンテンツ（useSearchParams を使うため Suspense で包む） ----
function ExploreContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ---- URLから現在値を取得（SSOT） ----
  const urlTag = searchParams.get("tag") ?? "";
  const urlQuery = searchParams.get("q") ?? "";
  const urlGenre = searchParams.get("genre") ?? "";
  const urlParentGenre = searchParams.get("parent_genre") ?? "";

  // ---- ローカルState ----
  const [items, setItems] = useState<ExploreThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState(urlQuery);
  const [forkingId, setForkingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- URL更新の共通関数 ----
  const updateParams = useCallback(
  (updates: { tag?: string | null; q?: string | null; genre?: string | null; parent_genre?: string | null }, mode: "push" | "replace" = "replace") => {
    const params = new URLSearchParams(searchParams.toString());
    if (updates.tag !== undefined) {
      if (updates.tag) params.set("tag", updates.tag);
      else params.delete("tag");
    }
    if (updates.q !== undefined) {
      if (updates.q) params.set("q", updates.q);
      else params.delete("q");
    }
    if (updates.genre !== undefined) {
      if (updates.genre) params.set("genre", updates.genre);
      else params.delete("genre");
    }
    if (updates.parent_genre !== undefined) {
      if (updates.parent_genre) params.set("parent_genre", updates.parent_genre);
      else params.delete("parent_genre");
    }
      const qs = params.toString();
      const newUrl = qs ? `${pathname}?${qs}` : pathname;
      if (mode === "push") router.push(newUrl);
      else router.replace(newUrl);
    },
    [searchParams, pathname, router]
  );

  // ---- データ取得 ----
  const fetchItems = useCallback(
  async (tag: string, query: string, genre: string, parentGenre: string, cursor: string | null, append: boolean) => {
    // ...
    const params = new URLSearchParams();
    if (tag) params.set("tag", tag);
    if (query) params.set("q", query);
    if (genre) params.set("genre", genre);
    if (parentGenre) params.set("parent_genre", parentGenre);
    if (cursor) params.set("cursor", cursor);

      try {
        const res = await fetch(`/api/explore?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        setItems((prev) => (append ? [...prev, ...json.items] : json.items));
        setHasMore(json.hasMore);
        setNextCursor(json.nextCursor);
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    []
  );

  // URL変化で再フェッチ
  useEffect(() => {
  fetchItems(urlTag, urlQuery, urlGenre, urlParentGenre, null, false);
}, [urlTag, urlQuery, urlGenre, urlParentGenre, fetchItems]);

  // ---- いいねのトグル（楽観的更新） ----
  const handleLikeToggle = useCallback((threadId: string, liked: boolean) => {
    setItems((prev) =>
      prev.map((t) =>
        t.id === threadId
          ? { ...t, liked_by_me: liked, like_count: t.like_count + (liked ? 1 : -1) }
          : t
      )
    );
  }, []);

  // ---- 検索ハンドラ ----
  const handleSearchChange = useCallback(
    (value: string) => {
      setInputValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      // #タグ検索
      if (value.startsWith("#")) {
        const tagValue = value.slice(1).trim();
        debounceRef.current = setTimeout(() => {
          updateParams({ tag: tagValue || null, q: null });
        }, 400);
        return;
      }
      debounceRef.current = setTimeout(() => {
        updateParams({ q: value || null });
      }, 400);
    },
    [updateParams]
  );

  const handleSearchClear = useCallback(() => {
    setInputValue("");
    updateParams({ q: null, tag: null });
  }, [updateParams]);

  const handleTagClick = useCallback(
    (tag: string) => {
      if (urlTag === tag) {
        updateParams({ tag: null }, "push");
      } else {
        setInputValue("");
        updateParams({ tag, q: null }, "push");
      }
    },
    [urlTag, updateParams]
  );

  const handleLoadMore = useCallback(() => {
  if (!nextCursor || loadingMore) return;
  fetchItems(urlTag, urlQuery, urlGenre, urlParentGenre, nextCursor, true);
}, [nextCursor, loadingMore, urlTag, urlQuery, urlGenre, urlParentGenre, fetchItems]);

  const handleFork = useCallback(
    async (thread: ExploreThread) => {
      const { supabase } = await import("@/lib/supabase/client");
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        const currentParams = searchParams.toString();
        window.location.href = `/login?next=/explore${currentParams ? `?${currentParams}` : ""}`;
        return;
      }
      if (!thread.share_token) return;
      setForkingId(thread.id);
      try {
        const res = await fetch(`/api/share/${thread.share_token}/fork`, { method: "POST" });
        if (!res.ok) throw new Error("フォーク失敗");
        const { thread: newThread } = await res.json();
        window.location.href = `/?fork=${newThread.id}`;
      } catch (err) {
        console.error("フォーク失敗:", err);
        alert("フォークに失敗しました");
      } finally {
        setForkingId(null);
      }
    },
    [searchParams]
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--paper)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          position: "sticky",
          top: 0,
          background: "var(--paper)",
          borderBottom: "1px solid var(--border)",
          padding: "16px 24px",
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: "760px",
            width: "100%",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <a
              href="/"
              style={{
                fontSize: "11px",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--ink-muted)",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--ink)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--ink-muted)")}
            >
              ← 自分の壁打ち
            </a>
            <div style={{ flex: 1 }} />
            <h1
              style={{
                fontFamily: "'Lora', serif",
                fontSize: "17px",
                fontWeight: 500,
                color: "var(--ink)",
                margin: 0,
              }}
            >
              みんなの壁打ち
            </h1>
            <div style={{ flex: 1 }} />
          </div>

          {/* 検索ボックス */}
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "11px",
                color: "var(--ink-faint)",
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="タイトルで検索… (#タグ名でタグ検索)"
              style={{
                width: "100%",
                padding: "7px 28px 7px 26px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "12px",
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
            {inputValue && (
              <button
                onClick={handleSearchClear}
                style={{
                  position: "absolute",
                  right: "7px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--ink-faint)",
                  cursor: "pointer",
                  fontSize: "12px",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>
      {/* ジャンルフィルター */}
<div
  style={{
    maxWidth: "760px",
    width: "100%",
    margin: "0 auto",
    padding: "12px 24px 0",
  }}
>
  {/* 大分類ボタン */}
  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
    <button
      onClick={() => updateParams({ parent_genre: null, genre: null }, "push")}
      style={{
        padding: "4px 12px", borderRadius: "999px", fontSize: "11px", cursor: "pointer",
        border: !urlParentGenre && !urlGenre ? "1.5px solid var(--accent)" : "1px solid var(--border)",
        background: !urlParentGenre && !urlGenre ? "var(--accent)" : "white",
        color: !urlParentGenre && !urlGenre ? "white" : "var(--ink)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >すべて</button>
    {GENRES.map((parent) => {
      const isActive = urlParentGenre === parent.id || GENRES.find(g => g.id === parent.id)?.children.some(c => c.id === urlGenre);
      return (
        <button
          key={parent.id}
          onClick={() => {
            if (urlParentGenre === parent.id) {
              updateParams({ parent_genre: null, genre: null }, "push");
            } else {
              updateParams({ parent_genre: parent.id, genre: null }, "push");
            }
          }}
          style={{
            padding: "4px 12px", borderRadius: "999px", fontSize: "11px", cursor: "pointer",
            border: isActive ? "1.5px solid #3b82f6" : "1px solid var(--border)",
            background: isActive ? "#3b82f6" : "white",
            color: isActive ? "white" : "var(--ink)",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {parent.icon} {parent.label}
        </button>
      );
    })}
    <button
      onClick={() => updateParams({ parent_genre: "other", genre: null }, "push")}
      style={{
        padding: "4px 12px", borderRadius: "999px", fontSize: "11px", cursor: "pointer",
        border: urlParentGenre === "other" ? "1.5px solid #3b82f6" : "1px solid var(--border)",
        background: urlParentGenre === "other" ? "#3b82f6" : "white",
        color: urlParentGenre === "other" ? "white" : "var(--ink)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >📦 その他</button>
  </div>

  {/* 中分類（大分類が選択中かつ「その他」以外の時だけ表示） */}
  {urlParentGenre && urlParentGenre !== "other" && (() => {
    const expandedParent = GENRES.find(g => g.id === urlParentGenre);
    if (!expandedParent) return null;
    return (
      <div style={{ marginTop: "8px", padding: "8px 10px", background: "white", borderRadius: "8px", borderLeft: "2px solid #3b82f6", border: "1px solid #e2e8f0", borderLeftWidth: "2px", borderLeftColor: "#3b82f6" }}>
        <div style={{ fontSize: "10px", color: "var(--ink-muted)", marginBottom: "6px", fontFamily: "'DM Sans', sans-serif" }}>
          ▸ {expandedParent.label}の中から絞り込む
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
          {expandedParent.children.map((child) => (
            <button
              key={child.id}
              onClick={() => {
                if (urlGenre === child.id) {
                  updateParams({ genre: null }, "push");
                } else {
                  updateParams({ genre: child.id }, "push");
                }
              }}
              style={{
                padding: "3px 9px", borderRadius: "999px", fontSize: "11px", cursor: "pointer",
                border: urlGenre === child.id ? "1.5px solid #3b82f6" : "1px solid var(--border)",
                background: urlGenre === child.id ? "#dbeafe" : "white",
                color: urlGenre === child.id ? "#1d4ed8" : "var(--ink-muted)",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {child.label}
            </button>
          ))}
        </div>
      </div>
    );
  })()}
</div>
      {/* 選択中タグのチップ */}
      {urlTag && (
        <div
          style={{
            maxWidth: "760px",
            width: "100%",
            margin: "0 auto",
            padding: "12px 24px 0",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span style={{ fontSize: "11px", color: "var(--ink-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
            タグ絞り込み中:
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              fontFamily: "'JetBrains Mono', monospace",
              color: "white",
              background: "#7c3aed",
              border: "1px solid #7c3aed",
              borderRadius: "4px",
              padding: "2px 8px",
            }}
          >
            #{urlTag}
            <button
              onClick={() => handleTagClick(urlTag)}
              style={{
                background: "none",
                border: "none",
                color: "white",
                cursor: "pointer",
                fontSize: "12px",
                padding: "0 0 0 2px",
                lineHeight: 1,
                opacity: 0.8,
              }}
              title="絞り込みを解除"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {/* コンテンツ */}
      <div
        style={{
          flex: 1,
          maxWidth: "760px",
          width: "100%",
          margin: "0 auto",
          padding: "28px 24px 64px",
        }}
      >
        {loading && (
          <div
            style={{
              textAlign: "center",
              color: "var(--ink-muted)",
              fontSize: "13px",
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: "60px",
            }}
          >
            読み込み中…
          </div>
        )}

        {!loading && items.length === 0 && (
          <div
            style={{
              textAlign: "center",
              marginTop: "80px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div style={{ fontSize: "40px" }}>🌱</div>
            <div style={{ fontFamily: "'Lora', serif", fontSize: "16px", color: "var(--ink)" }}>
              {urlTag
                ? `#${urlTag} の壁打ちはありません`
                : urlQuery
                ? `「${urlQuery}」に一致する壁打ちはありません`
                : "まだ公開されている壁打ちがありません"}
            </div>
            <div style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
              {urlTag
                ? "別のタグを試してみてください"
                : "スレッドを公開すると、ここに表示されます"}
            </div>
          </div>
        )}

        {!loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {items.map((thread) => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                onFork={handleFork}
                forking={forkingId === thread.id}
                selectedTag={urlTag}
                onTagClick={handleTagClick}
                onLikeToggle={handleLikeToggle}
              />
            ))}
          </div>
        )}

        {!loading && hasMore && (
          <div style={{ textAlign: "center", marginTop: "28px" }}>
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              style={{
                padding: "9px 28px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: loadingMore ? "var(--sidebar-bg)" : "white",
                color: "var(--ink)",
                fontSize: "12px",
                fontFamily: "'JetBrains Mono', monospace",
                cursor: loadingMore ? "default" : "pointer",
                transition: "all 0.12s",
              }}
              onMouseEnter={(e) => {
                if (!loadingMore)
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--sidebar-bg)";
              }}
              onMouseLeave={(e) => {
                if (!loadingMore)
                  (e.currentTarget as HTMLButtonElement).style.background = "white";
              }}
            >
              {loadingMore ? "読み込み中…" : "もっと見る"}
            </button>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div
            style={{
              textAlign: "center",
              marginTop: "20px",
              fontSize: "11px",
              color: "var(--ink-faint)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {items.length} 件表示中
            {hasMore ? "（続きあり）" : "（すべて表示済み）"}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- ページエントリーポイント（Suspense でラップ） ----
export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "var(--paper)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            color: "var(--ink-muted)",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          読み込み中…
        </div>
      }
    >
      <ExploreContent />
    </Suspense>
  );
}
