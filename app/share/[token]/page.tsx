"use client";

import { useEffect, useRef, useState } from "react";
import { Message, Thread } from "@/types";

type ShareData = {
  thread: Thread;
  messages: Message[];
  has_secret_prompt: boolean;
};

// プロバイダーラベル
function ProviderLabel({ provider }: { provider: string }) {
  if (provider === "claude") return (
    <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: "#7c3aed", background: "#f5f3ff", border: "1px solid #e9d5ff", borderRadius: "4px", padding: "1px 6px" }}>Claude</span>
  );
  if (provider === "gemini") return (
    <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: "#0369a1", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "4px", padding: "1px 6px" }}>Gemini</span>
  );
  return (
    <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: "#6b7280", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "4px", padding: "1px 6px" }}>AI</span>
  );
}

// メッセージバブル（リードオンリー版・シンプル）
function ReadOnlyBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isMemo = message.provider === "memo";

  if (isMemo) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px" }}>
        <div style={{ maxWidth: "72%", background: "#fefce8", border: "1px solid #fde68a", borderRadius: "12px", padding: "12px 16px" }}>
          <div style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: "#92400e", marginBottom: "6px" }}>📝 Memo</div>
          <div style={{ fontSize: "14px", color: "#78350f", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{message.content}</div>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px" }}>
        <div style={{ maxWidth: "72%", background: "white", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "12px 16px" }}>
          <div style={{ fontSize: "14px", color: "#111827", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{message.content}</div>
          <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "6px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>
            {new Date(message.created_at).toLocaleString("ja-JP")}
          </div>
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "20px", gap: "10px" }}>
      <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "#f3f4f6", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0, marginTop: "2px" }}>✦</div>
      <div style={{ maxWidth: "80%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
          <ProviderLabel provider={message.provider ?? "unknown"} />
          <span style={{ fontSize: "10px", color: "#9ca3af", fontFamily: "'JetBrains Mono', monospace" }}>
            {new Date(message.created_at).toLocaleString("ja-JP")}
          </span>
        </div>
        <div
          style={{ fontSize: "14px", color: "#111827", lineHeight: 1.8 }}
          dangerouslySetInnerHTML={{ __html: simpleMarkdown(message.content) }}
        />
      </div>
    </div>
  );
}

// 簡易Markdownレンダラー（react-markdownを使わずSSRを避けるため）
// ※ プロジェクトでreact-markdownを使っている場合はそちらに差し替え推奨
function simpleMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // コードブロック
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;overflow-x:auto;font-size:13px;font-family:\'JetBrains Mono\',monospace;line-height:1.6;margin:8px 0"><code>$1</code></pre>')
    // インラインコード
    .replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:1px 5px;font-size:13px;font-family:\'JetBrains Mono\',monospace">$1</code>')
    // 太字
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // 斜体
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // 見出し
    .replace(/^### (.+)$/gm, '<h3 style="font-size:15px;font-weight:600;margin:16px 0 6px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:17px;font-weight:600;margin:20px 0 8px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:20px;font-weight:700;margin:24px 0 10px">$1</h1>')
    // 箇条書き
    .replace(/^- (.+)$/gm, '<li style="margin:3px 0;padding-left:4px">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="padding-left:20px;margin:8px 0">$&</ul>')
    // 改行
    .replace(/\n/g, "<br>");
}

export default function SharePage({ params }: { params: { token: string } }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<"notfound" | "error" | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [forking, setForking] = useState(false);

  useEffect(() => {
    const fetchShare = async () => {
      try {
        const res = await fetch(`/api/share/${params.token}`, { cache: "no-store" });
        if (res.status === 404) { setError("notfound"); return; }
        if (!res.ok) { setError("error"); return; }
        const json: ShareData = await res.json();
        setData(json);
      } catch {
        setError("error");
      } finally {
        setLoading(false);
      }
    };
    fetchShare();
  }, [params.token]);

  useEffect(() => {
    import("@/lib/supabase/client").then(({ supabase }) => {
      supabase.auth.getUser().then(({ data }) => {
        setIsLoggedIn(!!data.user);
      });
    });
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data]);

  const handleFork = async () => {
    // ボタンを押した瞬間にログイン状態を確認
    const { supabase } = await import("@/lib/supabase/client");
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      window.location.href = "/login";
      return;
    }
    setForking(true);
    try {
      const res = await fetch(`/api/share/${params.token}/fork`, { method: "POST" });
      if (!res.ok) throw new Error("フォーク失敗");
      const { thread: newThread } = await res.json();
      window.location.href = `/?fork=${newThread.id}`;
    } catch (err) {
      console.error("フォーク失敗:", err);
      alert("フォークに失敗しました");
    } finally {
      setForking(false);
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
      {/* ヘッダー */}
      <div style={{ position: "sticky", top: 0, background: "#fafaf7", borderBottom: "1px solid #e5e7eb", padding: "16px 32px", display: "flex", alignItems: "center", gap: "12px", zIndex: 10 }}>
        <div style={{ width: "4px", height: "18px", background: "#7c3aed", borderRadius: "2px", flexShrink: 0 }} />
        <h1 style={{ fontFamily: "'Lora', serif", fontSize: "18px", fontWeight: 500, color: "#111827", margin: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {data?.thread.title}
        </h1>
        <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "#9ca3af", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {data?.has_secret_prompt && (
            <span
              title="このスレッドのシステムプロンプトは非公開です。フォークした場合はデフォルトのプロンプトで開始されます。"
              style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "4px", padding: "2px 8px", cursor: "default" }}
            >🔒 シークレットプロンプト</span>
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
      </div>

      {/* メッセージ一覧 */}
      <div ref={scrollRef} style={{ flex: 1, maxWidth: "760px", width: "100%", margin: "0 auto", padding: "32px 24px 64px" }}>
        {data?.messages.length === 0 && (
          <div style={{ textAlign: "center", color: "#9ca3af", fontSize: "13px", marginTop: "40px" }}>メッセージがありません</div>
        )}
        {data?.messages.map((msg) => (
          <ReadOnlyBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* フッター */}
      <div style={{ borderTop: "1px solid #e5e7eb", padding: "12px 32px", background: "#fafaf7", textAlign: "center" }}>
        <span style={{ fontSize: "11px", color: "#9ca3af", fontFamily: "'JetBrains Mono', monospace" }}>
          Shared via KabeHub — 思考のGitHub
        </span>
      </div>
    </div>
  );
}
