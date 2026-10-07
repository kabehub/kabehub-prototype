import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import * as logger from "@/lib/logger";
import { LORE_CHAT_MODEL } from "@/lib/internalModels";
import { getOwnedProject } from "@/lib/project-memory/get-owned-project";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import {
  AutoSummaryUpdateDbError, AutoSummaryUpdateInputTooLarge, loadAutoSummaryUpdateTopics,
  selectAutoSummaryUpdateInput, generateAutoSummaryUpdate, parseAutoSummaryUpdateResponse,
} from "@/lib/project-memory/auto-summary-update";
import { AUTO_SUMMARY_UPDATE_PROMPT_VERSION, type UpdateProposal, type AutoSummaryUpdatePreview } from "@/lib/project-memory/auto-summary-update-limits";

export const dynamic = "force-dynamic";
type RouteProps = { params: Promise<{ projectId: string }> };

export async function POST(req: NextRequest, props: RouteProps) {
  const key = req.headers.get("x-openai-api-key")?.trim();
  if (!key) return NextResponse.json({ error: "x-openai-api-key header required" }, { status: 400 });
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;
  const { projectId } = await props.params;
  const project = await getOwnedProject(supabase, user.id, projectId);
  if (!project.ok) return finalizeJson({ error: project.error }, { status: project.status });
  const header = { run_id: randomUUID(), model: LORE_CHAT_MODEL, prompt_version: AUTO_SUMMARY_UPDATE_PROMPT_VERSION };
  let loaded, selection;
  try {
    loaded = await loadAutoSummaryUpdateTopics(supabase, user.id, projectId);
    if (!loaded.topics.length) {
      const body: AutoSummaryUpdatePreview = { ...header, result: "not_applicable", reason: "no_updatable_topics", excluded_topics: loaded.excluded_topics };
      return finalizeJson(body);
    }
    selection = await selectAutoSummaryUpdateInput(supabase, user.id, projectId, loaded.topics);
  } catch (error) {
    if (error instanceof AutoSummaryUpdateInputTooLarge) return finalizeJson({ error: "update_input_too_large" }, { status: 413 });
    logger.dbOperationFailed({ route: "projects-memory-update-preview", operation: "load_input",
      table: error instanceof AutoSummaryUpdateDbError ? error.table : "project_memory_topics",
      errorCode: error instanceof AutoSummaryUpdateDbError ? error.code : undefined });
    return finalizeJson({ error: "Failed to load Project Memory update input" }, { status: 500 });
  }
  if (!selection.stats.user_messages_included) {
    const body: AutoSummaryUpdatePreview = { ...header, result: "not_applicable", reason: "no_new_messages", excluded_topics: loaded.excluded_topics };
    return finalizeJson(body);
  }
  try {
    const content = await generateAutoSummaryUpdate(key, selection.input);
    if (typeof content !== "string") throw new Error("empty model response");
    const decisions = parseAutoSummaryUpdateResponse(content, loaded.topics);
    const proposals: UpdateProposal[] = decisions.flatMap(d => {
      if (!d.needs_update) return [];
      const topic = loaded.topics.find(t => t.topic_key === d.topic_key)!;
      return [{ topic_id: topic.id, topic_key: topic.topic_key, origin: topic.origin, base_revision: topic.revision,
        current_content_md: topic.content_md, proposed_content_md: d.content_md, reason: d.reason }];
    });
    const payload = { ...header, checkpoint_topics: selection.checkpoint_topics, considered_threads: selection.considered_threads,
      stats: selection.stats, excluded_topics: loaded.excluded_topics };
    const body: AutoSummaryUpdatePreview = proposals.length ? { ...payload, result: "preview", proposals } :
      { ...payload, result: "checkpoint_only", proposals: [] };
    return finalizeJson(body);
  } catch (error) {
    const invalid = error instanceof Error && error.message === "Invalid auto summary update response";
    logger.externalApiFailed({ service: "openai", errorCode: invalid ? "UPSTREAM_RESPONSE_INVALID" : "UPSTREAM_REQUEST_FAILED" });
    return finalizeJson({ error: invalid ? "invalid_llm_response" : "llm_failed" }, { status: 502 });
  }
}
