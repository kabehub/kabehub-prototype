"use client";

import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { Thread, Message } from "@/types";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";

export default function Home() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [displayThreads, setDisplayThreads] = useState<Thread[]>([]); // 表示用（検索結果）
  const [isSearching, setIsSearching] = useState(false); // 検索中フラグ
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<"claude" | "gemini">("claude");

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/threads", { cache: "no-store" });
      const data: Thread[] = await res.json();
      setThreads(data);
      setDisplayThreads(data); // 検索していない時は全件表示
      return data;
    } catch (err) {
      console.error("スレッド一覧の取得失敗:", err);
      return [];
    }
  }, []);

  const selectThread = useCallback(async (id: string) => {
    setActiveThreadId(id);
    setInputValue("");
    localStorage.setItem("lastActiveThreadId", id);
    try {
      const res = await fetch(`/api/threads/${id}/messages`, { cache: "no-store" });
      if (!res.ok) throw new Error("メッセージ取得失敗");
      const data: Message[] = await res.json();
      setMessages(data);
    } catch (err) {
      console.error("会話読み込みエラー:", err);
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const latestThreads = await fetchThreads();
      const savedId = localStorage.getItem("lastActiveThreadId");
      if (savedId && latestThreads.some((t: Thread) => t.id === savedId)) {
        selectThread(savedId);
      }
    };
    init();
  }, [fetchThreads, selectThread]);

  // ── 検索 ─────────────────────────────────────────────────────
  const handleSearch = useCallback(async (query: string, target: "title" | "message" | "both") => {
    if (!query.trim()) {
      // 空なら全件に戻す
      setIsSearching(false);
      setDisplayThreads(threads);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&target=${target}`, { cache: "no-store" });
      const data: Thread[] = await res.json();
      setDisplayThreads(data);
    } catch (err) {
      console.error("検索失敗:", err);
    }
  }, [threads]);

  const handleNewThread = useCallback(() => {
    const id = uuidv4();
    setActiveThreadId(id);
    setMessages([]);
    setInputValue("");
    localStorage.removeItem("lastActiveThreadId");
  }, []);

  const handleDeleteThread = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/threads/${id}`, { method: "DELETE" });
        if (activeThreadId === id) {
          setActiveThreadId(null);
          setMessages([]);
          localStorage.removeItem("lastActiveThreadId");
        }
        await fetchThreads();
      } catch (err) {
        console.error("削除失敗:", err);
      }
    },
    [activeThreadId, fetchThreads]
  );

  const handleTitleUpdate = useCallback((id: string, title: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t))
    );
    setDisplayThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t))
    );
  }, []);

    // ★ ここに移動
  const activeThread =
    threads.find((t) => t.id === activeThreadId) ??
    (activeThreadId
      ? { id: activeThreadId, title: "新しい壁打ち", created_at: new Date().toISOString() }
      : null);

  // ── 通常送信 ──────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!inputValue.trim() || !activeThreadId || isLoading) return;
    const userContent = inputValue.trim();
    setInputValue("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: activeThreadId,
          messages: [...messages.map(m => ({ role: m.role, content: m.content, provider: m.provider })), { role: "user", content: userContent }],
          userContent,
          provider,
          systemPrompt: activeThread?.system_prompt ?? "",
        }),
      });
      const { userMessage, assistantMessage } = await res.json();
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      await fetchThreads();
    } catch (err) {
      console.error("送信エラー:", err);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, activeThreadId, isLoading, messages, fetchThreads, provider, activeThread]);

  // ── メモ送信（AIを呼ばない）──────────────────────────────────
  const handleMemoSubmit = useCallback(async () => {
    if (!inputValue.trim() || !activeThreadId || isLoading) return;
    const userContent = inputValue.trim();
    setInputValue("");

    const optimisticMemo: Message = {
      id: uuidv4(),
      thread_id: activeThreadId,
      role: "user",
      content: userContent,
      provider: "memo",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMemo]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: activeThreadId,
          messages: [...messages.map(m => ({ role: m.role, content: m.content, provider: m.provider }))],
          userContent,
          provider,
          isMemo: true,
        }),
      });
      if (!res.ok) throw new Error("メモ保存失敗");
      const { userMessage } = await res.json();
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticMemo.id ? userMessage : m))
      );
      await fetchThreads();
    } catch (err) {
      console.error("メモ保存エラー:", err);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMemo.id));
    }
  }, [inputValue, activeThreadId, isLoading, messages, fetchThreads, provider, activeThread]);

  // ── 再生成 ────────────────────────────────────────────────────
  const handleRegenerate = useCallback(async (targetProvider: "claude" | "gemini") => {
    if (isLoading || !activeThreadId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/threads/${activeThreadId}/messages`, { cache: "no-store" });
      const latestMessages: Message[] = await res.json();

      let lastAssistantIndex = -1;
      for (let i = latestMessages.length - 1; i >= 0; i--) {
        if (latestMessages[i].role === "assistant") { lastAssistantIndex = i; break; }
      }
      if (lastAssistantIndex === -1) { setIsLoading(false); return; }

      const lastAssistant = latestMessages[lastAssistantIndex];
      let lastUser = null;
      for (let i = lastAssistantIndex - 1; i >= 0; i--) {
        if (latestMessages[i].role === "user") { lastUser = latestMessages[i]; break; }
      }
      if (!lastUser) { setIsLoading(false); return; }

      await fetch(`/api/messages/${lastAssistant.id}`, { method: "DELETE" });
      const newMessages = latestMessages.filter((m) => m.id !== lastAssistant.id);
      setMessages(newMessages);

      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: activeThreadId,
          messages: newMessages.map(m => ({ role: m.role, content: m.content, provider: m.provider })),
          userContent: lastUser.content,
          provider: targetProvider,
          isRegenerate: true,
          systemPrompt: activeThread?.system_prompt ?? "",
      }),
      });
      const { assistantMessage } = await chatRes.json();
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error("再生成失敗:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, activeThreadId, provider, activeThread]);

  // ── タイムトラベル削除 ──────────────────────────────────────
  const handleTrimFrom = useCallback(async (message: Message) => {
    if (!activeThreadId) return;
    setIsLoading(true);

    const index = messages.findIndex((m) => m.id === message.id);
    setMessages(messages.slice(0, index));

    try {
      const res = await fetch(`/api/threads/${activeThreadId}/messages`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromCreatedAt: message.created_at }),
      });
      if (!res.ok) {
        const restored = await fetch(`/api/threads/${activeThreadId}/messages`, { cache: "no-store" });
        setMessages(await restored.json());
      }
    } catch (err) {
      console.error("タイムトラベル削除失敗:", err);
    } finally {
      setIsLoading(false);
    }
  }, [activeThreadId, messages]);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar
        threads={displayThreads}
        activeThreadId={activeThreadId}
        onSelectThread={selectThread}
        onNewThread={handleNewThread}
        onDeleteThread={handleDeleteThread}
        onSearch={handleSearch}
        isSearching={isSearching}
      />
      <ChatPanel
        thread={activeThread}
        messages={messages}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSubmit={handleSubmit}
        onMemoSubmit={handleMemoSubmit}
        isLoading={isLoading}
        provider={provider}
        onProviderChange={setProvider}
        onTitleUpdate={handleTitleUpdate}
        onRegenerate={handleRegenerate}
        onTrimFrom={handleTrimFrom}
      />
    </div>
  );
}
