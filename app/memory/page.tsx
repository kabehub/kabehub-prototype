"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LoreMemoryCard } from "@/types";

type LoreMemoryRow = {
  id: string;
  chunk_text: string;
  tags: string[] | null;
  memory_kind: string | null;
  temporal_status: string | null;
  importance_score: number | null;
  confidence_score: number | null;
  source_thread_id: string | null;
  source_message_id: string | null;
  source_message_number: number | null;
  is_pinned: boolean | null;
  is_archived: boolean | null;
  extraction_version: string | null;
  last_confirmed_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  event_time: string | null;
  created_at: string;
};

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

type ConsolidationCandidate = {
  idA: string;
  idB: string;
  chunkTextA: string;
  chunkTextB: string;
  memoryKindA: string | null;
  memoryKindB: string | null;
  temporalStatusA: string | null;
  temporalStatusB: string | null;
  createdAtA: string | null;
  createdAtB: string | null;
  similarity: number;
};

type HistoryItem = {
  newRecord: LoreMemoryCard;
  sources: LoreMemoryCard[];
};

const KIND_GROUPS: Record<string, string[]> = {
  plan_todo: ["plan", "todo"],
  fact_other: ["fact", "other"],
};

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

function toMemoryCard(row: LoreMemoryRow): LoreMemoryCard {
  return {
    id: row.id,
    chunkText: row.chunk_text,
    tags: row.tags ?? [],
    memoryKind: row.memory_kind ?? "fact",
    temporalStatus: row.temporal_status ?? "current",
    importanceScore: row.importance_score ?? 0,
    confidenceScore: row.confidence_score ?? 0,
    sourceThreadId: row.source_thread_id,
    sourceMessageId: row.source_message_id,
    sourceMessageNumber: row.source_message_number,
    isPinned: row.is_pinned ?? false,
    isArchived: row.is_archived ?? false,
    extractionVersion: row.extraction_version,
    lastConfirmedAt: row.last_confirmed_at,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    eventTime: row.event_time,
    createdAt: row.created_at,
  };
}

interface MemoryCardProps {
  card: LoreMemoryCard;
  onUpdate: (updated: LoreMemoryCard) => void;
  onArchive: (id: string) => void;
}

function badgeClass(tone: "blue" | "gray" | "orange" | "green") {
  const tones = {
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    gray: "border-gray-700 bg-gray-900 text-gray-400",
    orange: "border-orange-500/30 bg-orange-500/10 text-orange-300",
    green: "border-green-500/30 bg-green-500/10 text-green-300",
  };
  return `inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${tones[tone]}`;
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

function MemoryCard({ card, onUpdate, onArchive }: MemoryCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(card.chunkText);
  const [draftKind, setDraftKind] = useState(card.memoryKind);
  const [draftStatus, setDraftStatus] = useState(card.temporalStatus);
  const [saving, setSaving] = useState(false);

  const isTextChanged = draftText.trim() !== card.chunkText.trim();
  const isStaleStatus = card.temporalStatus === "uncertain" || card.temporalStatus === "expired";
  const leftBorderClass = isStaleStatus
    ? "border-l-orange-500"
    : card.isPinned
      ? "border-l-blue-500"
      : "border-l-gray-800";

  const patchCard = async (patchBody: Record<string, unknown>) => {
    setSaving(true);
    try {
      const openaiKey = localStorage.getItem("kabehub_openai_key") ?? "";
      if (patchBody.action === "update_text" && !openaiKey) {
        alert("OpenAI APIキーが設定されていません。");
        return;
      }

      const res = await fetch(`/api/lore/${card.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-openai-api-key": openaiKey,
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
      const res = await fetch(`/api/lore/${card.id}`, {
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
    <article className={`border border-l-4 ${leftBorderClass} border-gray-800 rounded-xl bg-gray-950 p-5 space-y-4`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={badgeClass("blue")}>{card.memoryKind}</span>
            <span className={badgeClass(isStaleStatus ? "orange" : "gray")}>{card.temporalStatus}</span>
            {card.sourceMessageId ? (
              <span className={badgeClass("gray")}>#{card.sourceMessageNumber ?? "-"}</span>
            ) : (
              <span className={badgeClass("green")}>手動追加</span>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              <textarea
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                rows={5}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={draftKind}
                  onChange={(event) => setDraftKind(event.target.value)}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  {MEMORY_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={draftStatus}
                  onChange={(event) => setDraftStatus(event.target.value)}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  {TEMPORAL_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              {isTextChanged && (
                <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 text-sm space-y-2">
                  <p className="text-gray-500 line-through">{card.chunkText}</p>
                  <p className="text-green-300">{draftText}</p>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={cancelEditing}
                  disabled={saving}
                  className="px-3 py-2 rounded-lg text-sm border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-2 rounded-lg text-sm border border-blue-500 bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-800 disabled:border-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
                >
                  {saving ? "保存中..." : "保存して再Embedding"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-7 text-gray-200 whitespace-pre-wrap">{card.chunkText}</p>
          )}
        </div>

        {!editing && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => patchCard({ action: "pin", isPinned: !card.isPinned })}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:text-gray-600"
            >
              {card.isPinned ? "固定解除" : "固定"}
            </button>
            <button
              onClick={() => setEditing(true)}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:text-gray-600"
            >
              編集
            </button>
            <button
              onClick={handleArchive}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-xs border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:text-gray-600"
            >
              アーカイブ
            </button>
          </div>
        )}
      </div>

      {!editing && (
        <div className="flex flex-wrap gap-2 border-t border-gray-800 pt-3">
          <button
            onClick={() => patchCard({ action: "confirm_current" })}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:text-gray-600"
          >
            今も有効として確認
          </button>
          <button
            onClick={() => patchCard({ action: "update_meta", temporalStatus: "past" })}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:text-gray-600"
          >
            古い情報にする
          </button>
        </div>
      )}
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

function consolidationPairKey(candidate: Pick<ConsolidationCandidate, "idA" | "idB">) {
  return candidate.idA < candidate.idB
    ? `${candidate.idA}:${candidate.idB}`
    : `${candidate.idB}:${candidate.idA}`;
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
    <section className="border border-amber-500/30 bg-amber-500/10 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between gap-4 text-left hover:bg-amber-500/10 transition-colors"
      >
        <span className="text-sm font-medium text-amber-200">
          似ている記憶が {candidates.length} 件あります
        </span>
        <span className="text-xs text-amber-300">{expanded ? "閉じる" : "確認する"}</span>
      </button>

      {expanded && (
        <div className="border-t border-amber-500/20 p-4 space-y-3">
          {candidates.map((candidate) => {
            const pairKey = consolidationPairKey(candidate);
            const dismissing = dismissingPairKey === pairKey;
            const merging = mergingPairKey === pairKey;

            return (
              <article key={pairKey} className="rounded-lg border border-gray-800 bg-gray-950 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={badgeClass("orange")}>
                      類似度 {Math.round(candidate.similarity * 100)}%
                    </span>
                    <span className={badgeClass("blue")}>{candidate.memoryKindA ?? "-"}</span>
                    <span className={badgeClass("gray")}>{candidate.temporalStatusA ?? "-"}</span>
                    <span className="text-xs text-gray-500">A: {formatDateTime(candidate.createdAtA)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onMerge(candidate)}
                      disabled={merging || dismissing}
                      className="px-3 py-1.5 rounded-lg text-xs border border-blue-500 bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-800 disabled:border-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
                    >
                      {merging ? "生成中..." : "統合する"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDismiss(candidate)}
                      disabled={dismissing || merging}
                      className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed"
                    >
                      {dismissing ? "処理中..." : "無視"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={badgeClass("blue")}>{candidate.memoryKindA ?? "-"}</span>
                      <span className={badgeClass("gray")}>{candidate.temporalStatusA ?? "-"}</span>
                      <span className="text-xs text-gray-500">{formatDateTime(candidate.createdAtA)}</span>
                    </div>
                    <p className="text-sm leading-7 text-gray-200 whitespace-pre-wrap">{candidate.chunkTextA}</p>
                  </div>

                  <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={badgeClass("blue")}>{candidate.memoryKindB ?? "-"}</span>
                      <span className={badgeClass("gray")}>{candidate.temporalStatusB ?? "-"}</span>
                      <span className="text-xs text-gray-500">{formatDateTime(candidate.createdAtB)}</span>
                    </div>
                    <p className="text-sm leading-7 text-gray-200 whitespace-pre-wrap">{candidate.chunkTextB}</p>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-3xl rounded-xl border border-gray-800 bg-gray-950 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-gray-800 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-100">記憶を統合</h2>
            <p className="mt-1 text-xs text-gray-500">
              類似度 {Math.round(candidate.similarity * 100)}%
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            閉じる
          </button>
        </div>

        <div className="max-h-[calc(100vh-180px)] overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={badgeClass("blue")}>{candidate.memoryKindA ?? "-"}</span>
                <span className={badgeClass("gray")}>{candidate.temporalStatusA ?? "-"}</span>
              </div>
              <p className="text-xs leading-6 text-gray-400 whitespace-pre-wrap">{candidate.chunkTextA}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={badgeClass("blue")}>{candidate.memoryKindB ?? "-"}</span>
                <span className={badgeClass("gray")}>{candidate.temporalStatusB ?? "-"}</span>
              </div>
              <p className="text-xs leading-6 text-gray-400 whitespace-pre-wrap">{candidate.chunkTextB}</p>
            </div>
          </div>

          <textarea
            value={previewText}
            onChange={(event) => onTextChange(event.target.value)}
            rows={8}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm leading-7 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-800 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !previewText.trim()}
            className="px-4 py-2 rounded-lg text-sm border border-blue-500 bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-800 disabled:border-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
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

    const openaiKey = localStorage.getItem("kabehub_openai_key") ?? "";
    if (!openaiKey) {
      alert("OpenAI APIキーが設定されていません。");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/lore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-openai-api-key": openaiKey,
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
    <div className="border border-gray-800 rounded-xl p-5 bg-gray-950 space-y-4">
      <textarea
        value={chunkText}
        onChange={(event) => setChunkText(event.target.value)}
        rows={5}
        placeholder="追加する記憶を入力"
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select
          value={memoryKind}
          onChange={(event) => setMemoryKind(event.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        >
          {MEMORY_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          value={temporalStatus}
          onChange={(event) => setTemporalStatus(event.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        >
          {TEMPORAL_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 rounded-lg text-sm border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed"
        >
          キャンセル
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-4 py-2 rounded-lg text-sm border border-blue-500 bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-800 disabled:border-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
        >
          {submitting ? "追加中..." : "追加して記憶化"}
        </button>
      </div>
    </div>
  );
}

export default function MemoryPage() {
  const router = useRouter();
  const [cards, setCards] = useState<LoreMemoryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterPinned, setFilterPinned] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [batchTraining, setBatchTraining] = useState(false);
  const [updatingTemporalStatus, setUpdatingTemporalStatus] = useState(false);
  const [temporalStatusMessage, setTemporalStatusMessage] = useState<string | null>(null);
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

  const currentFolderName = "すべて";

  const fetchCards = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filterKind && !KIND_GROUPS[filterKind]) params.set("kind", filterKind);
      if (filterStatus) params.set("status", filterStatus);
      if (filterPinned) params.set("pinned", "true");
      const url = `/api/lore?${params.toString()}`;

      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "記憶一覧の取得に失敗しました");

      setCards((json as LoreMemoryRow[]).map(toMemoryCard));
    } catch (err) {
      setError((err as Error).message);
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [filterKind, filterPinned, filterStatus]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);

    try {
      const res = await fetch("/api/lore/dreaming-batch/history", {
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
      const res = await fetch("/api/lore/consolidate/candidates", {
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
    fetchCards();
    fetchHistory();
  }, [fetchCards, fetchHistory]);

  useEffect(() => {
    fetchConsolidationCandidates();
  }, [fetchConsolidationCandidates]);

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

  const handleBatchTrain = async () => {
    const openaiKey = localStorage.getItem("kabehub_openai_key") ?? "";
    if (!openaiKey) {
      setError("OpenAI APIキーが設定されていません。");
      return;
    }

    setBatchTraining(true);
    setError(null);
    try {
      const res = await fetch("/api/lore/batch-train", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-openai-api-key": openaiKey,
        },
        body: JSON.stringify({ limit: 20 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "記憶化に失敗しました");
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
      const res = await fetch("/api/lore/update-temporal-status", {
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
    const openaiKey = localStorage.getItem("kabehub_openai_key") ?? "";
    if (!openaiKey) {
      setError("OpenAI APIキーが設定されていません。");
      return;
    }

    setIsDreamingBatch(true);
    setError(null);
    setDreamingBatchResult(null);

    try {
      const res = await fetch("/api/lore/dreaming-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-openai-api-key": openaiKey,
        },
        body: JSON.stringify({ limit: 5, threshold: 0.92 }),
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
    const pairKey = consolidationPairKey(candidate);
    setDismissingPairKey(pairKey);
    setError(null);

    try {
      const res = await fetch("/api/lore/consolidate/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idA: candidate.idA, idB: candidate.idB }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "統合候補の無視に失敗しました");

      setConsolidationCandidates((prev) => prev.filter((item) => consolidationPairKey(item) !== pairKey));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDismissingPairKey(null);
    }
  };

  const handlePreviewMerge = async (candidate: ConsolidationCandidate) => {
    const openaiKey = localStorage.getItem("kabehub_openai_key") ?? "";
    if (!openaiKey) {
      setError("OpenAI APIキーが設定されていません。");
      return;
    }

    const pairKey = consolidationPairKey(candidate);
    setMergingPairKey(pairKey);
    setError(null);

    try {
      const res = await fetch("/api/lore/consolidate/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-openai-api-key": openaiKey,
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

    const openaiKey = localStorage.getItem("kabehub_openai_key") ?? "";
    if (!openaiKey) {
      setError("OpenAI APIキーが設定されていません。");
      return;
    }

    setSavingMerge(true);
    setError(null);

    try {
      const res = await fetch("/api/lore/consolidate/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-openai-api-key": openaiKey,
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
  };

  const handleRollback = async (consolidatedId: string) => {
    setRollbackingId(consolidatedId);

    try {
      const res = await fetch("/api/lore/dreaming-batch/rollback", {
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
    `w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${
      active
        ? "bg-blue-500/15 text-blue-300 border border-blue-500/30"
        : "text-gray-400 border border-transparent hover:bg-gray-900 hover:text-gray-200"
    }`;

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between gap-4">
        <button
          onClick={() => router.push("/settings")}
          className="text-gray-400 hover:text-gray-200 transition-colors text-sm"
        >
          ← 設定
        </button>

        <div className="text-center">
          <h1 className="text-lg font-semibold">AI記憶</h1>
          <p className="text-xs text-gray-500 mt-1">{currentFolderName}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewForm((value) => !value)}
            className="px-4 py-2 rounded-lg text-sm transition-colors border border-gray-600 hover:bg-gray-800 text-gray-300 hover:text-gray-100"
          >
            手動で追加
          </button>
          <button
            onClick={handleBatchTrain}
            disabled={batchTraining}
            className={`px-4 py-2 rounded-lg text-sm transition-colors border ${
              batchTraining
                ? "bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed"
                : "bg-blue-600 border-blue-500 hover:bg-blue-500 text-white"
            }`}
          >
            {batchTraining ? "記憶化中..." : "記憶化を実行"}
          </button>
          <button
            onClick={handleUpdateTemporalStatus}
            disabled={updatingTemporalStatus}
            className={`px-4 py-2 rounded-lg text-sm transition-colors border ${
              updatingTemporalStatus
                ? "bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed"
                : "bg-orange-600 border-orange-500 hover:bg-orange-500 text-white"
            }`}
          >
            {updatingTemporalStatus ? "整理中..." : "期限切れを整理"}
          </button>
          <button
            onClick={handleDreamingBatch}
            disabled={isDreamingBatch}
            className={`px-4 py-2 rounded-lg text-sm transition-colors border ${
              isDreamingBatch
                ? "bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed"
                : "bg-emerald-600 border-emerald-500 hover:bg-emerald-500 text-white"
            }`}
          >
            {isDreamingBatch ? "自動整理中..." : "自動整理を実行"}
          </button>
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-73px)]">
        <aside className="w-[200px] shrink-0 border-r border-gray-800 px-4 py-6 space-y-8">
          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">フィルタ</h2>
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

          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">種類</h2>
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

        <section className="flex-1 px-6 py-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="記憶を検索"
              className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors"
            />
            <p className="shrink-0 text-xs text-gray-500">{filteredCards.length}件</p>
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
            <div className="border border-red-500/30 bg-red-500/10 rounded-lg px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {temporalStatusMessage && (
            <div className="border border-green-500/30 bg-green-500/10 rounded-lg px-4 py-3 text-sm text-green-300">
              {temporalStatusMessage}
            </div>
          )}

          {dreamingBatchResult && (
            <div className="border border-green-500/30 bg-green-500/10 rounded-lg px-4 py-3 text-sm text-green-300">
              {dreamingBatchResult.succeeded}件統合しました / {dreamingBatchResult.failed}件スキップ
            </div>
          )}

          <section className="border border-gray-800 rounded-xl p-5 bg-gray-950 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">自動整理の履歴</h2>
            </div>

            {historyLoading ? (
              <div className="text-sm text-gray-500">読み込み中...</div>
            ) : history.length === 0 ? (
              <div className="text-sm text-gray-500">まだ自動整理の履歴はありません</div>
            ) : (
              <div className="space-y-3">
                {history.map((item) => {
                  const expanded = expandedHistoryId === item.newRecord.id;
                  const rollbacking = rollbackingId === item.newRecord.id;

                  return (
                    <article key={item.newRecord.id} className="rounded-lg border border-gray-800 bg-gray-950 p-4 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p
                          className="min-w-0 flex-1 text-sm leading-7 text-gray-200 whitespace-pre-wrap"
                          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {item.newRecord.chunkText}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRollback(item.newRecord.id)}
                            disabled={rollbacking}
                            className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed"
                          >
                            {rollbacking ? "処理中..." : "元に戻す"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedHistoryId(expanded ? null : item.newRecord.id)}
                            className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed"
                          >
                            {expanded ? "閉じる" : `元の記憶を見る（${item.sources.length}件）`}
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-2">
                          {item.sources.map((source) => (
                            <p key={source.id} className="text-sm text-gray-500">
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
            <div className="text-sm text-gray-500">読み込み中...</div>
          ) : filteredCards.length === 0 ? (
            <div className="text-sm text-gray-500">記憶がありません</div>
          ) : (
            <div className="space-y-3">
              {filteredCards.map((card) => (
                <MemoryCard
                  key={card.id}
                  card={card}
                  onUpdate={handleUpdate}
                  onArchive={handleArchive}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
