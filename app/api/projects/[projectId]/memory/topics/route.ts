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
    .select("id, topic_key, revision, created_at, updated_at")
    .eq("project_id", projectId)
    .order("topic_key", { ascending: true });

  if (error) {
    return finalizeJson({ error: "Failed to load topics" }, { status: 500 });
  }

  return finalizeJson({ topics: data ?? [] });
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
