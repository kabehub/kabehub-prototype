import { NextRequest } from "next/server";
import * as logger from "@/lib/logger";
import { PROJECT_MEMORY_BULK_DELETE_MAX_TOPICS } from "@/lib/project-memory/topic-delete-limits";
import { getOwnedProject } from "@/lib/project-memory/get-owned-project";
import { mapProjectMemoryRpcError } from "@/lib/project-memory/map-rpc-error";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export const dynamic = "force-dynamic";
type RouteProps = { params: Promise<{ projectId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function POST(req: NextRequest, props: RouteProps) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;
  const { projectId } = await props.params;
  const project = await getOwnedProject(supabase, user.id, projectId);
  if (!project.ok) return finalizeJson({ error: project.error }, { status: project.status });

  let body: unknown;
  try { body = await req.json(); }
  catch { return finalizeJson({ error: "Invalid request body" }, { status: 400 }); }
  const topics = record(body) ? body.topics : undefined;
  if (!Array.isArray(topics) || topics.length < 1 || topics.length > PROJECT_MEMORY_BULK_DELETE_MAX_TOPICS) {
    return finalizeJson({ error: "topics must contain 1 to 50 items" }, { status: 400 });
  }
  const seen = new Set<string>();
  const input: Array<{ topic_id: string; expected_revision: number }> = [];
  for (const topic of topics) {
    if (!record(topic) || typeof topic.id !== "string" || !UUID.test(topic.id) ||
        typeof topic.expected_revision !== "number" || !Number.isInteger(topic.expected_revision) ||
        topic.expected_revision < 1 || topic.expected_revision > 2147483647) {
      return finalizeJson({ error: "invalid topic element" }, { status: 400 });
    }
    const id = topic.id.toLowerCase();
    if (seen.has(id)) return finalizeJson({ error: "duplicate topic_id" }, { status: 400 });
    seen.add(id);
    input.push({ topic_id: id, expected_revision: topic.expected_revision });
  }
  const { data, error } = await supabase.rpc("delete_project_memory_topics", {
    p_user_id: user.id, p_project_id: projectId, p_topics: input,
  });
  if (error) {
    logger.dbOperationFailed({ route: "projects-memory-topics", operation: "delete_project_memory_topics",
      table: "project_memory_topics", errorCode: error.code });
    const mapped = mapProjectMemoryRpcError(error);
    return finalizeJson({ error: mapped.error }, { status: mapped.status });
  }
  return finalizeJson({ deleted_count: data });
}
