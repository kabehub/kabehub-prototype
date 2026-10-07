import { NextRequest } from "next/server";
import * as logger from "@/lib/logger";
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
  const badRequest = (error: string) => finalizeJson({ error }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return badRequest("Invalid request body"); }
  if (!record(body)) return badRequest("Invalid request body");
  const { topic_id: topicId, expected_revision: expectedRevision, cursors } = body;
  if (typeof topicId !== "string" || !UUID.test(topicId)) return badRequest("invalid topic_id");
  if (typeof expectedRevision !== "number" || !Number.isInteger(expectedRevision) ||
      expectedRevision < 1 || expectedRevision > 2147483647) {
    return badRequest("expected_revision must be a positive integer");
  }
  if (!Array.isArray(cursors)) return badRequest("cursors must be a jsonb array");
  if (cursors.length < 1 || cursors.length > 100) return badRequest("cursors must contain 1 to 100 items");

  const input: Array<{ thread_id: string; message_id: string }> = [];
  for (const cursor of cursors) {
    if (!record(cursor) || (Object.getPrototypeOf(cursor) !== Object.prototype && Object.getPrototypeOf(cursor) !== null) ||
        Object.keys(cursor).length !== 2 || !Object.hasOwn(cursor, "thread_id") || !Object.hasOwn(cursor, "message_id") ||
        typeof cursor.thread_id !== "string" || !UUID.test(cursor.thread_id) ||
        typeof cursor.message_id !== "string" || !UUID.test(cursor.message_id)) {
      return badRequest("invalid cursor element");
    }
    input.push({ thread_id: cursor.thread_id, message_id: cursor.message_id });
  }
  const seen = new Set<string>();
  for (const cursor of input) {
    const id = cursor.thread_id.toLowerCase();
    if (seen.has(id)) return badRequest("duplicate thread_id");
    seen.add(id);
  }

  const { projectId } = await props.params;
  const project = await getOwnedProject(supabase, user.id, projectId);
  if (!project.ok) return finalizeJson({ error: project.error }, { status: project.status });
  const { data: topic, error: topicError } = await supabase
    .from("project_memory_topics").select("id").eq("id", topicId).eq("project_id", projectId).maybeSingle();
  if (topicError) return finalizeJson({ error: "Failed to load topic" }, { status: 500 });
  if (!topic) return finalizeJson({ error: "Topic not found" }, { status: 404 });

  const { data, error } = await supabase.rpc("advance_project_memory_auto_summary_cursors", {
    p_user_id: user.id, p_topic_id: topicId, p_expected_revision: expectedRevision, p_cursors: input,
  });
  if (error) {
    const mapped = mapProjectMemoryRpcError(error);
    logger.dbOperationFailed({
      route: "projects-memory-update-checkpoint", operation: "advance_project_memory_auto_summary_cursors",
      table: "project_memory_auto_summary_cursors", errorCode: error.code,
    });
    return finalizeJson({ error: mapped.error }, { status: mapped.status });
  }
  return finalizeJson({ advanced: typeof data === "number" ? data : 0 });
}
