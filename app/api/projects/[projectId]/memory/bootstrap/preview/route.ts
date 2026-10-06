import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import * as logger from "@/lib/logger";
import { LORE_CHAT_MODEL } from "@/lib/internalModels";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { getOwnedProject } from "@/lib/project-memory/get-owned-project";
import { AUTO_SUMMARY_STANDARD_TOPIC_KEYS } from "@/lib/project-memory/auto-summary-limits";
import { AUTO_SUMMARY_PROMPT_VERSION, AutoSummaryDbError, selectAutoSummaryInput, generateAutoSummary, parseAutoSummaryResponse } from "@/lib/project-memory/auto-summary";

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

  let selection;
  let missing;
  try {
    // Only standard keys are needed; never read existing topic bodies.
    const { data, error } = await supabase.from("project_memory_topics").select("topic_key")
      .eq("project_id", projectId).in("topic_key", [...AUTO_SUMMARY_STANDARD_TOPIC_KEYS]);
    if (error) throw new AutoSummaryDbError("project_memory_topics", error.code);
    const existing = new Set((data ?? []).map(t => t.topic_key));
    missing = AUTO_SUMMARY_STANDARD_TOPIC_KEYS.filter(k => !existing.has(k));
    if (!missing.length) return finalizeJson({ result: "not_applicable", reason: "all_standard_topics_exist" });
    selection = await selectAutoSummaryInput(supabase, user.id, projectId, missing);
  } catch (error) {
    logger.dbOperationFailed({ route: "projects-memory-bootstrap-preview", operation: "load_input",
      table: error instanceof AutoSummaryDbError ? error.table : "messages",
      errorCode: error instanceof AutoSummaryDbError ? error.code : undefined });
    return finalizeJson({ error: "Failed to load Project conversations" }, { status: 500 });
  }
  if (!selection.considered_threads.length) return finalizeJson({ result: "not_applicable", reason: "no_eligible_threads" });
  try {
    const content = await generateAutoSummary(key, selection.input);
    if (typeof content !== "string") throw new Error("Invalid auto summary response: empty response");
    const parsedTopics = parseAutoSummaryResponse(content, missing);
    const topics = parsedTopics.filter(t => t.content_md.trim() !== "");
    const emptyKeys = new Set(parsedTopics.filter(t => t.content_md.trim() === "").map(t => t.topic_key));
    const empty_topic_keys = missing.filter(k => emptyKeys.has(k));
    if (!topics.length) return finalizeJson({ result: "not_applicable", reason: "insufficient_evidence" });
    return finalizeJson({ result: "preview", run_id: randomUUID(), model: LORE_CHAT_MODEL,
      prompt_version: AUTO_SUMMARY_PROMPT_VERSION, stats: selection.stats,
      considered_threads: selection.considered_threads, topics, empty_topic_keys });
  } catch (error) {
    logger.externalApiFailed({ service: "openai", errorCode: error instanceof Error && error.message.startsWith("Invalid auto summary response:")
      ? "UPSTREAM_RESPONSE_INVALID" : "UPSTREAM_REQUEST_FAILED" });
    return finalizeJson({ error: "会話からProject Memoryを生成できませんでした" }, { status: 502 });
  }
}
