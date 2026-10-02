import { NextRequest } from "next/server";
import * as logger from "@/lib/logger";
import { PROJECT_MEMORY_CHAT_MAX_CHARS } from "@/lib/project-memory/chat-inclusion-limits";
import { getOwnedProject } from "@/lib/project-memory/get-owned-project";
import { mapProjectMemoryRpcError } from "@/lib/project-memory/map-rpc-error";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ projectId: string; topicId: string }> };
type ChatInclusionRpcResult = { is_included: boolean; included_chars: number };

export async function PATCH(req: NextRequest, props: RouteProps) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;
  const { projectId, topicId } = await props.params;

  const project = await getOwnedProject(supabase, user.id, projectId);
  if (!project.ok) {
    return finalizeJson({ error: project.error }, { status: project.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return finalizeJson({ error: "Invalid request body" }, { status: 400 });
  }
  const include = typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>).include : undefined;
  if (typeof include !== "boolean") {
    return finalizeJson({ error: "include must be a boolean" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("set_project_memory_topic_chat_inclusion", {
    p_user_id: user.id,
    p_project_id: projectId,
    p_topic_id: topicId,
    p_include: include,
  }).single<ChatInclusionRpcResult>();

  if (error) {
    const mapped = mapProjectMemoryRpcError(error);
    logger.dbOperationFailed({
      route: "projects-memory-topics",
      operation: "set_project_memory_topic_chat_inclusion",
      table: "project_memory_topics",
      errorCode: error.code,
    });
    const limitExceeded = error.message === "chat inclusion limit exceeded" && mapped.status === 409;
    return finalizeJson({
      error: mapped.error,
      ...(limitExceeded ? { code: "chat_inclusion_limit_exceeded", max_chars: PROJECT_MEMORY_CHAT_MAX_CHARS } : {}),
    }, { status: mapped.status });
  }
  return finalizeJson({
    topic: { id: topicId, include_in_chat: data.is_included },
    included_chars: data.included_chars,
  });
}
