"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BranchTree from "@/components/BranchTree";
import { buildChainBlocksByRootAnchor, buildCurrentLaneKeyByBranchRootId, buildMessageById, compareMessagesForDisplay } from "@/lib/branching";
import { computeTreeLayout } from "@/lib/branchTree";
import type { Message, Thread } from "@/types";

export default function ThreadTreePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const threadId = params.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadTitle, setThreadTitle] = useState("分岐ツリー");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [messagesRes, threadsRes] = await Promise.all([
          fetch(`/api/threads/${encodeURIComponent(threadId)}/messages`, { cache: "no-store" }),
          fetch("/api/threads", { cache: "no-store" }),
        ]);

        if (!messagesRes.ok) {
          throw new Error(messagesRes.status === 401 ? "ログインが必要です。" : "メッセージを取得できませんでした。");
        }

        const fetchedMessages: Message[] = await messagesRes.json();
        const fetchedThreads: Thread[] = threadsRes.ok ? await threadsRes.json() : [];
        const thread = fetchedThreads.find((item) => item.id === threadId);

        if (!ignore) {
          setMessages(fetchedMessages);
          setThreadTitle(thread?.title ?? "分岐ツリー");
        }
      } catch (err) {
        if (!ignore) {
          setMessages([]);
          setError(err instanceof Error ? err.message : "分岐ツリーを読み込めませんでした。");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();

    return () => {
      ignore = true;
    };
  }, [threadId]);

  const layout = useMemo(() => {
    const orderedMessages = [...messages].sort(compareMessagesForDisplay);
    const treeMessages = orderedMessages.filter((msg) => msg.provider !== "memo");
    const messageById = buildMessageById(treeMessages);
    const chains = buildChainBlocksByRootAnchor(treeMessages, messageById);
    const currentLaneKeys = buildCurrentLaneKeyByBranchRootId(chains, treeMessages);
    return computeTreeLayout(treeMessages, currentLaneKeys);
  }, [messages]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--paper)", color: "var(--ink)" }}>
      <header style={{ height: 58, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, padding: "0 22px", background: "white", flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => router.push(`/?thread=${encodeURIComponent(threadId)}`)}
          style={{ border: "1px solid var(--border)", background: "white", borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: "var(--ink-muted)", fontSize: 13 }}
        >
          ← 戻る
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Lora', serif" }}>
            {threadTitle}
          </h1>
          <div style={{ marginTop: 2, color: "var(--ink-faint)", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
            分岐ツリー
          </div>
        </div>
        <span style={{ border: "1px solid #d8d8cf", background: "#f6f6f2", borderRadius: 999, padding: "4px 9px", fontSize: 11, color: "var(--ink-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
          読み取り専用
        </span>
      </header>

      {loading ? (
        <div style={{ padding: 32, color: "var(--ink-muted)", fontSize: 14 }}>読み込み中...</div>
      ) : error ? (
        <div style={{ padding: 32, color: "#b91c1c", fontSize: 14 }}>{error}</div>
      ) : (
        <BranchTree threadId={threadId} nodes={layout.nodes} edges={layout.edges} />
      )}
    </div>
  );
}
