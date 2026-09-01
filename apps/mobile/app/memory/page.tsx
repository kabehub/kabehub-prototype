"use client";

import {
  API_KEY_HEADER_NAMES,
  BATCH_TRAIN_UI_REQUEST_LIMIT,
  BULK_ARCHIVE_MAX_ITEMS,
  DREAMING_DEFAULTS,
  buildApiKeyHeaders,
  memoryNeedsReview,
  pairKey,
  toMemoryCard,
  type ConsolidationCandidate,
  type LoreMemoryCard,
  type LoreMemoryRow,
} from "@kabehub/shared";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { mobileAccessTokenProvider } from "../../lib/accessTokenProvider";
import { createMobileApiClient } from "../../lib/api-client";
import { mobileApiKeyStore } from "../../lib/apiKeyStore";
import { supabase } from "../../lib/supabase/client";

const apiClient = createMobileApiClient(mobileAccessTokenProvider);

type AuthState = "loading" | "signedOut" | "signedIn";

type TemporalStatusUpdateResult = {
  pastCount: number;
  expiredCount: number;
  total: number;
};

type DreamingBatchResult = {
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<
    | { sourceIds: string[]; newId: string | null; status: "merged"; mergedText: string }
    | { sourceIds: string[]; status: "failed"; reason: string }
  >;
};

type HistoryItem = {
  newRecord: LoreMemoryCard;
  sources: LoreMemoryCard[];
};

const KIND_GROUPS: Record<string, string[]> = {
  plan_todo: ["plan", "todo"],
  fact_other: ["fact", "other"],
};

const KIND_ORDER = ["preference", "decision", "project", "constraint", "plan", "todo", "fact", "idea"];

const MEMORY_KIND_OPTIONS = [
  { value: "preference", label: "好み・方針" },
  { value: "project", label: "プロジェクト" },
  { value: "plan", label: "予定" },
  { value: "decision", label: "決定事項" },
  { value: "fact", label: "事実" },
  { value: "todo", label: "TODO" },
  { value: "idea", label: "アイデア" },
  { value: "constraint", label: "制約" },
  { value: "profile", label: "プロフィール" },
  { value: "temporary", label: "一時情報" },
  { value: "other", label: "その他" },
];

const TEMPORAL_STATUS_OPTIONS = [
  { value: "current", label: "現在有効" },
  { value: "past", label: "過去" },
  { value: "future", label: "未来" },
  { value: "expired", label: "期限切れ" },
  { value: "uncertain", label: "要確認" },
];

async function getOpenAiApiKeyHeaders(): Promise<Record<string, string> | null> {
  const headers = await buildApiKeyHeaders(mobileApiKeyStore, ["openai"]);
  return headers[API_KEY_HEADER_NAMES.openai] ? headers : null;
}

interface MemoryCardProps {
  card: LoreMemoryCard;
  onUpdate: (updated: LoreMemoryCard) => void;
  onArchive: (id: string) => void;
  selected: boolean;
  onSelect: (id: string) => void;
}

function badgeClass(tone: "blue" | "gray" | "orange" | "green") {
  return `memory-card-badge memory-card-badge-${tone}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MemoryCard({ card, onUpdate, onArchive, selected, onSelect }: MemoryCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(card.chunkText);
  const [draftKind, setDraftKind] = useState(card.memoryKind);
  const [draftStatus, setDraftStatus] = useState(card.temporalStatus);
  const [saving, setSaving] = useState(false);

  const isTextChanged = draftText.trim() !== card.chunkText.trim();
  const needsReview = memoryNeedsReview(card, Date.now());
  const leftBorderClass = needsReview
    ? "memory-card-review"
    : card.isPinned
      ? "memory-card-pinned"
      : "memory-card-default";

  const patchCard = async (patchBody: Record<string, unknown>) => {
    setSaving(true);
    try {
      let apiKeyHeaders: Record<string, string> = {};
      if (patchBody.action === "update_text") {
        const headers = await getOpenAiApiKeyHeaders();
        if (!headers) {
          alert("OpenAI APIキーが設定されていません。");
          return;
        }
        apiKeyHeaders = headers;
      }

      const res = await apiClient.request(`/api/lore/${card.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...apiKeyHeaders,
        },
        body: JSON.stringify(patchBody),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json?.error ?? "更新に失敗しました。");
        return;
      }
      onUpdate(toMemoryCard(json as LoreMemoryRow));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const trimmedText = draftText.trim();
    if (!trimmedText) {
      alert("内容を入力してください。");
      return;
    }

    if (isTextChanged) {
      await patchCard({
        action: "update_text",
        chunkText: trimmedText,
        memoryKind: draftKind,
        temporalStatus: draftStatus,
      });
    } else {
      await patchCard({
        action: "update_meta",
        memoryKind: draftKind,
        temporalStatus: draftStatus,
      });
    }
  };

  const handleArchive = async () => {
    setSaving(true);
    try {
      const res = await apiClient.request(`/api/lore/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        alert(json?.error ?? "固定済みの記憶はアーカイブできません。");
        return;
      }
      if (!res.ok) {
        alert(json?.error ?? "アーカイブに失敗しました。");
        return;
      }
      onArchive(card.id);
    } finally {
      setSaving(false);
    }
  };

  const cancelEditing = () => {
    setDraftText(card.chunkText);
    setDraftKind(card.memoryKind);
    setDraftStatus(card.temporalStatus);
    setEditing(false);
  };

  return (
    <article className={`memory-card ${leftBorderClass}`}>
      <div className="memory-card-inner">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(card.id)}
          className="memory-card-checkbox"
        />
        <div className="memory-card-body">
        <div className="memory-card-top">
        <div className="memory-card-main">
          <div className="memory-card-badges">
            <span className={badgeClass("blue")}>{card.memoryKind}</span>
            <span className={badgeClass(needsReview ? "orange" : "gray")}>{card.temporalStatus}</span>
            {card.sourceMessageId ? (
              <span className={badgeClass("gray")}>#{card.sourceMessageNumber ?? "-"}</span>
            ) : (
              <span className={badgeClass("green")}>手動追加</span>
            )}
          </div>

          {editing ? (
            <div className="memory-card-editing">
              <textarea
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                rows={5}
                className="memory-card-textarea"
              />
              <div className="memory-card-select-grid">
                <select
                  value={draftKind}
                  onChange={(event) => setDraftKind(event.target.value)}
                  className="memory-card-select"
                >
                  {MEMORY_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={draftStatus}
                  onChange={(event) => setDraftStatus(event.target.value)}
                  className="memory-card-select"
                >
                  {TEMPORAL_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              {isTextChanged && (
                <div className="memory-card-diff">
                  <p className="memory-card-diff-old">{card.chunkText}</p>
                  <p className="memory-card-diff-new">{draftText}</p>
                </div>
              )}
              <div className="memory-card-actions">
                <button
                  onClick={cancelEditing}
                  disabled={saving}
                  className="memory-button memory-button-secondary"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="memory-button memory-button-primary"
                >
                  {saving ? "保存中..." : "保存して再Embedding"}
                </button>
              </div>
            </div>
          ) : (
            <p className="memory-card-text">{card.chunkText}</p>
          )}
        </div>

        {!editing && (
          <div className="memory-card-inline-actions">
            <button
              onClick={() => patchCard({ action: "pin", isPinned: !card.isPinned })}
              disabled={saving}
              className="memory-button memory-button-secondary memory-button-compact"
            >
              {card.isPinned ? "固定解除" : "固定"}
            </button>
            <button
              onClick={() => setEditing(true)}
              disabled={saving}
              className="memory-button memory-button-secondary memory-button-compact"
            >
              編集
            </button>
            <button
              onClick={handleArchive}
              disabled={saving}
              className="memory-button memory-button-danger memory-button-compact"
            >
              アーカイブ
            </button>
          </div>
        )}
      </div>

      {!editing && (
        <div className="memory-card-footer">
          <button
            onClick={() => patchCard({ action: "confirm_current" })}
            disabled={saving}
            className="memory-button memory-button-secondary memory-button-compact"
          >
            今も有効として確認
          </button>
          <button
            onClick={() => patchCard({ action: "update_meta", temporalStatus: "past" })}
            disabled={saving}
            className="memory-button memory-button-secondary memory-button-compact"
          >
            古い情報にする
          </button>
        </div>
      )}
        </div>
      </div>
    </article>
  );
}

interface ConsolidationCandidatesProps {
  candidates: ConsolidationCandidate[];
  expanded: boolean;
  dismissingPairKey: string | null;
  mergingPairKey: string | null;
  onToggle: () => void;
  onMerge: (candidate: ConsolidationCandidate) => void;
  onDismiss: (candidate: ConsolidationCandidate) => void;
}

function ConsolidationCandidates({
  candidates,
  expanded,
  dismissingPairKey,
  mergingPairKey,
  onToggle,
  onMerge,
  onDismiss,
}: ConsolidationCandidatesProps) {
  if (candidates.length === 0) return null;

  return (
    <section className="memory-consolidation-section">
      <button
        type="button"
        onClick={onToggle}
        className="memory-consolidation-toggle"
      >
        <span className="memory-consolidation-title">
          似ている記憶が {candidates.length} 件あります
        </span>
        <span className="memory-consolidation-meta">{expanded ? "閉じる" : "確認する"}</span>
      </button>

      {expanded && (
        <div className="memory-consolidation-list">
          {candidates.map((candidate) => {
            const candidatePairKey = pairKey(candidate.idA, candidate.idB);
            const dismissing = dismissingPairKey === candidatePairKey;
            const merging = mergingPairKey === candidatePairKey;

            return (
              <article key={candidatePairKey} className="memory-consolidation-item">
                <div className="memory-consolidation-item-header">
                  <div className="memory-card-badges">
                    <span className={badgeClass("orange")}>
                      類似度 {Math.round(candidate.similarity * 100)}%
                    </span>
                    <span className={badgeClass("blue")}>{candidate.memoryKindA ?? "-"}</span>
                    <span className={badgeClass("gray")}>{candidate.temporalStatusA ?? "-"}</span>
                    <span className="memory-muted-small">A: {formatDateTime(candidate.createdAtA)}</span>
                  </div>
                  <div className="memory-card-inline-actions">
                    <button
                      type="button"
                      onClick={() => onMerge(candidate)}
                      disabled={merging || dismissing}
                      className="memory-button memory-button-primary memory-button-compact"
                    >
                      {merging ? "生成中..." : "統合する"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDismiss(candidate)}
                      disabled={dismissing || merging}
                      className="memory-button memory-button-secondary memory-button-compact"
                    >
                      {dismissing ? "処理中..." : "無視"}
                    </button>
                  </div>
                </div>

                <div className="memory-consolidation-grid">
                  <div className="memory-consolidation-source">
                    <div className="memory-card-badges">
                      <span className={badgeClass("blue")}>{candidate.memoryKindA ?? "-"}</span>
                      <span className={badgeClass("gray")}>{candidate.temporalStatusA ?? "-"}</span>
                      <span className="memory-muted-small">{formatDateTime(candidate.createdAtA)}</span>
                    </div>
                    <p className="memory-card-text">{candidate.chunkTextA}</p>
                  </div>

                  <div className="memory-consolidation-source">
                    <div className="memory-card-badges">
                      <span className={badgeClass("blue")}>{candidate.memoryKindB ?? "-"}</span>
                      <span className={badgeClass("gray")}>{candidate.temporalStatusB ?? "-"}</span>
                      <span className="memory-muted-small">{formatDateTime(candidate.createdAtB)}</span>
                    </div>
                    <p className="memory-card-text">{candidate.chunkTextB}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface ConsolidationPreviewModalProps {
  open: boolean;
  candidate: ConsolidationCandidate | null;
  previewText: string;
  saving: boolean;
  onTextChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

function ConsolidationPreviewModal({
  open,
  candidate,
  previewText,
  saving,
  onTextChange,
  onClose,
  onSave,
}: ConsolidationPreviewModalProps) {
  if (!open || !candidate) return null;

  return (
    <div className="memory-modal-overlay">
      <div className="memory-modal-box">
        <div className="memory-modal-header">
          <div>
            <h2 className="memory-modal-title">記憶を統合</h2>
            <p className="memory-modal-meta">
              類似度 {Math.round(candidate.similarity * 100)}%
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="memory-button memory-button-secondary memory-button-compact"
          >
            閉じる
          </button>
        </div>

        <div className="memory-modal-body">
          <div className="memory-consolidation-grid">
            <div className="memory-consolidation-source">
              <div className="memory-card-badges">
                <span className={badgeClass("blue")}>{candidate.memoryKindA ?? "-"}</span>
                <span className={badgeClass("gray")}>{candidate.temporalStatusA ?? "-"}</span>
              </div>
              <p className="memory-modal-source-text">{candidate.chunkTextA}</p>
            </div>
            <div className="memory-consolidation-source">
              <div className="memory-card-badges">
                <span className={badgeClass("blue")}>{candidate.memoryKindB ?? "-"}</span>
                <span className={badgeClass("gray")}>{candidate.temporalStatusB ?? "-"}</span>
              </div>
              <p className="memory-modal-source-text">{candidate.chunkTextB}</p>
            </div>
          </div>

          <textarea
            value={previewText}
            onChange={(event) => onTextChange(event.target.value)}
            rows={8}
            className="memory-card-textarea memory-modal-textarea"
          />
        </div>

        <div className="memory-modal-footer">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="memory-button memory-button-secondary"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !previewText.trim()}
            className="memory-button memory-button-primary"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface NewMemoryFormProps {
  onCreate: (created: LoreMemoryCard) => void;
  onCancel: () => void;
}

function NewMemoryForm({ onCreate, onCancel }: NewMemoryFormProps) {
  const [chunkText, setChunkText] = useState("");
  const [memoryKind, setMemoryKind] = useState("fact");
  const [temporalStatus, setTemporalStatus] = useState("current");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmedText = chunkText.trim();
    if (!trimmedText) {
      alert("内容を入力してください。");
      return;
    }

    const apiKeyHeaders = await getOpenAiApiKeyHeaders();
    if (!apiKeyHeaders) {
      alert("OpenAI APIキーが設定されていません。");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.request("/api/lore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...apiKeyHeaders,
        },
        body: JSON.stringify({ chunkText: trimmedText, memoryKind, temporalStatus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json?.error ?? "追加に失敗しました。");
        return;
      }
      onCreate(toMemoryCard(json as LoreMemoryRow));
      setChunkText("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="memory-new-form">
      <textarea
        value={chunkText}
        onChange={(event) => setChunkText(event.target.value)}
        rows={5}
        placeholder="追加する記憶を入力"
        className="memory-card-textarea"
      />
      <div className="memory-card-select-grid">
        <select
          value={memoryKind}
          onChange={(event) => setMemoryKind(event.target.value)}
          className="memory-card-select"
        >
          {MEMORY_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          value={temporalStatus}
          onChange={(event) => setTemporalStatus(event.target.value)}
          className="memory-card-select"
        >
          {TEMPORAL_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <div className="memory-card-actions">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="memory-button memory-button-secondary"
        >
          キャンセル
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="memory-button memory-button-primary"
        >
          {submitting ? "追加中..." : "追加して記憶化"}
        </button>
      </div>
    </div>
  );
}

export default function MemoryPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [cards, setCards] = useState<LoreMemoryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterPinned, setFilterPinned] = useState(false);
  const [sortMode, setSortMode] = useState<"created_at" | "importance_score">("created_at");
  const [groupByKind, setGroupByKind] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [batchTraining, setBatchTraining] = useState(false);
  const [updatingTemporalStatus, setUpdatingTemporalStatus] = useState(false);
  const [temporalStatusMessage, setTemporalStatusMessage] = useState<string | null>(null);
  const [batchTrainMessage, setBatchTrainMessage] = useState<string | null>(null);
  const [isDreamingBatch, setIsDreamingBatch] = useState(false);
  const [dreamingBatchResult, setDreamingBatchResult] = useState<DreamingBatchResult | null>(null);
  const [consolidationCandidates, setConsolidationCandidates] = useState<ConsolidationCandidate[]>([]);
  const [consolidationExpanded, setConsolidationExpanded] = useState(false);
  const [dismissingPairKey, setDismissingPairKey] = useState<string | null>(null);
  const [mergingPairKey, setMergingPairKey] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [previewCandidate, setPreviewCandidate] = useState<ConsolidationCandidate | null>(null);
  const [previewMemoryKind, setPreviewMemoryKind] = useState<string | null>(null);
  const [previewTemporalStatus, setPreviewTemporalStatus] = useState<string | null>(null);
  const [savingMerge, setSavingMerge] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [rollbackingId, setRollbackingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkArchiving, setIsBulkArchiving] = useState(false);
  const [bulkArchiveMessage, setBulkArchiveMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setAuthState(!error && data.session ? "signedIn" : "signedOut");
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "INITIAL_SESSION") return;
        setAuthState(session ? "signedIn" : "signedOut");
      }
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const currentFolderName = "すべて";

  const fetchCards = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filterKind && !KIND_GROUPS[filterKind]) params.set("kind", filterKind);
      if (filterStatus) params.set("status", filterStatus);
      if (filterPinned) params.set("pinned", "true");
      if (sortMode === "importance_score") params.set("sort", "importance_score");
      const url = `/api/lore?${params.toString()}` as `/api/${string}`;

      const res = await apiClient.request(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "記憶一覧の取得に失敗しました");

      setCards((json as LoreMemoryRow[]).map(toMemoryCard));
    } catch (err) {
      setError((err as Error).message);
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [filterKind, filterPinned, filterStatus, sortMode]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);

    try {
      const res = await apiClient.request("/api/lore/dreaming-batch/history", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "統合履歴の取得に失敗しました");

      const items = Array.isArray(json?.history)
        ? (json.history as Array<{ newRecord: LoreMemoryRow; sources: LoreMemoryRow[] }>)
        : [];
      setHistory(
        items
          .filter((item) => item.newRecord.is_archived === false)
          .map((item) => ({
            newRecord: toMemoryCard(item.newRecord),
            sources: (item.sources ?? []).map(toMemoryCard),
          })),
      );
    } catch (err) {
      setError((err as Error).message);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchConsolidationCandidates = useCallback(async () => {
    try {
      const res = await apiClient.request("/api/lore/consolidate/candidates", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "統合候補の取得に失敗しました");

      const candidates = Array.isArray(json?.candidates)
        ? (json.candidates as ConsolidationCandidate[])
        : [];
      setConsolidationCandidates(candidates);
      if (candidates.length === 0) setConsolidationExpanded(false);
    } catch (err) {
      setError((err as Error).message);
      setConsolidationCandidates([]);
      setConsolidationExpanded(false);
    }
  }, []);

  useEffect(() => {
    if (authState !== "signedIn") return;
    void fetchCards();
    void fetchHistory();
  }, [authState, fetchCards, fetchHistory]);

  useEffect(() => {
    if (authState !== "signedIn") return;
    void fetchConsolidationCandidates();
  }, [authState, fetchConsolidationCandidates]);

  const filteredCards = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return cards.filter((card) => {
      if (filterKind && KIND_GROUPS[filterKind] && !KIND_GROUPS[filterKind].includes(card.memoryKind)) {
        return false;
      }
      if (query && !card.chunkText.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [cards, filterKind, searchQuery]);

  const sortedCards = useMemo(() => {
    if (sortMode === "importance_score") {
      return [...filteredCards].sort((a, b) => {
        const aScore = a.importanceScore ?? 0;
        const bScore = b.importanceScore ?? 0;
        if (bScore !== aScore) return bScore - aScore;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
    return filteredCards;
  }, [filteredCards, sortMode]);

  const groupedSections = useMemo(() => {
    const groups: Record<string, LoreMemoryCard[]> = {};
    for (const card of sortedCards) {
      const kind = card.memoryKind;
      if (!groups[kind]) groups[kind] = [];
      groups[kind].push(card);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      const ai = KIND_ORDER.indexOf(a);
      const bi = KIND_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [sortedCards]);

  const handleBatchTrain = async () => {
    const apiKeyHeaders = await getOpenAiApiKeyHeaders();
    if (!apiKeyHeaders) {
      setError("OpenAI APIキーが設定されていません。");
      return;
    }

    setBatchTraining(true);
    setError(null);
    setBatchTrainMessage(null);
    try {
      const res = await apiClient.request("/api/lore/batch-train", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...apiKeyHeaders,
        },
        body: JSON.stringify({ limit: BATCH_TRAIN_UI_REQUEST_LIMIT }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "記憶化に失敗しました");
      setBatchTrainMessage(`${json.processedCount}件処理 / ${json.insertedCount}件を記憶化しました`);
      await Promise.all([fetchCards(), fetchHistory()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBatchTraining(false);
    }
  };

  const handleUpdateTemporalStatus = async () => {
    setUpdatingTemporalStatus(true);
    setError(null);
    setTemporalStatusMessage(null);

    try {
      const res = await apiClient.request("/api/lore/update-temporal-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "期限切れ整理に失敗しました");

      const result = json as TemporalStatusUpdateResult;
      setTemporalStatusMessage(
        `過去の予定へ移動: ${result.pastCount}件 / 期限切れ: ${result.expiredCount}件 / 合計: ${result.total}件更新しました`
      );
      await Promise.all([fetchCards(), fetchHistory()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUpdatingTemporalStatus(false);
    }
  };

  const handleDreamingBatch = async () => {
    const apiKeyHeaders = await getOpenAiApiKeyHeaders();
    if (!apiKeyHeaders) {
      setError("OpenAI APIキーが設定されていません。");
      return;
    }

    setIsDreamingBatch(true);
    setError(null);
    setDreamingBatchResult(null);

    try {
      const res = await apiClient.request("/api/lore/dreaming-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...apiKeyHeaders,
        },
        body: JSON.stringify(DREAMING_DEFAULTS),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "自動整理に失敗しました");

      setDreamingBatchResult(json as DreamingBatchResult);
      await Promise.all([fetchCards(), fetchHistory(), fetchConsolidationCandidates()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsDreamingBatch(false);
    }
  };

  const handleDismissCandidate = async (candidate: ConsolidationCandidate) => {
    const candidatePairKey = pairKey(candidate.idA, candidate.idB);
    setDismissingPairKey(candidatePairKey);
    setError(null);

    try {
      const res = await apiClient.request("/api/lore/consolidate/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idA: candidate.idA, idB: candidate.idB }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "統合候補の無視に失敗しました");

      setConsolidationCandidates((prev) => prev.filter((item) => pairKey(item.idA, item.idB) !== candidatePairKey));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDismissingPairKey(null);
    }
  };

  const handlePreviewMerge = async (candidate: ConsolidationCandidate) => {
    const apiKeyHeaders = await getOpenAiApiKeyHeaders();
    if (!apiKeyHeaders) {
      setError("OpenAI APIキーが設定されていません。");
      return;
    }

    const candidatePairKey = pairKey(candidate.idA, candidate.idB);
    setMergingPairKey(candidatePairKey);
    setError(null);

    try {
      const res = await apiClient.request("/api/lore/consolidate/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...apiKeyHeaders,
        },
        body: JSON.stringify({ idA: candidate.idA, idB: candidate.idB }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "統合プレビューの生成に失敗しました");

      setPreviewCandidate(candidate);
      setPreviewText(typeof json?.mergedText === "string" ? json.mergedText : "");
      setPreviewMemoryKind(typeof json?.suggestedMemoryKind === "string" ? json.suggestedMemoryKind : null);
      setPreviewTemporalStatus(
        typeof json?.suggestedTemporalStatus === "string" ? json.suggestedTemporalStatus : null,
      );
      setPreviewModalOpen(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setMergingPairKey(null);
    }
  };

  const closePreviewModal = () => {
    setPreviewModalOpen(false);
    setPreviewText("");
    setPreviewCandidate(null);
    setPreviewMemoryKind(null);
    setPreviewTemporalStatus(null);
  };

  const handleSaveMerge = async () => {
    if (!previewCandidate) return;

    const mergedText = previewText.trim();
    if (!mergedText) {
      setError("統合後の本文を入力してください。");
      return;
    }

    const apiKeyHeaders = await getOpenAiApiKeyHeaders();
    if (!apiKeyHeaders) {
      setError("OpenAI APIキーが設定されていません。");
      return;
    }

    setSavingMerge(true);
    setError(null);

    try {
      const res = await apiClient.request("/api/lore/consolidate/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...apiKeyHeaders,
        },
        body: JSON.stringify({
          idA: previewCandidate.idA,
          idB: previewCandidate.idB,
          mergedText,
          memoryKind: previewMemoryKind ?? undefined,
          temporalStatus: previewTemporalStatus ?? undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "統合の保存に失敗しました");

      closePreviewModal();
      await Promise.all([fetchCards(), fetchHistory(), fetchConsolidationCandidates()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingMerge(false);
    }
  };

  const handleUpdate = (updated: LoreMemoryCard) => {
    setCards((prev) => prev.map((card) => card.id === updated.id ? updated : card));
  };

  const handleArchive = (id: string) => {
    setCards((prev) => prev.filter((card) => card.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    const ids = filteredCards.slice(0, BULK_ARCHIVE_MAX_ITEMS).map((c) => c.id);
    setSelectedIds(new Set(ids));
    if (filteredCards.length > BULK_ARCHIVE_MAX_ITEMS) {
      setBulkArchiveMessage(`一度に選択できるのは最大${BULK_ARCHIVE_MAX_ITEMS}件です。`);
    } else {
      setBulkArchiveMessage(null);
    }
  };

  const handleToggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }
      if (prev.size >= BULK_ARCHIVE_MAX_ITEMS) {
        setBulkArchiveMessage(`一度に選択できるのは最大${BULK_ARCHIVE_MAX_ITEMS}件です。`);
        return prev;
      }
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`選択した ${selectedIds.size} 件の記憶をアーカイブしますか？`)) return;

    setIsBulkArchiving(true);
    setBulkArchiveMessage(null);
    setError(null);
    try {
      const res = await apiClient.request("/api/lore/bulk-archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "一括アーカイブに失敗しました");
        return;
      }

      const { archivedCount, skippedCount } = json as { archivedCount: number; skippedCount: number };

      setCards((prev) =>
        prev.filter((card) => !selectedIds.has(card.id) || card.isPinned)
      );
      setSelectedIds(new Set());

      let message = `${archivedCount}件アーカイブしました`;
      if (skippedCount > 0) {
        message += `（${skippedCount}件はピン留めのためスキップしました）`;
      }
      setBulkArchiveMessage(message);

      await fetchCards();
    } finally {
      setIsBulkArchiving(false);
    }
  };

  const handleRollback = async (consolidatedId: string) => {
    setRollbackingId(consolidatedId);

    try {
      const res = await apiClient.request("/api/lore/dreaming-batch/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consolidatedId }),
      });
      if (res.status === 409) {
        alert("この記憶はすでに保護されているため元に戻せません");
        return;
      }
      if (!res.ok) {
        alert("元に戻すのに失敗しました");
        return;
      }

      setHistory((prev) =>
        prev.filter((item) => item.newRecord.id !== consolidatedId)
      );
      setExpandedHistoryId((prev) =>
        prev === consolidatedId ? null : prev
      );
      await Promise.all([fetchHistory(), fetchCards(), fetchConsolidationCandidates()]);
    } catch {
      alert("元に戻すのに失敗しました");
    } finally {
      setRollbackingId(null);
    }
  };

  const selectAll = () => {
    setFilterKind(null);
    setFilterStatus(null);
    setFilterPinned(false);
  };

  const selectPinned = () => {
    setFilterKind(null);
    setFilterStatus(null);
    setFilterPinned(true);
  };

  const selectStatus = (status: string) => {
    setFilterKind(null);
    setFilterStatus(status);
    setFilterPinned(false);
  };

  const selectKind = (kind: string) => {
    setFilterKind(kind);
    setFilterStatus(null);
    setFilterPinned(false);
  };

  const filterButtonClass = (active: boolean) =>
    `memory-filter-button ${
      active
        ? "memory-filter-button-selected"
        : "memory-filter-button-idle"
    }`;

  if (authState !== "signedIn") {
    return (
      <main className="memory-page">
        <div className="memory-auth-gate">
          <p>ログインが必要です</p>
          <Link href="/">ホームへ戻る</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="memory-page">
      <header className="memory-header">
        <button
          onClick={() => router.push("/settings")}
          className="memory-back-button"
        >
          ← 設定
        </button>

        <div className="memory-header-title">
          <h1>AI記憶</h1>
          <p>{currentFolderName}</p>
        </div>

        <div className="memory-header-actions">
          <button
            onClick={() => setShowNewForm((value) => !value)}
            className="memory-button memory-button-secondary memory-header-action"
          >
            手動で追加
          </button>
          <button
            onClick={handleBatchTrain}
            disabled={batchTraining}
            className={`memory-button memory-header-action ${
              batchTraining
                ? "memory-button-disabled"
                : "memory-button-primary"
            }`}
          >
            {batchTraining ? "記憶化中..." : "記憶化を実行"}
          </button>
          <button
            onClick={handleUpdateTemporalStatus}
            disabled={updatingTemporalStatus}
            className={`memory-button memory-header-action ${
              updatingTemporalStatus
                ? "memory-button-disabled"
                : "memory-button-warning"
            }`}
          >
            {updatingTemporalStatus ? "整理中..." : "期限切れを整理"}
          </button>
          <button
            onClick={handleDreamingBatch}
            disabled={isDreamingBatch}
            className={`memory-button memory-header-action ${
              isDreamingBatch
                ? "memory-button-disabled"
                : "memory-button-success"
            }`}
          >
            {isDreamingBatch ? "自動整理中..." : "自動整理を実行"}
          </button>
        </div>
      </header>

      <div className="memory-layout">
        <aside className="memory-sidebar">
          <section className="memory-filter-section">
            <h2 className="memory-filter-heading">フィルタ</h2>
            <button className={filterButtonClass(!filterKind && !filterStatus && !filterPinned)} onClick={selectAll}>
              すべて
            </button>
            <button className={filterButtonClass(filterPinned)} onClick={selectPinned}>
              固定済み
            </button>
            <button className={filterButtonClass(filterStatus === "uncertain")} onClick={() => selectStatus("uncertain")}>
              要確認
            </button>
            <button className={filterButtonClass(filterStatus === "expired")} onClick={() => selectStatus("expired")}>
              期限切れ
            </button>
          </section>

          <section className="memory-filter-section">
            <h2 className="memory-filter-heading">種類</h2>
            <button className={filterButtonClass(filterKind === "project")} onClick={() => selectKind("project")}>
              プロジェクト
            </button>
            <button className={filterButtonClass(filterKind === "decision")} onClick={() => selectKind("decision")}>
              決定事項
            </button>
            <button className={filterButtonClass(filterKind === "preference")} onClick={() => selectKind("preference")}>
              好み・方針
            </button>
            <button className={filterButtonClass(filterKind === "plan_todo")} onClick={() => selectKind("plan_todo")}>
              予定・TODO
            </button>
            <button className={filterButtonClass(filterKind === "fact_other")} onClick={() => selectKind("fact_other")}>
              事実・その他
            </button>
          </section>
        </aside>

        <section className="memory-content">
          <div className="memory-toolbar">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="記憶を検索"
              className="memory-search-input"
            />
            <div className="memory-sort-controls">
              <button
                onClick={() => setSortMode("created_at")}
                className={`memory-toggle-button ${sortMode === "created_at" ? "memory-toggle-button-selected" : "memory-toggle-button-idle"}`}
              >
                新着順
              </button>
              <button
                onClick={() => setSortMode("importance_score")}
                className={`memory-toggle-button ${sortMode === "importance_score" ? "memory-toggle-button-selected" : "memory-toggle-button-idle"}`}
              >
                重要度順
              </button>
              <button
                onClick={() => setGroupByKind((v) => !v)}
                className={`memory-toggle-button ${groupByKind ? "memory-toggle-button-selected" : "memory-toggle-button-idle"}`}
              >
                グループ表示
              </button>
              <p className="memory-result-count">{sortedCards.length}件</p>
            </div>
          </div>
          <div className="memory-bulk-actions">
            <button
              onClick={handleSelectAll}
              className="memory-button memory-button-secondary memory-button-compact"
            >
              表示中をすべて選択
            </button>
            {selectedIds.size > 0 && (
              <>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="memory-button memory-button-secondary memory-button-compact"
                >
                  選択解除
                </button>
                <button
                  onClick={handleBulkArchive}
                  disabled={isBulkArchiving}
                  className="memory-button memory-button-danger memory-button-compact"
                >
                  {isBulkArchiving ? "アーカイブ中..." : `選択した記憶をアーカイブ（${selectedIds.size}件）`}
                </button>
              </>
            )}
          </div>

          {showNewForm && (
            <NewMemoryForm
              onCreate={(created) => {
                setCards((prev) => [created, ...prev]);
                setShowNewForm(false);
              }}
              onCancel={() => setShowNewForm(false)}
            />
          )}

          {error && (
            <div className="memory-alert memory-alert-error">
              {error}
            </div>
          )}

          {temporalStatusMessage && (
            <div className="memory-alert memory-alert-success">
              {temporalStatusMessage}
            </div>
          )}

          {batchTrainMessage && (
            <div className="memory-alert memory-alert-success">
              {batchTrainMessage}
            </div>
          )}

          {dreamingBatchResult && (
            <div className="memory-alert memory-alert-success">
              {dreamingBatchResult.succeeded}件統合しました / {dreamingBatchResult.failed}件スキップ
            </div>
          )}

          {bulkArchiveMessage && (
            <div className="memory-alert memory-alert-success">
              {bulkArchiveMessage}
            </div>
          )}

          <section className="memory-history-section">
            <div className="memory-history-heading">
              <h2>自動整理の履歴</h2>
            </div>

            {historyLoading ? (
              <div className="memory-empty-state">読み込み中...</div>
            ) : history.length === 0 ? (
              <div className="memory-empty-state">まだ自動整理の履歴はありません</div>
            ) : (
              <div className="memory-history-list">
                {history.map((item) => {
                  const expanded = expandedHistoryId === item.newRecord.id;
                  const rollbacking = rollbackingId === item.newRecord.id;

                  return (
                    <article key={item.newRecord.id} className="memory-history-item">
                      <div className="memory-history-item-header">
                        <p
                          className="memory-history-summary memory-truncate"
                        >
                          {item.newRecord.chunkText}
                        </p>
                        <div className="memory-card-inline-actions">
                          <button
                            type="button"
                            onClick={() => handleRollback(item.newRecord.id)}
                            disabled={rollbacking}
                            className="memory-button memory-button-secondary memory-button-compact"
                          >
                            {rollbacking ? "処理中..." : "元に戻す"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedHistoryId(expanded ? null : item.newRecord.id)}
                            className="memory-button memory-button-secondary memory-button-compact"
                          >
                            {expanded ? "閉じる" : `元の記憶を見る（${item.sources.length}件）`}
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="memory-history-sources">
                          {item.sources.map((source) => (
                            <p key={source.id} className="memory-history-source">
                              {source.chunkText}
                            </p>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <ConsolidationCandidates
            candidates={consolidationCandidates}
            expanded={consolidationExpanded}
            dismissingPairKey={dismissingPairKey}
            mergingPairKey={mergingPairKey}
            onToggle={() => setConsolidationExpanded((value) => !value)}
            onMerge={handlePreviewMerge}
            onDismiss={handleDismissCandidate}
          />

          <ConsolidationPreviewModal
            open={previewModalOpen}
            candidate={previewCandidate}
            previewText={previewText}
            saving={savingMerge}
            onTextChange={setPreviewText}
            onClose={closePreviewModal}
            onSave={handleSaveMerge}
          />

          {loading ? (
            <div className="memory-empty-state">読み込み中...</div>
          ) : sortedCards.length === 0 ? (
            <div className="memory-empty-state">記憶がありません</div>
          ) : groupByKind ? (
            <div className="memory-groups">
              {groupedSections.map(([kind, kindCards]) => (
                <section key={kind}>
                  <h3 className="memory-group-heading">
                    {MEMORY_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind}
                    <span className="memory-group-count">({kindCards.length})</span>
                  </h3>
                  <div className="memory-card-list">
                    {kindCards.map((card) => (
                      <MemoryCard
                        key={card.id}
                        card={card}
                        onUpdate={handleUpdate}
                        onArchive={handleArchive}
                        selected={selectedIds.has(card.id)}
                        onSelect={handleToggleSelection}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="memory-card-list">
              {sortedCards.map((card) => (
                <MemoryCard
                  key={card.id}
                  card={card}
                  onUpdate={handleUpdate}
                  onArchive={handleArchive}
                  selected={selectedIds.has(card.id)}
                  onSelect={handleToggleSelection}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
