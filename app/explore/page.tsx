"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

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

// ---- スレッドカード ----
function ThreadCard({
  thread,
  onFork,
  forking,
  selectedTag,
  onTagClick,
}: {
  thread: ExploreThread;
  onFork: (thread: ExploreThread) => void;
  forking: boolean;
  selectedTag: string;
  onTagClick: (tag: string) => void;
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

      {/* フッター：メッセージ数・フォーク数・アクション */}
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
            gap: "12px",
            fontSize: "11px",
            color: "var(--ink-muted)",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <span title="メッセージ数">💬 {thread.message_count}</span>
          <span title="フォーク数">📋 {thread.fork_count}</span>
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

  // ---- ローカルState ----
  const [items, setItems] = useState<ExploreThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  // inputValue だけローカル管理（タイピングの即応性を担保）
  const [inputValue, setInputValue] = useState(urlQuery);
  const [forkingId, setForkingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- URL更新の共通関数 ----
  const updateParams = useCallback(
    (updates: { tag?: string | null; q?: string | null }, mode: "push" | "replace" = "replace") => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });
      const url = `${pathname}?${params.toString()}`;
      if (mode === "push") {
        router.push(url, { scroll: false });
      } else {
        router.replace(url, { scroll: false });
      }
    },
    [pathname, searchParams, router]
  );

  // ---- データ取得 ----
  const fetchItems = useCallback(async (q: string, tag: string, cursor: string | null, append: boolean) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (tag) params.set("tag", tag);
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/explore?${params.toString()}`);
      if (!res.ok) throw new Error("fetch error");
      const json = await res.json();

      setItems((prev) => (append ? [...prev, ...json.items] : json.items));
      setHasMore(json.hasMore);
      setNextCursor(json.nextCursor);
    } catch (err) {
      console.error("explore fetch error:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // ---- URLパラメータが変わったらフェッチ（カーソルもリセット） ----
  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    fetchItems(urlQuery, urlTag, null, false);
  }, [urlTag, urlQuery, fetchItems]);

  // ---- 検索入力ハンドラー ----
  // inputValue はローカルで即時更新し、デバウンス後にURLへ反映
  const handleSearchChange = (val: string) => {
    setInputValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (val.startsWith("#") && val.length > 1) {
        // "#タグ名" 入力 → タグ検索に切り替え
        const tagVal = val.slice(1).trim();
        updateParams({ tag: tagVal, q: null }, "replace");
      } else {
        // 通常のタイトル検索（タグ絞り込みは維持）
        updateParams({ q: val || null }, "replace");
      }
    }, 300);
  };

  // ---- 検索クリア ----
  const handleSearchClear = () => {
    setInputValue("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // #タグ検索由来の selectedTag も同時にクリア
    if (inputValue.startsWith("#")) {
      updateParams({ tag: null, q: null }, "replace");
    } else {
      updateParams({ q: null }, "replace");
    }
  };

  // ---- タグクリック（トグル） ----
  // push を使うことでブラウザの「戻る」でタグ解除できる
  const handleTagClick = (tag: string) => {
    const next = urlTag === tag ? null : tag;
    // タグクリック時は inputValue が "#xxx" 形式なら一緒にクリア
    if (inputValue.startsWith("#")) {
      setInputValue("");
      updateParams({ tag: next, q: null }, "push");
    } else {
      updateParams({ tag: next }, "push");
    }
  };

  // ---- もっと見る ----
  const handleLoadMore = () => {
    if (nextCursor && !loadingMore) {
      fetchItems(urlQuery, urlTag, nextCursor, true);
    }
  };

  // ---- フォーク ----
  const handleFork = async (thread: ExploreThread) => {
    if (!thread.share_token) return;
    setForkingId(thread.id);
    try {
      const res = await fetch(`/api/share/${thread.share_token}/fork`, {
        method: "POST",
      });
      if (res.status === 401) {
        window.location.href = `/login?next=/explore`;
        return;
      }
      if (!res.ok) throw new Error("fork failed");
      const { thread: newThread } = await res.json();
      window.location.href = `/?fork=${newThread.id}`;
    } catch (err) {
      console.error("フォーク失敗:", err);
      alert("フォークに失敗しました");
    } finally {
      setForkingId(null);
    }
  };

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
          padding: "16px 32px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
          <a
            href="/"
            style={{
              fontSize: "12px",
              color: "var(--ink-muted)",
              fontFamily: "'JetBrains Mono', monospace",
              textDecoration: "none",
              padding: "4px 8px",
              border: "1px solid var(--border)",
              borderRadius: "5px",
              background: "white",
              transition: "all 0.12s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "var(--sidebar-bg)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "white";
            }}
          >
            ← 戻る
          </a>
          <div style={{ width: "1px", height: "16px", background: "var(--border)" }} />
          <div>
            <div
              style={{
                fontFamily: "'Lora', serif",
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--ink)",
                letterSpacing: "-0.02em",
              }}
            >
              🌍 みんなの壁打ち
            </div>
            <div
              style={{
                fontSize: "10px",
                color: "var(--ink-muted)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Public Threads
            </div>
          </div>
        </div>

        {/* 検索バー */}
        <div style={{ position: "relative", width: "280px" }}>
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
        {/* ローディング */}
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

        {/* 0件 */}
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
            <div
              style={{
                fontFamily: "'Lora', serif",
                fontSize: "16px",
                color: "var(--ink)",
              }}
            >
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

        {/* スレッドカード一覧 */}
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
              />
            ))}
          </div>
        )}

        {/* もっと見るボタン */}
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

        {/* 件数表示 */}
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
// useSearchParams() を使うコンポーネントは必ず Suspense で囲む（Next.js 14 App Router の要件）
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
