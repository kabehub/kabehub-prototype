import { NextRequest } from "next/server";
import * as logger from "@/lib/logger";
import { getOwnedProject } from "@/lib/project-memory/get-owned-project";
import { mapProjectMemoryRpcError } from "@/lib/project-memory/map-rpc-error";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export const dynamic = "force-dynamic";

type RouteProps = {
  params: Promise<{ projectId: string; topicId: string }>;
};

type UpdateTopicRpcResult = {
  revision: number;
  content_md: string;
  updated_at: string;
};

export async function GET(req: NextRequest, props: RouteProps) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;
  const { projectId, topicId } = await props.params;

  const project = await getOwnedProject(supabase, user.id, projectId);
  if (!project.ok) {
    return finalizeJson({ error: project.error }, { status: project.status });
  }

  const { data, error } = await supabase
    .from("project_memory_topics")
    .select("id, topic_key, content_md, revision, created_at, updated_at")
    .eq("id", topicId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    return finalizeJson({ error: "Failed to load topic" }, { status: 500 });
  }
  if (!data) {
    return finalizeJson({ error: "Topic not found" }, { status: 404 });
  }

  return finalizeJson({ topic: data });
}

export async function PATCH(req: NextRequest, props: RouteProps) {
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

  const editKind = requestBody.edit_kind;
  if (editKind !== "full" && editKind !== "partial") {
    return finalizeJson(
      { error: "edit_kind must be full or partial" },
      { status: 400 },
    );
  }

  let newContentMd: string | null = null;
  let oldText: string | null = null;
  let newText: string | null = null;

  if (editKind === "full") {
    if (typeof requestBody.new_content_md !== "string") {
      return finalizeJson(
        { error: "new_content_md is required for full edit" },
        { status: 400 },
      );
    }
    newContentMd = requestBody.new_content_md;
  } else {
    if (
      typeof requestBody.old_text !== "string" ||
      requestBody.old_text === "" ||
      typeof requestBody.new_text !== "string"
    ) {
      return finalizeJson(
        { error: "old_text and new_text are required for partial edit" },
        { status: 400 },
      );
    }
    oldText = requestBody.old_text;
    newText = requestBody.new_text;
  }

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

  const project = await getOwnedProject(supabase, user.id, projectId);
  if (!project.ok) {
    return finalizeJson({ error: project.error }, { status: project.status });
  }

  const { data: topic, error: topicError } = await supabase
    .from("project_memory_topics")
    .select("id")
    .eq("id", topicId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (topicError) {
    return finalizeJson({ error: "Failed to load topic" }, { status: 500 });
  }
  if (!topic) {
    return finalizeJson({ error: "Topic not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .rpc("update_project_memory_topic", {
      p_user_id: user.id,
      p_topic_id: topicId,
      p_expected_revision: expectedRevision,
      p_edit_kind: editKind,
      p_new_content_md: newContentMd,
      p_old_text: oldText,
      p_new_text: newText,
      p_source_refs: sourceRefs,
    })
    .single<UpdateTopicRpcResult>();

  if (error) {
    const mapped = mapProjectMemoryRpcError(error);
    logger.dbOperationFailed({
      route: "projects-memory-topics",
      operation: "update_project_memory_topic",
      table: "project_memory_topics",
      errorCode: error.code,
    });
    return finalizeJson({ error: mapped.error }, { status: mapped.status });
  }

  return finalizeJson({
    topic: {
      id: topicId,
      revision: data.revision,
      content_md: data.content_md,
      updated_at: data.updated_at,
    },
  });
}
