// Client componentからも参照されるため、server-only依存を追加しないこと。

import type { LoreMemoryCard } from "../types";
import type { LoreMemoryRow } from "./types";

export type ConsolidationCandidate = {
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

export type DreamingCandidate = { idA: string; idB: string; similarity: number };

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function stringValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") return value;
  }
  return null;
}

function numberValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function normalizeConsolidationCandidate(row: Record<string, unknown>): ConsolidationCandidate | null {
  const idA = stringValue(row, ["idA", "id_a", "loreIdA", "lore_id_a"]);
  const idB = stringValue(row, ["idB", "id_b", "loreIdB", "lore_id_b"]);
  const chunkTextA = stringValue(row, ["chunkTextA", "chunk_text_a"]);
  const chunkTextB = stringValue(row, ["chunkTextB", "chunk_text_b"]);
  const similarity = numberValue(row, ["similarity", "score"]);

  if (!idA || !idB || !chunkTextA || !chunkTextB || similarity === null) {
    return null;
  }

  return {
    idA,
    idB,
    chunkTextA,
    chunkTextB,
    memoryKindA: stringValue(row, ["memoryKindA", "memory_kind_a"]),
    memoryKindB: stringValue(row, ["memoryKindB", "memory_kind_b"]),
    temporalStatusA: stringValue(row, ["temporalStatusA", "temporal_status_a"]),
    temporalStatusB: stringValue(row, ["temporalStatusB", "temporal_status_b"]),
    createdAtA: stringValue(row, ["createdAtA", "created_at_a"]),
    createdAtB: stringValue(row, ["createdAtB", "created_at_b"]),
    similarity,
  };
}

export function normalizeDreamingCandidate(row: Record<string, unknown>): DreamingCandidate | null {
  const idA = stringValue(row, ["idA", "id_a", "loreIdA", "lore_id_a"]);
  const idB = stringValue(row, ["idB", "id_b", "loreIdB", "lore_id_b"]);
  const similarity = numberValue(row, ["similarity", "score"]);

  if (!idA || !idB || idA === idB || similarity === null) return null;
  return { idA, idB, similarity };
}

export function normalizeRpcNewId(data: unknown) {
  const row = Array.isArray(data) ? data[0] : data;
  if (typeof row === "string") return row;
  if (row && typeof row === "object") {
    const record = row as Record<string, unknown>;
    for (const key of ["newId", "new_id", "id"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
  }
  return null;
}

export function toMemoryCard(row: LoreMemoryRow): LoreMemoryCard {
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

// 関数名は呼び出し側のローカル変数名(isNeedsReview/needsReview)との衝突を避けるため
// 意図的に別名(memoryNeedsReview)にしている。この名前を変更しないこと。
export function memoryNeedsReview(card: LoreMemoryCard, now: number): boolean {
  const isValidUntilPast = (() => {
    if (!card.validUntil) return false;
    const d = new Date(card.validUntil);
    if (Number.isNaN(d.getTime())) return false;
    return d.getTime() < now;
  })();

  return (
    card.temporalStatus === "uncertain" ||
    card.temporalStatus === "expired" ||
    (card.confidenceScore !== null && card.confidenceScore < 0.5) ||
    (card.temporalStatus === "current" && isValidUntilPast)
  );
}
