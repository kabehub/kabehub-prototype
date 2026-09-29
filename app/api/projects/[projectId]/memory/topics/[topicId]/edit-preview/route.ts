import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import * as logger from "@/lib/logger";
import { LORE_CHAT_MODEL } from "@/lib/internalModels";
import { getOwnedProject } from "@/lib/project-memory/get-owned-project";
import {
  buildInstructionEditInput,
  generateInstructionEdit,
  INSTRUCTION_EDIT_PROMPT_VERSION,
  MAX_INSTRUCTION_CHARS,
  MAX_INSTRUCTION_EDIT_INPUT_CHARS,
  parseInstructionEditResponse,
  validateInstructionEditSnapshot,
} from "@/lib/project-memory/instruction-edit";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ projectId: string; topicId: string }> };

export async function POST(req: NextRequest, props: RouteProps) {
  const openaiKey = req.headers.get("x-openai-api-key")?.trim();
  if (!openaiKey) {
    return NextResponse.json({ error: "x-openai-api-key header required" }, { status: 400 });
  }

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
  const instruction = typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>).instruction
    : undefined;
  if (typeof instruction !== "string" || instruction.trim() === "" || instruction.length > MAX_INSTRUCTION_CHARS) {
    return finalizeJson({ error: "Invalid instruction" }, { status: 400 });
  }

  const project = await getOwnedProject(supabase, user.id, projectId);
  if (!project.ok) return finalizeJson({ error: project.error }, { status: project.status });

  const { data, error } = await supabase
    .from("project_memory_topics")
    .select("id, topic_key, revision, updated_at, content_md")
    .eq("id", topicId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) {
    logger.dbOperationFailed({
      route: "projects-memory-topic-edit-preview",
      operation: "load_topic",
      table: "project_memory_topics",
      errorCode: error.code,
    });
    return finalizeJson({ error: "Failed to load topic" }, { status: 500 });
  }
  if (data === null) return finalizeJson({ error: "Topic not found" }, { status: 404 });

  let topic;
  try {
    topic = validateInstructionEditSnapshot({
      topic_id: data.id,
      topic_key: data.topic_key,
      revision: data.revision,
      updated_at: data.updated_at,
      content_md: data.content_md,
    });
  } catch {
    return finalizeJson({ error: "Invalid Project Memory snapshot" }, { status: 500 });
  }

  const input = buildInstructionEditInput(instruction, topic);
  if (input.length > MAX_INSTRUCTION_EDIT_INPUT_CHARS) {
    return finalizeJson({ error: "このtopicは大きすぎるためAI編集できません" }, { status: 413 });
  }

  try {
    const content = await generateInstructionEdit(openaiKey, input);
    if (typeof content !== "string" || content.trim() === "") throw new Error("empty model response");
    const result = parseInstructionEditResponse(content, topic);
    const envelope = {
      result: result.kind,
      run_id: randomUUID(),
      model: LORE_CHAT_MODEL,
      prompt_version: INSTRUCTION_EDIT_PROMPT_VERSION,
      topic_id: topic.topic_id,
      topic_key: topic.topic_key,
      revision: topic.revision,
      updated_at: topic.updated_at,
    };
    if (result.kind === "proposal") {
      return finalizeJson({ ...envelope, old_content_md: topic.content_md, new_content_md: result.new_content_md, summary: result.summary });
    }
    if (result.kind === "not_applicable") return finalizeJson({ ...envelope, reason: result.reason });
    return finalizeJson(envelope);
  } catch (error) {
    logger.externalApiFailed({
      service: "openai",
      errorCode: error instanceof Error && error.message.startsWith("Invalid instruction edit response:")
        ? "UPSTREAM_RESPONSE_INVALID"
        : "UPSTREAM_REQUEST_FAILED",
    });
    return finalizeJson({ error: "Project MemoryのAI編集案を生成できませんでした" }, { status: 502 });
  }
}
