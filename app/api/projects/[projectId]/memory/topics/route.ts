import { NextRequest } from "next/server";
import * as logger from "@/lib/logger";
import { getOwnedProject } from "@/lib/project-memory/get-owned-project";
import { mapProjectMemoryRpcError } from "@/lib/project-memory/map-rpc-error";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ projectId: string }> };

type CreateTopicRpcResult = {
  topic_id: string;
  revision: number;
  content_md: string;
  created_at: string;
};

export async function GET(req: NextRequest, props: RouteProps) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;
  const { projectId } = await props.params;

  const project = await getOwnedProject(supabase, user.id, projectId);
  if (!project.ok) {
    return finalizeJson({ error: project.error }, { status: project.status });
  }

  const { data, error } = await supabase
    .from("project_memory_topics")
    .select("id, topic_key, content_md, revision, created_at, updated_at")
    .eq("project_id", projectId)
    .order("topic_key", { ascending: true });

  if (error) {
    return finalizeJson({ error: "Failed to load topics" }, { status: 500 });
  }

  const topics = data ?? [];
  if (topics.length === 0) return finalizeJson({ topics: [] });

  const topicIds = topics.map((topic) => topic.id);
  const { data: promotions, error: promotionError } = await supabase
    .from("lore_embeddings")
    .select("id, metadata")
    .eq("user_id", user.id)
    .eq("source_type", "project_memory_promotion")
    .eq("is_archived", false)
    .is("superseded_by", null)
    .in("metadata->>source_topic_id", topicIds);

  if (promotionError) {
    return finalizeJson({ error: "Failed to load topics" }, { status: 500 });
  }

  const promotionsByTopic = new Map<string, Array<{ id: string; metadata: unknown }>>();
  for (const promotion of promotions ?? []) {
    const metadata = promotion.metadata;
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) continue;
    const topicId = (metadata as Record<string, unknown>).source_topic_id;
    if (typeof topicId !== "string") continue;
    const matches = promotionsByTopic.get(topicId) ?? [];
    matches.push(promotion);
    promotionsByTopic.set(topicId, matches);
  }

  return finalizeJson({
    topics: topics.map((topic) => {
      const notPromoted = { status: "not_promoted" as const, source_revision: null, lore_id: null };
      const matches = promotionsByTopic.get(topic.id) ?? [];
      if (matches.length === 0) return { ...topic, promotion: notPromoted };
      if (matches.length > 1) {
        console.error("[project-memory-promotion-invariant]", { reason: "multiple_active", topicId: topic.id });
        return { ...topic, promotion: notPromoted };
      }
      const match = matches[0];
      const metadata = match.metadata as Record<string, unknown>;
      const rawRevision = metadata.source_revision;
      const sourceRevision = typeof rawRevision === "number" ? rawRevision :
        typeof rawRevision === "string" && /^\d+$/.test(rawRevision) ? Number(rawRevision) : NaN;
      if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 1) {
        return { ...topic, promotion: notPromoted };
      }
      if (sourceRevision > topic.revision) {
        console.error("[project-memory-promotion-invariant]", { reason: "future_revision", topicId: topic.id });
        return { ...topic, promotion: notPromoted };
      }
      return {
        ...topic,
        promotion: {
          status: sourceRevision === topic.revision ? "current" as const : "stale" as const,
          source_revision: sourceRevision,
          lore_id: match.id,
        },
      };
    }),
  });
}

export async function POST(req: NextRequest, props: RouteProps) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;
  const { projectId } = await props.params;

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

  if (
    typeof requestBody.topic_key !== "string" ||
    requestBody.topic_key.trim() === ""
  ) {
    return finalizeJson({ error: "topic_key is required" }, { status: 400 });
  }

  const topicKey = requestBody.topic_key.trim();
  const contentMd =
    typeof requestBody.content_md === "string" ? requestBody.content_md : "";

  if (
    requestBody.source_refs !== undefined &&
    !Array.isArray(requestBody.source_refs)
  ) {
    return finalizeJson(
      { error: "source_refs must be a jsonb array" },
      { status: 400 },
    );
  }
  const sourceRefs = requestBody.source_refs ?? [];

  const { data, error } = await supabase
    .rpc("create_project_memory_topic", {
      p_user_id: user.id,
      p_project_id: projectId,
      p_topic_key: topicKey,
      p_content_md: contentMd,
      p_source_refs: sourceRefs,
    })
    .single<CreateTopicRpcResult>();

  if (error) {
    const mapped = mapProjectMemoryRpcError(error);
    logger.dbOperationFailed({
      route: "projects-memory-topics",
      operation: "create_project_memory_topic",
      table: "project_memory_topics",
      errorCode: error.code,
    });
    return finalizeJson({ error: mapped.error }, { status: mapped.status });
  }

  return finalizeJson(
    {
      topic: {
        id: data.topic_id,
        topic_key: topicKey,
        revision: data.revision,
        content_md: data.content_md,
        created_at: data.created_at,
      },
    },
    { status: 201 },
  );
}
