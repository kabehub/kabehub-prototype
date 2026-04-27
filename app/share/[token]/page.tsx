"use client";

import { useEffect, useRef, useState } from "react";
import { Message, Thread } from "@/types";
import MarkdownRenderer from "@/components/MarkdownRenderer";

type ShareData = {
  thread: Thread;
  messages: Message[];
  has_secret_prompt: boolean;
};

function ProviderLabel({ provider }: { provider: string }) {
  if (provider === "claude") return (
    <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: "#7c3aed", background: "#f5f3ff", border: "1px solid #e9d5ff", borderRadius: "4px", padding: "1px 6px" }}>Claude</span>
  );
  if (provider === "gemini") return (
    <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: "#0369a1", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "4px", padding: "1px 6px" }}>Gemini</span>
  );
  if (provider === "openai") return (  // ← 追加
    <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "4px", padding: "1px 6px" }}>ChatGPT</span>
  );
  return (
    <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: "#6b7280", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "4px", padding: "1px 6px" }}>AI</span>
  );
}

function ReadOnlyBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isMemo = message.provider === "memo";

  // is_hidden = true のメッセージはプレースホルダー表示
  if (message.is_hidden) {
    return (
      <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", marginBottom: "16px", width: "100%" }}>
        <div style={{
          width: "100%",
          maxWidth: "720px",
          padding: "10px 16px",
          borderRadius: "8px",
          border: "1px dashed #d1d5db",
          background: "#f9fafb",
          color: "#9ca3af",
          fontSize: "13px",
          fontFamily: "'JetBrains Mono', monospace",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          boxShadow: "none",
        }}>
          <span>🔒</span>
          <span>この発言は非公開です</span>
        </div>
      </div>
    );
  }

  if (isMemo) {
    return (
      <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", marginBottom: "16px", width: "100%" }}>
        <div style={{ width: "100%", maxWidth: "720px", background: "#fefce8", border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 16px", boxShadow: "none" }}>
          <div style={{ fontSize: "11px", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: "#92400e", marginBottom: "6px", letterSpacing: "0.05em" }}>📝 MEMO</div>
          <div style={{ fontSize: "14px", color: "#78350f", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{message.content}</div>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", marginBottom: "16px", width: "100%" }}>
        <div style={{
          width: "100%",
          maxWidth: "720px",
          background: "#f7f7f5",
          border: "1px solid #e8e8e8",
          borderLeft: "4px solid var(--accent, #c4622d)",
          borderRadius: "8px",
          padding: "10px 14px",
          boxShadow: "none",
        }}>
          <div style={{ fontSize: "11px", fontWeight: 600, color: "#888888", marginBottom: "6px", letterSpacing: "0.05em", fontFamily: "'JetBrains Mono', monospace" }}>YOU</div>
          <div style={{ fontSize: "14px", color: "#111827", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
          {message.content.replace(/\[\[(.+?)\]\]/g, "████")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", marginBottom: "16px", width: "100%" }}>
      <div style={{ width: "100%", maxWidth: "720px", background: "#ffffff", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "10px 16px", boxShadow: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <ProviderLabel provider={message.provider ?? "unknown"} />
        </div>
        {/* variant="share" でマスク記法([[text]] → ████)が適用される */}
        <MarkdownRenderer content={message.content} variant="share" />
      </div>
    </div>
  );
}

export default function SharePage({ params }: { params: { token: string } }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<"notfound" | "error" | null>(null);
  const [loading, setLoading] = useState(true);
  const [forking, setForking] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likedByMe, setLikedByMe] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);

  useEffect(() => {
    const fetchShare = async () => {
      try {
        const res = await fetch(`/api/share/${params.token}`, { cache: "no-store" });
        if (res.status === 404) { setError("notfound"); return; }
        if (!res.ok) { setError("error"); return; }
        const json: ShareData = await res.json();
        setData(json);
        if (json.thread?.id) {
          fetchLikeInfo(json.thread.id);
        }
      } catch {
        setError("error");
      } finally {
        setLoading(false);
      }
    };
    fetchShare();
  }, [params.token]);

  const fetchLikeInfo = async (threadId: string) => {
    try {
      const { supabase } = await import("@/lib/supabase/client");
      const { data: { user } } = await supabase.auth.getUser();
      const { count } = await supabase
        .from("likes")
        .select("*", { count: "exact", head: true })
        .eq("thread_id", threadId);
      setLikeCount(count ?? 0);
      if (user) {
        const { data: myLike } = await supabase
          .from("likes")
          .select("id")
          .eq("thread_id", threadId)
          .eq("user_id", user.id)
          .single();
        setLikedByMe(!!myLike);
      }
    } catch {}
  };

  const handleLike = async () => {
    if (!data?.thread?.id || likeLoading) return;
    setLikeLoading(true);
    try {
      const method = likedByMe ? "DELETE" : "POST";
      const res = await fetch(`/api/threads/${data.thread.id}/likes`, { method });
      if (res.status === 401) {
        window.location.href = `/login?next=/share/${params.token}`;
        return;
      }
      if (res.ok) {
        setLikedByMe(!likedByMe);
        setLikeCount((prev) => prev + (likedByMe ? -1 : 1));
      }
    } finally {
      setLikeLoading(false);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data]);

  const handleFork = async () => {
  const { supabase } = await import("@/lib/supabase/client");
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    window.location.href = `/login?next=/share/${params.token}`;
    return;
  }
  setForking(true);
  try {
    const res = await fetch(`/api/share/${params.token}/fork`, { method: "POST" });
    if (!res.ok) throw new Error("フォーク失敗");
    const { thread: newThread, hidden_count } = await res.json(); // ← hidden_count を追加

    // 非公開メッセージがあった場合はToast表示してから遷移
    if (hidden_count > 0) {
      alert(`📋 会話を引き継ぎました\n🔒 ${hidden_count}件の非公開メッセージはプレースホルダーに置き換えられました`);
    }

    window.location.href = `/?fork=${newThread.id}`;
  } catch (err) {
    console.error("フォーク失敗:", err);
    alert("フォークに失敗しました");
  } finally {
    setForking(false);
  }
};

  const handleReport = async () => {
  if (!reportReason || reportSubmitting) return;
  setReportSubmitting(true);
  try {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: data?.thread.id, reason: reportReason }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error ?? "報告の送信に失敗しました");
      return;
    }
    setReportDone(true);
  } catch {
    alert("報告の送信に失敗しました");
  } finally {
    setReportSubmitting(false);
  }
};
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#fafaf7", color: "#6b7280", fontSize: "14px", fontFamily: "'DM Sans', sans-serif" }}>
        読み込み中…
      </div>
    );
  }

  if (error === "notfound") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#fafaf7", gap: "12px" }}>
        <div style={{ fontSize: "48px" }}>🔒</div>
        <div style={{ fontFamily: "'Lora', serif", fontSize: "20px", color: "#111827" }}>このページは存在しないか、非公開です</div>
        <div style={{ fontSize: "13px", color: "#9ca3af", fontFamily: "'DM Sans', sans-serif" }}>URLをご確認ください</div>
      </div>
    );
  }

  if (error === "error") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#fafaf7", gap: "12px" }}>
        <div style={{ fontSize: "48px" }}>⚠️</div>
        <div style={{ fontFamily: "'Lora', serif", fontSize: "20px", color: "#111827" }}>読み込みに失敗しました</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fafaf7", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, background: "#fafaf7", borderBottom: "1px solid #e5e7eb", padding: "16px 32px", display: "flex", alignItems: "center", gap: "12px", zIndex: 10 }}>
        <div style={{ width: "4px", height: "18px", background: "#7c3aed", borderRadius: "2px", flexShrink: 0 }} />
        <h1 style={{ fontFamily: "'Lora', serif", fontSize: "18px", fontWeight: 500, color: "#111827", margin: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {data?.thread.title}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <button
            onClick={handleLike}
            disabled={likeLoading}
            title={likedByMe ? "いいねを取り消す" : "いいね"}
            style={{
              display: "inline-flex", alignItems: "center", gap: "4px", padding: "5px 10px",
              border: "1px solid", borderColor: likedByMe ? "#d97706" : "#e5e7eb",
              borderRadius: "6px", background: likedByMe ? "#fffbeb" : "white",
              color: likedByMe ? "#d97706" : "#6b7280", fontSize: "12px",
              fontFamily: "'JetBrains Mono', monospace", cursor: likeLoading ? "default" : "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { if (!likeLoading) { (e.currentTarget as HTMLButtonElement).style.borderColor = "#d97706"; (e.currentTarget as HTMLButtonElement).style.color = "#d97706"; } }}
            onMouseLeave={(e) => { if (!likeLoading) { (e.currentTarget as HTMLButtonElement).style.borderColor = likedByMe ? "#d97706" : "#e5e7eb"; (e.currentTarget as HTMLButtonElement).style.color = likedByMe ? "#d97706" : "#6b7280"; } }}
          >
            <span style={{ fontSize: "14px" }}>{likedByMe ? "★" : "☆"}</span>
            <span>{likeCount}</span>
          </button>
          {data?.has_secret_prompt && (
            <span title="このスレッドのシステムプロンプトは非公開です。フォークした場合はデフォルトのプロンプトで開始されます。" style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "4px", padding: "2px 8px", cursor: "default" }}>🔒 シークレットプロンプト</span>
          )}
          <button
            onClick={handleFork}
            disabled={forking}
            style={{ padding: "6px 14px", borderRadius: "6px", border: "1px solid #7c3aed", background: forking ? "#f5f3ff" : "white", color: "#7c3aed", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", cursor: forking ? "default" : "pointer", transition: "all 0.15s" }}
            onMouseEnter={(e) => { if (!forking) { (e.currentTarget as HTMLButtonElement).style.background = "#7c3aed"; (e.currentTarget as HTMLButtonElement).style.color = "white"; } }}
            onMouseLeave={(e) => { if (!forking) { (e.currentTarget as HTMLButtonElement).style.background = "white"; (e.currentTarget as HTMLButtonElement).style.color = "#7c3aed"; } }}
          >
            {forking ? "処理中…" : "📋 この会話を引き継ぐ"}
          </button>
          <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "#9ca3af" }}>
            🔗 KabeHub · 読み取り専用
          </div>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, maxWidth: "760px", width: "100%", margin: "0 auto", padding: "32px 24px 64px" }}>
        {data?.messages.length === 0 && (
          <div style={{ textAlign: "center", color: "#9ca3af", fontSize: "13px", marginTop: "40px" }}>メッセージがありません</div>
        )}
        {data?.messages.map((msg) => (
          <ReadOnlyBubble key={msg.id} message={msg} />
        ))}
      </div>

      <div style={{ borderTop: "1px solid #e5e7eb", padding: "12px 32px", background: "#fafaf7", display: "flex", alignItems: "center", justifyContent: "center", gap: "16px" }}>
  <span style={{ fontSize: "11px", color: "#9ca3af", fontFamily: "'JetBrains Mono', monospace" }}>
    Shared via KabeHub — 思考のGitHub
  </span>
  <button
    onClick={() => { setShowReportModal(true); setReportDone(false); setReportReason(""); }}
    style={{ fontSize: "11px", color: "#9ca3af", fontFamily: "'JetBrains Mono', monospace", background: "none", border: "none", cursor: "pointer", padding: 0 }}
    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; }}
    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af"; }}
  >⚑ 報告する</button>
</div>

{/* 通報モーダル */}
{showReportModal && (
  <>
    <div onClick={() => setShowReportModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000 }} />
    <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001, background: "white", borderRadius: "12px", padding: "28px", width: "min(440px, calc(100vw - 32px))", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
      {reportDone ? (
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>✅</div>
          <div style={{ fontFamily: "'Lora', serif", fontSize: "16px", color: "#111827", marginBottom: "8px" }}>報告を受け付けました</div>
          <div style={{ fontSize: "12px", color: "#6b7280", fontFamily: "'DM Sans', sans-serif", marginBottom: "20px" }}>ご協力ありがとうございます。内容を確認の上、対応いたします。</div>
          <button onClick={() => setShowReportModal(false)} style={{ padding: "8px 24px", borderRadius: "7px", border: "1px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: "13px", cursor: "pointer" }}>閉じる</button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>報告する</div>
          <div style={{ fontFamily: "'Lora', serif", fontSize: "16px", fontWeight: 600, color: "#111827", marginBottom: "18px" }}>このコンテンツを報告</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
            {[
              "個人情報・プライバシー侵害",
              "誹謗中傷・ハラスメント",
              "不適切なコンテンツ（暴力・性的表現等）",
              "スパム・商業宣伝",
              "その他",
            ].map((label) => (
              <label key={label} onClick={() => setReportReason(label)} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: reportReason === label ? "5px solid #ef4444" : "2px solid #d1d5db", flexShrink: 0, transition: "all 0.15s" }} />
                <span style={{ fontSize: "13px", color: "#111827", fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button onClick={() => setShowReportModal(false)} style={{ padding: "8px 18px", borderRadius: "7px", border: "1px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>キャンセル</button>
            <button
              onClick={handleReport}
              disabled={!reportReason || reportSubmitting}
              style={{ padding: "8px 18px", borderRadius: "7px", border: "none", background: reportReason && !reportSubmitting ? "#ef4444" : "#d1d5db", color: reportReason && !reportSubmitting ? "white" : "#9ca3af", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", cursor: reportReason && !reportSubmitting ? "pointer" : "not-allowed", transition: "background 0.15s" }}
            >{reportSubmitting ? "送信中…" : "報告を送信"}</button>
          </div>
        </>
      )}
    </div>
  </>
)}
</div>
  );
}
