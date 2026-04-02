"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Message, Thread, ThreadNote, MessageNote, Draft, ThreadTag } from "@/types";
import MessageBubble, { ThinkingBubble } from "./MessageBubble";
import ChatInput from "./ChatInput";

// ✅ 変更後
interface ChatPanelProps {
  thread: Thread | null;
  messages: Message[];
  inputValue: string;
  onInputChange: (val: string) => void;
  onSubmit: () => void;
  onMemoSubmit: () => void;
  isLoading: boolean;
  provider: "claude" | "gemini";
  onProviderChange: (p: "claude" | "gemini") => void;
  onTitleUpdate: (id: string, title: string) => void;
  onRegenerate: (targetProvider: "claude" | "gemini") => void;
  onTrimFrom: (message: Message) => void;
  isTemporary: boolean;
  onSwitchTemporary: () => void;
  onCopyThread: (threadId: string) => void;
}

export default function ChatPanel({
  thread,
  messages,
  inputValue,
  onInputChange,
  onSubmit,
  onMemoSubmit,
  isLoading,
  provider,
  onProviderChange,
  onTitleUpdate,
  onRegenerate,
  onTrimFrom,
  isTemporary,
  onSwitchTemporary,
  onCopyThread,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  // スレッドメモ関連
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState<ThreadNote[]>([]);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);

  // メッセージノート関連
  const [messageNotes, setMessageNotes] = useState<MessageNote[]>([]);

  // 下書き関連
  const [showDrafts, setShowDrafts] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);

  // ★ システムプロンプト関連
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [systemPromptDraft, setSystemPromptDraft] = useState("");
  const [systemPromptSaving, setSystemPromptSaving] = useState(false);

  // ★ 公開設定関連
  const [showShare, setShowShare] = useState(false);
  const [sharePublic, setSharePublic] = useState(false);
  const [shareHideMemos, setShareHideMemos] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);

  // ★ APIキー管理関連
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [apiKeyDrafts, setApiKeyDrafts] = useState({ anthropic: "", gemini: "", openai: "" });
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [showKeyValues, setShowKeyValues] = useState({ anthropic: false, gemini: false, openai: false });

  // ★ タグ関連
  const [tags, setTags] = useState<ThreadTag[]>([]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInputValue, setTagInputValue] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  // APIキーをLocalStorageから読み込む
  useEffect(() => {
    try {
      setApiKeyDrafts({
        anthropic: localStorage.getItem("kabehub_anthropic_key") ?? "",
        gemini: localStorage.getItem("kabehub_gemini_key") ?? "",
        openai: localStorage.getItem("kabehub_openai_key") ?? "",
      });
    } catch {}
  }, []);

  const hasAnyApiKey = !!(apiKeyDrafts.anthropic || apiKeyDrafts.gemini || apiKeyDrafts.openai);

  const handleSaveApiKeys = () => {
    try {
      if (apiKeyDrafts.anthropic.trim()) {
        localStorage.setItem("kabehub_anthropic_key", apiKeyDrafts.anthropic.trim());
      } else {
        localStorage.removeItem("kabehub_anthropic_key");
      }
      if (apiKeyDrafts.gemini.trim()) {
        localStorage.setItem("kabehub_gemini_key", apiKeyDrafts.gemini.trim());
      } else {
        localStorage.removeItem("kabehub_gemini_key");
      }
      if (apiKeyDrafts.openai.trim()) {
        localStorage.setItem("kabehub_openai_key", apiKeyDrafts.openai.trim());
      } else {
        localStorage.removeItem("kabehub_openai_key");
      }
      setApiKeySaved(true);
      setTimeout(() => setApiKeySaved(false), 2000);
    } catch (err) {
      console.error("APIキー保存失敗:", err);
    }
  };

  const handleOpenApiKeys = () => {
    setShowApiKeys(true);
    setShowNotes(false);
    setShowDrafts(false);
    setShowSystemPrompt(false);
    setShowShare(false);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // スレッド切り替え時にリセット
  useEffect(() => {
    setShowNotes(false);
    setShowDrafts(false);
    setShowSystemPrompt(false);
    setShowShare(false);
    setShowApiKeys(false);
    setSharePublic(thread?.is_public ?? false);
    setShareHideMemos(thread?.hide_memos ?? false);
    setShareToken(thread?.share_token ?? null);
    setNotes([]);
    setDrafts([]);
    setMessageNotes([]);
    setNewNoteContent("");
    setEditingNoteId(null);
    setSystemPromptDraft(thread?.system_prompt ?? "");
    // タグリセット
    setTags([]);
    setShowTagInput(false);
    setTagInputValue("");
  }, [thread?.id]);

  // スレッド選択時にタグを取得
  useEffect(() => {
    if (!thread) return;
    fetch(`/api/threads/${thread.id}/tags`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: ThreadTag[]) => { if (Array.isArray(data)) setTags(data); })
      .catch(() => {});
  }, [thread?.id]);

  // タグ入力欄表示時にフォーカス
  useEffect(() => {
    if (showTagInput) tagInputRef.current?.focus();
  }, [showTagInput]);

  const fetchNotes = useCallback(async () => {
    if (!thread) return;
    setNotesLoading(true);
    try {
      const res = await fetch(`/api/threads/${thread.id}/notes`, { cache: "no-store" });
      const data: ThreadNote[] = await res.json();
      setNotes(data);
    } catch (err) {
      console.error("メモ取得失敗:", err);
    } finally {
      setNotesLoading(false);
    }
  }, [thread?.id]);

  const fetchMessageNotes = useCallback(async () => {
    if (!thread) return;
    try {
      const res = await fetch(`/api/threads/${thread.id}/message-notes`, { cache: "no-store" });
      const data: MessageNote[] = await res.json();
      setMessageNotes(data);
    } catch (err) {
      console.error("メッセージノート取得失敗:", err);
    }
  }, [thread?.id]);

  const fetchDrafts = useCallback(async () => {
    if (!thread) return;
    setDraftsLoading(true);
    try {
      const res = await fetch(`/api/threads/${thread.id}/drafts`, { cache: "no-store" });
      const data: Draft[] = await res.json();
      setDrafts(data);
    } catch (err) {
      console.error("下書き取得失敗:", err);
    } finally {
      setDraftsLoading(false);
    }
  }, [thread?.id]);

  // スレッド選択時にメッセージノートを取得
  useEffect(() => {
    if (thread) fetchMessageNotes();
  }, [thread?.id, fetchMessageNotes]);

  const handleOpenNotes = () => {
    setShowNotes(true);
    setShowDrafts(false);
    setShowSystemPrompt(false);
    fetchNotes();
  };

  const handleOpenDrafts = () => {
    setShowDrafts(true);
    setShowNotes(false);
    setShowSystemPrompt(false);
    fetchDrafts();
  };

  // ★ システムプロンプトドロワーを開く
  const handleOpenSystemPrompt = () => {
    setShowSystemPrompt(true);
    setShowNotes(false);
    setShowDrafts(false);
    setSystemPromptDraft(thread?.system_prompt ?? "");
  };

  // ★ 公開設定ドロワーを開く
  const handleOpenShare = () => {
    setShowShare(true);
    setShowNotes(false);
    setShowDrafts(false);
    setShowSystemPrompt(false);
    setSharePublic(thread?.is_public ?? false);
    setShareHideMemos(thread?.hide_memos ?? false);
    setShareToken(thread?.share_token ?? null);
  };

  // ★ 公開設定を保存
  const handleSaveShare = async (newPublic: boolean, newHideMemos: boolean) => {
    if (!thread) return;
    setShareSaving(true);
    try {
      const res = await fetch(`/api/threads/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_public: newPublic,
          hide_memos: newHideMemos,
          needsToken: newPublic,
        }),
      });
      const updated = await res.json();
      setSharePublic(updated.is_public ?? false);
      setShareHideMemos(updated.hide_memos ?? false);
      setShareToken(updated.share_token ?? null);
      thread.is_public = updated.is_public;
      thread.hide_memos = updated.hide_memos;
      thread.share_token = updated.share_token;
    } catch (err) {
      console.error("公開設定保存失敗:", err);
    } finally {
      setShareSaving(false);
    }
  };

  // ★ URLをコピー
  const handleCopyUrl = () => {
    if (!shareToken) return;
    const url = `${window.location.origin}/share/${shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  // ★ システムプロンプトを保存
  const handleSaveSystemPrompt = async () => {
    if (!thread) return;
    setSystemPromptSaving(true);
    try {
      const res = await fetch(`/api/threads/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_prompt: systemPromptDraft }),
      });
      const updated = await res.json();
      thread.system_prompt = updated.system_prompt ?? "";
    } catch (err) {
      console.error("システムプロンプト保存失敗:", err);
    } finally {
      setSystemPromptSaving(false);
    }
  };

  // ★ タグ追加
  const handleAddTag = async () => {
    if (!thread) return;
    const raw = tagInputValue;
    const clean = raw.replace(/^#+/, "").replace(/[\s\u3000]/g, "").slice(0, 20);
    if (!clean) { setTagInputValue(""); setShowTagInput(false); return; }

    setTagInputValue("");
    setShowTagInput(false);

    const res = await fetch(`/api/threads/${thread.id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: clean }),
    });
    const data = await res.json();
    // 重複(duplicate: true)でなければstateに追加
    if (data && !data.duplicate && !data.error && data.id) {
      setTags((prev) => [...prev, data]);
    }
  };

  // ★ タグ削除
  const handleDeleteTag = async (tagId: string) => {
    if (!thread) return;
    setTags((prev) => prev.filter((t) => t.id !== tagId)); // 楽観的更新
    await fetch(`/api/threads/${thread.id}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
  };

  const handleAddNote = async () => {
    if (!thread || !newNoteContent.trim()) return;
    try {
      const res = await fetch(`/api/threads/${thread.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newNoteContent.trim() }),
      });
      const note: ThreadNote = await res.json();
      setNotes((prev) => [...prev, note]);
      setNewNoteContent("");
    } catch (err) {
      console.error("メモ追加失敗:", err);
    }
  };

  const handleUpdateNote = async (id: string) => {
    if (!thread || !editingNoteContent.trim()) return;
    try {
      const res = await fetch(`/api/threads/${thread.id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, content: editingNoteContent.trim() }),
      });
      const updated: ThreadNote = await res.json();
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
      setEditingNoteId(null);
    } catch (err) {
      console.error("メモ更新失敗:", err);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!thread) return;
    try {
      await fetch(`/api/threads/${thread.id}/notes`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error("メモ削除失敗:", err);
    }
  };

  const handleAddMessageNote = useCallback(async (messageId: string, content: string) => {
    if (!thread) return;
    try {
      const res = await fetch(`/api/threads/${thread.id}/message-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, content }),
      });
      const note: MessageNote = await res.json();
      setMessageNotes((prev) => [...prev, note]);
    } catch (err) {
      console.error("メッセージノート追加失敗:", err);
    }
  }, [thread?.id]);

  const handleDeleteMessageNote = useCallback(async (noteId: string) => {
    if (!thread) return;
    try {
      await fetch(`/api/threads/${thread.id}/message-notes`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: noteId }),
      });
      setMessageNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err) {
      console.error("メッセージノート削除失敗:", err);
    }
  }, [thread?.id]);

  const handleSaveDraft = async () => {
    if (!thread || !inputValue.trim()) return;
    try {
      const res = await fetch(`/api/threads/${thread.id}/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: inputValue.trim() }),
      });
      const draft: Draft = await res.json();
      setDrafts((prev) => [draft, ...prev]);
      onInputChange("");
    } catch (err) {
      console.error("下書き保存失敗:", err);
    }
  };

  const handleLoadDraft = (draft: Draft) => {
    onInputChange(draft.content);
    setShowDrafts(false);
  };

  const handleDeleteDraft = async (id: string) => {
    if (!thread) return;
    try {
      await fetch(`/api/threads/${thread.id}/drafts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error("下書き削除失敗:", err);
    }
  };

const buildExportContent = (format: "txt" | "md" | "csv") => {
  if (!thread) return "";
  const lines: string[] = [];

  if (format === "md") {
    const createdAt = messages.length > 0
      ? new Date(messages[0].created_at).toISOString()
      : new Date(thread.created_at).toISOString();
    const modifiedAt = messages.length > 0
      ? new Date(messages[messages.length - 1].created_at).toISOString()
      : new Date(thread.updated_at ?? thread.created_at).toISOString();

    const usedAIs = Array.from(
      new Set(
        messages
          .map((m) => m.provider)
          .filter((p) => p === "claude" || p === "gemini")
      )
    );
    const exportTags = ["ai-conversation", ...usedAIs];

    const safeTitle = thread.title.replace(/"/g, '\\"');
    const systemPromptValue = thread.system_prompt?.trim() ?? "";

    lines.push("---");
    lines.push(`title: "${safeTitle}"`);
    lines.push(`source: kabehub`);
    lines.push(`created: ${createdAt}`);
    lines.push(`modified: ${modifiedAt}`);
    lines.push(`tags:`);
    exportTags.forEach((tag) => lines.push(`  - ${tag}`));
    lines.push(`message_count: ${messages.length}`);
    lines.push(`system_prompt: "${systemPromptValue.replace(/"/g, '\\"')}"`);
    lines.push("---");
    lines.push("");

    messages.forEach((msg) => {
      const contentLines = msg.content
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");

      if (msg.provider === "memo") {
        lines.push(`> [!MEMO] 📝 Memo`);
        lines.push(contentLines);
      } else if (msg.role === "user") {
        lines.push(`> [!QUESTION] You`);
        lines.push(contentLines);
      } else {
        const aiLabel = msg.provider === "gemini" ? "Gemini" : "Claude";
        lines.push(`> [!NOTE] ${aiLabel}`);
        lines.push(contentLines);
      }
      lines.push("");
    });

  } else if (format === "csv") {
    lines.push("\uFEFF" + "timestamp,role,provider,content");
    messages.forEach((msg) => {
      const timestamp = new Date(msg.created_at).toLocaleString("ja-JP");
      const role = msg.role;
      const msgProvider = msg.provider ?? "unknown";
      const rawContent = msg.content.replace(/\n/g, " ");
      const needsQuote = /[,"\n]/.test(rawContent);
      const escapedContent = rawContent.replace(/"/g, '""');
      const content = needsQuote ? `"${escapedContent}"` : escapedContent;
      lines.push(`${timestamp},${role},${msgProvider},${content}`);
    });

  } else {
    lines.push(`# ${thread.title}`);
    lines.push(`エクスポート日時: ${new Date().toLocaleString("ja-JP")}`);
    lines.push("=".repeat(40));
    lines.push("");
    messages.forEach((msg) => {
      let roleLabel: string;
      if (msg.provider === "memo") {
        roleLabel = "【📝 メモ】";
      } else if (msg.role === "user") {
        roleLabel = "【あなた】";
      } else {
        const aiName = msg.provider === "gemini" ? "Gemini" : msg.provider === "claude" ? "Claude" : "AI";
        roleLabel = `【${aiName}】`;
      }
      const time = new Date(msg.created_at).toLocaleString("ja-JP");
      lines.push(`${roleLabel} ${time}`);
      lines.push(msg.content);
      lines.push("");
      lines.push("-".repeat(40));
      lines.push("");
    });
  }

  return lines.join("\n");
};

const handleExport = (format: "txt" | "md" | "csv") => {
  if (!thread || messages.length === 0) return;
  const content = buildExportContent(format);
  const mimeType =
    format === "md" ? "text/markdown;charset=utf-8" :
    format === "csv" ? "text/csv;charset=utf-8" :
    "text/plain;charset=utf-8";
  const filename = thread.title.replace(/[/\\?%*:|"<>]/g, "_");
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
};

  const openDialog = () => {
    setEditTitle(thread?.title ?? "");
    setShowDialog(true);
  };

  const handleSaveTitle = async () => {
    if (!thread || !editTitle.trim()) return;
    await fetch(`/api/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle.trim() }),
    });
    onTitleUpdate(thread.id, editTitle.trim());
    setShowDialog(false);
  };

  const lastAssistantIndex = messages.reduce(
    (last, msg, i) => (msg.role === "assistant" ? i : last),
    -1
  );

  const hasSystemPrompt = !!(thread?.system_prompt && thread.system_prompt.trim());

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", background: isTemporary ? "#f1f1f0" : "var(--chat-bg)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 28px", borderBottom: "1px solid var(--border)", background: "var(--chat-bg)" }}>
        {thread ? (
          <>
            {/* 1行目: タイトル + ボタン群 */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "36px" }}>
              <div style={{ width: "4px", height: "18px", background: "var(--accent)", borderRadius: "2px", flexShrink: 0 }} />
              <h1 style={{ fontFamily: "'Lora', serif", fontSize: "16px", fontWeight: 500, color: "var(--ink)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {thread.title}
              </h1>
              {/* ⚡ 一時モードトグル */}
              <button
                onClick={onSwitchTemporary}
                title={isTemporary ? "通常モードに戻す（DB保存）" : "一時モードに切り替え（DBに保存しない）"}
                style={{ padding: "5px 12px", borderRadius: "6px", border: `1px solid ${isTemporary ? "#f59e0b" : "var(--border)"}`, background: isTemporary ? "#fef3c7" : "white", color: isTemporary ? "#d97706" : "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", flexShrink: 0, transition: "all 0.15s" }}
                onMouseEnter={(e) => { if (!isTemporary) { (e.currentTarget as HTMLButtonElement).style.borderColor = "#f59e0b"; (e.currentTarget as HTMLButtonElement).style.color = "#d97706"; } }}
                onMouseLeave={(e) => { if (!isTemporary) { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; } }}
              >⚡ {isTemporary ? "一時モード中" : "一時モード"}</button>
              {/* コピーボタン */}
              <button
                onClick={async () => {
                  if (!thread?.id) return
                  const ok = window.confirm('この会話をベースに新しいスレッドを作成します。よろしいですか？')
                  if (!ok) return
                  await onCopyThread(thread.id)
                }}
                title="この会話をコピーして新しいスレッドを作成"
                style={{ padding: "5px 12px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", flexShrink: 0, transition: "all 0.15s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}
              >📋 この会話をコピー</button>
              {/* タイトル編集ボタン */}
              <button
                onClick={openDialog}
                title="タイトルを編集"
                style={{ width: "28px", height: "28px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}
              >✎</button>
              {/* APIキー設定ボタン */}
              <button
                onClick={handleOpenApiKeys}
                title="APIキーを設定"
                style={{ padding: "5px 12px", borderRadius: "6px", border: `1px solid ${showApiKeys ? "var(--accent)" : hasAnyApiKey ? "var(--accent)" : "var(--border)"}`, background: showApiKeys ? "var(--accent)" : "white", color: showApiKeys ? "white" : hasAnyApiKey ? "var(--accent)" : "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", flexShrink: 0, transition: "all 0.15s" }}
                onMouseEnter={(e) => { if (!showApiKeys) { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; } }}
                onMouseLeave={(e) => { if (!showApiKeys) { (e.currentTarget as HTMLButtonElement).style.borderColor = hasAnyApiKey ? "var(--accent)" : "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = hasAnyApiKey ? "var(--accent)" : "var(--ink-muted)"; } }}
              >🔑 APIキー{hasAnyApiKey && " ✓"}</button>
              <button
                onClick={handleOpenShare}
                title="公開設定"
                style={{ padding: "5px 12px", borderRadius: "6px", border: `1px solid ${showShare ? "var(--accent)" : sharePublic ? "#16a34a" : "var(--border)"}`, background: showShare ? "var(--accent)" : "white", color: showShare ? "white" : sharePublic ? "#16a34a" : "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", flexShrink: 0, transition: "all 0.15s" }}
                onMouseEnter={(e) => { if (!showShare) { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; } }}
                onMouseLeave={(e) => { if (!showShare) { (e.currentTarget as HTMLButtonElement).style.borderColor = sharePublic ? "#16a34a" : "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = sharePublic ? "#16a34a" : "var(--ink-muted)"; } }}
              >{sharePublic ? "🌐 公開中" : "🔒 非公開"}</button>
              {/* システムプロンプトボタン */}
              <button
                onClick={handleOpenSystemPrompt}
                title="システムプロンプトを設定"
                style={{ padding: "5px 12px", borderRadius: "6px", border: `1px solid ${showSystemPrompt ? "var(--accent)" : hasSystemPrompt ? "var(--accent)" : "var(--border)"}`, background: showSystemPrompt ? "var(--accent)" : "white", color: showSystemPrompt ? "white" : hasSystemPrompt ? "var(--accent)" : "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", flexShrink: 0, transition: "all 0.15s" }}
                onMouseEnter={(e) => { if (!showSystemPrompt) { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; } }}
                onMouseLeave={(e) => { if (!showSystemPrompt) { (e.currentTarget as HTMLButtonElement).style.borderColor = hasSystemPrompt ? "var(--accent)" : "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = hasSystemPrompt ? "var(--accent)" : "var(--ink-muted)"; } }}
              >🤖 プロンプト{hasSystemPrompt && " ✓"}</button>
              {/* スレッドメモボタン */}
              <button
                onClick={handleOpenNotes}
                title="スレッドメモ"
                style={{ padding: "5px 12px", borderRadius: "6px", border: "1px solid var(--border)", background: showNotes ? "var(--accent)" : "white", color: showNotes ? "white" : "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", flexShrink: 0, transition: "all 0.15s" }}
                onMouseEnter={(e) => { if (!showNotes) { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; } }}
                onMouseLeave={(e) => { if (!showNotes) { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; } }}
              >📝 メモ {notes.length > 0 && `(${notes.length})`}</button>
              {/* 下書きボタン */}
              <button
                onClick={handleOpenDrafts}
                title="下書き"
                style={{ padding: "5px 12px", borderRadius: "6px", border: "1px solid var(--border)", background: showDrafts ? "var(--accent)" : "white", color: showDrafts ? "white" : "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", flexShrink: 0, transition: "all 0.15s" }}
                onMouseEnter={(e) => { if (!showDrafts) { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; } }}
                onMouseLeave={(e) => { if (!showDrafts) { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; } }}
              >📋 下書き {drafts.length > 0 && `(${drafts.length})`}</button>
              {messages.length > 0 && (
                <>
                  <button onClick={() => handleExport("txt")} title="TXTでエクスポート" style={{ padding: "5px 12px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", flexShrink: 0, transition: "all 0.15s" }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}>↓ TXT</button>
                  <button onClick={() => handleExport("md")} title="Markdownでエクスポート（Obsidian対応）" style={{ padding: "5px 12px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", flexShrink: 0, transition: "all 0.15s" }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}>↓ MD</button>
                  <button onClick={() => handleExport("csv")} title="CSVでエクスポート（Excel対応）" style={{ padding: "5px 12px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", flexShrink: 0, transition: "all 0.15s" }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}>↓ CSV</button>
                </>
              )}
            </div>

            {/* 2行目: タグ */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", flexWrap: "wrap", paddingLeft: "16px" }}>
              <span style={{ fontSize: "10px", color: "var(--ink-faint)", fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>🏷️</span>
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  style={{ display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 8px", borderRadius: "12px", border: "1px solid var(--accent-muted)", background: "#f0f4ff", fontSize: "11px", color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}
                >
                  #{tag.name}
                  <button
                    onClick={() => handleDeleteTag(tag.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: "11px", padding: "0 0 0 2px", lineHeight: 1, opacity: 0.6 }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.6"; }}
                  >×</button>
                </span>
              ))}
              {/* タグ入力欄 */}
              {showTagInput ? (
                <input
                  ref={tagInputRef}
                  id="tag-input"
                  name="tag-input"
                  type="text"
                  value={tagInputValue}
                  onChange={(e) => setTagInputValue(e.target.value.slice(0, 20))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleAddTag(); }
                    if (e.key === "Escape") { setShowTagInput(false); setTagInputValue(""); }
                  }}
                  onBlur={handleAddTag}
                  placeholder="#タグ名"
                  maxLength={21} // # + 20文字
                  style={{ padding: "2px 8px", borderRadius: "12px", border: "1px solid var(--accent-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", outline: "none", color: "var(--ink)", width: "100px" }}
                />
              ) : (
                <button
                  onClick={() => setShowTagInput(true)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 8px", borderRadius: "12px", border: "1px dashed var(--border)", background: "transparent", fontSize: "11px", color: "var(--ink-faint)", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", transition: "all 0.12s" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent-muted)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-faint)"; }}
                >＋ タグ追加</button>
              )}
            </div>
          </>
        ) : (
          <div style={{ minHeight: "36px", display: "flex", alignItems: "center" }}>
            <div style={{ fontSize: "13px", color: "var(--ink-muted)", fontStyle: "italic" }}>
              スレッドを選択するか、新規作成してください
            </div>
          </div>
        )}
      </div>

      {/* ★ APIキー設定ドロワー */}
      {showApiKeys && (
        <div style={{ borderBottom: "1px solid var(--border)", background: "#fefdf0", padding: "16px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>APIキー設定</div>
              <div style={{ fontSize: "10px", color: "var(--ink-faint)", fontFamily: "'DM Sans', sans-serif" }}>このブラウザにのみ保存されます（LocalStorage）</div>
            </div>
            <button onClick={() => setShowApiKeys(false)} style={{ background: "none", border: "none", color: "var(--ink-muted)", cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "0 2px" }}>×</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Anthropic */}
            <div>
              <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", marginBottom: "4px" }}>Anthropic (Claude) <span style={{ color: "var(--ink-faint)", fontFamily: "'DM Sans', sans-serif" }}>— sk-ant-... で始まるキー</span></div>
              <div style={{ display: "flex", gap: "6px" }}>
                <input id="api-key-anthropic" name="api-key-anthropic" type={showKeyValues.anthropic ? "text" : "password"} value={apiKeyDrafts.anthropic} onChange={(e) => setApiKeyDrafts(prev => ({ ...prev, anthropic: e.target.value }))} placeholder="sk-ant-api03-..." style={{ flex: 1, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", outline: "none", color: "var(--ink)", background: "white", boxSizing: "border-box" }} />
                <button onClick={() => setShowKeyValues(prev => ({ ...prev, anthropic: !prev.anthropic }))} style={{ padding: "5px 10px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", cursor: "pointer" }}>{showKeyValues.anthropic ? "隠す" : "表示"}</button>
              </div>
            </div>
            {/* Gemini */}
            <div>
              <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", marginBottom: "4px" }}>Google (Gemini) <span style={{ color: "var(--ink-faint)", fontFamily: "'DM Sans', sans-serif" }}>— AIza... で始まるキー</span></div>
              <div style={{ display: "flex", gap: "6px" }}>
                <input id="api-key-gemini" name="api-key-gemini" type={showKeyValues.gemini ? "text" : "password"} value={apiKeyDrafts.gemini} onChange={(e) => setApiKeyDrafts(prev => ({ ...prev, gemini: e.target.value }))} placeholder="AIzaSy..." style={{ flex: 1, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", outline: "none", color: "var(--ink)", background: "white", boxSizing: "border-box" }} />
                <button onClick={() => setShowKeyValues(prev => ({ ...prev, gemini: !prev.gemini }))} style={{ padding: "5px 10px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", cursor: "pointer" }}>{showKeyValues.gemini ? "隠す" : "表示"}</button>
              </div>
            </div>
            {/* OpenAI */}
            <div>
              <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", marginBottom: "4px" }}>OpenAI <span style={{ color: "var(--ink-faint)", fontFamily: "'DM Sans', sans-serif" }}>— sk-... で始まるキー（将来用）</span></div>
              <div style={{ display: "flex", gap: "6px" }}>
                <input id="api-key-openai" name="api-key-openai" type={showKeyValues.openai ? "text" : "password"} value={apiKeyDrafts.openai} onChange={(e) => setApiKeyDrafts(prev => ({ ...prev, openai: e.target.value }))} placeholder="sk-proj-..." style={{ flex: 1, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", outline: "none", color: "var(--ink)", background: "white", boxSizing: "border-box" }} />
                <button onClick={() => setShowKeyValues(prev => ({ ...prev, openai: !prev.openai }))} style={{ padding: "5px 10px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", cursor: "pointer" }}>{showKeyValues.openai ? "隠す" : "表示"}</button>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
            <div style={{ fontSize: "11px", color: "var(--ink-faint)", fontFamily: "'DM Sans', sans-serif" }}>
              空欄で保存すると削除されます。未入力のキーは .env.local の設定が使われます。
            </div>
            <button onClick={handleSaveApiKeys} style={{ padding: "5px 16px", borderRadius: "6px", border: "none", background: apiKeySaved ? "#16a34a" : "var(--accent)", color: "white", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", transition: "all 0.2s" }}>{apiKeySaved ? "✓ 保存しました" : "保存"}</button>
          </div>
        </div>
      )}

      {/* ★ システムプロンプトドロワー */}
      {showSystemPrompt && thread && (
        <div style={{ borderBottom: "1px solid var(--border)", background: "#f5f3ff", padding: "16px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>システムプロンプト</div>
              <div style={{ fontSize: "10px", color: "var(--ink-faint)", fontFamily: "'DM Sans', sans-serif" }}>このスレッドのAIの役割・人格を設定します</div>
            </div>
            <button onClick={() => setShowSystemPrompt(false)} style={{ background: "none", border: "none", color: "var(--ink-muted)", cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "0 2px" }}>×</button>
          </div>
          <textarea
            id="system-prompt-textarea"
            name="system-prompt-textarea"
            value={systemPromptDraft}
            onChange={(e) => setSystemPromptDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSaveSystemPrompt(); }}
            placeholder={`例：あなたは優秀なプロダクトマネージャーです。ユーザーのアイデアに対して、批判的かつ建設的なフィードバックをしてください。\n例：あなたは厳しい編集者です。文章の冗長な部分を容赦なく指摘してください。`}
            style={{ width: "100%", minHeight: "100px", maxHeight: "200px", padding: "10px 12px", border: "1px solid #c4b5fd", borderRadius: "7px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", resize: "vertical", outline: "none", color: "var(--ink)", boxSizing: "border-box", background: "white", lineHeight: 1.6 }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px" }}>
            <div style={{ fontSize: "11px", color: "var(--ink-faint)", fontFamily: "'JetBrains Mono', monospace" }}>
              Cmd/Ctrl+Enter で保存 · 空にして保存するとリセット
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              {systemPromptDraft.trim() && (
                <button onClick={() => setSystemPromptDraft("")} style={{ padding: "5px 12px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>クリア</button>
              )}
              <button onClick={handleSaveSystemPrompt} disabled={systemPromptSaving} style={{ padding: "5px 14px", borderRadius: "6px", border: "none", background: systemPromptSaving ? "var(--border)" : "#7c3aed", color: systemPromptSaving ? "var(--ink-faint)" : "white", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: systemPromptSaving ? "default" : "pointer", transition: "all 0.15s" }}>{systemPromptSaving ? "保存中…" : "保存"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ★ 公開設定ドロワー */}
      {showShare && thread && (
        <div style={{ borderBottom: "1px solid var(--border)", background: "#f0fdf4", padding: "16px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>公開設定</div>
              <div style={{ fontSize: "10px", color: "var(--ink-faint)", fontFamily: "'DM Sans', sans-serif" }}>URLを知っている人なら誰でも閲覧できます</div>
            </div>
            <button onClick={() => setShowShare(false)} style={{ background: "none", border: "none", color: "var(--ink-muted)", cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "0 2px" }}>×</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
              <div onClick={() => { const next = !sharePublic; setSharePublic(next); handleSaveShare(next, shareHideMemos); }} style={{ width: "40px", height: "22px", borderRadius: "11px", background: sharePublic ? "#16a34a" : "#d1d5db", transition: "background 0.2s", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", padding: "2px" }}>
                <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: "white", transition: "transform 0.2s", transform: sharePublic ? "translateX(18px)" : "translateX(0)" }} />
              </div>
              <span style={{ fontSize: "13px", color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
                {sharePublic ? "🌐 公開中（リンクを知っている人が閲覧可能）" : "🔒 非公開"}
              </span>
              {shareSaving && <span style={{ fontSize: "11px", color: "var(--ink-faint)" }}>保存中…</span>}
            </label>
            {sharePublic && (
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", paddingLeft: "4px" }}>
                <div onClick={() => { const next = !shareHideMemos; setShareHideMemos(next); handleSaveShare(sharePublic, next); }} style={{ width: "40px", height: "22px", borderRadius: "11px", background: shareHideMemos ? "#7c3aed" : "#d1d5db", transition: "background 0.2s", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", padding: "2px" }}>
                  <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: "white", transition: "transform 0.2s", transform: shareHideMemos ? "translateX(18px)" : "translateX(0)" }} />
                </div>
                <span style={{ fontSize: "13px", color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>📝 メモを共有ページに表示しない</span>
              </label>
            )}
            {sharePublic && shareToken && (
              <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "8px", background: "white", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "8px 12px" }}>
                <span style={{ fontSize: "12px", color: "#15803d", fontFamily: "'JetBrains Mono', monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {typeof window !== "undefined" ? `${window.location.origin}/share/${shareToken}` : `/share/${shareToken}`}
                </span>
                <button onClick={handleCopyUrl} style={{ padding: "4px 12px", borderRadius: "6px", border: "none", background: shareCopied ? "#16a34a" : "#dcfce7", color: shareCopied ? "white" : "#15803d", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}>{shareCopied ? "✓ コピー済み" : "📋 コピー"}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* スレッドメモドロワー */}
      {showNotes && thread && (
        <div style={{ borderBottom: "1px solid var(--border)", background: "#fafaf7", padding: "16px 28px", maxHeight: "320px", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>スレッドメモ</div>
            <button onClick={() => setShowNotes(false)} style={{ background: "none", border: "none", color: "var(--ink-muted)", cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "0 2px" }}>×</button>
          </div>
          {notesLoading ? (
            <div style={{ fontSize: "12px", color: "var(--ink-faint)", padding: "8px 0" }}>読み込み中…</div>
          ) : notes.length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--ink-faint)", padding: "8px 0" }}>メモはまだありません</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
              {notes.map((note) => (
                <div key={note.id} style={{ background: "white", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {editingNoteId === note.id ? (
                    <>
                      <textarea autoFocus value={editingNoteContent} onChange={(e) => setEditingNoteContent(e.target.value)} style={{ width: "100%", minHeight: "60px", padding: "6px 8px", border: "1px solid var(--accent)", borderRadius: "6px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        <button onClick={() => setEditingNoteId(null)} style={{ padding: "3px 10px", borderRadius: "5px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", cursor: "pointer" }}>キャンセル</button>
                        <button onClick={() => handleUpdateNote(note.id)} style={{ padding: "3px 10px", borderRadius: "5px", border: "none", background: "var(--accent)", color: "white", fontSize: "11px", cursor: "pointer" }}>保存</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: "13px", color: "var(--ink)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{note.content}</div>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        <button onClick={() => { setEditingNoteId(note.id); setEditingNoteContent(note.content); }} style={{ padding: "2px 8px", borderRadius: "5px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>✎ 編集</button>
                        <button onClick={() => handleDeleteNote(note.id)} style={{ padding: "2px 8px", borderRadius: "5px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e53e3e"; (e.currentTarget as HTMLButtonElement).style.color = "#e53e3e"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}>✕ 削除</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <textarea
              id="new-note-textarea"
              name="new-note-textarea"
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote(); }}
              placeholder="メモを追加… (Cmd/Ctrl+Enter で保存)"
              style={{ width: "100%", minHeight: "60px", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "7px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", resize: "vertical", outline: "none", color: "var(--ink)", boxSizing: "border-box", background: "white" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={handleAddNote} disabled={!newNoteContent.trim()} style={{ padding: "5px 14px", borderRadius: "6px", border: "none", background: newNoteContent.trim() ? "var(--accent)" : "var(--border)", color: newNoteContent.trim() ? "white" : "var(--ink-faint)", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", cursor: newNoteContent.trim() ? "pointer" : "default", transition: "all 0.15s" }}>
                ＋ 追加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 下書きドロワー */}
      {showDrafts && thread && (
        <div style={{ borderBottom: "1px solid var(--border)", background: "#f0f9ff", padding: "16px 28px", maxHeight: "320px", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>下書き</div>
            <button onClick={() => setShowDrafts(false)} style={{ background: "none", border: "none", color: "var(--ink-muted)", cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "0 2px" }}>×</button>
          </div>
          {draftsLoading ? (
            <div style={{ fontSize: "12px", color: "var(--ink-faint)", padding: "8px 0" }}>読み込み中…</div>
          ) : drafts.length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--ink-faint)", padding: "8px 0" }}>下書きはまだありません</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {drafts.map((draft) => (
                <div key={draft.id} style={{ background: "white", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ fontSize: "13px", color: "var(--ink)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{draft.content}</div>
                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                    <button onClick={() => handleLoadDraft(draft)} style={{ padding: "2px 8px", borderRadius: "5px", border: "1px solid var(--accent)", background: "white", color: "var(--accent)", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>↑ 入力欄へ</button>
                    <button onClick={() => handleDeleteDraft(draft.id)} style={{ padding: "2px 8px", borderRadius: "5px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e53e3e"; (e.currentTarget as HTMLButtonElement).style.color = "#e53e3e"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}>✕ 削除</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "28px 48px" }}>
        {!thread && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "16px", color: "var(--ink-muted)" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "14px", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>✦</div>
            <div style={{ textAlign: "center", lineHeight: 1.8 }}>
              <div style={{ fontFamily: "'Lora', serif", fontSize: "18px", color: "var(--ink)", marginBottom: "6px" }}>思考を始めましょう</div>
              <div style={{ fontSize: "13px" }}>左の「＋」から新しい壁打ちを開始できます。</div>
            </div>
          </div>
        )}
        {thread && messages.length === 0 && !isLoading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--ink-muted)", fontSize: "13px" }}>
            最初のメッセージを入力してください。
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLast={i === lastAssistantIndex}
            isLoading={isLoading}
            provider={provider}
            onRegenerate={onRegenerate}
            onTrimFrom={onTrimFrom}
            messageNotes={messageNotes}
            onAddMessageNote={handleAddMessageNote}
            onDeleteMessageNote={handleDeleteMessageNote}
          />
        ))}
        {isLoading && <ThinkingBubble />}
      </div>

      {/* 下書き保存ボタン */}
      {thread && inputValue.trim() && (
        <div style={{ padding: "0 28px 8px", display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleSaveDraft}
            style={{ padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}
          >
            📋 下書き保存
          </button>
        </div>
      )}

      {/* Input */}
      <ChatInput
        value={inputValue}
        onChange={onInputChange}
        onSubmit={onSubmit}
        onMemoSubmit={onMemoSubmit}
        isLoading={isLoading}
        disabled={!thread}
        provider={provider}
        onProviderChange={onProviderChange}
      />

      {/* タイトル編集ダイアログ */}
      {showDialog && (
        <div onClick={() => setShowDialog(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: "12px", padding: "24px", width: "400px", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <div style={{ fontFamily: "'Lora', serif", fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: "var(--ink)" }}>タイトルを編集</div>
            <input
              id="edit-title-input"
              name="edit-title-input"
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") setShowDialog(false); }}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "7px", fontSize: "14px", fontFamily: "'DM Sans', sans-serif", outline: "none", color: "var(--ink)", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "16px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowDialog(false)} style={{ padding: "8px 16px", borderRadius: "7px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "13px", cursor: "pointer" }}>キャンセル</button>
              <button onClick={handleSaveTitle} style={{ padding: "8px 16px", borderRadius: "7px", border: "none", background: "var(--accent)", color: "white", fontSize: "13px", cursor: "pointer" }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
