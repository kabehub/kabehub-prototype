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
    })
    .single<PromoteTopicRpcResult>();

  if (error) {
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
