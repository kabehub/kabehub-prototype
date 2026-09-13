import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import * as logger from "@/lib/logger";
import { LORE_CHAT_MODEL } from "@/lib/internalModels";
import { getOwnedProject } from "@/lib/project-memory/get-owned-project";
import {
  buildProjectMemoryConsolidationInput,
  generateProjectMemoryConsolidation,
  MAX_CONSOLIDATION_INPUT_CHARS,
  parseProjectMemoryConsolidationResponse,
  PROJECT_MEMORY_CONSOLIDATION_PROMPT_VERSION,
  toProjectMemoryConsolidationProposals,
  validateProjectMemorySnapshot,
} from "@/lib/project-memory/consolidation";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ projectId: string }> };

export async function POST(req: NextRequest, props: RouteProps) {
  const openaiKey = req.headers.get("x-openai-api-key")?.trim();
  if (!openaiKey) {
    return NextResponse.json(
      { error: "x-openai-api-key header required" },
      { status: 400 },
    );
  }

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
    .select("id, topic_key, revision, updated_at, content_md")
    .eq("project_id", projectId)
    .neq("topic_key", "current_state")
    .order("topic_key", { ascending: true });

  if (error) {
    logger.dbOperationFailed({
      route: "projects-memory-consolidate-preview",
      operation: "load_snapshot",
      table: "project_memory_topics",
      errorCode: error.code,
    });
    return finalizeJson(
      { error: "Failed to load Project Memory" },
      { status: 500 },
    );
  }

  let snapshot;
  try {
    snapshot = validateProjectMemorySnapshot(
      (data ?? []).map((topic) => ({
        topic_id: topic.id,
        topic_key: topic.topic_key,
        revision: topic.revision,
        updated_at: topic.updated_at,
        content_md: topic.content_md,
      })),
    );
  } catch {
    return finalizeJson(
      { error: "Invalid Project Memory snapshot" },
      { status: 500 },
    );
  }

  const runId = randomUUID();
  const consideredTopics = snapshot.map((topic) => ({
    topic_id: topic.topic_id,
    topic_key: topic.topic_key,
    revision: topic.revision,
  }));

  if (snapshot.length === 0) {
    return finalizeJson({
      run_id: runId,
      model: LORE_CHAT_MODEL,
      prompt_version: PROJECT_MEMORY_CONSOLIDATION_PROMPT_VERSION,
      considered_topics: consideredTopics,
      topics: [],
    });
  }

  const input = buildProjectMemoryConsolidationInput(snapshot);
  if (input.length > MAX_CONSOLIDATION_INPUT_CHARS) {
    return finalizeJson(
      { error: "Project Memoryが大きすぎるため一括整理できません" },
      { status: 413 },
    );
  }

  try {
    const content = await generateProjectMemoryConsolidation(openaiKey, input);
    if (typeof content !== "string") {
      throw new Error("empty model response");
    }
    const decisions = parseProjectMemoryConsolidationResponse(content, snapshot);
    const topics = toProjectMemoryConsolidationProposals(decisions, snapshot);

    return finalizeJson({
      run_id: runId,
      model: LORE_CHAT_MODEL,
      prompt_version: PROJECT_MEMORY_CONSOLIDATION_PROMPT_VERSION,
      considered_topics: consideredTopics,
      topics,
    });
  } catch (error) {
    logger.externalApiFailed({
      service: "openai",
      errorCode:
        error instanceof Error && error.message.startsWith("Invalid consolidation response:")
          ? "UPSTREAM_RESPONSE_INVALID"
          : "UPSTREAM_REQUEST_FAILED",
    });
    return finalizeJson(
      { error: "Project Memoryの整理案を生成できませんでした" },
      { status: 502 },
    );
  }
}
