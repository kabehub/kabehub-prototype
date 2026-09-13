const MESSAGE_STATUS_MAP: Record<string, { status: number; error: string }> = {
  "project not found": { status: 404, error: "Project not found" },
  "topic not found": { status: 404, error: "Topic not found" },
  "topic already exists": { status: 409, error: "Topic already exists" },
  "revision conflict": { status: 409, error: "Revision conflict" },
  "old_text not found": { status: 409, error: "old_text not found" },
  "old_text not unique": { status: 409, error: "old_text not unique" },
  "topic_key is required": { status: 400, error: "topic_key is required" },
  "source_refs must be a jsonb array": {
    status: 400,
    error: "source_refs must be a jsonb array",
  },
  "expected_revision must be a positive integer": {
    status: 400,
    error: "expected_revision must be a positive integer",
  },
  "edit_kind must be full or partial": {
    status: 400,
    error: "edit_kind must be full or partial",
  },
  "new_content_md is required for full edit": {
    status: 400,
    error: "new_content_md is required for full edit",
  },
  "old_text and new_text are required for partial edit": {
    status: 400,
    error: "old_text and new_text are required for partial edit",
  },
  "promote_to_lore is required": {
    status: 400,
    error: "promote_to_lore is required",
  },
  "lore_promotions must be a jsonb array": {
    status: 400,
    error: "lore_promotions must be a jsonb array",
  },
  "lore_promotions must be empty when promote_to_lore is false": {
    status: 400,
    error: "lore_promotions must be empty when promote_to_lore is false",
  },
  "invalid lore promotion element": {
    status: 400,
    error: "invalid lore promotion element",
  },
  "duplicate topic_id in lore_promotions": {
    status: 400,
    error: "duplicate topic_id in lore_promotions",
  },
  "topic changed during promotion": {
    status: 409,
    error: "Topic changed during promotion",
  },
};

export function mapProjectMemoryRpcError(error: { code?: string; message: string }) {
  if (error.code === "42501") return { status: 403, error: "Forbidden" };
  return MESSAGE_STATUS_MAP[error.message] ?? {
    status: 500,
    error: "Failed to process request",
  };
}
