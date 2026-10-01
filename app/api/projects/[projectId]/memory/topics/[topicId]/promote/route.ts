import { NextRequest } from "next/server";
import * as logger from "@/lib/logger";
import { AiProviderRequestError, createEmbedding } from "@/lib/lore/openai";
import { getOwnedProject } from "@/lib/project-memory/get-owned-project";
import { mapProjectMemoryRpcError } from "@/lib/project-memory/map-rpc-error";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export const dynamic = "force-dynamic";

type RouteProps = {
  params: Promise<{ projectId: string; topicId: string }>;
};

type PromoteTopicRpcResult = {
  lore_id: string;
  created: boolean;
};

type RestorePromotionRpcResult = {
  lore_id: string;
  restored: boolean;
};

export async function POST(req: NextRequest, props: RouteProps) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;
  const { projectId, topicId } = await props.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return finalizeJson({ error: "Invalid request body" }, { status: 400 });
  }

  const requestBody =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const expectedRevision = requestBody.expected_revision;
  if (
    typeof expectedRevision !== "number" ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 1
  ) {
    return finalizeJson(
      { error: "expected_revision must be a positive integer" },
      { status: 400 },
    );
  }

  const rawAcknowledged = requestBody.acknowledged_edited_lore_ids ?? [];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (requestBody.acknowledged_edited_lore_ids === null || !Array.isArray(rawAcknowledged) ||
      rawAcknowledged.length > 100 || rawAcknowledged.some((id) => typeof id !== "string" || !uuid.test(id))) {
    return finalizeJson({ error: "acknowledged_edited_lore_ids must be an array of at most 100 UUIDs" }, { status: 400 });
  }
  const acknowledgedIds = [...new Set((rawAcknowledged as string[]).map((id) => id.toLowerCase()))];

  const project = await getOwnedProject(supabase, user.id, projectId);
  if (!project.ok) {
    return finalizeJson({ error: project.error }, { status: project.status });
  }

  const { data: topic, error: topicError } = await supabase
    .from("project_memory_topics")
    .select("content_md, revision")
    .eq("id", topicId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (topicError) {
    return finalizeJson({ error: "Failed to load topic" }, { status: 500 });
  }
  if (!topic) {
    return finalizeJson({ error: "Topic not found" }, { status: 404 });
  }
  if (topic.revision !== expectedRevision) {
    return finalizeJson({ error: "Revision conflict" }, { status: 409 });
  }
  if (topic.content_md.trim() === "") {
    return finalizeJson({ error: "Topic is empty" }, { status: 400 });
  }

  const loadEditedLores = async () => {
    // Match the RPC supersede predicate. A newly inserted Lore cannot be in this preflight result.
    const { data, error } = await supabase.from("lore_embeddings")
      .select("id, chunk_text")
      .eq("user_id", user.id)
      .eq("source_type", "project_memory_promotion")
      .eq("metadata->>source_topic_id", topicId.toLowerCase())
      .eq("is_archived", false)
      .is("superseded_by", null)
      .eq("extraction_version", "user_edited")
      .order("id", { ascending: true });
    return { error, editedLores: (data ?? []).map((row) => ({
      id: row.id,
      title: (row.chunk_text ?? "").split(/\r?\n/).find((line: string) => line.trim())?.trim().slice(0, 120) || "無題のLore",
    })) };
  };
  const confirmationResponse = (editedLores: Array<{ id: string; title: string }>) => finalizeJson({
    error: "手動編集済みのLoreを置き換えるには確認が必要です",
    code: "edited_lore_needs_confirmation",
    edited_lores: editedLores,
  }, { status: 409 });

  // The unique index includes archived rows; restore an unsuperseded same-revision row before embedding.
  // Superseded same-revision rows intentionally retain the legacy embedding/promotion path;
  // a 409 short-circuit before embedding is out of scope and can be considered in a separate ticket.
  const { data: existing, error: existingError } = await supabase.from("lore_embeddings")
    .select("id, is_archived, superseded_by")
    .eq("user_id", user.id)
    .eq("source_type", "project_memory_promotion")
    .eq("metadata->>source_topic_id", topicId.toLowerCase())
    .eq("metadata->>source_revision", String(expectedRevision))
    .maybeSingle();
  if (existingError) return finalizeJson({ error: "Failed to load promotion" }, { status: 500 });
  if (existing?.is_archived === true && existing.superseded_by === null) {
    const { data, error } = await supabase
      .rpc("restore_archived_project_memory_promotion", {
        p_user_id: user.id,
        p_topic_id: topicId,
        p_expected_revision: expectedRevision,
      })
      .single<RestorePromotionRpcResult>();

    if (error) {
      logger.dbOperationFailed({
        route: "projects-memory-topics-promote",
        operation: "restore_archived_project_memory_promotion",
        table: "lore_embeddings",
        errorCode: error.code,
      });
      if (error.code === "P0001" && [
        "restore_conflict_active_exists",
        "restore_not_allowed_superseded",
        "promotion_not_found",
      ].includes(error.message)) {
        return finalizeJson({
          error: "昇格Loreを復元できません。一覧を更新して状態を確認してください。",
          code: "promotion_restore_unavailable",
        }, { status: 409 });
      }
      const mapped = mapProjectMemoryRpcError(error);
      return finalizeJson({ error: mapped.error }, { status: mapped.status });
    }

    return finalizeJson({ lore_id: data.lore_id, created: false, restored: data.restored });
  }
  if (!existing) {
    const { error, editedLores } = await loadEditedLores();
    if (error) return finalizeJson({ error: "Failed to load promotion" }, { status: 500 });
    if (editedLores.some((row) => !acknowledgedIds.includes(row.id.toLowerCase()))) {
      return confirmationResponse(editedLores);
    }
  }

  const openaiKey = req.headers.get("x-openai-api-key");
  if (!openaiKey) {
    return finalizeJson(
      { error: "x-openai-api-key header required" },
      { status: 400 },
    );
  }

  let embedding: number[];
  try {
    embedding = await createEmbedding(openaiKey, topic.content_md);
  } catch (err) {
    const status =
      err instanceof AiProviderRequestError ? (err.status ?? 502) : 502;
    const message =
      err instanceof Error
        ? err.message
        : "OpenAI APIへのリクエストに失敗しました";
    return finalizeJson({ error: message }, { status });
  }

  const { data, error } = await supabase
    .rpc("promote_project_memory_topic_to_lore", {
      p_user_id: user.id,
      p_topic_id: topicId,
      p_expected_revision: expectedRevision,
      p_embedding: embedding,
      p_acknowledged_edited_lore_ids: acknowledgedIds,
    })
    .single<PromoteTopicRpcResult>();

  if (error) {
    if (error.code === "P0001" && error.message === "edited_lore_needs_confirmation") {
      const { error: lookupError, editedLores } = await loadEditedLores();
      if (lookupError) return finalizeJson({ error: "Failed to load promotion" }, { status: 500 });
      return confirmationResponse(editedLores);
    }
    const mapped = mapProjectMemoryRpcError(error);
    logger.dbOperationFailed({
      route: "projects-memory-topics-promote",
      operation: "promote_project_memory_topic_to_lore",
      table: "lore_embeddings",
      errorCode: error.code,
    });
    return finalizeJson({ error: mapped.error }, { status: mapped.status });
  }

  return finalizeJson({ lore_id: data.lore_id, created: data.created });
}
