"use client";

import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { Thread, Message } from "@/types";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import { supabase } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function Home() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [displayThreads, setDisplayThreads] = useState<Thread[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMatchIds, setSearchMatchIds] = useState<string[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<"claude" | "gemini">("claude");
  const [user, setUser] = useState<User | null>(null);

  // 一時モード関連
  const [isTemporary, setIsTemporary] = useState(false);
  const [temporaryMessages, setTemporaryMessages] = useState<Message[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // ── ユーザー情報の取得 ───────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // ── beforeunload: 一時モード中にブラウザを閉じようとしたら警告 ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isTemporary && temporaryMessages.length > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isTemporary, temporaryMessages]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  // ── LocalStorageからAPIキーを読み込む ─────────────────────
  const getApiKeyHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    try {
      const anthropic = localStorage.getItem("kabehub_anthropic_key");
      const gemini = localStorage.getItem("kabehub_gemini_key");
      const openai = localStorage.getItem("kabehub_openai_key");
      if (anthropic) headers["x-anthropic-api-key"] = anthropic;
      if (gemini) headers["x-gemini-api-key"] = gemini;
      if (openai) headers["x-openai-api-key"] = openai;
    } catch {}
    return headers;
  }, []);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/threads", { cache: "no-store" });
      const data: Thread[] = await res.json();
      setThreads(data);
      setDisplayThreads(data);
      return data;
    } catch (err) {
      console.error("スレッド一覧の取得失敗:", err);
      return [];
    }
  }, []);

  const selectThread = useCallback(async (id: string, matchedMessageIds?: string[]) => {
    // 一時モード中にスレッド切り替えガード
    if (isTemporary && temporaryMessages.length > 0) {
      const ok = window.confirm("保存されていない一時メッセージは消去されます。よろしいですか？");
      if (!ok) return;
    }
    setIsTemporary(false);
    setTemporaryMessages([]);
    setActiveThreadId(id);
    setSearchMatchIds(matchedMessageIds ?? []);
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
  }, [isTemporary, temporaryMessages]);

// ✅ 変更後
useEffect(() => {
  const init = async () => {
    const latestThreads = await fetchThreads();
    const savedId = localStorage.getItem("lastActiveThreadId");
    if (savedId && latestThreads.some((t: Thread) => t.id === savedId)) {
      selectThread(savedId);
    }
    // ↓ ここに追加
    const url = new URL(window.location.href);
    const forkId = url.searchParams.get("fork");
    if (forkId) {
      url.searchParams.delete("fork");
      window.history.replaceState({}, "", url.toString());
      selectThread(forkId);
    }
  };
  init();
}, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 検索 ─────────────────────────────────────────────────
  const handleSearch = useCallback(async (query: string, target: "title" | "message" | "both") => {
    if (!query.trim()) {
      setIsSearching(false);
      setSearchMatchIds([]);
      setDisplayThreads(threads);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&target=${target}`, { cache: "no-store" });
      const data: (Thread & { matchedMessageIds?: string[] })[] = await res.json();
      setDisplayThreads(data);
    } catch (err) {
      console.error("検索失敗:", err);
    }
  }, [threads]);

  const handleNewThread = useCallback(() => {
    // 一時モード中に新規スレッドガード
    if (isTemporary && temporaryMessages.length > 0) {
      const ok = window.confirm("保存されていない一時メッセージは消去されます。よろしいですか？");
      if (!ok) return;
    }
    setIsTemporary(false);
    setTemporaryMessages([]);
    const id = uuidv4();
    setActiveThreadId(id);
    setMessages([]);
    setInputValue("");
    localStorage.removeItem("lastActiveThreadId");
  }, [isTemporary, temporaryMessages]);

  const handleDeleteThread = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/threads/${id}`, { method: "DELETE" });
        if (activeThreadId === id) {
          setActiveThreadId(null);
          setMessages([]);
          setIsTemporary(false);
          setTemporaryMessages([]);
          localStorage.removeItem("lastActiveThreadId");
        }
        await fetchThreads();
      } catch (err) {
        console.error("削除失敗:", err);
      }
    },
    [activeThreadId, fetchThreads]
  );
const handleUpdateFolder = useCallback(async (threadId: string, folderName: string | null) => {
  await fetch(`/api/threads/${threadId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder_name: folderName }),
  });
  setThreads((prev) =>
    prev.map((t) => t.id === threadId ? { ...t, folder_name: folderName } : t)
  );
  setDisplayThreads((prev) =>                                          // 👈 追加
    prev.map((t) => t.id === threadId ? { ...t, folder_name: folderName } : t)
  );
}, []);
  const handleTitleUpdate = useCallback((id: string, title: string) => {
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    setDisplayThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }, []);

  const activeThread =
    threads.find((t) => t.id === activeThreadId) ??
    (activeThreadId
      ? { id: activeThreadId, title: "新しい壁打ち", created_at: new Date().toISOString() }
      : null);

  // ── 一時モード切り替え ────────────────────────────────────
  const handleSwitchTemporary = useCallback(async () => {
    if (!activeThreadId) return;

    if (!isTemporary) {
      // 通常 → 一時
      setIsTemporary(true);
      setTemporaryMessages([]);
    } else {
      // 一時 → 通常（全件DB保存）
      if (temporaryMessages.length === 0) {
        setIsTemporary(false);
        return;
      }
      const ok = window.confirm(`${temporaryMessages.length}件のメッセージをDBに保存して通常モードに戻しますか？`);
      if (!ok) return;

      setIsSaving(true);
      try {
        // スレッドがDBに存在しない場合は先に作成
        const existsInDB = threads.some((t) => t.id === activeThreadId);
        if (!existsInDB) {
          const firstMsg = temporaryMessages[0];
          const title = firstMsg?.content.slice(0, 20) ?? "新しい壁打ち";
          await fetch("/api/threads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: activeThreadId, title }),
          });
        }

        // 全件を順番に保存
        for (const msg of temporaryMessages) {
          await fetch("/api/chat", {
            method: "POST",
            headers: getApiKeyHeaders(),
            body: JSON.stringify({
              threadId: activeThreadId,
              messages: [],
              userContent: msg.content,
              provider: msg.provider === "memo" ? provider : (msg.provider as "claude" | "gemini"),
              isMemo: msg.provider === "memo",
              isTemporarySave: true,
              savedMessage: msg,
            }),
          });
        }

        await fetchThreads();
        setIsTemporary(false);
        setTemporaryMessages([]);
      } catch (err) {
        console.error("一時メッセージ保存失敗:", err);
        alert("保存中にエラーが発生しました。");
      } finally {
        setIsSaving(false);
      }
    }
  }, [activeThreadId, isTemporary, temporaryMessages, threads, fetchThreads, getApiKeyHeaders, provider]);

  // ── 通常送信 ──────────────────────────────────────────────
  const handleSubmit = useCallback(async (userContent: string) => {
    if (!userContent.trim() || !activeThreadId || isLoading) return;
    setInputValue("");
    setIsLoading(true);

    if (isTemporary) {
      // 一時モード: メモリのみ（DBに保存しない）
      const userMsg: Message = {
        id: uuidv4(),
        thread_id: activeThreadId,
        role: "user",
        content: userContent,
        provider: "user",
        created_at: new Date().toISOString(),
      };

      const allMessages = [...messages, ...temporaryMessages, userMsg];
      setTemporaryMessages((prev) => [...prev, userMsg]);
      setMessages((prev) => [...prev, userMsg]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: getApiKeyHeaders(),
          body: JSON.stringify({
            threadId: null, // DB保存しない
            messages: allMessages.map(m => ({ role: m.role, content: m.content, provider: m.provider })),
            userContent,
            provider,
            systemPrompt: activeThread?.system_prompt ?? "",
            isTemporary: true,
          }),
        });
        const { assistantMessage } = await res.json();
        const tempAssistant: Message = {
          ...assistantMessage,
          id: uuidv4(),
          thread_id: activeThreadId,
          created_at: new Date().toISOString(),
        };
        setTemporaryMessages((prev) => [...prev, tempAssistant]);
        setMessages((prev) => [...prev, tempAssistant]);
      } catch (err) {
        console.error("一時送信エラー:", err);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // 通常モード: DB保存あり
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: getApiKeyHeaders(),
        body: JSON.stringify({
          threadId: activeThreadId,
          messages: messages.map(m => ({ role: m.role, content: m.content, provider: m.provider })),
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
  }, [activeThreadId, isLoading, isTemporary, messages, temporaryMessages, fetchThreads, provider, activeThread, getApiKeyHeaders]);

  // ── メモ送信（AIを呼ばない）──────────────────────────────
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

    if (isTemporary) {
      // 一時モード: メモリのみ
      setTemporaryMessages((prev) => [...prev, optimisticMemo]);
      setMessages((prev) => [...prev, optimisticMemo]);
      return;
    }

    // 通常モード: DB保存あり
    setMessages((prev) => [...prev, optimisticMemo]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: getApiKeyHeaders(),
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
      setMessages((prev) => prev.map((m) => (m.id === optimisticMemo.id ? userMessage : m)));
      await fetchThreads();
    } catch (err) {
      console.error("メモ保存エラー:", err);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMemo.id));
    }
  }, [inputValue, activeThreadId, isLoading, isTemporary, messages, fetchThreads, provider, getApiKeyHeaders]);

  // ── 再生成 ────────────────────────────────────────────────
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
        headers: getApiKeyHeaders(),
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
  }, [isLoading, activeThreadId, activeThread, getApiKeyHeaders]);

  // ── タイムトラベル削除 ──────────────────────────────────
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
  // ── セルフコピペ ──────────────────────────────────────────
  const handleCopyThread = useCallback(async (threadId: string) => {
    try {
      const res = await fetch(`/api/threads/${threadId}/copy`, { method: 'POST' })
      if (!res.ok) throw new Error('コピー失敗')
      const { thread: newThread } = await res.json()
      await fetchThreads()
      selectThread(newThread.id)
    } catch (err) {
      console.error('コピー失敗:', err)
      alert('コピーに失敗しました')
    }
  }, [fetchThreads, selectThread])

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {isSaving && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999, color: "white", fontSize: "16px", gap: "12px"
        }}>
          <span>⏳</span> 一時メッセージを保存中...
        </div>
      )}
      <Sidebar
        threads={displayThreads}
        activeThreadId={activeThreadId}
        onSelectThread={(id: string) => {
          const thread = displayThreads.find((t) => t.id === id) as (typeof displayThreads[0] & { matchedMessageIds?: string[] }) | undefined;
          selectThread(id, thread?.matchedMessageIds);
        }}
        onNewThread={handleNewThread}
        onDeleteThread={handleDeleteThread}
        onSearch={handleSearch}
        isSearching={isSearching}
        user={user}
        onLogout={handleLogout}
        onUpdateFolder={handleUpdateFolder}
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
        isTemporary={isTemporary}
        onSwitchTemporary={handleSwitchTemporary}
        onCopyThread={handleCopyThread}
        searchMatchIds={searchMatchIds}
      />
    </div>
  );
}