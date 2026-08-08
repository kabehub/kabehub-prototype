"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/formatters";
import { supabase } from "@/lib/supabase/client";
import { getClientUser } from "@/lib/supabase/client-auth";
import { useToast } from "@/components/Toast";

interface AlbumItem {
  id: string;
  thread_id: string;
  created_at: string;
  content: string;
  metadata: {
    storagePath: string | null;
    mimeType?: string;
    image_deleted?: boolean;
  };
  signedUrl: string | null;
}

function SkeletonCard() {
  return (
    <div style={{
      borderRadius: "10px",
      border: "1px solid var(--border)",
      background: "white",
      overflow: "hidden",
      animation: "pulse 1.5s ease-in-out infinite",
    }}>
      <div style={{ width: "100%", aspectRatio: "1", background: "#e5e7eb" }} />
      <div style={{ padding: "10px 12px" }}>
        <div style={{ height: "10px", background: "#e5e7eb", borderRadius: "4px", marginBottom: "6px", width: "80%" }} />
        <div style={{ height: "10px", background: "#e5e7eb", borderRadius: "4px", width: "50%" }} />
        <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
          <div style={{ height: "26px", background: "#e5e7eb", borderRadius: "6px", flex: 1 }} />
          <div style={{ height: "26px", background: "#e5e7eb", borderRadius: "6px", flex: 1 }} />
          <div style={{ height: "26px", background: "#e5e7eb", borderRadius: "6px", flex: 1 }} />
        </div>
      </div>
    </div>
  );
}

function AlbumCard({
  item,
  onDelete,
  isSelectMode,
  isSelected,
  onToggleSelect,
}: {
  item: AlbumItem;
  onDelete: () => void;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  return (
    <div
      style={{
        borderRadius: "10px",
        border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
        background: isSelected ? "rgba(196,98,45,0.04)" : "white",
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        transition: "box-shadow 0.15s, border-color 0.15s, background 0.15s",
        cursor: isSelectMode ? "pointer" : "default",
      }}
      onMouseEnter={(e) => {
        if (!isSelectMode) (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)";
      }}
      onMouseLeave={(e) => {
        if (!isSelectMode) (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
      }}
      onClick={() => {
        if (isSelectMode && onToggleSelect) onToggleSelect();
      }}
    >
      {/* 画像サムネイル */}
      <div style={{ width: "100%", aspectRatio: "1", overflow: "hidden", background: "#f3f4f6", position: "relative" }}>
        {item.signedUrl ? (
          <img
            src={item.signedUrl}
            alt={item.content}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            loading="lazy"
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--ink-faint)", fontSize: "28px",
          }}>
            🖼️
          </div>
        )}
        {/* 選択チェックオーバーレイ */}
        {isSelectMode && (
          <div style={{
            position: "absolute",
            top: "8px", left: "8px",
            width: "22px", height: "22px",
            borderRadius: "50%",
            border: `2px solid ${isSelected ? "var(--accent)" : "white"}`,
            background: isSelected ? "var(--accent)" : "rgba(0,0,0,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: "12px", fontWeight: "bold",
          }}>
            {isSelected ? "✓" : ""}
          </div>
        )}
      </div>

      {/* カード本体 */}
      <div style={{ padding: "10px 12px" }}>
        {/* プロンプト */}
        <p style={{
          margin: "0 0 4px",
          fontSize: "11px",
          color: "var(--ink)",
          fontFamily: "'DM Sans', sans-serif",
          lineHeight: 1.4,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}>
          {item.content}
        </p>
        {/* 日時 */}
        <p style={{
          margin: "0 0 10px",
          fontSize: "10px",
          color: "var(--ink-faint)",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {formatDateTime(item.created_at)}
        </p>

        {/* ボタン群（選択モード中は非表示） */}
        {!isSelectMode && (
          <div style={{ display: "flex", gap: "5px" }}>
            {/* ⬇️ ダウンロード */}
            {item.signedUrl && (
              <a
                href={item.signedUrl}
                download={`kabehub-${item.id}.${item.metadata.mimeType?.split("/")[1] ?? "jpg"}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "3px",
                  padding: "5px 0",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--ink-muted)",
                  fontSize: "10px",
                  fontFamily: "'JetBrains Mono', monospace",
                  textDecoration: "none",
                  cursor: "pointer",
                  transition: "all 0.12s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--accent)";
                  (e.currentTarget as HTMLAnchorElement).style.color = "var(--accent)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLAnchorElement).style.color = "var(--ink-muted)";
                }}
                title="ダウンロード"
              >
                ⬇️
              </a>
            )}

            {/* 💬 会話を見る */}
            <a
              href={`/?thread=${item.thread_id}&msg=${item.id}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                flex: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "3px",
                padding: "5px 0",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--ink-muted)",
                fontSize: "10px",
                fontFamily: "'JetBrains Mono', monospace",
                textDecoration: "none",
                cursor: "pointer",
                transition: "all 0.12s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--accent)";
                (e.currentTarget as HTMLAnchorElement).style.color = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)";
                (e.currentTarget as HTMLAnchorElement).style.color = "var(--ink-muted)";
              }}
              title="会話を見る"
            >
              💬 会話
            </a>

            {/* 🗑️ 削除 */}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "5px 0",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--ink-muted)",
                fontSize: "10px",
                fontFamily: "'JetBrains Mono', monospace",
                cursor: "pointer",
                transition: "all 0.12s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#ef4444";
                (e.currentTarget as HTMLButtonElement).style.color = "#ef4444";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)";
              }}
              title="削除"
            >
              🗑️
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AlbumPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const [items, setItems] = useState<AlbumItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(0);
  const hasMoreRef = useRef(true);
  const isLoadingRef = useRef(false);

  // 認証確認
  useEffect(() => {
    getClientUser(supabase).then(({ user }) => {
      if (!user) router.push("/login");
    });
  }, [router]);

  const fetchPage = useCallback(async (pageNum: number) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/album?page=${pageNum}`);
      if (!res.ok) throw new Error("アルバム取得失敗");
      const data = await res.json();
      if (pageNum === 0) {
        setItems(data.items);
      } else {
        setItems(prev => [...prev, ...data.items]);
      }
      hasMoreRef.current = data.hasMore;
      setHasMore(data.hasMore);
      pageRef.current = pageNum + 1;
    } catch (err) {
      // 読み取り専用: 失敗時はitemsとページ位置を更新せず既存表示を維持する。fetchPageが再度起動すれば再取得可能。
      console.error("アルバム取得失敗:", err);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  }, []);

  // 初回ロード
  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);

  // 無限スクロール（IntersectionObserver）
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMoreRef.current && !isLoadingRef.current) {
          fetchPage(pageRef.current);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchPage]);

  const handleDelete = async (item: AlbumItem) => {
    const preview = item.content.length > 40 ? item.content.slice(0, 40) + "…" : item.content;
    if (!window.confirm(`この画像を削除しますか？\n\nプロンプト:「${preview}」\n\nStorage上のファイルも削除されます。`)) return;

    setDeletedIds(prev => new Set([...prev, item.id]));
    try {
      const res = await fetch(`/api/messages/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_image" }),
      });
      if (!res.ok) throw new Error("削除失敗");
    } catch (err) {
      console.error("画像削除失敗:", err);
      setDeletedIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      showToast("画像の削除に失敗しました", "error");
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`選択した ${selectedIds.size} 件の画像を削除しますか？\n\nStorage上のファイルも削除されます。`)) return;

    setIsBulkDeleting(true);
    const idsArray = Array.from(selectedIds);

    // 楽観的UI: 先に全件非表示
    setDeletedIds(prev => new Set([...prev, ...idsArray]));

    const failedIds: string[] = [];
    const chunkSize = 5;

    for (let i = 0; i < idsArray.length; i += chunkSize) {
      const chunk = idsArray.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (id) => {
          try {
            const res = await fetch(`/api/messages/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "delete_image" }),
            });
            if (!res.ok) failedIds.push(id);
          } catch {
            failedIds.push(id);
          }
        })
      );
    }

    // 失敗分をロールバック
    if (failedIds.length > 0) {
      setDeletedIds(prev => {
        const next = new Set(prev);
        failedIds.forEach(id => next.delete(id));
        return next;
      });
      showToast(`${failedIds.length}件の削除に失敗しました`, "error");
    }

    setSelectedIds(new Set());
    setIsSelectMode(false);
    setIsBulkDeleting(false);
  };

  const visibleItems = items.filter(item => !deletedIds.has(item.id));

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @media (max-width: 768px) {
          .album-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
      <div style={{ minHeight: "100vh", background: "#f9fafb", padding: "24px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          {/* ヘッダー */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
            <a
              href="/"
              style={{
                color: "var(--ink-muted)",
                textDecoration: "none",
                fontSize: "13px",
                fontFamily: "'JetBrains Mono', monospace",
                transition: "color 0.12s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--ink-muted)"; }}
            >
              ← 戻る
            </a>
            <h1 style={{
              fontFamily: "'Lora', serif",
              fontSize: "20px",
              fontWeight: 600,
              color: "var(--ink)",
              margin: 0,
              letterSpacing: "-0.02em",
            }}>
              🖼️ 画像アルバム
            </h1>
            {/* 選択モードボタン群 */}
            <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
              {isSelectMode ? (
                <>
                  <button
                    onClick={() => { setIsSelectMode(false); setSelectedIds(new Set()); }}
                    disabled={isBulkDeleting}
                    style={{
                      padding: "5px 12px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--ink-muted)",
                      fontSize: "12px",
                      fontFamily: "'JetBrains Mono', monospace",
                      cursor: isBulkDeleting ? "not-allowed" : "pointer",
                      opacity: isBulkDeleting ? 0.5 : 1,
                    }}
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={selectedIds.size === 0 || isBulkDeleting}
                    style={{
                      padding: "5px 12px",
                      borderRadius: "6px",
                      border: "none",
                      background: selectedIds.size > 0 && !isBulkDeleting ? "#ef4444" : "var(--ink-faint)",
                      color: "white",
                      fontSize: "12px",
                      fontFamily: "'JetBrains Mono', monospace",
                      cursor: selectedIds.size === 0 || isBulkDeleting ? "not-allowed" : "pointer",
                      opacity: selectedIds.size === 0 || isBulkDeleting ? 0.6 : 1,
                      transition: "background 0.12s",
                    }}
                  >
                    {isBulkDeleting ? "削除中…" : `🗑️ ${selectedIds.size}件を削除`}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsSelectMode(true)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--ink-muted)",
                    fontSize: "12px",
                    fontFamily: "'JetBrains Mono', monospace",
                    cursor: "pointer",
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)";
                  }}
                >
                  選択
                </button>
              )}
            </div>
          </div>

          {/* グリッド or 空状態 */}
          {isInitialLoad ? (
            <div
              className="album-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "16px",
              }}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : visibleItems.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "80px 24px",
              color: "var(--ink-muted)",
              fontSize: "14px",
              fontFamily: "'DM Sans', sans-serif",
              lineHeight: 1.8,
            }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>🎨</div>
              <div>まだ生成画像がありません</div>
              <div style={{ fontSize: "12px", color: "var(--ink-faint)", marginTop: "6px" }}>
                チャット画面で「🎨 画像」プロバイダーを選択して画像を生成してみましょう
              </div>
            </div>
          ) : (
            <>
              <div
                className="album-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "16px",
                }}
              >
                {visibleItems.map(item => (
                  <AlbumCard
                    key={item.id}
                    item={item}
                    onDelete={() => handleDelete(item)}
                    isSelectMode={isSelectMode}
                    isSelected={selectedIds.has(item.id)}
                    onToggleSelect={() => {
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                        return next;
                      });
                    }}
                  />
                ))}
                {/* ローディングスケルトン（追加ページ読み込み中） */}
                {isLoading && !isInitialLoad &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonCard key={`skel-${i}`} />
                  ))
                }
              </div>

              {/* 無限スクロールセンチネル */}
              <div ref={sentinelRef} style={{ height: "40px", marginTop: "16px" }} />

              {!hasMore && visibleItems.length > 0 && (
                <div style={{
                  textAlign: "center",
                  padding: "20px",
                  fontSize: "11px",
                  color: "var(--ink-faint)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  全 {visibleItems.length} 件表示済み
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
