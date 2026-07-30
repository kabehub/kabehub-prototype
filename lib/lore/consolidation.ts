// Client componentからも参照されるため、server-only依存を追加しないこと。

export function normalizePair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

export function pairKey(idA: string, idB: string): string {
  const [a, b] = normalizePair(idA, idB);
  return `${a}:${b}`;
}

export const CONSOLIDATION_SOURCE_SELECT = [
  "id",
  "user_id",
  "folder_name",
  "chunk_text",
  "tags",
  "memory_kind",
  "temporal_status",
  "importance_score",
  "confidence_score",
  "is_archived",
  "superseded_by",
  "is_pinned",
  "extraction_version",
  "created_at",
].join(", ");

export type ConsolidationSourceRow = {
  id: string;
  user_id: string;
  folder_name: string | null;
  chunk_text: string;
  tags: string[] | null;
  memory_kind: string | null;
  temporal_status: string | null;
  importance_score: number | null;
  confidence_score: number | null;
  is_archived: boolean | null;
  superseded_by: string | null;
  is_pinned: boolean | null;
  extraction_version: string | null;
  created_at: string | null;
};

export function buildConsolidationUserPrompt(sources: ConsolidationSourceRow[]) {
  return sources
    .sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""))
    .map((source, index) =>
      `記憶${index + 1}（created_at: ${source.created_at ?? "unknown"}）:\n${source.chunk_text}`
    )
    .join("\n\n---\n\n");
}

export function isJsonStringLike(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !["{", "[", "\""].includes(trimmed[0])) return false;

  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function validateMergedText(value: string) {
  if (!value.trim()) return "Merged text is empty";
  if (value.length > 500) return "Merged text exceeds 500 characters";
  if (isJsonStringLike(value)) return "Merged text must not be JSON";
  return null;
}

export function validateApprovedPair(
  rows: ConsolidationSourceRow[],
  userId: string,
  loreIdA: string,
  loreIdB: string,
): { sourceA: ConsolidationSourceRow; sourceB: ConsolidationSourceRow } | null {
  if (rows.length !== 2) return null;

  const byId = new Map(rows.map((row) => [row.id, row]));
  const sourceA = byId.get(loreIdA);
  const sourceB = byId.get(loreIdB);
  if (!sourceA || !sourceB) return null;

  const isEditableExtraction = (value: string | null) => value === "user_edited" || value === "user_created";
  const invalid = [sourceA, sourceB].some((row) =>
    row.user_id !== userId ||
    row.is_archived !== false ||
    row.superseded_by !== null ||
    row.is_pinned !== false ||
    isEditableExtraction(row.extraction_version)
  );
  if (invalid) return null;

  return { sourceA, sourceB };
}

export function validateDreamingSources(
  rows: ConsolidationSourceRow[],
  userId: string,
  sourceIds: string[],
): ConsolidationSourceRow[] | null {
  if (rows.length < 2) return null;

  const byId = new Map(rows.map((row) => [row.id, row]));
  const sources = sourceIds.map((id) => byId.get(id));
  if (sources.some((source) => !source)) return null;

  const isProtectedExtraction = (value: string | null) =>
    value === "user_edited" ||
    value === "user_created" ||
    value === "liked_ai" ||
    value === "liked_ai_cleaned";
  const validSources = sources as ConsolidationSourceRow[];
  const invalid = validSources.some((row) =>
    row.user_id !== userId ||
    row.is_archived !== false ||
    row.superseded_by !== null ||
    row.is_pinned !== false ||
    isProtectedExtraction(row.extraction_version)
  );
  if (invalid) return null;
  const first = validSources[0];
  const mismatched = validSources.some((row) =>
    row.folder_name !== first.folder_name || row.memory_kind !== first.memory_kind
  );
  if (mismatched) return null;

  return validSources;
}
