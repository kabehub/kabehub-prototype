"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  buildApiKeyHeaders,
  type ApiKeyProvider,
  type Message,
  type ModelId,
  type TextProvider,
  type Thread,
} from "@kabehub/shared";

import ChatPanel from "../../components/ChatPanel";
import Sidebar from "../../components/Sidebar";
import { ToastProvider, useToast } from "../../components/Toast";
import { mobileAccessTokenProvider } from "../../lib/accessTokenProvider";
import { createMobileApiClient } from "../../lib/api-client";
import { mobileApiKeyStore } from "../../lib/apiKeyStore";
import { loadModel } from "../../lib/modelRegistry";
import { supabase } from "../../lib/supabase/client";

type AuthState =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "signedIn"; session: Session };

type StreamingResult = {
  userMessage: Message;
  assistantMessage: Message;
  aborted: boolean;
  thinkingContent?: string;
};

const API_KEY_PROVIDERS: readonly ApiKeyProvider[] = [
  "claude",
  "gemini",
  "openai",
];

const apiClient = createMobileApiClient(mobileAccessTokenProvider);

export default function ChatPage() {
  const [authState, setAuthState] = useState<AuthState>({ kind: "loading" });

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setAuthState(
        !error && data.session
          ? { kind: "signedIn", session: data.session }
          : { kind: "signedOut" }
      );
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "INITIAL_SESSION" || !active) return;
        setAuthState(
          session
            ? { kind: "signedIn", session }
            : { kind: "signedOut" }
        );
      }
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (authState.kind !== "signedIn") {
    return (
      <main className="chat-auth-page">
        <section className="chat-auth-card">
          <h1>壁打ち</h1>
          {authState.kind === "loading" ? (
            <p>ログイン状態を確認中…</p>
          ) : (
            <>
              <p>壁打ちを利用するにはログインしてください。</p>
              <Link href="/">ホームへ戻る</Link>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <ToastProvider>
      <ChatWorkspace session={authState.session} />
    </ToastProvider>
  );
}

function ChatWorkspace({ session }: { session: Session }) {
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
  const [provider, setProvider] = useState<TextProvider>("claude");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [githubProgressMessages, setGithubProgressMessages] = useState<string[]>(
    []
  );
  const [thinkingContents, setThinkingContents] = useState<
    Record<string, string>
  >({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let ignore = false;

    const loadProfile = async () => {
      try {
        const res = await apiClient.request("/api/profile", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("プロフィール取得失敗");
        const data = await res.json();
        if (!ignore) {
          setDisplayName(data.profile?.display_name?.trim() || null);
        }
      } catch (error) {
        console.error("プロフィール取得失敗:", error);
        if (!ignore) setDisplayName(null);
      }
    };

    void loadProfile();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape" || !isLoading) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable)
      ) {
        return;
      }
      abortControllerRef.current?.abort();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLoading]);

  const getApiKeyHeaders = useCallback(
    async (): Promise<Record<string, string>> => ({
      "Content-Type": "application/json",
      ...(await buildApiKeyHeaders(mobileApiKeyStore, API_KEY_PROVIDERS)),
    }),
    []
  );

  const fetchThreads = useCallback(async (): Promise<Thread[]> => {
    try {
      const res = await apiClient.request("/api/threads", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("スレッド一覧の取得失敗");
      const data: Thread[] = await res.json();
      setThreads(data);
      setDisplayThreads(data);
      return data;
    } catch (error) {
      console.error("スレッド一覧の取得失敗:", error);
      return [];
    }
  }, []);

  const selectThread = useCallback(
    async (id: string, matchedMessageIds?: string[]) => {
      setActiveThreadId(id);
      setSearchMatchIds(matchedMessageIds ?? []);
      setSearchMatchIndex(0);
      setInputValue("");
      localStorage.setItem("lastActiveThreadId", id);
      try {
        const res = await apiClient.request(
          `/api/threads/${id}/messages`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("メッセージ取得失敗");
        const data: Message[] = await res.json();
        setMessages(data);
      } catch (error) {
        console.error("会話読み込みエラー:", error);
        setMessages([]);
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      const latestThreads = await fetchThreads();
      if (cancelled) return;

      const url = new URL(window.location.href);
      const requestedThreadId =
        url.searchParams.get("thread") ?? url.searchParams.get("fork");
      const requestedMessageId = url.searchParams.get("msg");
      const savedThreadId = localStorage.getItem("lastActiveThreadId");
      const initialThreadId =
        requestedThreadId ??
        (savedThreadId &&
        latestThreads.some((thread) => thread.id === savedThreadId)
          ? savedThreadId
          : null);

      if (requestedThreadId) {
        url.searchParams.delete("thread");
        url.searchParams.delete("fork");
        url.searchParams.delete("msg");
        window.history.replaceState({}, "", url.toString());
      }

      if (initialThreadId && !cancelled) {
        await selectThread(
          initialThreadId,
          requestedMessageId ? [requestedMessageId] : undefined
        );
      }
    };

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [fetchThreads, selectThread]);

  useEffect(() => {
    if (searchMatchIds.length === 0) return;
    const targetId = searchMatchIds[searchMatchIndex];
    if (!targetId) return;
    const timeoutId = window.setTimeout(() => {
      document
        .getElementById('msg-' + targetId)
        ?.scrollIntoView({ behavior: "auto", block: "center" });
    }, 50);
    return () => window.clearTimeout(timeoutId);
  }, [searchMatchIds, searchMatchIndex]);

  const handleSearch = useCallback(
    async (query: string, target: "title" | "message" | "both") => {
      if (!query.trim()) {
        setIsSearching(false);
        setSearchMatchIds([]);
        setSearchMatchIndex(0);
        setDisplayThreads(threads);
        return;
      }

      setIsSearching(true);
      try {
        const res = await apiClient.request(
          `/api/search?q=${encodeURIComponent(query)}&target=${target}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("検索失敗");
        const data: (Thread & { matchedMessageIds?: string[] })[] =
          await res.json();
        setDisplayThreads(data);
      } catch (error) {
        console.error("検索失敗:", error);
        showToast("検索に失敗しました", "error");
      }
    },
    [showToast, threads]
  );

  const handleMatchNavigate = useCallback(
    (direction: "prev" | "next") => {
      setSearchMatchIndex((current) => {
        if (searchMatchIds.length === 0) return 0;
        return direction === "next"
          ? (current + 1) % searchMatchIds.length
          : (current - 1 + searchMatchIds.length) % searchMatchIds.length;
      });
    },
    [searchMatchIds.length]
  );

  const handleClearSearch = useCallback(() => {
    setSearchMatchIds([]);
    setSearchMatchIndex(0);
    setIsSearching(false);
    setDisplayThreads(threads);
  }, [threads]);

  const handleNewThread = useCallback(() => {
    setActiveThreadId(crypto.randomUUID());
    setMessages([]);
    setInputValue("");
    setSearchMatchIds([]);
    setSearchMatchIndex(0);
    localStorage.removeItem("lastActiveThreadId");
  }, []);

  const handleNewThreadInFolder = useCallback(
    async (folderName: string) => {
      const id = crypto.randomUUID();
      try {
        const res = await apiClient.request(`/api/threads/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "新しい壁打ち",
            folder_name: folderName,
          }),
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
      } catch (error) {
        console.error("フォルダ内スレッド作成失敗:", error);
        showToast("フォルダ内スレッドの作成に失敗しました", "error");
      }
    },
    [fetchThreads, showToast]
  );

  const handleDeleteThread = useCallback(
    async (id: string) => {
      try {
        const res = await apiClient.request(`/api/threads/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("スレッド削除失敗");
        if (activeThreadId === id) {
          setActiveThreadId(null);
          setMessages([]);
          localStorage.removeItem("lastActiveThreadId");
        }
        await fetchThreads();
      } catch (error) {
        console.error("削除失敗:", error);
        showToast("スレッドの削除に失敗しました", "error");
      }
    },
    [activeThreadId, fetchThreads, showToast]
  );

  const handleUpdateFolder = useCallback(
    async (threadId: string, folderName: string | null) => {
      try {
        const res = await apiClient.request(`/api/threads/${threadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder_name: folderName }),
        });
        if (!res.ok) {
          showToast("フォルダの更新に失敗しました", "error");
          return;
        }
        setThreads((current) =>
          current.map((thread) =>
            thread.id === threadId
              ? { ...thread, folder_name: folderName }
              : thread
          )
        );
        setDisplayThreads((current) =>
          current.map((thread) =>
            thread.id === threadId
              ? { ...thread, folder_name: folderName }
              : thread
          )
        );
      } catch {
        showToast("フォルダの更新に失敗しました", "error");
      }
    },
    [showToast]
  );

  const handleTitleUpdate = useCallback((id: string, title: string) => {
    setThreads((current) =>
      current.map((thread) =>
        thread.id === id ? { ...thread, title } : thread
      )
    );
    setDisplayThreads((current) =>
      current.map((thread) =>
        thread.id === id ? { ...thread, title } : thread
      )
    );
  }, []);

  const activeThread = useMemo<Thread | null>(() => {
    const existing = threads.find((thread) => thread.id === activeThreadId);
    if (existing) return existing;
    if (!activeThreadId) return null;
    return {
      id: activeThreadId,
      title: "新しい壁打ち",
      created_at: new Date().toISOString(),
    };
  }, [activeThreadId, threads]);

  const handleAbort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const requestStreamingChat = useCallback(
    async (
      path: `/api/${string}`,
      headers: Record<string, string>,
      body: string,
      onChunk: (text: string) => void
    ): Promise<StreamingResult> => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const res = await apiClient.request(path, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("チャット応答取得失敗");

      const contentType = res.headers.get("Content-Type") ?? "";
      if (contentType.includes("application/json")) {
        return (await res.json()) as StreamingResult;
      }
      if (!res.body) throw new Error("ストリームを取得できません");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let userMessage: Message | null = null;
      let assistantMessageId = "";
      let assistantThreadId = "";
      let assistantProvider: Message["provider"] = "unknown";
      let assistantCreatedAt = "";
      let assistantModelId = "";
      let accumulatedText = "";
      let thinkingAccumulated = "";
      let deepThinkingMode = false;
      let aborted = false;

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
                userMessage = parsed.userMessage as Message;
                assistantMessageId = parsed.assistantMessageId;
                assistantThreadId = parsed.threadId;
                assistantProvider = parsed.provider || "unknown";
                assistantCreatedAt = parsed.createdAt;
                assistantModelId = parsed.modelId || "";
                deepThinkingMode = parsed.isDeepThinking ?? false;
              } else if (parsed.type === "chunk") {
                if (deepThinkingMode) {
                  try {
                    const inner = JSON.parse(parsed.text);
                    if (inner.kind === "text") {
                      accumulatedText += inner.text;
                      onChunk(accumulatedText);
                    } else if (inner.kind === "thinking") {
                      thinkingAccumulated += inner.text;
                    }
                  } catch {
                    // 分割されたdeep-thinking chunkは次の行まで保留しない。
                  }
                } else {
                  accumulatedText += parsed.text;
                  onChunk(accumulatedText);
                }
              } else if (parsed.type === "done") {
                aborted = parsed.aborted;
              } else if (parsed.type === "github_progress") {
                setGithubProgressMessages((current) => [
                  ...current,
                  parsed.text,
                ]);
              }
            } catch {
              // JSON Lines以外の断片は無視する。
            }
          }
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          aborted = true;
        } else {
          throw error;
        }
      }

      return {
        userMessage:
          userMessage ?? {
            id: crypto.randomUUID(),
            thread_id: assistantThreadId,
            role: "user",
            content: "",
            provider: "user",
            created_at: new Date().toISOString(),
          },
        assistantMessage: {
          id: assistantMessageId || crypto.randomUUID(),
          thread_id: assistantThreadId,
          role: "assistant",
          content: accumulatedText,
          provider: assistantProvider,
          created_at: assistantCreatedAt || new Date().toISOString(),
          model_id: assistantModelId || null,
        },
        aborted,
        thinkingContent: thinkingAccumulated || undefined,
      };
    },
    []
  );

  const handleSubmit = useCallback(
    async (
      userContent: string,
      modelId?: ModelId,
      isDeepThinking?: boolean
    ) => {
      if (!userContent.trim() || isLoading) return;
      const resolvedThreadId = activeThreadId ?? crypto.randomUUID();

      if (!activeThreadId) {
        setActiveThreadId(resolvedThreadId);
        setMessages([]);
        setSearchMatchIds([]);
        setSearchMatchIndex(0);
        localStorage.setItem("lastActiveThreadId", resolvedThreadId);
      }

      setInputValue("");
      setIsLoading(true);
      setStreamingContent("");

      try {
        const result = await requestStreamingChat(
          "/api/chat",
          await getApiKeyHeaders(),
          JSON.stringify({
            threadId: resolvedThreadId,
            messages: messages
              .filter((message) => message.is_active !== false)
              .map((message) => ({
                role: message.role,
                content: message.content,
                provider: message.provider,
              })),
            userContent,
            provider,
            modelId: modelId ?? loadModel(provider),
            systemPrompt: activeThread?.system_prompt ?? "",
            isDeepThinking: isDeepThinking ?? false,
          }),
          setStreamingContent
        );

        if (result.thinkingContent && result.assistantMessage.id) {
          setThinkingContents((current) => ({
            ...current,
            [result.assistantMessage.id]: result.thinkingContent as string,
          }));
        }

        if (
          result.aborted &&
          result.userMessage.id &&
          result.assistantMessage.id
        ) {
          setMessages((current) => [
            ...current,
            { ...result.userMessage, provider: "memo" },
            { ...result.assistantMessage, provider: "memo" },
          ]);

          void Promise.all([
            apiClient.request(
              `/api/threads/${resolvedThreadId}/messages/${result.userMessage.id}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider: "memo" }),
              }
            ),
            apiClient.request(
              `/api/threads/${resolvedThreadId}/messages/${result.assistantMessage.id}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider: "memo" }),
              }
            ),
          ]).catch((error) => console.error("中断メモ化失敗:", error));
        } else {
          setMessages((current) => [
            ...current,
            result.userMessage,
            result.assistantMessage,
          ]);
        }
        await fetchThreads();
      } catch (error) {
        console.error("送信エラー:", error);
        showToast("メッセージの送信に失敗しました", "error");
      } finally {
        abortControllerRef.current = null;
        setIsLoading(false);
        setStreamingContent("");
        setGithubProgressMessages([]);
      }
    },
    [
      activeThread,
      activeThreadId,
      fetchThreads,
      getApiKeyHeaders,
      isLoading,
      messages,
      provider,
      requestStreamingChat,
      showToast,
    ]
  );

  const handleRegenerate = useCallback(
    async (
      targetProvider: TextProvider,
      assistantMessage?: Message,
      modelId?: string
    ) => {
      if (isLoading || !activeThreadId) return;
      setIsLoading(true);
      setStreamingContent("");

      try {
        let targetAssistant: Message;
        let precedingUser: Message | null = null;
        let contextMessages: Message[];

        if (assistantMessage) {
          targetAssistant = assistantMessage;
          const assistantIndex = messages.findIndex(
            (message) => message.id === assistantMessage.id
          );
          for (let index = assistantIndex - 1; index >= 0; index -= 1) {
            const candidate = messages[index];
            if (
              candidate.role === "user" &&
              candidate.is_active !== false
            ) {
              precedingUser = candidate;
              break;
            }
          }
          contextMessages = messages.filter(
            (message) =>
              message.id !== targetAssistant.id &&
              message.is_active !== false
          );
        } else {
          const res = await apiClient.request(
            `/api/threads/${activeThreadId}/messages`,
            { cache: "no-store" }
          );
          if (!res.ok) throw new Error("再生成失敗");
          const latestMessages: Message[] = await res.json();
          const activeMessages = latestMessages.filter(
            (message) => message.is_active !== false
          );
          const assistantIndex = activeMessages.findLastIndex(
            (message) => message.role === "assistant"
          );
          if (assistantIndex < 0) return;
          targetAssistant = activeMessages[assistantIndex];
          for (let index = assistantIndex - 1; index >= 0; index -= 1) {
            if (activeMessages[index].role === "user") {
              precedingUser = activeMessages[index];
              break;
            }
          }
          contextMessages = activeMessages.filter(
            (message) => message.id !== targetAssistant.id
          );
        }

        if (!precedingUser) return;
        const previousContent = targetAssistant.content;
        const previousModelId = targetAssistant.model_id;
        const result = await requestStreamingChat(
          "/api/chat",
          await getApiKeyHeaders(),
          JSON.stringify({
            threadId: activeThreadId,
            messages: contextMessages.map((message) => ({
              role: message.role,
              content: message.content,
              provider: message.provider,
            })),
            userContent: precedingUser.content,
            provider: targetProvider,
            modelId,
            isRegenerate: true,
            regenerateMode: "light",
            targetMessageId: targetAssistant.id,
            systemPrompt: activeThread?.system_prompt ?? "",
          }),
          setStreamingContent
        );

        if (result.thinkingContent && result.assistantMessage.id) {
          setThinkingContents((current) => ({
            ...current,
            [result.assistantMessage.id]: result.thinkingContent as string,
          }));
        }

        setMessages((current) =>
          current.map((message) =>
            message.id === targetAssistant.id
              ? result.aborted
                ? {
                    ...message,
                    content: previousContent,
                    model_id: previousModelId,
                  }
                : {
                    ...message,
                    content: result.assistantMessage.content,
                    model_id: result.assistantMessage.model_id,
                  }
              : message
          )
        );
        if (!result.aborted) await fetchThreads();
      } catch (error) {
        console.error("再生成失敗:", error);
        showToast("再生成に失敗しました", "error");
      } finally {
        abortControllerRef.current = null;
        setIsLoading(false);
        setStreamingContent("");
        setGithubProgressMessages([]);
      }
    },
    [
      activeThread,
      activeThreadId,
      fetchThreads,
      getApiKeyHeaders,
      isLoading,
      messages,
      requestStreamingChat,
      showToast,
    ]
  );

  const handleCopyThread = useCallback(
    async (threadId: string) => {
      try {
        const res = await apiClient.request(
          `/api/threads/${threadId}/copy`,
          { method: "POST" }
        );
        if (!res.ok) throw new Error("コピー失敗");
        const data = await res.json();
        await fetchThreads();
        await selectThread(data.thread.id);
      } catch (error) {
        console.error("コピー失敗:", error);
        showToast("コピーに失敗しました", "error");
      }
    },
    [fetchThreads, selectThread, showToast]
  );

  const handleLogout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showToast("ログアウトに失敗しました", "error");
    }
  }, [showToast]);

  return (
    <div className="chat-workspace">
      {isSidebarOpen && (
        <>
          <button
            type="button"
            className="chat-sidebar-backdrop"
            aria-label="会話一覧を閉じる"
            onClick={() => setIsSidebarOpen(false)}
          />
          <Sidebar
            threads={displayThreads}
            activeThreadId={activeThreadId}
            onSelectThread={(id) => {
              const selected = displayThreads.find(
                (thread) => thread.id === id
              ) as (Thread & { matchedMessageIds?: string[] }) | undefined;
              void selectThread(id, selected?.matchedMessageIds);
              setIsSidebarOpen(false);
            }}
            onNewThread={() => {
              handleNewThread();
              setIsSidebarOpen(false);
            }}
            onDeleteThread={handleDeleteThread}
            onSearch={handleSearch}
            isSearching={isSearching}
            user={session.user}
            onLogout={handleLogout}
            onUpdateFolder={handleUpdateFolder}
            onNewThreadInFolder={handleNewThreadInFolder}
            isMobileOverlay
          />
        </>
      )}
      <ChatPanel
        thread={activeThread}
        messages={messages}
        displayName={displayName ?? session.user.email ?? null}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        provider={provider}
        onProviderChange={setProvider}
        onTitleUpdate={handleTitleUpdate}
        onRegenerate={handleRegenerate}
        onCopyThread={handleCopyThread}
        searchMatchIds={searchMatchIds}
        searchMatchIndex={searchMatchIndex}
        onMatchNavigate={handleMatchNavigate}
        onClearSearch={handleClearSearch}
        streamingContent={streamingContent}
        githubProgressMessages={githubProgressMessages}
        onAbort={handleAbort}
        thinkingContents={thinkingContents}
        hasMobileSidebarButton
        onMobileSidebarOpen={() => setIsSidebarOpen(true)}
      />
    </div>
  );
}
