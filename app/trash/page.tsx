"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { createLatestRequest } from "@/lib/threads/view-guard";
import { trashDaysRemaining, trashRestoreError } from "@/lib/threads/trash-display";

type TrashThread = {
  id: string; title: string; deleted_at: string; expires_at: string;
  is_public: boolean; project_id: string | null;
};
type Action = "restore" | "purge";

export default function TrashPage() {
  const { showToast } = useToast();
  const [threads, setThreads] = useState<TrashThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string[]>([]);
  const busyRef = useRef(new Set<string>());
  const [confirmation, setConfirmation] = useState<{ thread: TrashThread; action: Action } | null>(null);
  const [requests] = useState(createLatestRequest);
  const [now, setNow] = useState(Date.now);

  const load = useCallback(async () => {
    const request = requests.start();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/trash/threads", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body)) throw new Error("ゴミ箱を読み込めませんでした。");
      if (requests.isLatest(request)) {
        setThreads((body as TrashThread[]).slice().sort((a, b) => Date.parse(b.deleted_at) - Date.parse(a.deleted_at)));
      }
    } catch {
      if (requests.isLatest(request)) setError("ゴミ箱を読み込めませんでした。");
    } finally {
      if (requests.isLatest(request)) setLoading(false);
    }
  }, [requests]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => { requests.start(); clearInterval(timer); };
  }, [load, requests]);

  const mutate = async (thread: TrashThread, action: Action) => {
    if (busyRef.current.has(thread.id)) return;
    busyRef.current.add(thread.id);
    setBusy([...busyRef.current]);
    setConfirmation(null);
    try {
      const response = await fetch(`/api/trash/threads/${thread.id}${action === "restore" ? "/restore" : ""}`, {
        method: action === "restore" ? "POST" : "DELETE",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        showToast(action === "restore" ? trashRestoreError(response.status, body?.error) : "スレッドの完全削除に失敗しました", "error");
        return;
      }
      requests.start();
      setThreads(current => current.filter(t => t.id !== thread.id));
      showToast(action === "restore" ? "スレッドを復元しました" : "スレッドを完全に削除しました");
    } catch {
      showToast(action === "restore" ? "スレッドの復元に失敗しました" : "スレッドの完全削除に失敗しました", "error");
    } finally {
      busyRef.current.delete(thread.id);
      setBusy([...busyRef.current]);
    }
  };

  return (
    <main style={{ maxWidth: "920px", margin: "0 auto", padding: "32px 24px", color: "var(--ink)" }}>
      <a href="/" style={{ color: "var(--ink-muted)", fontSize: "13px", textDecoration: "none" }}>← 壁打ちへ</a>
      <h1 style={{ fontSize: "24px", marginBottom: "8px" }}>ゴミ箱</h1>
      <p style={{ fontSize: "13px", color: "var(--ink-muted)", marginBottom: "24px" }}>ゴミ箱に移動したスレッドは、7日後に完全削除予定です。</p>
      {loading ? <p role="status">読み込み中…</p>
        : error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => void load()}>再読み込み</button></div>
        : threads.length === 0 ? <p style={{ color: "var(--ink-muted)" }}>ゴミ箱は空です。</p>
        : <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "12px" }}>
          {threads.map(thread => {
            const days = trashDaysRemaining(thread.expires_at, now);
            const disabled = busy.includes(thread.id) || confirmation !== null;
            return <li key={thread.id} style={{ border: "1px solid var(--border)", borderRadius: "10px", padding: "16px",
              display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
              <div style={{ flex: "1 1 220px", minWidth: 0, overflowWrap: "anywhere" }}>
                <strong>{thread.title || "無題のスレッド"}</strong>
                {thread.is_public && <span style={{ marginLeft: "8px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px", padding: "2px 6px" }}>公開スレッド</span>}
                <p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--ink-muted)" }}>残り{days}日{days === 0 ? "（保持期間終了）" : ""}</p>
              </div>
              <button type="button" disabled={disabled} onClick={() => {
                if (thread.is_public) setConfirmation({ thread, action: "restore" });
                else void mutate(thread, "restore");
              }}>復元</button>
              <button type="button" disabled={disabled} style={{ color: "#b91c1c" }}
                onClick={() => setConfirmation({ thread, action: "purge" })}>完全に削除</button>
            </li>;
          })}
        </ul>}
      {confirmation && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: "24px", zIndex: 200 }}>
        <div role="dialog" aria-modal="true" aria-labelledby="trash-confirm-title" aria-describedby="trash-confirm-body"
          onKeyDown={event => {
            if (event.key === "Escape") setConfirmation(null);
            if (event.key === "Tab") {
              const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
              const first = buttons[0], last = buttons[buttons.length - 1];
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
          }}
          style={{ background: "var(--paper, white)", maxWidth: "440px", padding: "24px", borderRadius: "12px" }}>
          <h2 id="trash-confirm-title" style={{ marginTop: 0, fontSize: "18px" }}>{confirmation.action === "restore" ? "公開スレッドを復元" : "スレッドを完全に削除"}</h2>
          <p id="trash-confirm-body">{confirmation.action === "restore"
            ? "このスレッドは以前公開されていました。復元すると、共有URLから再び閲覧できるようになります。"
            : `「${confirmation.thread.title}」を完全に削除します。メッセージと画像も削除され、この操作は取り消せません。`}</p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <button type="button" autoFocus onClick={() => setConfirmation(null)}>キャンセル</button>
            <button type="button" onClick={() => void mutate(confirmation.thread, confirmation.action)}>
              {confirmation.action === "restore" ? "復元する" : "完全に削除する"}
            </button>
          </div>
        </div>
      </div>}
    </main>
  );
}
