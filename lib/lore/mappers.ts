// Client componentからも参照されるため、server-only依存を追加しないこと。

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
