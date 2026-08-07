"use client";

import { Fragment, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Message, Thread, ThreadNote, MessageNote, Draft, ThreadTag } from "@/types";
import MessageBubble, { ThinkingBubble, BranchBubble } from "./MessageBubble";
import ChatInput, { type ModelId, type Provider, type SubmittedAttachedImageFile } from "./ChatInput";
import ChatInputCentered from "./ChatInputCentered";
import ExportModal from "./ExportModal";
import { GENRES } from "@/lib/genres";
import { generateMessageSummary } from "@/lib/stringUtils";
import { buildExportContent, ExportOptions } from "@/lib/exportUtils";
import { TAG_NAME_MAX_LENGTH, normalizeTagName } from "@/lib/validationLimits";
import PublishConfirmModal from "./PublishConfirmModal";
import RoleplayBubble, { RoleplayThinkingBubble } from "./RoleplayBubble";
import { useToast } from "@/components/Toast";
import {
  buildBranchLanes,
  buildChainBlocksByRootAnchor,
  buildCurrentLaneKeyByBranchRootId,
  buildMessageById,
  compareMessagesForDisplay,
  getAnchorKey,
  resolveBranchBlockAnchor,
  resolveCurrentLaneKey,
  type BranchLane,
} from "@/lib/branching";

const EMPTY_STRING_ARRAY: string[] = [];

// ✅ v26更新: searchMatchIndex / onMatchNavigate / onClearSearch 追加
interface ChatPanelProps {
  thread: Thread | null;
  messages: Message[];
  displayName?: string | null;
  inputValue: string;
  onInputChange: (val: string) => void;
  onSubmit: (content: string, modelId: ModelId, attachedImages?: SubmittedAttachedImageFile[], isDeepThinking?: boolean) => void;
  thinkingContents?: Record<string, string>;
  onMemoSubmit: () => void;
  isLoading: boolean;
  provider: Provider;
  onProviderChange: (p: Provider) => void;
  onTitleUpdate: (id: string, title: string) => void;  // ← ここに追加
  onThreadUpdate: (id: string, partial: Partial<Thread>) => void;
  onRegenerate: (
    targetProvider: "claude" | "gemini" | "openai",
    assistantMsg?: Message,
    modelId?: string,
    mode?: "branch" | "light",
    editedUserContent?: string
  ) => void;
  onEditAndRegenerate: (
    baseUserMsg: Message,
    editedContent: string,
    targetProvider: "claude" | "gemini" | "openai",
    modelId?: string
  ) => void;
  onTrimFrom: (message: Message) => void;
  onDeleteMessage?: (message: Message) => void;
  onDeleteImage?: (message: Message) => void;
  onMemoizeMessage?: (message: Message) => void;
  onBranchToNewChat?: (message: Message) => void;
  isTemporary: boolean;
  onSwitchTemporary: () => void;
  onCopyThread: (threadId: string) => void;
  searchMatchIds?: string[];
  searchMatchIndex?: number;
  onMatchNavigate?: (dir: "prev" | "next") => void;
  onClearSearch?: () => void;
  onUpdateMessage?: (messageId: string, updates: { content?: string; is_hidden?: boolean }) => Promise<void>;
  streamingContent?: string;   // ✅ v62追加: ストリーミング中のリアルタイムテキスト
  onAbort?: () => void;        // ✅ v62追加: ■停止ボタン用
  githubProgressMessages?: string[];
  onSendMemoToAI?: (content: string) => void;
  onRestoreBranch?: (branchRootId: string, branchIndex: number) => void | Promise<void>;
  onImageGenerate?: (prompt: string, imageProvider?: string, imageRefId?: string, imageRefUpload?: { base64: string; mimeType: string; previewUrl: string }) => void;
  onDiscuss?: (messageId: string) => void;
  imageContextId?: string | null;
  isImagePinned?: boolean;
  onImagePinToggle?: () => void;
  onImageContextClear?: () => void;
  onImageRef?: (messageId: string) => void;
  imageRefId?: string | null;
  onImageRefClear?: () => void;
  imageRefUpload?: { base64: string; mimeType: string; previewUrl: string } | null;
  onImageRefUpload?: (data: { base64: string; mimeType: string; previewUrl: string }) => void;
  onImageRefUploadClear?: () => void;
  hasMobileSidebarButton?: boolean;
  onMobileSidebarOpen?: () => void;
}

export default function ChatPanel({
  thread,
  messages,
  displayName,
  inputValue,
  onInputChange,
  onSubmit,
  onMemoSubmit,
  isLoading,
  provider,
  onProviderChange,
  onTitleUpdate,
  onThreadUpdate,
  onRegenerate,
  onEditAndRegenerate,
  onTrimFrom,
  onDeleteMessage,
  onDeleteImage,
  onMemoizeMessage,
  onBranchToNewChat,
  isTemporary,
  onSwitchTemporary,
  onCopyThread,
  searchMatchIds = EMPTY_STRING_ARRAY,
  searchMatchIndex = 0,
  onMatchNavigate,
  onClearSearch,
  onUpdateMessage,
  streamingContent = "",  // ✅ v62追加
  onAbort,               // ✅ v62追加
  githubProgressMessages = EMPTY_STRING_ARRAY,
  onSendMemoToAI,
  thinkingContents,
  onRestoreBranch,
  onImageGenerate,
  onDiscuss,
  imageContextId,
  isImagePinned,
  onImagePinToggle,
  onImageContextClear,
  onImageRef,
  imageRefId,
  onImageRefClear,
  imageRefUpload,
  onImageRefUpload,
  onImageRefUploadClear,
  hasMobileSidebarButton = false,
  onMobileSidebarOpen,
}: ChatPanelProps) {
  const { showToast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [dotPositions, setDotPositions] = useState<Array<{id: string; topPct: number; role: string}>>([]);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{top: number; right: number} | null>(null);
  const [navExpanded, setNavExpanded] = useState(false);
  const [navWide, setNavWide] = useState(false);
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
  const [shareAllowPromptFork, setShareAllowPromptFork] = useState(true);
  const [shareGenre, setShareGenre] = useState<string | null>(null); // 👈 追加
  const [selectedParentGenreId, setSelectedParentGenreId] = useState<string | null>(null); // 👈 追加
  const [shareSaving, setShareSaving] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [pendingDefaultTitle, setPendingDefaultTitle] = useState<string | null>(null);
  
  // ★ APIキー管理関連
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [apiKeyDrafts, setApiKeyDrafts] = useState({ anthropic: "", gemini: "", openai: "" });
  const [showKeyValues, setShowKeyValues] = useState({ anthropic: false, gemini: false, openai: false });

  // ★ タグ関連
  const [tags, setTags] = useState<ThreadTag[]>([]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInputValue, setTagInputValue] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagSubmittingRef = useRef(false);

  // ★ エクスポートモーダル関連
  const [exportFormat, setExportFormat] = useState<"txt" | "md" | "md2" | "csv" | null>(null);

  // ★ ヘッダーメニュー関連
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // ★ フォルダシステムプロンプト継承表示用
  const [folderSystemPrompt, setFolderSystemPrompt] = useState<string | null>(null)

  // ★ なりきりモード関連
  const [showRoleplay, setShowRoleplay] = useState(false);
  const [roleplayMode, setRoleplayMode] = useState(false);
  const [rpCharName, setRpCharName] = useState("");
  const [rpCharNameDraft, setRpCharNameDraft] = useState("");
  const [rpCharIconUrl, setRpCharIconUrl] = useState<string | null>(null);
  const [rpIconSaving, setRpIconSaving] = useState(false);
  const [rpSaving, setRpSaving] = useState(false);
  const [showMobileHistory, setShowMobileHistory] = useState(false);
  const rpIconInputRef = useRef<HTMLInputElement>(null);
  const orderedMessages = useMemo(
    () => [...messages].sort(compareMessagesForDisplay),
    [messages]
  );
  const messageById = useMemo(
    () => buildMessageById(orderedMessages),
    [orderedMessages]
  );
  const dbActiveMessages = useMemo(
    () => orderedMessages.filter(msg => msg.is_active !== false),
    [orderedMessages]
  );

  const chainBlocksByRootAnchor = useMemo(
    () => buildChainBlocksByRootAnchor(orderedMessages, messageById),
    [orderedMessages]
  );

  const currentLaneKeyByBranchRootId = useMemo(
    () => buildCurrentLaneKeyByBranchRootId(
      chainBlocksByRootAnchor,
      orderedMessages
    ),
    [orderedMessages]
  );

  const visibleMessages = useMemo(
    () => dbActiveMessages.filter((msg) => {
      if (!msg.branch_root_id || msg.branch_index == null) return true;

      const currentLaneKey = currentLaneKeyByBranchRootId[msg.branch_root_id];
      if (!currentLaneKey) return true;

      const laneKey = `${msg.branch_root_id}:${msg.branch_index}`;
      return laneKey === currentLaneKey;
    }),
    [orderedMessages]
  );
  const threadId = thread?.id;

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1280);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    setNavExpanded(localStorage.getItem('kabehub_nav_expanded_always') === 'true');
  }, []);

  useEffect(() => {
    setNavWide(localStorage.getItem("kabehub_nav_wide") === "true");
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const compute = () => {
      const scrollH = el.scrollHeight;
      if (!scrollH) return;
      const navMsgs = visibleMessages.filter(m => m.provider !== "memo");
      const positions = navMsgs.map(msg => {
        const dom = document.getElementById(`msg-${String(msg.id)}`);
        if (!dom) return null;
        return { id: String(msg.id), topPct: dom.offsetTop / scrollH * 100, role: msg.role };
      }).filter(Boolean) as Array<{id: string; topPct: number; role: string}>;
      setDotPositions(positions);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [orderedMessages]);

  useEffect(() => {
    if (!thread?.folder_name) {
      setFolderSystemPrompt(null)
      return
    }
    let ignore = false
    const fetch_ = async () => {
      try {
        const r = await fetch(`/api/folder-settings?folder_name=${encodeURIComponent(thread.folder_name!)}`)
        if (!r.ok) throw new Error('fetch failed')
        const data = await r.json()
        if (!ignore) setFolderSystemPrompt(data?.system_prompt ?? null)
      } catch {
        if (!ignore) setFolderSystemPrompt(null)
      }
    }
    fetch_()
    return () => { ignore = true }
  }, [thread?.folder_name])

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
      showToast("APIキーを保存しました");
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

  const scrollToMessage = (id: string) => {
    const container = scrollRef.current;
    const el = document.getElementById(`msg-${id}`);
    if (container && el) {
      container.scrollTo({ top: el.offsetTop - 20, behavior: 'smooth' });
    }
  };


  // ✅ v26: スクロールuseEffectはpage.tsxに移動済み。
  // ChatPanel側では searchMatchIds の変化を検知する必要はない。

  // スレッド切り替え時にリセット
  useEffect(() => {
    setShowNotes(false);
    setShowDrafts(false);
    setShowSystemPrompt(false);
    setShowShare(false);
    setShowApiKeys(false);
    setNotes([]);
    setDrafts([]);
    setMessageNotes([]);
    setNewNoteContent("");
    setEditingNoteId(null);
    setShowRoleplay(false);
    // タグリセット
    setTags([]);
    setShowTagInput(false);
    setTagInputValue("");
    // navExpandedを常時設定の初期値に戻す
    setNavExpanded(localStorage.getItem('kabehub_nav_expanded_always') === 'true');
  }, [threadId]);

  useEffect(() => setSharePublic(thread?.is_public ?? false), [threadId, thread?.is_public]);
  useEffect(() => setShareHideMemos(thread?.hide_memos ?? false), [threadId, thread?.hide_memos]);
  useEffect(() => setShareAllowPromptFork(thread?.allow_prompt_fork ?? true), [threadId, thread?.allow_prompt_fork]);
  useEffect(() => setShareToken(thread?.share_token ?? null), [threadId, thread?.share_token]);
  useEffect(() => setShareGenre((thread?.genre as string | null) ?? null), [threadId, thread?.genre]);
  useEffect(() => setSystemPromptDraft(thread?.system_prompt ?? ""), [threadId, thread?.system_prompt]);
  useEffect(() => setRoleplayMode(thread?.roleplay_mode ?? false), [threadId, thread?.roleplay_mode]);
  useEffect(() => { setRpCharName(thread?.rp_char_name ?? ""); setRpCharNameDraft(thread?.rp_char_name ?? ""); }, [threadId, thread?.rp_char_name]);
  useEffect(() => setRpCharIconUrl(thread?.rp_char_icon_url ?? null), [threadId, thread?.rp_char_icon_url]);

  // スレッド選択時にタグを取得
  useEffect(() => {
    if (!threadId) return;
    fetch(`/api/threads/${threadId}/tags`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: ThreadTag[]) => { if (Array.isArray(data)) setTags(data); })
      .catch(() => {});
  }, [threadId]);

  // タグ入力欄表示時にフォーカス
  useEffect(() => {
    if (showTagInput) tagInputRef.current?.focus();
  }, [showTagInput]);

  const fetchNotes = useCallback(async () => {
    if (!threadId) return;
    setNotesLoading(true);
    try {
      const res = await fetch(`/api/threads/${threadId}/notes`, { cache: "no-store" });
      if (!res.ok) throw new Error("メモ取得失敗");
      const data: ThreadNote[] = await res.json();
      setNotes(data);
    } catch (err) {
      console.error("メモ取得失敗:", err);
    } finally {
      setNotesLoading(false);
    }
  }, [threadId]);

  const fetchMessageNotes = useCallback(async () => {
    if (!threadId) return;
    try {
      const res = await fetch(`/api/threads/${threadId}/message-notes`, { cache: "no-store" });
      if (!res.ok) throw new Error("メッセージノート取得失敗");
      const data: MessageNote[] = await res.json();
      setMessageNotes(data);
    } catch (err) {
      console.error("メッセージノート取得失敗:", err);
    }
  }, [threadId]);

  const fetchDrafts = useCallback(async () => {
    if (!threadId) return;
    setDraftsLoading(true);
    try {
      const res = await fetch(`/api/threads/${threadId}/drafts`, { cache: "no-store" });
      if (!res.ok) throw new Error("下書き取得失敗");
      const data: Draft[] = await res.json();
      setDrafts(data);
    } catch (err) {
      console.error("下書き取得失敗:", err);
    } finally {
      setDraftsLoading(false);
    }
  }, [threadId]);

  // スレッド選択時にメッセージノートを取得
  useEffect(() => {
    if (threadId) fetchMessageNotes();
  }, [threadId, fetchMessageNotes]);

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
    setShareAllowPromptFork(thread?.allow_prompt_fork ?? true);
    setShareToken(thread?.share_token ?? null);
    setShareGenre((thread?.genre as string | null) ?? null); // 👈 追加
    setSelectedParentGenreId(null); // 👈 追加
  };

  // ★ 公開設定を保存
  const handleSaveShare = async (newPublic: boolean, newHideMemos: boolean, newAllowPromptFork: boolean, newGenre?: string | null) => {
    if (newPublic && thread?.roleplay_mode) {
      alert("なりきりモードのスレッドは公開できません。\nなりきりモードをOFFにしてから公開設定を行ってください。");
      return;
    }
    if (!thread) return;
    setShareSaving(true);
    try {
      const res = await fetch(`/api/threads/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_public: newPublic,
          hide_memos: newHideMemos,
          allow_prompt_fork: newAllowPromptFork,
          needsToken: newPublic,
          ...(newPublic && { shared_at: new Date().toISOString() }), // ✅ v76: 公開時に現在時刻をスナップショット
          ...(newGenre !== undefined && { genre: newGenre }), // 👈 追加（undefinedの時は送らない）
        }),
      });
      if (!res.ok) throw new Error("公開設定保存失敗");
      const updated = await res.json();
      onThreadUpdate(thread.id, {
        is_public: updated.is_public,
        hide_memos: updated.hide_memos,
        allow_prompt_fork: updated.allow_prompt_fork,
        share_token: updated.share_token,
        shared_at: updated.shared_at ?? null,
        genre: updated.genre ?? null,
      });
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
      showToast("共有URLをコピーしました");
    });
  };

  // ✅ v76: Pushボタン — shared_at を現在時刻で更新してスナップショットを更新
const handlePushLatest = async () => {
  if (!thread) return;
  setShareSaving(true);
  try {
    const now = new Date().toISOString();
    const res = await fetch(`/api/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shared_at: now }),
    });
    if (!res.ok) throw new Error("Push失敗");
    const updated = await res.json();
    onThreadUpdate(thread.id, { shared_at: updated.shared_at ?? null });
    showToast("最新の会話をPushしました");
  } catch (err) {
    console.error("Push失敗:", err);
  } finally {
    setShareSaving(false);
  }
};

  // ★ システムプロンプトを保存
  const handleSaveSystemPrompt = async () => {
  if (!thread) return;
  setSystemPromptSaving(true);
  try {
    const res = await fetch(`/api/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_prompt: systemPromptDraft,
        title: thread.title || "無題", // Gemini指摘: INSERT時のフォールバック
      }),
    });
    if (!res.ok) throw new Error("システムプロンプト保存失敗");
    const updated = await res.json();
    onThreadUpdate(thread.id, { system_prompt: updated.system_prompt ?? "" });
  } catch (err) {
    console.error("システムプロンプト保存失敗:", err);
  } finally {
    setSystemPromptSaving(false);
  }
};

  const handleOpenRoleplay = useCallback(() => {
  setShowRoleplay(true);
  setShowNotes(false);
  setShowDrafts(false);
  setShowSystemPrompt(false);
  setShowShare(false);
  setShowApiKeys(false);
  setRpCharNameDraft(rpCharName);
}, [rpCharName]);

// なりきりモード設定を保存
const handleSaveRoleplay = async (
  newMode: boolean,
  newCharName: string,
  newIconUrl: string | null
) => {
  if (!thread) return;
  setRpSaving(true);
  try {
    const res = await fetch(`/api/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roleplay_mode: newMode,
        rp_char_name: newCharName,
        rp_char_icon_url: newIconUrl,
        title: thread.title || "無題",
      }),
    });
    if (!res.ok) throw new Error("なりきりモード保存失敗");
    onThreadUpdate(thread.id, {
      roleplay_mode: newMode,
      rp_char_name: newCharName,
      rp_char_icon_url: newIconUrl,
    });
  } catch (err) {
    console.error("なりきりモード保存失敗:", err);
  } finally {
    setRpSaving(false);
  }
};

// アイコン画像の圧縮（長辺200px・JPEG品質0.85・白背景）
// ※ ChatInput.tsx の compressImage と同じロジック・アイコン用に強めに圧縮
async function compressRpIcon(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 200; // アイコンは長辺200pxまで
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error("画像読み込み失敗")); };
    img.src = URL.createObjectURL(file);
  });
}

const handleRpIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("画像ファイルを選択してください");
    return;
  }
  setRpIconSaving(true);
  try {
    const dataUrl = await compressRpIcon(file);
    setRpCharIconUrl(dataUrl);
  } catch {
    alert("画像の読み込みに失敗しました");
  } finally {
    setRpIconSaving(false);
    if (rpIconInputRef.current) rpIconInputRef.current.value = "";
  }
};

// なりきりモードON時にシステムプロンプトが空ならテンプレートを自動挿入
const handleToggleRoleplayMode = (next: boolean) => {
  setRoleplayMode(next);
  if (next && !(thread?.system_prompt?.trim())) {
    const charNameForTemplate = rpCharNameDraft.trim() || "キャラ名";
    const template = `あなたは「${charNameForTemplate}」として振る舞ってください。以下の口調や設定を厳密に守り、AIや言語モデルとしてのメタ発言はしないでください。\n\n【キャラクター設定】\n（ここに性格・口調・背景などを記入してください）`;
    setSystemPromptDraft(template);
    setShowSystemPrompt(true);
    setShowRoleplay(false);
  }
};


  // ★ タグ追加
  const handleAddTag = async () => {
    if (!thread || tagSubmittingRef.current) return;
    const raw = tagInputValue;
    const clean = normalizeTagName(raw);
    if (!clean) { setTagInputValue(""); setShowTagInput(false); return; }
    if (clean.length > TAG_NAME_MAX_LENGTH) return;

    tagSubmittingRef.current = true;
    setTagInputValue("");
    setShowTagInput(false);

    try {
      const res = await fetch(`/api/threads/${thread.id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean }),
      });
      if (!res.ok) throw new Error("タグ追加失敗");
      const data = await res.json();
      // 重複(duplicate: true)でなければstateに追加
      if (data && !data.duplicate && !data.error && data.id) {
        setTags((prev) => [...prev, data]);
      }
    } catch (err) {
      console.error("タグ追加失敗:", err);
    } finally {
      tagSubmittingRef.current = false;
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
      if (!res.ok) throw new Error("メモ追加失敗");
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
      if (!res.ok) throw new Error("メモ更新失敗");
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
      if (!res.ok) throw new Error("メッセージノート追加失敗");
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
      if (!res.ok) throw new Error("下書き保存失敗");
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



const handleExport = (format: "txt" | "md" | "md2" | "csv", options: ExportOptions = { omitCsv: false }) => {
  if (!thread || orderedMessages.length === 0) return;
  const content = buildExportContent(format, thread, visibleMessages, options);
  const mimeType =
    format === "md" || format === "md2" ? "text/markdown;charset=utf-8" :
    format === "csv" ? "text/csv;charset=utf-8" :
    "text/plain;charset=utf-8";
  const filename = thread.title.replace(/[/\\?%*:|"<>]/g, "_");
  const ext = format === "md2" ? "md" : format;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.${ext}`;
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

  const lastAssistantIndex = useMemo(
    () => visibleMessages.reduce(
      (last, msg, i) => (msg.role === "assistant" ? i : last),
      -1
    ),
    [visibleMessages]
  );
  const lastAssistantMsg = useMemo(
    () => lastAssistantIndex >= 0 ? visibleMessages[lastAssistantIndex] : null,
    [visibleMessages]
  );

  const handleEditAndRegenerateFromBubble = useCallback((
    assistantOrUserMsg: Message,
    editedContent: string,
    targetProvider: "claude" | "gemini" | "openai",
    modelId?: string,
  ) => {
    if (assistantOrUserMsg.role === "user") {
      onEditAndRegenerate(assistantOrUserMsg, editedContent, targetProvider, modelId);
      return;
    }

    const idx = visibleMessages.findIndex((m) => m.id === assistantOrUserMsg.id);
    for (let i = idx - 1; i >= 0; i--) {
      if (visibleMessages[i].role === "user" && visibleMessages[i].provider !== "memo") {
        onEditAndRegenerate(visibleMessages[i], editedContent, targetProvider, modelId);
        return;
      }
    }
  }, [visibleMessages, onEditAndRegenerate]);

  const handleRestoreBranchFromBubble = useCallback((message: Message) => {
    if (!message.branch_root_id || message.branch_index == null) return;
    onRestoreBranch?.(message.branch_root_id, message.branch_index);
  }, [onRestoreBranch]);

  const hasSystemPrompt = !!(thread?.system_prompt && thread.system_prompt.trim());

  const messageNumbers = useMemo(
    () => {
      let msgCounter = 0;
      return visibleMessages.reduce<Record<string, number>>((acc, msg) => {
        if (msg.provider !== 'memo') {
          msgCounter++;
          acc[msg.id] = msgCounter;
        }
        return acc;
      }, {});
    },
    [visibleMessages]
  );

  type BranchBlock = {
    anchorKey: string;
    anchorMessageId: string;
    branchPointNumber: number | null;
    lanes: BranchLane[];
  };

  const {
    inactiveBranchGroupsByAnchor,
    branchBlocksByAnchor,
  } = useMemo(() => {
    const activeAnchorByInactiveRootKeyDirect = dbActiveMessages.reduce<Record<string, string>>((acc, msg) => {
      if (msg.role !== "user" || !msg.branch_root_id) return acc;
      const rootMessage = messageById[msg.branch_root_id];
      if (!rootMessage || rootMessage.is_active !== false) return acc;
      const rootKey = getAnchorKey(rootMessage);
      if (!acc[rootKey]) {
        acc[rootKey] = getAnchorKey(msg);
      }
      return acc;
    }, {});

    const childGroupKeysByParentRootId = orderedMessages.reduce<Record<string, string[]>>((acc, msg) => {
      if (
        msg.is_active !== false ||
        msg.role !== "user" ||
        !msg.parent_id ||
        !msg.branch_root_id ||
        msg.branch_root_id !== msg.id ||
        msg.branch_index !== 0
      ) {
        return acc;
      }

      const parent = messageById[msg.parent_id];
      if (!parent || parent.is_active !== false || parent.branch_root_id !== parent.id) return acc;

      const parentRootKey = getAnchorKey(parent);
      const childRootKey = getAnchorKey(msg);
      if (!acc[parentRootKey]) acc[parentRootKey] = [];
      if (!acc[parentRootKey].includes(childRootKey)) {
        acc[parentRootKey].push(childRootKey);
      }
      return acc;
    }, {});

    // inactiveなrootメッセージ自身のparent_idがactiveを指す場合の直接マッピング。
    const parentAnchorByInactiveRootKeyDirect = orderedMessages.reduce<Record<string, string>>((acc, msg) => {
      if (
        msg.is_active !== false ||
        msg.role !== "user" ||
        !msg.parent_id ||
        !msg.branch_root_id ||
        msg.branch_root_id !== msg.id
      ) {
        return acc;
      }

      const parent = messageById[msg.parent_id];
      if (!parent || parent.is_active === false) return acc;

      const rootKey = getAnchorKey(msg);
      acc[rootKey] = getAnchorKey(parent);
      return acc;
    }, {});

    const resolveActiveAnchorForInactiveRoot = (
      rootKey: string,
      visited: Set<string> = new Set()
    ): string | undefined => {
      if (visited.has(rootKey)) return undefined;
      visited.add(rootKey);

      const directAnchor = activeAnchorByInactiveRootKeyDirect[rootKey];
      if (directAnchor) return directAnchor;

      const parentAnchor = parentAnchorByInactiveRootKeyDirect[rootKey];
      if (parentAnchor) return parentAnchor;

      const childRootKeys = childGroupKeysByParentRootId[rootKey] ?? [];
      for (const childRootKey of childRootKeys) {
        const resolvedAnchor = resolveActiveAnchorForInactiveRoot(childRootKey, new Set(visited));
        if (resolvedAnchor) return resolvedAnchor;
      }

      return undefined;
    };

    const activeAnchorByInactiveRootKey = orderedMessages.reduce<Record<string, string>>(
      (acc, msg) => {
        if (
          msg.is_active !== false ||
          msg.role !== "user" ||
          !msg.branch_root_id ||
          msg.branch_root_id !== msg.id
        ) {
          return acc;
        }

        const rootKey = getAnchorKey(msg);
        const resolvedAnchor = resolveActiveAnchorForInactiveRoot(rootKey);
        if (resolvedAnchor) {
          acc[rootKey] = resolvedAnchor;
        }
        return acc;
      },
      { ...activeAnchorByInactiveRootKeyDirect }
    );

    const branchGroupsByAnchor = orderedMessages.reduce<{
      groups: Record<string, Message[]>;
      anchors: Record<string, string>;
      previousActiveUser: Message | null;
    }>((acc, msg) => {
      if (msg.is_active !== false) {
        if (msg.role === "user" && msg.provider !== "memo") {
          acc.previousActiveUser = msg;
        }
        return acc;
      }

      const groupKey = `${msg.branch_root_id ?? msg.id}:${msg.branch_index ?? "legacy"}`;
      if (!acc.groups[groupKey]) {
        acc.groups[groupKey] = [];
        const rootMessage = msg.branch_root_id ? messageById[msg.branch_root_id] : null;
        const anchorMessage = rootMessage ?? acc.previousActiveUser;
        if (anchorMessage) {
          const anchorKey = getAnchorKey(anchorMessage);
          acc.anchors[groupKey] = activeAnchorByInactiveRootKey[anchorKey] ?? anchorKey;
        }
      }
      acc.groups[groupKey].push(msg);
      return acc;
    }, { groups: {}, anchors: {}, previousActiveUser: null });

    const inactiveBranchGroupsByAnchor = Object.entries(branchGroupsByAnchor.groups).reduce<Record<string, Message[][]>>(
      (acc, [groupKey, group]) => {
        const anchorKey = branchGroupsByAnchor.anchors[groupKey];
        if (!anchorKey) return acc;
        if (!acc[anchorKey]) acc[anchorKey] = [];
        acc[anchorKey].push(group);
        return acc;
      },
      {}
    );

    Object.values(inactiveBranchGroupsByAnchor).forEach((groups) => {
      groups.sort((a, b) => {
        const aIndex = typeof a[0]?.branch_index === "number" ? a[0].branch_index : Number.MAX_SAFE_INTEGER;
        const bIndex = typeof b[0]?.branch_index === "number" ? b[0].branch_index : Number.MAX_SAFE_INTEGER;
        if (aIndex !== bIndex) return aIndex - bIndex;
        return new Date(a[0]?.created_at ?? 0).getTime() - new Date(b[0]?.created_at ?? 0).getTime();
      });
    });

    const branchBlocksByAnchor = Object.values(chainBlocksByRootAnchor).reduce<Record<string, BranchBlock>>(
      (acc, chain) => {
        const currentLaneKey = resolveCurrentLaneKey(chain, orderedMessages);
        if (!currentLaneKey) return acc;
        const anchorMsg = resolveBranchBlockAnchor(currentLaneKey, visibleMessages);
        if (!anchorMsg) return acc;
        const anchorKey = getAnchorKey(anchorMsg);
        const lanes = buildBranchLanes(
          chain.branchRootIds,
          currentLaneKey,
          orderedMessages,
          messageById
        );

        if (lanes.length < 2 || !lanes.some((lane) => lane.isCurrent)) return acc;

        acc[anchorKey] = {
          anchorKey,
          anchorMessageId: anchorMsg.id,
          branchPointNumber: messageNumbers[anchorMsg.id] ?? null,
          lanes,
        };
        return acc;
      },
      {}
    );

    return {
      inactiveBranchGroupsByAnchor,
      branchBlocksByAnchor,
    };
  }, [orderedMessages, messageById, chainBlocksByRootAnchor, visibleMessages, messageNumbers]);

  const handleBranchLaneClick = async (lane: BranchLane) => {
    if (isLoading || lane.isCurrent) return;
    await onRestoreBranch?.(lane.branchRootId, lane.branchIndex);
    scrollToMessage(lane.branchRootId);
  };

  const isInitialInputMode =
    (!thread || orderedMessages.length === 0) && !isLoading;

  const footerInnerStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "840px",
    margin: "0 auto",
    padding: hasMobileSidebarButton ? "0 12px" : "0 24px",
    boxSizing: "border-box",
  };

  const shouldShowBottomInput =
    !isInitialInputMode && orderedMessages.length > 0 && !isLoading;

  const shouldShowFooter =
    shouldShowBottomInput ||
    (isLoading && githubProgressMessages.length > 0) ||
    !!(isLoading && onAbort) ||
    (!isInitialInputMode && !!thread);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", background: isTemporary ? "#f1f1f0" : "var(--chat-bg)", overflow: "hidden" }}>
      <style>{`
        [data-chat-title-edit-button]:hover [data-chat-title-edit-icon],
        [data-chat-title-edit-button]:focus-visible [data-chat-title-edit-icon] {
          opacity: 1 !important;
        }
      `}</style>
      {/* Header */}
      {(!(isInitialInputMode && !thread) || hasMobileSidebarButton) && (
      <div style={{ padding: hasMobileSidebarButton ? "10px 14px" : "12px 28px", borderBottom: "1px solid var(--border)", background: "var(--chat-bg)" }}>
        {thread ? (
          <>
            {/* 1行目: タイトル + ボタン群 */}
            <div style={{ display: "flex", alignItems: "center", gap: hasMobileSidebarButton ? "8px" : "12px", minHeight: "36px", flexWrap: hasMobileSidebarButton ? "wrap" : "nowrap" }}>
              {!hasMobileSidebarButton && (
                <div style={{ width: "4px", height: "18px", background: "var(--accent)", borderRadius: "2px", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <button
                  type="button"
                  title="タイトルを編集"
                  aria-label="タイトルを編集"
                  data-chat-title-edit-button
                  onClick={openDialog}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    width: hasMobileSidebarButton ? "100%" : "fit-content",
                    maxWidth: "100%",
                    minWidth: 0,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    color: "var(--ink)",
                    cursor: "pointer",
                    textAlign: "left",
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontFamily: "'Lora', serif",
                      fontSize: "16px",
                      fontWeight: 500,
                    }}
                  >
                    {thread.title}
                  </span>
                  <span
                    data-chat-title-edit-icon
                    aria-hidden="true"
                    style={{
                      display: hasMobileSidebarButton ? "none" : "inline",
                      flexShrink: 0,
                      opacity: 0,
                      transition: "opacity 0.15s",
                      fontSize: "13px",
                      lineHeight: 1,
                    }}
                  >
                    ✏️
                  </span>
                </button>
                {(() => {
                  const userCount = orderedMessages.filter((m) => m.role === "user" && m.provider !== "memo").length;
                  const aiCount = orderedMessages.filter((m) => m.role === "assistant").length;
                  if (userCount === 0) return null;
                  return (
                    <div style={{ fontSize: "10px", color: "var(--ink-faint)", marginTop: "1px", fontFamily: "'JetBrains Mono', monospace" }}>
                      あなた {userCount}回 / AI {aiCount}回
                    </div>
                  );
                })()}
              </div>

              {hasMobileSidebarButton && (
                <button
                  type="button"
                  aria-label="サイドバーを開く"
                  onClick={onMobileSidebarOpen}
                  style={{
                    width: "38px",
                    height: "38px",
                    flexShrink: 0,
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    background: "white",
                    color: "var(--ink)",
                    fontSize: "22px",
                    lineHeight: 1,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ☰
                </button>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, flexWrap: hasMobileSidebarButton ? "wrap" : "nowrap", width: hasMobileSidebarButton ? "100%" : "auto", marginTop: hasMobileSidebarButton ? "6px" : 0 }}>

                {/* 公開/非公開 */}
                <button
                  onClick={handleOpenShare}
                  style={{ padding: "4px 10px", borderRadius: "6px", border: `1px solid ${sharePublic ? "#bbf7d0" : "var(--border)"}`, background: sharePublic ? "#f0fdf4" : "white", color: sharePublic ? "#16a34a" : "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", transition: "all 0.15s" }}
                >
                  {sharePublic ? "🌐 公開中" : "🔒 非公開"}
                </button>

                {/* プロンプト */}
                <button
                  onClick={handleOpenSystemPrompt}
                  style={{ padding: "4px 10px", borderRadius: "6px", border: `1px solid ${hasSystemPrompt ? "var(--accent)" : "var(--border)"}`, background: "white", color: hasSystemPrompt ? "var(--accent)" : "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", transition: "all 0.15s" }}
                >
                  🤖 プロンプト{hasSystemPrompt && " ✓"}
                </button>

                {/* メモ */}
                <button
                  onClick={handleOpenNotes}
                  style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid var(--border)", background: showNotes ? "var(--accent)" : "white", color: showNotes ? "white" : "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", transition: "all 0.15s" }}
                >
                  📝 メモ{notes.length > 0 && ` (${notes.length})`}
                </button>

                {/* 履歴ナビゲーショントグル */}
                {isDesktop && (
                  <button
                    onClick={() => setNavExpanded(v => !v)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      background: navExpanded ? "var(--accent)" : "white",
                      color: navExpanded ? "white" : "var(--ink-muted)",
                      fontSize: "11px",
                      fontFamily: "'JetBrains Mono', monospace",
                      cursor: "pointer",
                      transition: "all 0.12s",
                    }}
                  >
                    {navExpanded ? "📖 履歴ON" : "📘 履歴OFF"}
                  </button>
                )}

                {/* ··· メニュー */}
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setShowMoreMenu((v) => !v)}
                    style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "16px", lineHeight: 1, cursor: "pointer" }}
                  >
                    ···
                  </button>
                  {showMoreMenu && (
                    <>
                      <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setShowMoreMenu(false)} />
                      <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 20, background: "white", border: "1px solid var(--border)", borderRadius: "8px", padding: "4px", minWidth: "170px", boxShadow: "0 4px 16px rgba(0,0,0,0.10)" }}>
                        {[
                          { label: "🌳 分岐ツリー",        action: () => { window.location.href = `/threads/${thread.id}/tree`; } },
                          { label: "📋 この会話をコピー", action: async () => { const ok = window.confirm("この会話をベースに新しいスレッドを作成します。よろしいですか？"); if (ok) await onCopyThread(thread.id); } },
                          { label: "✎ タイトル編集",      action: () => openDialog() },
                          { label: "🔑 APIキー",           action: () => handleOpenApiKeys() },
                          { label: "↓ TXT",               action: () => { if (messages.length > 0) setExportFormat("txt"); } },
                          { label: "↓ MD",                action: () => { if (messages.length > 0) setExportFormat("md"); } },
                          { label: "↓ MD v2",             action: () => { if (messages.length > 0) setExportFormat("md2"); } },
                          { label: "↓ CSV",               action: () => { if (messages.length > 0) setExportFormat("csv"); } },
                          { label: isTemporary ? "⚡ 一時モード中 ✓" : "⚡ 一時モード", action: () => onSwitchTemporary(), active: isTemporary },
                          { label: `📋 下書き${drafts.length > 0 ? ` (${drafts.length})` : ""}`, action: () => handleOpenDrafts() },
                          { label: `🎭 なりきりモード${roleplayMode ? " ✓" : ""}`, action: () => handleOpenRoleplay(), active: roleplayMode },
                          {
                            label: " 会話履歴",
                            action: () => {
                              if (isDesktop) {
                                setNavExpanded((v: boolean) => !v);
                              } else {
                                setShowMobileHistory(true);
                              }
                            },
                          },
                        ].map((item) => (
                          <button
                            key={item.label}
                            onClick={() => { item.action(); setShowMoreMenu(false); }}
                            style={{ display: "block", width: "100%", textAlign: "left", fontSize: "12px", padding: "6px 10px", background: item.active ? "#fef3c7" : "none", border: "none", color: item.active ? "#d97706" : "var(--ink)", borderRadius: "5px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = item.active ? "#fde68a" : "#f5f5f5"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = item.active ? "#fef3c7" : "none"; }}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

  </div>
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
                  onChange={(e) => {
                    const next = e.target.value;
                    if (normalizeTagName(next).length <= TAG_NAME_MAX_LENGTH) {
                      setTagInputValue(next);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleAddTag(); }
                    if (e.key === "Escape") { e.stopPropagation(); setShowTagInput(false); setTagInputValue(""); }
                  }}
                  onBlur={handleAddTag}
                  placeholder="#タグ名"
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
          <div style={{ minHeight: "36px", display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: "13px", color: "var(--ink-muted)", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              スレッドを選択するか、新規作成してください
            </div>
            {hasMobileSidebarButton && (
              <button
                type="button"
                aria-label="サイドバーを開く"
                onClick={onMobileSidebarOpen}
                style={{
                  width: "38px",
                  height: "38px",
                  flexShrink: 0,
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  background: "white",
                  color: "var(--ink)",
                  fontSize: "22px",
                  lineHeight: 1,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ☰
              </button>
            )}
          </div>
        )}
      </div>
      )}

      {/* ✅ v26追加: 検索ナビゲーションバー（ヒットが1件以上の時だけ表示） */}
      {searchMatchIds.length > 0 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 28px",
          background: "rgba(124, 58, 237, 0.06)",
          borderBottom: "1px solid rgba(124, 58, 237, 0.15)",
          fontSize: "12px",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {/* カウンター */}
          <span style={{ color: "#7c3aed", fontWeight: 500, minWidth: "60px" }}>
            {searchMatchIndex + 1} / {searchMatchIds.length} 件
          </span>
          {/* ↑ボタン */}
          <button
            onClick={() => onMatchNavigate?.("prev")}
            title="前のヒット"
            style={{
              width: "26px", height: "26px",
              borderRadius: "6px",
              border: "1px solid rgba(124, 58, 237, 0.3)",
              background: "white",
              color: "#7c3aed",
              fontSize: "12px",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.12s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#7c3aed"; (e.currentTarget as HTMLButtonElement).style.color = "white"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "white"; (e.currentTarget as HTMLButtonElement).style.color = "#7c3aed"; }}
          >↑</button>
          {/* ↓ボタン */}
          <button
            onClick={() => onMatchNavigate?.("next")}
            title="次のヒット"
            style={{
              width: "26px", height: "26px",
              borderRadius: "6px",
              border: "1px solid rgba(124, 58, 237, 0.3)",
              background: "white",
              color: "#7c3aed",
              fontSize: "12px",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.12s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#7c3aed"; (e.currentTarget as HTMLButtonElement).style.color = "white"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "white"; (e.currentTarget as HTMLButtonElement).style.color = "#7c3aed"; }}
          >↓</button>
          {/* 説明テキスト */}
          <span style={{ color: "rgba(124, 58, 237, 0.5)", fontSize: "11px", flex: 1 }}>
            検索ヒット
          </span>
          {/* × 検索解除ボタン */}
          <button
            onClick={() => onClearSearch?.()}
            title="検索解除"
            style={{
              padding: "2px 10px",
              borderRadius: "6px",
              border: "1px solid rgba(124, 58, 237, 0.2)",
              background: "transparent",
              color: "rgba(124, 58, 237, 0.6)",
              fontSize: "11px",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
              transition: "all 0.12s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#7c3aed"; (e.currentTarget as HTMLButtonElement).style.color = "#7c3aed"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(124, 58, 237, 0.2)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(124, 58, 237, 0.6)"; }}
          >× 解除</button>
        </div>
      )}

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
            <button onClick={handleSaveApiKeys} style={{ padding: "5px 16px", borderRadius: "6px", border: "none", background: "var(--accent)", color: "white", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", transition: "all 0.2s" }}>保存</button>
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
         {/* フォルダ設定継承バナー */}
          {folderSystemPrompt && !thread.system_prompt && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "8px 10px", background: "#ede9fe", borderRadius: "6px", marginBottom: "8px", border: "1px solid #c4b5fd" }}>
              <span style={{ fontSize: "12px", flexShrink: 0 }}>📁</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "11px", color: "#7c3aed", fontFamily: "'JetBrains Mono', monospace", marginBottom: "2px" }}>
                  フォルダ「{thread.folder_name}」の設定を継承中
                </div>
                <div style={{ fontSize: "11px", color: "#6d28d9", fontFamily: "'DM Sans', sans-serif", whiteSpace: "pre-wrap", lineHeight: 1.5, opacity: 0.8 }}>
                  {folderSystemPrompt.length > 60 ? folderSystemPrompt.slice(0, 60) + "…" : folderSystemPrompt}
                </div>
                <div style={{ fontSize: "10px", color: "#7c3aed", marginTop: "4px", opacity: 0.7 }}>
                  個別設定を入力すると上書きできます
                </div>
              </div>
            </div>
          )}
          <textarea
            id="system-prompt-textarea"
            name="system-prompt-textarea"
            value={systemPromptDraft}
            onChange={(e) => setSystemPromptDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSaveSystemPrompt(); }}
            placeholder={`例：あなたは優秀なプロダクトマネージャーです。ユーザーのアイデアに対して、批判的かつ建設的なフィードバックをしてください。\n例：あなたは厳しい編集者です。文章の冗長な部分を容赦なく指摘してください。`}
            style={{ width: "100%", minHeight: "100px", maxHeight: "200px", padding: "10px 12px", border: "1px solid #c4b5fd", borderRadius: "7px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", resize: "vertical", outline: "none", color: "var(--ink)", boxSizing: "border-box", background: "white", lineHeight: 1.6 }}
          />
          {/* ⚠️ トークン数警告 */}
          {systemPromptDraft.length > 5000 && (
            <div style={{ marginTop: "6px", padding: "6px 10px", borderRadius: "6px", background: "#fff7ed", border: "1px solid #fed7aa", fontSize: "11px", color: "#c2410c", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
              ⚠️ プロンプトが長い場合、ChatGPT（TPM制限）ではエラーになることがあります。Claude・Geminiは問題ありません。
            </div>
          )}
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
              <div onClick={() => {
                const next = !sharePublic;
                if (next && thread) {
                  const t = thread.title ?? "";
                  const isDefaultTitle = t === "新しい壁打ち" || (t.length === 21 && t.endsWith("…"));
                  setPendingDefaultTitle(isDefaultTitle ? t : null);
                  setShowPublishConfirm(true);
                  return;
                }
                // 非公開に戻す場合はモーダル不要
                setSharePublic(false);
                handleSaveShare(false, shareHideMemos, shareAllowPromptFork);
                }} 
                style={{ width: "40px", height: "22px", borderRadius: "11px", background: sharePublic ? "#16a34a" : "#d1d5db", transition: "background 0.2s", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", padding: "2px" }}>
                <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: "white", transition: "transform 0.2s", transform: sharePublic ? "translateX(18px)" : "translateX(0)" }} />
              </div>
              <span style={{ fontSize: "13px", color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
                {sharePublic ? "🌐 公開中（リンクを知っている人が閲覧可能）" : "🔒 非公開"}
              </span>
              {shareSaving && <span style={{ fontSize: "11px", color: "var(--ink-faint)" }}>保存中…</span>}
            </label>
{sharePublic && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingLeft: "4px" }}>

                {/* メモ非表示トグル */}
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                  <div onClick={() => { const next = !shareHideMemos; setShareHideMemos(next); handleSaveShare(sharePublic, next, shareAllowPromptFork); }} style={{ width: "40px", height: "22px", borderRadius: "11px", background: shareHideMemos ? "#7c3aed" : "#d1d5db", transition: "background 0.2s", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", padding: "2px" }}>
                    <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: "white", transition: "transform 0.2s", transform: shareHideMemos ? "translateX(18px)" : "translateX(0)" }} />
                  </div>
                  <span style={{ fontSize: "13px", color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>📝 メモを共有ページに表示しない</span>
                </label>

                {/* システムプロンプトフォークトグル */}
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                  <div onClick={() => { const next = !shareAllowPromptFork; setShareAllowPromptFork(next); handleSaveShare(sharePublic, shareHideMemos, next); }} style={{ width: "40px", height: "22px", borderRadius: "11px", background: shareAllowPromptFork ? "#16a34a" : "#d1d5db", transition: "background 0.2s", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", padding: "2px" }}>
                    <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: "white", transition: "transform 0.2s", transform: shareAllowPromptFork ? "translateX(18px)" : "translateX(0)" }} />
                  </div>
                  <span style={{ fontSize: "13px", color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
                    {shareAllowPromptFork ? "🔓 システムプロンプトをフォーク時に引き継ぐ" : "🔒 システムプロンプトを非公開（シークレット）"}
                  </span>
                </label>

                {/* ジャンル選択UI */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ fontSize: "11px", color: "var(--ink-muted)", fontFamily: "'JetBrains Mono', monospace" }}>ジャンル（任意）</div>

                  {/* 大分類チップ */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {GENRES.map((parent) => {
                      const isExpanded = selectedParentGenreId === parent.id;
                      const hasSelectedChild = parent.children.some(c => c.id === shareGenre);
                      return (
                        <button
                          key={parent.id}
                          onClick={() => {
                            if (isExpanded) {
                              setSelectedParentGenreId(null);
                            } else {
                              setSelectedParentGenreId(parent.id);
                              if (!hasSelectedChild) setShareGenre(null);
                            }
                          }}
                          style={{
                            padding: "4px 10px", borderRadius: "999px", fontSize: "11px", cursor: "pointer",
                            border: hasSelectedChild ? "1.5px solid #3b82f6" : "1px solid var(--border)",
                            background: hasSelectedChild ? "#3b82f6" : "white",
                            color: hasSelectedChild ? "white" : "var(--ink)",
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          {parent.icon} {parent.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* 中分類（展開中の大分類がある時だけ表示） */}
                  {selectedParentGenreId && (() => {
                    const expandedParent = GENRES.find(g => g.id === selectedParentGenreId);
                    if (!expandedParent) return null;
                    return (
                      <div style={{ padding: "8px 10px", background: "#f8fafc", borderRadius: "8px", borderLeft: "2px solid #3b82f6" }}>
                        <div style={{ fontSize: "10px", color: "var(--ink-muted)", marginBottom: "6px", fontFamily: "'DM Sans', sans-serif" }}>
                          ▸ {expandedParent.label}の中から選択
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                          {expandedParent.children.map((child) => (
                            <button
                              key={child.id}
                              onClick={() => {
                                setShareGenre(child.id);
                                handleSaveShare(sharePublic, shareHideMemos, shareAllowPromptFork, child.id);
                              }}
                              style={{
                                padding: "3px 9px", borderRadius: "999px", fontSize: "11px", cursor: "pointer",
                                border: shareGenre === child.id ? "1.5px solid #3b82f6" : "1px solid var(--border)",
                                background: shareGenre === child.id ? "#dbeafe" : "white",
                                color: shareGenre === child.id ? "#1d4ed8" : "var(--ink-muted)",
                                fontFamily: "'DM Sans', sans-serif",
                              }}
                            >
                              {child.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 確定結果チップ */}
                  {shareGenre && (() => {
                    const parent = GENRES.find(g => g.children.some(c => c.id === shareGenre));
                    const child = parent?.children.find(c => c.id === shareGenre);
                    return (
                      <div>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", padding: "2px 10px", borderRadius: "999px", background: "#dbeafe", color: "#1d4ed8", border: "1px solid #93c5fd" }}>
                          {parent?.icon} {parent?.label} › {child?.label}
                          <span
                            onClick={() => { setShareGenre(null); setSelectedParentGenreId(null); handleSaveShare(sharePublic, shareHideMemos, shareAllowPromptFork, null); }}
                            style={{ marginLeft: "2px", cursor: "pointer", opacity: 0.6, fontSize: "10px" }}
                          >✕</span>
                        </span>
                      </div>
                    );
                  })()}
                </div>

              </div>
            )}
            {sharePublic && shareToken && (
              <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "8px", background: "white", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "8px 12px" }}>
                <span style={{ fontSize: "12px", color: "#15803d", fontFamily: "'JetBrains Mono', monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {typeof window !== "undefined" ? `${window.location.origin}/share/${shareToken}` : `/share/${shareToken}`}
                </span>
                <button onClick={handleCopyUrl} style={{ padding: "4px 12px", borderRadius: "6px", border: "none", background: "#dcfce7", color: "#15803d", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}>📋 コピー</button>
              </div>
            )}
{/* ✅ v76: Pushボタン */}
            {sharePublic && shareToken && (
              <div style={{ marginTop: "4px", padding: "10px 12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "11px", color: "var(--ink-muted)", marginBottom: "8px", fontFamily: "'DM Sans', sans-serif" }}>
                  🔄 共有ページに表示する会話を更新（Push）します。押した時点までの内容が共有ページに反映されます。
                </div>
                <button
                  onClick={handlePushLatest}
                  disabled={shareSaving}
                  style={{
                    padding: "6px 14px", borderRadius: "6px",
                    border: "none",
                    background: "#3b82f6",
                    color: "white", fontSize: "12px",
                    fontFamily: "'JetBrains Mono', monospace",
                    cursor: shareSaving ? "default" : "pointer",
                    opacity: shareSaving ? 0.6 : 1,
                    transition: "all 0.2s",
                  }}
                >
                  {shareSaving ? "更新中…" : "🚀 最新の会話をPush"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    


      {/* ★ なりきりモードドロワー（公開設定ドロワーとは独立した別ブロック） */}
      {showRoleplay && thread && (
      <div style={{
        borderBottom: "1px solid var(--border)",
        padding: "16px 28px",
        background: "#fdf4ff",
        borderTop: "1px solid #e9d5ff",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
          <div style={{ fontFamily: "'Lora', serif", fontSize: "14px", fontWeight: 600, color: "#6b21a8" }}>
            🎭 なりきりモード
          </div>
          <button
            onClick={() => setShowRoleplay(false)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", fontSize: "16px", padding: "0 4px" }}
          >×</button>
        </div>

        {/* ON/OFFトグル */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <button
            onClick={() => handleToggleRoleplayMode(!roleplayMode)}
            style={{
              width: "40px", height: "22px",
              borderRadius: "11px",
              border: "none",
              background: roleplayMode ? "#9333ea" : "var(--border)",
              cursor: "pointer",
              position: "relative",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <span style={{
              position: "absolute",
              top: "3px",
              left: roleplayMode ? "21px" : "3px",
              width: "16px", height: "16px",
              borderRadius: "50%",
              background: "white",
              transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </button>
          <span style={{ fontSize: "13px", color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
            {roleplayMode ? "ON（なりきりモード有効）" : "OFF"}
          </span>
        </div>

        {/* なりきりモードがONの場合のみキャラ設定を表示 */}
        {roleplayMode && (
          <>
            {/* アイコン設定 */}
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", marginBottom: "8px", letterSpacing: "0.05em" }}>
                AIキャラのアイコン
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* アイコンプレビュー */}
                <div style={{
                  width: "56px", height: "56px",
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "2px solid #d8b4fe",
                  background: "#f5f3ff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "26px", flexShrink: 0, userSelect: "none",
                }}>
                  {rpCharIconUrl ? (
                    <img src={rpCharIconUrl} alt="icon" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : "🤖"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <button
                    onClick={() => rpIconInputRef.current?.click()}
                    disabled={rpIconSaving}
                    style={{
                      padding: "5px 14px",
                      borderRadius: "6px",
                      border: "1px solid #d8b4fe",
                      background: "white",
                      color: "#7c3aed",
                      fontSize: "11px",
                      fontFamily: "'JetBrains Mono', monospace",
                      cursor: rpIconSaving ? "default" : "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {rpIconSaving ? "⏳ 処理中…" : "📁 画像を選択"}
                  </button>
                  {rpCharIconUrl && (
                    <button
                      onClick={() => setRpCharIconUrl(null)}
                      style={{
                        padding: "5px 14px",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        background: "white",
                        color: "var(--ink-muted)",
                        fontSize: "11px",
                        fontFamily: "'JetBrains Mono', monospace",
                        cursor: "pointer",
                      }}
                    >
                      🗑️ 削除
                    </button>
                  )}
                </div>
                <input
                  ref={rpIconInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={handleRpIconChange}
                  style={{ display: "none" }}
                />
              </div>
              <div style={{ fontSize: "10px", color: "var(--ink-faint)", marginTop: "6px", fontFamily: "'JetBrains Mono', monospace" }}>
                PNG / JPEG / GIF / WebP · 自動で長辺200pxに圧縮
              </div>
            </div>

            {/* キャラ名設定 */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", marginBottom: "6px", letterSpacing: "0.05em" }}>
                AIキャラの名前
              </div>
              <input
                value={rpCharNameDraft}
                onChange={(e) => setRpCharNameDraft(e.target.value.slice(0, 30))}
                placeholder="例: 魔女アリス、探偵ルシアン…"
                maxLength={30}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid #d8b4fe",
                  borderRadius: "7px",
                  fontSize: "13px",
                  fontFamily: "'DM Sans', sans-serif",
                  color: "var(--ink)",
                  background: "white",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#9333ea"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "#d8b4fe"; }}
              />
              <div style={{ fontSize: "10px", color: "var(--ink-faint)", marginTop: "4px", fontFamily: "'JetBrains Mono', monospace" }}>
                {rpCharNameDraft.length}/30 · You（あなた側）の名前は変更できません
              </div>
            </div>

            {/* システムプロンプトへの誘導 */}
            <div style={{
              padding: "10px 12px",
              borderRadius: "8px",
              background: "#f3e8ff",
              border: "1px solid #e9d5ff",
              fontSize: "12px",
              color: "#6b21a8",
              fontFamily: "'DM Sans', sans-serif",
              lineHeight: 1.6,
              marginBottom: "16px",
            }}>
              💡 キャラの人格・口調は <strong>「🤖 プロンプト」</strong> から設定できます。
              なりきりモードONにすると空のシステムプロンプトにテンプレートが自動挿入されます。
            </div>

            {/* 注意事項 */}
            <div style={{
              padding: "8px 12px",
              borderRadius: "6px",
              background: "#fef9c3",
              border: "1px solid #fde68a",
              fontSize: "11px",
              color: "#92400e",
              fontFamily: "'JetBrains Mono', monospace",
              lineHeight: 1.6,
              marginBottom: "16px",
            }}>
              ⚠️ このスレッドは公開できません（なりきりモード専用）
            </div>
          </>
        )}

        {/* 保存ボタン */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => handleSaveRoleplay(roleplayMode, rpCharNameDraft.trim(), rpCharIconUrl).then(() => setShowRoleplay(false))}
            disabled={rpSaving}
            style={{
              padding: "7px 20px",
              borderRadius: "7px",
              border: "none",
              background: rpSaving ? "var(--border)" : "#9333ea",
              color: "white",
              fontSize: "12px",
              fontFamily: "'JetBrains Mono', monospace",
              cursor: rpSaving ? "default" : "pointer",
              transition: "all 0.15s",
            }}
          >
            {rpSaving ? "保存中…" : "保存"}
          </button>
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
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "28px 0", position: "relative" }}>
        <div
          style={{
            width: "100%",
            maxWidth: "840px",
            margin: "0 auto",
            padding: hasMobileSidebarButton ? "0 12px" : "0 24px",
            boxSizing: "border-box",
          }}
        >
        {visibleMessages.map((msg) => {
  const activeIdx = visibleMessages.indexOf(msg);
  return (
  <Fragment key={msg.id}>
  <div id={`msg-${msg.id}`}
    style={roleplayMode && msg.role === "user" ? {
      display: "flex",
      justifyContent: "flex-end",   // 右寄せ
      marginBottom: "12px",
    } : undefined}
  >
    {roleplayMode && msg.role === "user" ? (
      // なりきりモード中のuserメッセージ：右寄せ吹き出し
      <div style={{
        maxWidth: "72%",
        background: "#dcf8c6",       // LINEっぽい緑（好みで変更可）
        borderRadius: "12px 4px 12px 12px",
        padding: "10px 14px",
        fontSize: "14px",
        lineHeight: 1.75,
        color: "var(--ink)",
        fontFamily: "'DM Sans', sans-serif",
        whiteSpace: "pre-wrap",
      }}>
        {msg.content}
      </div>
    ) : roleplayMode && msg.role === "assistant" ? (
      <RoleplayBubble
        message={msg}
        charName={rpCharName || "AI"}
        charIconUrl={rpCharIconUrl}
        isLast={activeIdx === lastAssistantIndex}
        isLoading={isLoading}
        provider={provider}
        onRegenerate={onRegenerate}
        onTrimFrom={onTrimFrom}
        messageNotes={messageNotes}
        onAddMessageNote={handleAddMessageNote}
        onDeleteMessageNote={handleDeleteMessageNote}
        isHighlighted={searchMatchIds.includes(msg.id)}
        isActiveMatch={searchMatchIds[searchMatchIndex] === msg.id}
        activeFlashKey={searchMatchIds[searchMatchIndex] === msg.id ? searchMatchIndex : undefined}
        onUpdateMessage={onUpdateMessage}
        onOpenRoleplaySettings={handleOpenRoleplay}
        messageNumber={messageNumbers[msg.id]}
      />
    ) : (
      <MessageBubble
        message={msg}
        isLast={activeIdx === lastAssistantIndex}
        isLoading={isLoading}
        provider={provider}
        onRegenerate={onRegenerate}
        onEditAndRegenerate={handleEditAndRegenerateFromBubble}
        prevUserContent={(() => {
          const idx = orderedMessages.findIndex(m => m.id === msg.id);
          for (let i = idx - 1; i >= 0; i--) {
            if (orderedMessages[i].role === "user") return orderedMessages[i].content;
          }
          return "";
        })()}
        editRegenAssistantMsg={(() => {
          if (msg.role !== "user") return lastAssistantMsg ?? undefined;
          const activeIdx = visibleMessages.findIndex(m => m.id === msg.id);
          if (activeIdx === -1) return undefined;
          return visibleMessages.slice(activeIdx + 1).find(m => m.role === "assistant");
        })()}
        canEditAndRegenerateFromUser={
          msg.role === "user" &&
          msg.provider !== "memo" &&
          (() => {
            const activeIdx = visibleMessages.findIndex(m => m.id === msg.id);
            return activeIdx !== -1 && visibleMessages.some((m, j) => j > activeIdx && m.role === "assistant");
          })()
        }
        onTrimFrom={onTrimFrom}
        onMemoize={onMemoizeMessage}
        onDeleteImage={onDeleteImage}
        messageNotes={messageNotes}
        onAddMessageNote={handleAddMessageNote}
        onDeleteMessageNote={handleDeleteMessageNote}
        isHighlighted={searchMatchIds.includes(msg.id)}
        isActiveMatch={searchMatchIds[searchMatchIndex] === msg.id}
        activeFlashKey={searchMatchIds[searchMatchIndex] === msg.id ? searchMatchIndex : undefined}
        onUpdateMessage={onUpdateMessage}
        messageNumber={messageNumbers[msg.id]}
        thinkingContent={thinkingContents?.[msg.id]}
        onDiscuss={onDiscuss}
        onImageRef={onImageRef}
        onSendMemoToAI={onSendMemoToAI}
        onBranchToNewChat={onBranchToNewChat}
      />
    )}
  </div>
  {(inactiveBranchGroupsByAnchor[getAnchorKey(msg)] ?? []).map((group) => (
    <BranchBubble
      key={`branch-${group[0]?.branch_root_id ?? group[0]?.id}:${group[0]?.branch_index ?? "legacy"}`}
      messages={group}
      onRestore={handleRestoreBranchFromBubble}
    />
  ))}
  </Fragment>
  );
})}
        {isLoading && !streamingContent && (
  roleplayMode ? (
    <RoleplayThinkingBubble charName={rpCharName || "AI"} charIconUrl={rpCharIconUrl} />
  ) : (
    <ThinkingBubble />
  )
)}
{isLoading && streamingContent && (
  roleplayMode ? (
    // なりきりモード: LINEライク吹き出しでストリーミング表示
    <RoleplayThinkingBubble
      charName={rpCharName || "AI"}
      charIconUrl={rpCharIconUrl}
      streamingContent={streamingContent}
    />
  ) : (
    // 通常モード: 既存のプレーンテキスト表示（変更なし）
    <div style={{ padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent)", animation: "pulse 1s infinite" }} />
        <span style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--ink-muted)", letterSpacing: "0.05em" }}>生成中…</span>
      </div>
      <div style={{ fontSize: "14px", lineHeight: 1.75, color: "var(--ink)", whiteSpace: "pre-wrap", fontFamily: "'DM Sans', sans-serif" }}>
        {streamingContent}
      </div>
    </div>
  )
)}


        </div>
        </div>

        {isInitialInputMode && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              justifyContent: "center",
              zIndex: 30,
              pointerEvents: "none",
            }}
          >
            <div style={{ pointerEvents: "auto" }}>
              <ChatInputCentered
                value={inputValue}
                onChange={onInputChange}
                onSubmit={onSubmit}
                onMemoSubmit={onMemoSubmit}
                isLoading={isLoading}
                provider={provider}
                onProviderChange={onProviderChange}
                displayName={displayName}
              />
            </div>
          </div>
        )}

        {shouldShowFooter && (
          <div
            style={{
              background: "transparent",
            }}
          >
            <div style={footerInnerStyle}>

              {/* GitHub探索中インジケーター */}
              {isLoading && githubProgressMessages.length > 0 && (
                <div style={{
                  padding: "8px 16px",
                  margin: "4px 0",
                  borderRadius: "8px",
                  background: "var(--surface, #f5f5f5)",
                  border: "1px solid var(--border)",
                  fontSize: "11px",
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "var(--ink-muted)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                }}>
                  <div style={{ color: "var(--ink-faint)", marginBottom: "2px", fontSize: "10px" }}>
                    GitHub を探索中...
                  </div>
                  {githubProgressMessages.map((msg, i) => (
                    <div key={i}> {msg}</div>
                  ))}
                </div>
              )}

              {/* 生成を中断ボタン */}
              {isLoading && onAbort && (
                <div style={{ padding: "0 0 8px", display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={onAbort}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 20px",
                      borderRadius: "8px",
                      border: "1.5px solid #e53e3e",
                      background: "white",
                      color: "#e53e3e",
                      fontSize: "12px",
                      fontFamily: "'JetBrains Mono', monospace",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "#fff5f5";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "white";
                    }}
                  >
                    <span style={{
                      display: "inline-block",
                      width: "10px", height: "10px",
                      background: "#e53e3e",
                      borderRadius: "2px",
                      flexShrink: 0,
                    }} />
                    生成を中断 <span style={{ opacity: 0.5, fontSize: "10px" }}>(Esc)</span>
                  </button>
                </div>
              )}

              {/* 下書き保存ボタン */}
              {!isInitialInputMode && thread && inputValue.trim() && (
                <div style={{ padding: "0 0 8px", display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={handleSaveDraft}
                    style={{ padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--border)", background: "white", color: "var(--ink-muted)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", transition: "all 0.15s" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-muted)"; }}
                  >
                     下書き保存
                  </button>
                </div>
              )}

              {/* 入力欄 */}
              {shouldShowBottomInput && (
                <ChatInput
                  value={inputValue}
                  onChange={onInputChange}
                  onSubmit={onSubmit}
                  onMemoSubmit={onMemoSubmit}
                  isLoading={isLoading}
                  disabled={!thread}
                  provider={provider}
                  onProviderChange={onProviderChange}
                  onImageGenerate={onImageGenerate}
                  imageContextId={imageContextId}
                  isImagePinned={isImagePinned}
                  onImagePinToggle={onImagePinToggle}
                  onImageContextClear={onImageContextClear}
                  imageRefId={imageRefId}
                  onImageRefClear={onImageRefClear}
                  imageRefUpload={imageRefUpload}
                  onImageRefUpload={onImageRefUpload}
                  onImageRefUploadClear={onImageRefUploadClear}
                />
              )}

            </div>
          </div>
        )}
        </div>
        {/* 最小化インジケーター */}
        {isDesktop && !navExpanded && (
          <div style={{ position: "absolute", right: 0, top: 0, width: 16, height: "100%", pointerEvents: "none" }}>
            {dotPositions.map(({ id, topPct, role }) => {
              const msg = messageById[id];
              if (!msg) return null;
              const branchBlock = branchBlocksByAnchor[getAnchorKey(msg)];
              return (
                <div
                  key={id}
                  style={{
                    position: "absolute",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    top: `${topPct}%`,
                    width: 4,
                    height: role === "user" ? 14 : 8,
                    background: role === "user" ? "var(--accent)" : "var(--ink-faint)",
                    borderRadius: 2,
                    opacity: branchBlock ? 0.95 : 0.75,
                    cursor: "pointer",
                    pointerEvents: "auto",
                    ...(branchBlock ? { boxShadow: "0 0 0 2px var(--accent-muted)" } : {}),
                  }}
                  onClick={() => scrollToMessage(id)}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltipPos({ top: rect.top + rect.height / 2, right: window.innerWidth - rect.left + 8 });
                    setHoveredMsgId(id);
                  }}
                  onMouseLeave={() => { setHoveredMsgId(null); setTooltipPos(null); }}
                />
              );
            })}
            {hoveredMsgId && tooltipPos && (() => {
              const hoveredMsg = messageById[hoveredMsgId];
              if (!hoveredMsg) return null;
              const hoveredBranch = branchBlocksByAnchor[getAnchorKey(hoveredMsg)];
              const summary = generateMessageSummary(
                typeof hoveredMsg.content === "string" ? hoveredMsg.content : ""
              );
              return (
                <div style={{ position: "fixed", top: tooltipPos.top, right: tooltipPos.right, transform: "translateY(-50%)", background: "rgba(30,30,30,0.88)", color: "white", fontSize: 11, padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 200 }}>
                  {hoveredBranch ? `${summary}（分岐あり・${hoveredBranch.lanes.length}世界線）` : summary}
                </div>
              );
            })()}
          </div>
        )}

        {/* 展開時サイドペイン */}
        {isDesktop && navExpanded && (
          <div style={{
            width: navWide ? 260 : 180,
            borderLeft: "1px solid var(--border)",
            background: "var(--paper)",
            overflowY: "auto",
            padding: "12px 8px",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <div style={{ fontSize: "10px", color: "var(--ink-faint)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em" }}>
                会話履歴
              </div>
              <button
                onClick={() => {
                  setNavWide((v) => {
                    const next = !v;
                    localStorage.setItem("kabehub_nav_wide", String(next));
                    return next;
                  });
                }}
                title={navWide ? "幅を戻す" : "幅を広げる"}
                aria-label={navWide ? "会話履歴ペインの幅を戻す" : "会話履歴ペインの幅を広げる"}
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  color: "var(--ink-faint)",
                  fontSize: "10px",
                  cursor: "pointer",
                  padding: "1px 6px",
                  lineHeight: 1.4,
                }}
              >
                {navWide ? "縮小" : "拡大"}
              </button>
            </div>
            {dotPositions.map(({ id, role }) => {
              const msg = orderedMessages.find(m => String(m.id) === id);
              if (!msg) return null;
              const label = generateMessageSummary(
                typeof msg.content === "string" ? msg.content : ""
              );
              const branchBlock = branchBlocksByAnchor[getAnchorKey(msg)];
              return (
                <Fragment key={id}>
                  <div
                    onClick={() => scrollToMessage(id)}
                    style={{
                      padding: "5px 7px",
                      marginBottom: "3px",
                      borderRadius: "5px",
                      fontSize: "11px",
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: "pointer",
                      background: role === "user" ? "var(--sidebar-bg)" : "transparent",
                      border: "1px solid transparent",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      color: role === "user" ? "var(--ink)" : "var(--ink-muted)",
                      transition: "all 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = "transparent";
                    }}
                    title={label}
                  >
                    <span style={{ marginRight: "4px", fontSize: "9px" }}>
                      {role === "user" ? "👤" : "🤖"}
                    </span>
                    {branchBlock && (
                      <span
                        title={`分岐あり(${branchBlock.lanes.length}世界線)`}
                        style={{ marginRight: "4px", color: "var(--accent)", fontSize: "10px" }}
                      >
                        ◎
                      </span>
                    )}
                    {label}
                  </div>
                  {branchBlock && (
                    <div
                      style={{
                        margin: "0 0 6px 12px",
                        padding: "5px 0 3px 7px",
                        borderLeft: "2px solid var(--accent)",
                        fontSize: "11px",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      <div
                        style={{
                          marginBottom: "8px",
                          color: "var(--ink-faint)",
                          fontSize: "10px",
                          fontFamily: "'JetBrains Mono', monospace",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        分岐点 #{branchBlock.branchPointNumber ?? "?"} — {branchBlock.lanes.length}個の世界線
                      </div>
                      {branchBlock.lanes.map((lane) => (
                        <button
                          key={`${branchBlock.anchorKey}:${lane.branchRootId}:${lane.branchIndex}:${lane.isCurrent ? "current" : "branch"}`}
                          type="button"
                          onClick={() => {
                            if (isLoading || lane.isCurrent) return;
                            handleBranchLaneClick(lane);
                          }}
                          disabled={isLoading || lane.isCurrent}
                          aria-current={lane.isCurrent ? "true" : undefined}
                          style={{
                            display: "block",
                            width: "100%",
                            marginBottom: "3px",
                            padding: "4px 6px",
                            borderRadius: "5px",
                            border: lane.isCurrent ? "1px solid var(--accent)" : "1px solid var(--border)",
                            background: lane.isCurrent ? "var(--accent)" : "transparent",
                            color: lane.isCurrent ? "white" : "var(--ink-muted)",
                            cursor: isLoading || lane.isCurrent ? "default" : "pointer",
                            opacity: !lane.isCurrent && isLoading ? 0.45 : 1,
                            fontWeight: lane.isCurrent ? 600 : 400,
                            boxShadow: lane.isCurrent ? "inset 0 0 0 1px rgba(255,255,255,0.25)" : "none",
                            fontSize: "11px",
                            fontFamily: "'DM Sans', sans-serif",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          onMouseEnter={(e) => {
                            if (!lane.isCurrent) {
                              e.currentTarget.style.borderColor = "var(--accent-muted)";
                              e.currentTarget.style.background = "var(--sidebar-bg)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!lane.isCurrent) {
                              e.currentTarget.style.borderColor = "var(--border)";
                              e.currentTarget.style.background = "transparent";
                            }
                          }}
                          onFocus={(e) => {
                            if (!lane.isCurrent) {
                              e.currentTarget.style.borderColor = "var(--accent-muted)";
                              e.currentTarget.style.background = "var(--sidebar-bg)";
                            }
                          }}
                          onBlur={(e) => {
                            if (!lane.isCurrent) {
                              e.currentTarget.style.borderColor = "var(--border)";
                              e.currentTarget.style.background = "transparent";
                            }
                          }}
                          title={lane.label}
                        >
                          {lane.isCurrent ? "▶ 表示中: " : `世界線${lane.branchIndex}: `}
                          {lane.label}
                        </button>
                      ))}
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* エクスポートモーダル */}
      <ExportModal
        format={exportFormat}
        onClose={() => setExportFormat(null)}
        onExport={handleExport}
      />

      {/* ← ここに追加 */}
      <PublishConfirmModal
        isOpen={showPublishConfirm}
        isDefaultTitle={pendingDefaultTitle !== null}
        defaultTitle={pendingDefaultTitle ?? ""}
        onConfirm={() => {
          setShowPublishConfirm(false);
          setPendingDefaultTitle(null);
          setSharePublic(true);
          handleSaveShare(true, shareHideMemos, shareAllowPromptFork);
        }}
      onCancel={() => {
        setShowPublishConfirm(false);
        setPendingDefaultTitle(null);
      }}
    />

      {showMobileHistory && (
        <>
          {/* オーバーレイ */}
          <div
            onClick={() => setShowMobileHistory(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              zIndex: 200,
            }}
          />
          {/* 履歴ドロワー（右側） */}
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "80%",
              maxWidth: "320px",
              background: "var(--paper, white)",
              zIndex: 201,
              overflowY: "auto",
              padding: "16px 12px",
              boxShadow: "-4px 0 16px rgba(0,0,0,0.15)",
            }}
          >
            {/* ヘッダー */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px",
            }}>
              <div style={{
                fontSize: "11px",
                color: "var(--ink-faint)",
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.05em",
              }}>
                会話履歴
              </div>
              <button
                onClick={() => setShowMobileHistory(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "18px",
                  color: "var(--ink-muted)",
                  cursor: "pointer",
                  padding: "0 4px",
                }}
              >×</button>
            </div>

            {/* 履歴リスト（既存の展開サイドペインと同じ内容） */}
            {dotPositions.map(({ id, role }) => {
              const msg = orderedMessages.find(m => String(m.id) === id);
              if (!msg) return null;
              const label = generateMessageSummary(
                typeof msg.content === "string" ? msg.content : ""
              );
              const branchBlock = branchBlocksByAnchor[getAnchorKey(msg)];
              return (
                <Fragment key={id}>
                  <div
                    onClick={() => {
                      scrollToMessage(id);
                      setShowMobileHistory(false);
                    }}
                    style={{
                      padding: "8px 10px",
                      marginBottom: "4px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: "pointer",
                      background: role === "user" ? "var(--sidebar-bg, #f5f5f5)" : "transparent",
                      border: "1px solid transparent",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      color: role === "user" ? "var(--ink)" : "var(--ink-muted)",
                    }}
                    onTouchStart={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background =
                        role === "user" ? "#ebebeb" : "#f5f5f5";
                    }}
                    onTouchEnd={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background =
                        role === "user" ? "var(--sidebar-bg, #f5f5f5)" : "transparent";
                    }}
                    title={label}
                  >
                    <span style={{ marginRight: "6px", fontSize: "11px" }}>
                      {role === "user" ? "👤" : "🤖"}
                    </span>
                    {branchBlock && (
                      <span style={{ marginRight: "4px", color: "var(--accent)", fontSize: "11px" }}>
                        ◎
                      </span>
                    )}
                    {label}
                  </div>
                </Fragment>
              );
            })}

            {dotPositions.length === 0 && (
              <div style={{
                fontSize: "12px",
                color: "var(--ink-faint)",
                fontFamily: "'DM Sans', sans-serif",
                padding: "8px 4px",
              }}>
                会話がまだありません
              </div>
            )}
          </div>
        </>
      )}

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
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") { e.stopPropagation(); setShowDialog(false); } }}
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
