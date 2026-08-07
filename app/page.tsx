"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { Thread, Message } from "@/types";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import OutlinePane from "@/components/OutlinePane";
import NovelSettingsPane from "@/components/NovelSettingsPane";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase/client";
import { getClientUser } from "@/lib/supabase/client-auth";
import { loadModel, type ModelId, type Provider, type SubmittedAttachedImageFile } from "@/components/ChatInput";
import { getDefaultImageModel, type ImageApiProvider } from "@/lib/modelRegistry";
import type { User } from "@supabase/supabase-js";

type NovelSettingsData = {
  characters: { name: string; role: string; faction: string; status: string; notes: string }[];
  factions: { name: string; description: string; members: string[] }[];
  glossary: { term: string; description: string }[];
};

export default function Home() {
  const { showToast } = useToast();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [displayThreads, setDisplayThreads] = useState<Thread[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMatchIds, setSearchMatchIds] = useState<string[]>([]);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<Provider>("claude");
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isNovelPaneOpen, setIsNovelPaneOpen] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [novelSettingsData, setNovelSettingsData] = useState<NovelSettingsData | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("kabehub_sidebar_collapsed") === "true";
  });

  // 一時モード関連
  const [isTemporary, setIsTemporary] = useState(false);
  const [temporaryMessages, setTemporaryMessages] = useState<Message[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [imageContextId, setImageContextId] = useState<string | null>(null)
  const [isImagePinned, setIsImagePinned] = useState(false)
  const [imageRefId, setImageRefId] = useState<string | null>(null)
  const [imageRefUpload, setImageRefUpload] = useState<{ base64: string; mimeType: string; previewUrl: string } | null>(null)

  // ✅ v62追加: ストリーミング関連
  // streamingContentはChatPanelに渡してリアルタイム表示する
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [githubProgressMessages, setGithubProgressMessages] = useState<string[]>([]);
  const [thinkingContents, setThinkingContents] = useState<Record<string, string>>({});
  // AbortControllerをrefで管理（stateにするとre-renderが多すぎる）
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => {
      const isMobile = mediaQuery.matches;
      setIsMobileViewport(isMobile);
      if (!isMobile) setIsMobileSidebarOpen(false);
      if (isMobile) setIsSidebarCollapsed(false);
    };

    updateViewport();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", updateViewport);
      return () => mediaQuery.removeEventListener("change", updateViewport);
    }
    mediaQuery.addListener(updateViewport);
    return () => mediaQuery.removeListener(updateViewport);
  }, []);

  // ── ユーザー情報の取得 ───────────────────────────────────
  useEffect(() => {
    getClientUser(supabase).then(({ user }) => setUser(user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let ignore = false;

    const fetchProfile = async () => {
      if (!user) {
        setDisplayName(null);
        return;
      }

      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        if (!res.ok) throw new Error("プロフィール取得失敗");
        const json = await res.json();
        if (!ignore) {
          setDisplayName(json.profile?.display_name?.trim() || null);
        }
      } catch (err) {
        console.error("プロフィール取得失敗:", err);
        if (!ignore) setDisplayName(null);
      }
    };

    fetchProfile();

    return () => {
      ignore = true;
    };
  }, [user]);

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

  // ✅ v62追加: Escキーで生成中断
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      const target = e.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName;
        if (
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          tagName === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      if (e.key === "Escape" && isLoading) {
        abortControllerRef.current?.abort();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isLoading]);

  const handleLogout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[handleLogout] signOut failed:", error.message);
      alert("ログアウトに失敗しました。もう一度お試しください。");
      return;
    }
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
      if (!res.ok) throw new Error("スレッド一覧の取得失敗");
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
    if (isTemporary && temporaryMessages.length > 0) {
      const ok = window.confirm("保存されていない一時メッセージは消去されます。よろしいですか？");
      if (!ok) return;
    }
    setIsTemporary(false);
    setTemporaryMessages([]);
    setActiveThreadId(id);
    setSearchMatchIds(matchedMessageIds ?? []);
    setSearchMatchIndex(0);
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

  useEffect(() => {
    const init = async () => {
      const latestThreads = await fetchThreads();
      const savedId = localStorage.getItem("lastActiveThreadId");
      if (savedId && latestThreads.some((t: Thread) => t.id === savedId)) {
        selectThread(savedId);
      }
      const url = new URL(window.location.href);
      const forkId = url.searchParams.get("fork");
      if (forkId) {
        url.searchParams.delete("fork");
        window.history.replaceState({}, "", url.toString());
        selectThread(forkId);
      }
      const threadParam = url.searchParams.get("thread");
      const msgParam = url.searchParams.get("msg");
      if (threadParam) {
        url.searchParams.delete("thread");
        if (msgParam) url.searchParams.delete("msg");
        window.history.replaceState({}, "", url.toString());
        await selectThread(threadParam, msgParam ? [msgParam] : undefined);
      }
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 検索 ─────────────────────────────────────────────────
  const handleSearch = useCallback(async (query: string, target: "title" | "message" | "both") => {
    if (!query.trim()) {
      setIsSearching(false);
      setSearchMatchIds([]);
      setSearchMatchIndex(0);
      setDisplayThreads(threads);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&target=${target}`, { cache: "no-store" });
      if (!res.ok) throw new Error("検索失敗");
      const data: (Thread & { matchedMessageIds?: string[] })[] = await res.json();
      setDisplayThreads(data);
    } catch (err) {
      console.error("検索失敗:", err);
    }
  }, [threads]);

  const handleMatchNavigate = useCallback((dir: "prev" | "next") => {
    setSearchMatchIndex((prev) => {
      if (searchMatchIds.length === 0) return 0;
      if (dir === "next") return (prev + 1) % searchMatchIds.length;
      return (prev - 1 + searchMatchIds.length) % searchMatchIds.length;
    });
  }, [searchMatchIds.length]);

  useEffect(() => {
    if (searchMatchIds.length === 0) return;
    const targetId = searchMatchIds[searchMatchIndex];
    if (!targetId) return;
    const timeoutId = setTimeout(() => {
      const el = document.getElementById(`msg-${targetId}`);
      if (el) el.scrollIntoView({ behavior: "auto", block: "center" });
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [searchMatchIndex, searchMatchIds]);

  // スレッド切り替え時: NovelSettingsペインのリセット＆キャッシュフェッチ
  useEffect(() => {
    setNovelSettingsData(null);
    setIsExtracting(false);
    if (activeThreadId) {
      fetch(`/api/extract-settings?thread_id=${activeThreadId}`)
        .then(r => r.json())
        .then(data => {
          const hasData = (data.characters?.length ?? 0) > 0
                       || (data.factions?.length ?? 0) > 0
                       || (data.glossary?.length ?? 0) > 0;
          if (hasData) setNovelSettingsData(data);
        })
        .catch(() => {});
    }
  }, [activeThreadId]);

  const handleClearSearch = useCallback(() => {
    setSearchMatchIds([]);
    setSearchMatchIndex(0);
    setIsSearching(false);
    setDisplayThreads(threads);
  }, [threads]);

  const handleNewThread = useCallback(() => {
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

  const handleNewThreadInFolder = useCallback(async (folderName: string) => {
    if (isTemporary && temporaryMessages.length > 0) {
      const ok = window.confirm("保存されていない一時メッセージは消去されます。よろしいですか？");
      if (!ok) return;
    }
    setIsTemporary(false);
    setTemporaryMessages([]);
    const id = uuidv4();
    try {
      const res = await fetch(`/api/threads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "新しい壁打ち", folder_name: folderName }),
      });
      if (!res.ok) {
        showToast("フォルダ内スレッドの作成に失敗しました", "error");
        return;
      }
      await fetchThreads();
      setActiveThreadId(id);
      setMessages([]);
      setInputValue("");
      setSearchMatchIds([]);
      setSearchMatchIndex(0);
      localStorage.setItem("lastActiveThreadId", id);
    } catch (err) {
      console.error("フォルダ内スレッド作成失敗:", err);
      showToast("フォルダ内スレッドの作成に失敗しました", "error");
    }
  }, [isTemporary, temporaryMessages, fetchThreads, showToast]);

  const handleDeleteThread = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/threads/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("スレッド削除失敗");
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
        showToast("スレッドの削除に失敗しました", "error");
      }
    },
    [activeThreadId, fetchThreads, showToast]
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
    setDisplayThreads((prev) =>
      prev.map((t) => t.id === threadId ? { ...t, folder_name: folderName } : t)
    );
  }, []);

  const handleTitleUpdate = useCallback((id: string, title: string) => {
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    setDisplayThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }, []);

  const handleThreadUpdate = useCallback((id: string, partial: Partial<Thread>) => {
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, ...partial } : t)));
    setDisplayThreads((prev) => prev.map((t) => (t.id === id ? { ...t, ...partial } : t)));
  }, []);

  const activeThread = useMemo(() => {
    const found = threads.find((t) => t.id === activeThreadId);
    if (found) return found;
    if (!activeThreadId) return null;
    return { id: activeThreadId, title: "新しい壁打ち", created_at: new Date().toISOString() };
  }, [threads, activeThreadId]);

  // ── 一時モード切り替え ────────────────────────────────────
  const handleSwitchTemporary = useCallback(async () => {
    if (!activeThreadId) return;

    if (!isTemporary) {
      setIsTemporary(true);
      setTemporaryMessages([]);
    } else {
      if (temporaryMessages.length === 0) {
        setIsTemporary(false);
        return;
      }
      const ok = window.confirm(`${temporaryMessages.length}件のメッセージをDBに保存して通常モードに戻しますか？`);
      if (!ok) return;

      setIsSaving(true);
      try {
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

        for (const msg of temporaryMessages) {
          await fetch("/api/chat", {
            method: "POST",
            headers: getApiKeyHeaders(),
            body: JSON.stringify({
              threadId: activeThreadId,
              messages: [],
              userContent: msg.content,
              provider: msg.provider === "memo" ? provider : (msg.provider as "claude" | "gemini" | "openai"),
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

  // ✅ v62追加: 中断ハンドラ（■ボタン用）
  const handleAbort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // ─── ストリーミング受信ヘルパー ──────────────────────────────────────────
  // 返り値: { userMessage, assistantMessage } or throws
  const fetchWithStreaming = useCallback(async (
    url: string,
    headers: Record<string, string>,
    body: string,
    onChunk: (text: string) => void,
  ): Promise<{
    userMessage: Message;
    assistantMessage: Message;
    aborted: boolean;
    thinkingContent?: string;
  }> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error("チャット応答取得失敗");
    }

    // Content-Typeがapplication/json → エラーまたはメモ応答（非ストリーミング）
    const contentType = res.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      return await res.json();
    }

    // ストリーミング受信
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let userMessage: Message | null = null;
    let assistantMessageId = "";
    let assistantThreadId = "";
    let assistantProvider = "";
    let assistantCreatedAt = "";
    let assistantModelId = "";
    let accumulatedText = "";
    let aborted = false;
    let deepThinkingMode = false;
    let thinkingAccumulated = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);

            if (parsed.type === "meta") {
              // 最初のchunk: メタデータ受信
              userMessage = parsed.userMessage as Message;
              assistantMessageId = parsed.assistantMessageId;
              assistantThreadId = parsed.threadId;
              assistantProvider = parsed.provider;
              assistantCreatedAt = parsed.createdAt;
              assistantModelId = parsed.modelId || "";
              deepThinkingMode = parsed.isDeepThinking ?? false;
            } else if (parsed.type === "chunk") {
              if (deepThinkingMode) {
                try {
                  const inner = JSON.parse(parsed.text);
                  if (inner.kind === "text") { accumulatedText += inner.text; onChunk(accumulatedText); }
                  else if (inner.kind === "thinking") { thinkingAccumulated += inner.text; }
                } catch { /* 分割チャンクは無視 */ }
              } else {
                accumulatedText += parsed.text;
                onChunk(accumulatedText);
              }
            } else if (parsed.type === "done") {
              aborted = parsed.aborted;
            } else if (parsed.type === "github_progress") {
              setGithubProgressMessages(prev => [...prev, parsed.text]);
            }
          } catch {
            // JSON parseエラーは無視
          }
        }
      }
    } catch (err) {
      // AbortError: 中断（正常）
      if ((err as Error).name === "AbortError") {
        aborted = true;
      } else {
        throw err;
      }
    }

    const assistantMessage: Message = {
      id: assistantMessageId || uuidv4(),
      thread_id: assistantThreadId || "",
      role: "assistant",
      content: accumulatedText,
      provider: (assistantProvider || "unknown") as "user" | "claude" | "gemini" | "openai" | "memo" | "unknown",
      created_at: assistantCreatedAt || new Date().toISOString(),
      model_id: assistantModelId || null,
    };

    return {
      userMessage: userMessage ?? {
        id: uuidv4(),
        thread_id: assistantThreadId || "",
        role: "user",
        content: "",
        provider: "user",
        created_at: new Date().toISOString(),
      },
      assistantMessage,
      aborted,
      thinkingContent: thinkingAccumulated || undefined,
    };
  }, []);

  // ── 通常送信 ──────────────────────────────────────────────
  const handleSubmit = useCallback(async (userContent: string, modelId?: ModelId, attachedImages?: SubmittedAttachedImageFile[], isDeepThinking?: boolean) => {
    if (!userContent.trim() || isLoading) return;
    if (provider === "image_gen") return;
    const resolvedThreadId = activeThreadId ?? uuidv4();
    const isAutoNewThread = !activeThreadId;

    if (isAutoNewThread) {
      setActiveThreadId(resolvedThreadId);
      setMessages([]);
      setSearchMatchIds([]);
      setSearchMatchIndex(0);
      localStorage.setItem("lastActiveThreadId", resolvedThreadId);
    }

    setInputValue("");
    setIsLoading(true);
    setStreamingContent(""); // ストリーミング表示をリセット

    const resolvedModelId: ModelId = modelId ?? loadModel(provider);

    if (isTemporary) {
      // 一時モード: メモリのみ（ストリーミングなし・既存動作を維持）
      const userMsg: Message = {
        id: uuidv4(),
        thread_id: resolvedThreadId,
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
            threadId: null,
            messages: allMessages.map(m => ({ role: m.role, content: m.content, provider: m.provider })),
            userContent,
            provider,
            modelId: resolvedModelId,
            systemPrompt: activeThread?.system_prompt ?? "",
            isTemporary: true,
            attachedImages: attachedImages ?? [],
          }),
        });
        if (!res.ok) {
          showToast("メッセージの送信に失敗しました", "error");
          return;
        }
        const { assistantMessage } = await res.json();
        const tempAssistant: Message = {
          ...assistantMessage,
          id: uuidv4(),
          thread_id: resolvedThreadId,
          created_at: new Date().toISOString(),
        };
        setTemporaryMessages((prev) => [...prev, tempAssistant]);
        setMessages((prev) => [...prev, tempAssistant]);
      } catch (err) {
        console.error("一時送信エラー:", err);
        showToast("メッセージの送信に失敗しました", "error");
      } finally {
        setIsLoading(false);
        setStreamingContent("");
        setGithubProgressMessages([]);
      }
      return;
    }

    // 通常モード: ストリーミング
    try {
      const { userMessage, assistantMessage, aborted, thinkingContent } = await fetchWithStreaming(
        "/api/chat",
        getApiKeyHeaders(),
        JSON.stringify({
          threadId: resolvedThreadId,
          messages: messages
            .filter(m => m.is_active !== false)
            .map(m => ({ role: m.role, content: m.content, provider: m.provider })),
          userContent,
          provider,
          modelId: resolvedModelId,
          systemPrompt: activeThread?.system_prompt ?? "",
          attachedImages: attachedImages ?? [],
          isDeepThinking: isDeepThinking ?? false,
          imageContextId: imageContextId ?? undefined,
        }),
        (accumulated) => {
          setStreamingContent(accumulated);
        },
      );

      if (thinkingContent && assistantMessage.id) {
        setThinkingContents(prev => ({ ...prev, [assistantMessage.id]: thinkingContent }));
      }

      if (!isImagePinned) setImageContextId(null)

      if (aborted && userMessage.id && assistantMessage.id) {
        // Escキャンセル時: 両メッセージをmemoとして楽観的更新
        setMessages((prev) => [
          ...prev,
          { ...userMessage, provider: "memo" as const },
          { ...assistantMessage, provider: "memo" as const },
        ]);
        // DB側も非同期でmemoに更新（fire-and-forget）
        Promise.all([
          fetch(`/api/threads/${resolvedThreadId}/messages/${userMessage.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "memo" }),
          }),
          fetch(`/api/threads/${resolvedThreadId}/messages/${assistantMessage.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "memo" }),
          }),
        ]).catch((err) => console.error("中断メモ化失敗:", err));
      } else {
        setMessages((prev) => [...prev, userMessage, assistantMessage]);
      }
      await fetchThreads();
    } catch (err) {
      console.error("送信エラー:", err);
      showToast("メッセージの送信に失敗しました", "error");
    } finally {
      setIsLoading(false);
      setStreamingContent("");
      setGithubProgressMessages([]);
    }
  }, [activeThreadId, isLoading, isTemporary, messages, temporaryMessages, fetchThreads, provider, activeThread, getApiKeyHeaders, fetchWithStreaming, imageContextId, isImagePinned, showToast]);

  // ── メモ送信（AIを呼ばない）──────────────────────────────
  const handleMemoSubmit = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;
    const resolvedThreadId = activeThreadId ?? uuidv4();
    const isAutoNewThread = !activeThreadId;

    if (isAutoNewThread) {
      setActiveThreadId(resolvedThreadId);
      setMessages([]);
      setSearchMatchIds([]);
      setSearchMatchIndex(0);
      localStorage.setItem("lastActiveThreadId", resolvedThreadId);
    }

    const userContent = inputValue.trim();
    setInputValue("");

    const optimisticMemo: Message = {
      id: uuidv4(),
      thread_id: resolvedThreadId,
      role: "user",
      content: userContent,
      provider: "memo",
      created_at: new Date().toISOString(),
    };

    if (isTemporary) {
      setTemporaryMessages((prev) => [...prev, optimisticMemo]);
      setMessages((prev) => [...prev, optimisticMemo]);
      return;
    }

    setMessages((prev) => [...prev, optimisticMemo]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: getApiKeyHeaders(),
        body: JSON.stringify({
          threadId: resolvedThreadId,
          messages: [...messages.map(m => ({ role: m.role, content: m.content, provider: m.provider }))],
          userContent,
          provider,
          isMemo: true,
        }),
      });
      if (!res.ok) {
        showToast("メモの送信に失敗しました", "error");
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMemo.id));
        return;
      }
      const { userMessage } = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === optimisticMemo.id ? userMessage : m)));
      await fetchThreads();
    } catch (err) {
      console.error("メモ保存エラー:", err);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMemo.id));
      showToast("メモの送信に失敗しました", "error");
    }
  }, [inputValue, activeThreadId, isLoading, isTemporary, messages, fetchThreads, provider, getApiKeyHeaders, showToast]);

  const handleSendMemoToAI = useCallback((content: string) => {
    setInputValue((prev) => (prev.trim() ? `${prev}\n\n${content}` : content));
  }, []);

  // ── 画像生成（/image コマンド）────────────────────────────
  const handleImageGenerate = useCallback(async (prompt: string, imageProvider?: string, imageRefId?: string, imageRefUpload?: { base64: string; mimeType: string; previewUrl: string }) => {
    if (isLoading) return
    const resolvedThreadId = activeThreadId ?? uuidv4()
    const isAutoNewThread = !activeThreadId

    if (isAutoNewThread) {
      setActiveThreadId(resolvedThreadId)
      setMessages([])
      setSearchMatchIds([])
      setSearchMatchIndex(0)
      localStorage.setItem("lastActiveThreadId", resolvedThreadId)
    }

    const PROVIDER_MAP: Record<string, ImageApiProvider> = {
      gemini: 'gemini',
      openai: 'openai',
      ideogram: 'ideogram',
      flux: 'openrouter',
    }
    const rawProvider = imageProvider
      ?? localStorage.getItem('kabehub_image_provider')
      ?? 'openai'
    const resolvedProvider = PROVIDER_MAP[rawProvider] ?? 'openai'
    const modelId = getDefaultImageModel(resolvedProvider)
    if (modelId === null) return

    setIsLoading(true)

    const headers: Record<string, string> = {
      ...getApiKeyHeaders(),
      'x-ideogram-api-key': localStorage.getItem('kabehub_ideogram_key') ?? '',
      'x-openrouter-api-key': localStorage.getItem('kabehub_openrouter_key') ?? '',
    }

    try {
      // ユーザー入力ログをDBに保存
      const memoRes = await fetch('/api/chat', {
        method: 'POST',
        headers: getApiKeyHeaders(),
        body: JSON.stringify({
          threadId: resolvedThreadId,
          messages: [],
          userContent: `/image ${prompt}`,
          provider,
          isMemo: true,
        }),
      })
      if (memoRes.ok) {
        const { userMessage } = await memoRes.json()
        setMessages(prev => [...prev, userMessage])
      }

      // 仮メッセージ（生成中表示）
      const pendingId = 'image-gen-pending'
      const pendingMessage: Message = {
        id: pendingId,
        thread_id: resolvedThreadId,
        role: 'assistant',
        provider: 'image_gen',
        content: prompt,
        created_at: new Date().toISOString(),
        metadata: { storagePath: null },
      }
      setMessages(prev => [...prev, pendingMessage])

      // 画像生成API呼び出し
      const res = await fetch('/api/image-gen', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          provider: resolvedProvider,
          prompt,
          modelId,
          threadId: resolvedThreadId,
          imageRefId: imageRefId ?? undefined,
          imageRefUpload: imageRefUpload
            ? { base64: imageRefUpload.base64, mimeType: imageRefUpload.mimeType }
            : undefined,
        }),
      })
      setImageRefId(null)
      setImageRefUpload(prev => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
        return null
      })

      const json = await res.json()
      if (!res.ok || json.error) {
        setMessages(prev => prev.filter(m => m.id !== pendingId))
        console.error('画像生成失敗:', json.error)
        showToast("画像の生成に失敗しました", "error")
        return
      }

      // 仮メッセージを正規メッセージに置換
      const realMessage: Message = {
        id: json.messageId,
        thread_id: resolvedThreadId,
        role: 'assistant',
        provider: 'image_gen',
        content: prompt,
        created_at: new Date().toISOString(),
        metadata: {
          storagePath: json.storagePath,
          mimeType: json.mimeType,
          image_deleted: false,
          width: null,
          height: null,
          seed: null,
        },
      }
      setMessages(prev => prev.map(m => m.id === pendingId ? realMessage : m))
      await fetchThreads()
    } catch (err) {
      console.error('画像生成エラー:', err)
      setMessages(prev => prev.filter(m => m.id !== 'image-gen-pending'))
      showToast("画像の生成に失敗しました", "error")
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, activeThreadId, provider, getApiKeyHeaders, fetchThreads, showToast])

  const handleDiscuss = useCallback((messageId: string) => {
    setImageContextId(messageId)
    setIsImagePinned(false)
  }, [])

  const handleImageRef = useCallback((messageId: string) => {
    setImageRefId(messageId)
    setImageRefUpload(prev => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
    setProvider('image_gen')
  }, [])

  const handleImageRefUpload = useCallback((data: { base64: string; mimeType: string; previewUrl: string }) => {
    setImageRefUpload(data)
    setImageRefId(null)
    setProvider('image_gen')
  }, [])

  // ── 再生成 ────────────────────────────────────────────────
  const handleRegenerate = useCallback(async (
    targetProvider: "claude" | "gemini" | "openai",
    assistantMsg?: Message,
    modelId?: string,
    mode: "branch" | "light" = "branch",
    editedUserContent?: string,
  ) => {
    if (isLoading || !activeThreadId) return;
    setIsLoading(true);
    setStreamingContent("");
    try {
      let lastAssistant: Message;
      let lastUser: Message | null = null;
      let newMessages: Message[];

      if (assistantMsg) {
        // コンテキストメニューから: ローカルstateを使用
        lastAssistant = assistantMsg;
        const idx = messages.findIndex((m) => m.id === assistantMsg.id);
        for (let i = idx - 1; i >= 0; i--) {
          if (messages[i].role === "user") { lastUser = messages[i]; break; }
        }
        if (!lastUser) { setIsLoading(false); return; }
        newMessages = messages.filter((m) => m.id !== lastAssistant.id);
      } else {
        // isLastボタンから: DBから最新を取得（既存挙動を維持）
        const res = await fetch(`/api/threads/${activeThreadId}/messages`, { cache: "no-store" });
        if (!res.ok) throw new Error("再生成失敗");
        const latestMessages: Message[] = await res.json();
        const activeLatestMessages = latestMessages.filter(m => m.is_active !== false);

        let lastAssistantIndex = -1;
        for (let i = activeLatestMessages.length - 1; i >= 0; i--) {
          if (activeLatestMessages[i].role === "assistant") { lastAssistantIndex = i; break; }
        }
        if (lastAssistantIndex === -1) { setIsLoading(false); return; }

        lastAssistant = activeLatestMessages[lastAssistantIndex];
        for (let i = lastAssistantIndex - 1; i >= 0; i--) {
          if (activeLatestMessages[i].role === "user") { lastUser = activeLatestMessages[i]; break; }
        }
        if (!lastUser) { setIsLoading(false); return; }
        newMessages = activeLatestMessages.filter((m) => m.id !== lastAssistant.id);
      }

      const branchId = mode === "branch" ? crypto.randomUUID() : undefined;
      const userContentToSend = editedUserContent ?? lastUser.content;
      const userContentChanged = editedUserContent != null && editedUserContent !== lastUser.content;
      const originalAssistantContent = lastAssistant.content;
      const originalAssistantModelId = lastAssistant.model_id;

      if (mode === "branch") {
        // DBで is_active: false に更新（削除しない）
        await fetch(`/api/threads/${activeThreadId}/messages/${lastAssistant.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: false, branch_id: branchId }),
        });

        // フロントのstateでも is_active: false に更新（削除しない）
        setMessages(prev =>
          prev.map(m =>
            m.id === lastAssistant.id
              ? { ...m, is_active: false, branch_id: branchId }
              : m
          )
        );
      }

      const { assistantMessage, aborted } = await fetchWithStreaming(
        "/api/chat",
        getApiKeyHeaders(),
        JSON.stringify({
          threadId: activeThreadId,
          messages: newMessages
            .filter(m => m.is_active !== false)
            .map(m => ({ role: m.role, content: m.content, provider: m.provider })),
          userContent: userContentToSend,
          provider: targetProvider,
          modelId: modelId,
          isRegenerate: true,
          regenerateMode: mode,
          ...(mode === "light" ? { targetMessageId: lastAssistant.id } : {}),
          ...(userContentChanged ? { targetUserMessageId: lastUser.id } : {}),
          systemPrompt: activeThread?.system_prompt ?? "",
        }),
        (accumulated) => {
          setStreamingContent(accumulated);
        },
      );

      if (mode === "light") {
        setMessages(prev => prev.map(m => {
          if (m.id === lastAssistant.id) {
            if (aborted) {
              return { ...m, content: originalAssistantContent, model_id: originalAssistantModelId };
            }
            return { ...m, content: assistantMessage.content, model_id: assistantMessage.model_id };
          }
          if (userContentChanged && m.id === lastUser.id) {
            return { ...m, content: userContentToSend };
          }
          return m;
        }));
      } else if (aborted) {
        const assistantMemo = {
          ...assistantMessage,
          provider: "memo" as const,
          branch_id: branchId,
          is_active: true,
        };
        setMessages((prev) => [...prev, assistantMemo]);

        if (assistantMessage.id) {
          fetch(`/api/threads/${activeThreadId}/messages/${assistantMessage.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "memo" }),
          }).catch((err) => console.error("分岐再生成中断メモ化失敗:", err));
        }
      } else {
        setMessages((prev) => [...prev, { ...assistantMessage, branch_id: branchId, is_active: true }]);
      }
    } catch (err) {
      console.error("再生成失敗:", err);
    } finally {
      setIsLoading(false);
      setStreamingContent("");
      setGithubProgressMessages([]);
    }
  }, [isLoading, activeThreadId, activeThread, messages, getApiKeyHeaders, fetchWithStreaming]);

  const handleEditAndRegenerate = useCallback(async (
    baseUserMsg: Message,
    editedContent: string,
    targetProvider: "claude" | "gemini" | "openai",
    modelId?: string,
  ) => {
    if (isLoading || !activeThreadId) return;
    setIsLoading(true);
    setStreamingContent("");
    try {
      const { assistantMessage, aborted, thinkingContent } = await fetchWithStreaming(
        "/api/chat",
        getApiKeyHeaders(),
        JSON.stringify({
          threadId: activeThreadId,
          userContent: editedContent,
          provider: targetProvider,
          modelId: modelId,
          branchEdit: { baseUserMessageId: baseUserMsg.id },
          systemPrompt: activeThread?.system_prompt ?? "",
        }),
        (accumulated) => {
          setStreamingContent(accumulated);
        },
      );

      if (thinkingContent && assistantMessage.id) {
        setThinkingContents(prev => ({ ...prev, [assistantMessage.id]: thinkingContent }));
      }

      if (aborted && assistantMessage.id) {
        await fetch(`/api/threads/${activeThreadId}/messages/${assistantMessage.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "memo" }),
        });
      }

      const res = await fetch(`/api/threads/${activeThreadId}/messages`, { cache: "no-store" });
      if (!res.ok) {
        showToast("編集と再生成に失敗しました", "error");
        return;
      }
      const freshMessages: Message[] = await res.json();
      setMessages(freshMessages);
      await fetchThreads();
    } catch (err) {
      console.error("編集再生成失敗:", err);
      showToast("編集と再生成に失敗しました", "error");
    } finally {
      setIsLoading(false);
      setStreamingContent("");
      setGithubProgressMessages([]);
    }
  }, [isLoading, activeThreadId, activeThread, getApiKeyHeaders, fetchWithStreaming, fetchThreads, showToast]);

  // ── タイムトラベル削除 ──────────────────────────────────
  const handleTrimFrom = useCallback(async (message: Message) => {
    if (!activeThreadId) return;
    setIsLoading(true);

    const index = messages.findIndex((m) => m.id === message.id);
    const snapshot = messages;
    setMessages(snapshot.slice(0, index));

    try {
      const res = await fetch(`/api/threads/${activeThreadId}/messages`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromCreatedAt: message.created_at }),
      });
      if (!res.ok) {
        const restored = await fetch(`/api/threads/${activeThreadId}/messages`, { cache: "no-store" });
        if (restored.ok) {
          setMessages(await restored.json());
        } else {
          setMessages(snapshot);
        }
        showToast("削除に失敗しました", "error");
      }
    } catch (err) {
      console.error("タイムトラベル削除失敗:", err);
      try {
        const restored = await fetch(`/api/threads/${activeThreadId}/messages`, { cache: "no-store" });
        if (restored.ok) {
          setMessages(await restored.json());
        } else {
          setMessages(snapshot);
        }
      } catch (restoreErr) {
        console.error("メッセージ復元失敗:", restoreErr);
        setMessages(snapshot);
      }
      showToast("削除に失敗しました", "error");
    } finally {
      setIsLoading(false);
    }
  }, [activeThreadId, messages, showToast]);

  // ── メッセージ単体削除 ──────────────────────────────────
  const handleDeleteMessage = useCallback(async (message: Message) => {
    if (!activeThreadId) return;
    const originalIndex = messages.findIndex((m) => m.id === message.id);
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
    try {
      const res = await fetch(`/api/threads/${activeThreadId}/messages/${message.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("メッセージ削除失敗");
    } catch (err) {
      console.error("メッセージ削除失敗:", err);
      setMessages((prev) => {
        if (originalIndex < 0 || prev.some((m) => m.id === message.id)) return prev;
        return [
          ...prev.slice(0, originalIndex),
          message,
          ...prev.slice(originalIndex),
        ];
      });
      showToast("メッセージの削除に失敗しました", "error");
    }
  }, [activeThreadId, messages, showToast]);

  // ── 画像ファイル削除（tombstone）──────────────────────────
  const handleDeleteImage = useCallback(async (message: Message) => {
    const prevMetadata = message.metadata;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? { ...m, metadata: { ...m.metadata, storagePath: null, image_deleted: true } }
          : m
      )
    );
    const wasCurrentImageContext = imageContextId === message.id;
    const wasPinned = isImagePinned;
    if (wasCurrentImageContext) {
      setImageContextId(null);
      setIsImagePinned(false);
    }
    try {
      const res = await fetch(`/api/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_image" }),
      });
      if (!res.ok) throw new Error("画像削除失敗");
    } catch (err) {
      console.error("画像削除失敗:", err);
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, metadata: prevMetadata } : m))
      );
      if (wasCurrentImageContext) {
        setImageContextId(message.id);
        setIsImagePinned(wasPinned);
      }
      showToast("画像の削除に失敗しました", "error");
    }
  }, [imageContextId, isImagePinned, showToast]);

  // ── メッセージをメモ化 ──────────────────────────────────
  const handleMemoizeMessage = useCallback(async (message: Message) => {
    if (!activeThreadId) return;
    const prevProvider = message.provider;
    setMessages((prev) =>
      prev.map((m) => m.id === message.id ? { ...m, provider: "memo" as const } : m)
    );
    try {
      const res = await fetch(`/api/threads/${activeThreadId}/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "memo" }),
      });
      if (!res.ok) throw new Error("メモ化失敗");
    } catch (err) {
      console.error("メモ化失敗:", err);
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, provider: prevProvider } : m))
      );
      showToast("メモ化に失敗しました", "error");
    }
  }, [activeThreadId, showToast]);

  // ── ブランチ復元 ──────────────────────────────────────────
  const handleRestoreBranch = useCallback(async (branchRootId: string, branchIndex: number) => {
    if (!activeThreadId) return;

    try {
      await fetch(`/api/threads/${activeThreadId}/messages/restore-branch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchRootId, branchIndex }),
      });

      // DBから最新のmessagesを再取得して表示を更新
      const res = await fetch(`/api/threads/${activeThreadId}/messages`, { cache: "no-store" });
      if (res.ok) {
        const data: Message[] = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error("ブランチ復元失敗:", err);
    }
  }, [activeThreadId]);

  // ── セルフコピペ ──────────────────────────────────────────
  const handleCopyThread = useCallback(async (threadId: string) => {
    try {
      const res = await fetch(`/api/threads/${threadId}/copy`, { method: 'POST' });
      if (!res.ok) throw new Error('コピー失敗');
      const { thread: newThread } = await res.json();
      await fetchThreads();
      selectThread(newThread.id);
    } catch (err) {
      console.error('コピー失敗:', err);
      alert('コピーに失敗しました');
    }
  }, [fetchThreads, selectThread]);

  const handleBranchToNewChat = useCallback(async (message: Message) => {
    if (!activeThreadId) return;
    try {
      const res = await fetch(`/api/threads/${activeThreadId}/branch-to`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchorMessageId: message.id }),
      });
      if (!res.ok) throw new Error('分岐失敗');
      const { thread: newThread } = await res.json();
      await fetchThreads();
      selectThread(newThread.id);
    } catch (err) {
      console.error('分岐失敗:', err);
      alert('分岐に失敗しました');
    }
  }, [activeThreadId, fetchThreads, selectThread]);

  // ── Novel設定抽出 ──────────────────────────────────────────
  const handleExtractSettings = async () => {
    if (isExtracting || !activeThreadId) return;
    const anthropicKey = localStorage.getItem("kabehub_anthropic_key") ?? "";
    if (!anthropicKey) {
      alert("AnthropicのAPIキーを設定してください（ヘッダーの「🔑 APIキー」から設定できます）");
      return;
    }
    setIsExtracting(true);
    setIsNovelPaneOpen(true);
    setIsOutlineOpen(false);
    try {
      const res = await fetch("/api/extract-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-anthropic-api-key": anthropicKey,
        },
        body: JSON.stringify({
          threadId: activeThreadId,
          messages: messages
            .filter(m => m.provider !== "memo")
            .map(m => ({ role: m.role, content: m.content })),
          folderName: threads.find(t => t.id === activeThreadId)?.folder_name ?? undefined,
        }),
      });
      if (!res.ok) throw new Error("抽出失敗");
      const data = await res.json();
      setNovelSettingsData(data);
    } catch (err) {
      console.error("設定抽出失敗:", err);
      alert("設定の抽出に失敗しました。APIキーとネットワーク接続を確認してください。");
    } finally {
      setIsExtracting(false);
    }
  };

  // ── メッセージ更新（is_hidden / content マスク編集）──────────
  const handleUpdateMessage = useCallback(async (messageId: string, updates: { content?: string; is_hidden?: boolean }) => {
    const res = await fetch(`/api/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("更新失敗");
    setMessages((prev) =>
      prev.map((m) => m.id === messageId ? { ...m, ...updates } : m)
    );
  }, []);

  const handleNovelPaneToggle = () => {
    setIsNovelPaneOpen(v => !v);
    if (!isNovelPaneOpen) setIsOutlineOpen(false);
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <style>{`
        @media (max-width: 767px) {
          aside[data-sidebar-overlay="false"] {
            display: none !important;
          }
        }
      `}</style>
      {isSaving && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999, color: "white", fontSize: "16px", gap: "12px"
        }}>
          <span>⏳</span> 一時メッセージを保存中...
        </div>
      )}
      {isMobileViewport && isMobileSidebarOpen && (
        <div
          aria-hidden="true"
          onClick={() => setIsMobileSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.35)",
          }}
        />
      )}
      {(!isMobileViewport || isMobileSidebarOpen) && (
        <Sidebar
          threads={displayThreads}
          activeThreadId={activeThreadId}
          onSelectThread={(id: string) => {
            const thread = displayThreads.find((t) => t.id === id) as (typeof displayThreads[0] & { matchedMessageIds?: string[] }) | undefined;
            selectThread(id, thread?.matchedMessageIds);
            if (isMobileViewport) setIsMobileSidebarOpen(false);
          }}
          onNewThread={() => {
            handleNewThread();
            if (isMobileViewport) setIsMobileSidebarOpen(false);
          }}
          onDeleteThread={handleDeleteThread}
          onSearch={handleSearch}
          isSearching={isSearching}
          user={user}
          onLogout={handleLogout}
          onUpdateFolder={handleUpdateFolder}
          onNewThreadInFolder={(folderName: string) => {
            handleNewThreadInFolder(folderName);
            if (isMobileViewport) setIsMobileSidebarOpen(false);
          }}
          isMobileOverlay={isMobileViewport}
          isCollapsed={!isMobileViewport && isSidebarCollapsed}
          onToggleCollapse={() => {
            setIsSidebarCollapsed((v) => {
              const next = !v;
              localStorage.setItem("kabehub_sidebar_collapsed", String(next));
              return next;
            });
          }}
        />
      )}
      <ChatPanel
        thread={activeThread}
        messages={messages}
        displayName={displayName}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSubmit={handleSubmit}
        onMemoSubmit={handleMemoSubmit}
        isLoading={isLoading}
        provider={provider}
        onProviderChange={setProvider}
        onTitleUpdate={handleTitleUpdate}
        onThreadUpdate={handleThreadUpdate}
        onRegenerate={handleRegenerate}
        onEditAndRegenerate={handleEditAndRegenerate}
        onTrimFrom={handleTrimFrom}
        onDeleteMessage={handleDeleteMessage}
        onDeleteImage={handleDeleteImage}
        onMemoizeMessage={handleMemoizeMessage}
        isTemporary={isTemporary}
        onSwitchTemporary={handleSwitchTemporary}
        onCopyThread={handleCopyThread}
        onBranchToNewChat={handleBranchToNewChat}
        searchMatchIds={searchMatchIds}
        searchMatchIndex={searchMatchIndex}
        onMatchNavigate={handleMatchNavigate}
        onClearSearch={handleClearSearch}
        onUpdateMessage={handleUpdateMessage}
        // ✅ v62追加
        streamingContent={streamingContent}
        githubProgressMessages={githubProgressMessages}
        onAbort={handleAbort}
        onSendMemoToAI={handleSendMemoToAI}
        thinkingContents={thinkingContents}
        onRestoreBranch={handleRestoreBranch}
        onImageGenerate={handleImageGenerate}
        onDiscuss={handleDiscuss}
        imageContextId={imageContextId}
        isImagePinned={isImagePinned}
        onImagePinToggle={() => setIsImagePinned(v => !v)}
        onImageContextClear={() => { setImageContextId(null); setIsImagePinned(false) }}
        onImageRef={handleImageRef}
        imageRefId={imageRefId}
        onImageRefClear={() => setImageRefId(null)}
        imageRefUpload={imageRefUpload}
        onImageRefUpload={handleImageRefUpload}
        onImageRefUploadClear={() => setImageRefUpload(prev => {
          if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
          return null
        })}
        hasMobileSidebarButton={isMobileViewport}
        onMobileSidebarOpen={() => setIsMobileSidebarOpen(true)}
      />
      <OutlinePane
        messages={messages}
        isOpen={isOutlineOpen}
        onToggle={() => {
          setIsOutlineOpen((v) => !v);
          setIsNovelPaneOpen(false);
        }}
      />
      <NovelSettingsPane
        threadId={activeThreadId}
        threadTitle={threads.find(t => t.id === activeThreadId)?.title ?? undefined}
        folderName={threads.find(t => t.id === activeThreadId)?.folder_name ?? null}
        isOpen={isNovelPaneOpen}
        onToggle={handleNovelPaneToggle}
        isExtracting={isExtracting}
        settingsData={novelSettingsData}
        onExtract={handleExtractSettings}
      />
    </div>
  );
}
