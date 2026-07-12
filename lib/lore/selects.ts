import type { LoreMemoryRow } from "./types";

const LORE_MEMORY_COLUMNS = [
  "id",
  "chunk_text",
  "tags",
  "memory_kind",
  "temporal_status",
  "importance_score",
  "confidence_score",
  "source_thread_id",
  "source_message_id",
  "source_message_number",
  "is_pinned",
  "is_archived",
  "extraction_version",
  "is_manually_corrected",
  "last_confirmed_at",
  "valid_from",
  "valid_until",
  "event_time",
  "created_at",
] as const satisfies readonly (keyof LoreMemoryRow)[];

type _EnsureAllColumnsSelected =
  Exclude<keyof LoreMemoryRow, (typeof LORE_MEMORY_COLUMNS)[number]> extends never
    ? true
    : ["missing column in LORE_MEMORY_COLUMNS"];
const _check: _EnsureAllColumnsSelected = true;
void _check;

export const LORE_MEMORY_SELECT = LORE_MEMORY_COLUMNS.join(", ");
