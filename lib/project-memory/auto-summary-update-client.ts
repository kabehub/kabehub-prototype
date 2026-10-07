import { AUTO_SUMMARY_STANDARD_TOPIC_KEYS, type AutoSummaryTopicKey } from "./auto-summary-limits";
import { MAX_AUTO_SUMMARY_UPDATE_INPUT_CHARS, type AutoSummaryUpdatePreview, type UpdateCheckpointTopic } from "./auto-summary-update-limits";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type UpdateTopicResult = { topic_id: string; topic_key: AutoSummaryTopicKey; status: "applied" | "skipped" | "unchanged" | "conflict" | "failed"; checkpoint: "ok" | "failed" | "none"; error?: string };
const ORIGINS = ["auto_summary", "auto_summary_update", "consolidation_run", "instruction_edit", "manual_or_unknown"];
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const timestamp = (v: unknown) => text(v) && Number.isFinite(Date.parse(v));
const standard = (v: unknown): v is AutoSummaryTopicKey => AUTO_SUMMARY_STANDARD_TOPIC_KEYS.includes(v as AutoSummaryTopicKey);

export function parseUpdatePreview(value: unknown): AutoSummaryUpdatePreview | null {
  if (!record(value) || !uuid(value.run_id) || !text(value.model) || !integer(value.prompt_version, 1) || !Array.isArray(value.excluded_topics)) return null;
  const excluded = new Set<string>();
  for (const t of value.excluded_topics) {
    if (!record(t) || !exact(t, ["topic_key", "reason"]) || !standard(t.topic_key) || excluded.has(t.topic_key) ||
      !["no_baseline", "no_auto_summary_history", "provenance_mismatch", "empty_topic"].includes(t.reason as string)) return null;
    excluded.add(t.topic_key);
  }
  if (value.result === "not_applicable") {
    if (!exact(value, ["run_id", "model", "prompt_version", "result", "reason", "excluded_topics"]) ||
      !["no_updatable_topics", "no_new_messages"].includes(value.reason as string)) return null;
    return value as AutoSummaryUpdatePreview;
  }
  if (!["preview", "checkpoint_only"].includes(value.result as string) ||
    !exact(value, ["run_id", "model", "prompt_version", "result", "proposals", "checkpoint_topics", "considered_threads", "stats", "excluded_topics"]) ||
    !Array.isArray(value.proposals) || (value.result === "preview" ? !value.proposals.length : value.proposals.length !== 0) ||
    !Array.isArray(value.considered_threads) || !integer(value.considered_threads.length, 1, 100) ||
    !Array.isArray(value.checkpoint_topics) || !integer(value.checkpoint_topics.length, 1, 4) || !record(value.stats)) return null;
  const threads = new Map<string, string>();
  let count = 0;
  for (const t of value.considered_threads) {
    if (!record(t) || !exact(t, ["thread_id", "last_message_at", "included_message_count", "truncated", "oldest_included_message_id", "newest_included_message_id", "newest_included_created_at"]) ||
      !uuid(t.thread_id) || threads.has(t.thread_id) || !timestamp(t.last_message_at) || !timestamp(t.newest_included_created_at) ||
      !integer(t.included_message_count, 1) || typeof t.truncated !== "boolean" || !uuid(t.oldest_included_message_id) || !uuid(t.newest_included_message_id) ||
      (t.included_message_count === 1) !== (t.oldest_included_message_id === t.newest_included_message_id)) return null;
    threads.set(t.thread_id, t.newest_included_message_id); count += t.included_message_count;
  }
  const s = value.stats;
  if (!exact(s, ["user_messages_available", "user_messages_included", "threads_total", "threads_eligible", "threads_included", "input_chars", "input_chars_limit"]) ||
    !Object.values(s).every(v => integer(v)) || s.input_chars_limit !== MAX_AUTO_SUMMARY_UPDATE_INPUT_CHARS ||
    !integer(s.input_chars, 1, MAX_AUTO_SUMMARY_UPDATE_INPUT_CHARS) || s.threads_included !== threads.size || s.user_messages_included !== count ||
    !integer(s.user_messages_available, count) || !integer(s.threads_eligible, threads.size, s.threads_total as number)) return null;
  const topics = new Map<string, Record<string, unknown>>(), keys = new Set<string>();
  for (const t of value.checkpoint_topics) {
    if (!record(t) || !exact(t, ["topic_id", "topic_key", "base_revision", "cursors"]) || !uuid(t.topic_id) || topics.has(t.topic_id) ||
      !standard(t.topic_key) || keys.has(t.topic_key) || excluded.has(t.topic_key) || !integer(t.base_revision, 1, 2147483647) ||
      !Array.isArray(t.cursors) || t.cursors.length > 100) return null;
    const ids = new Set<string>();
    for (const c of t.cursors) {
      if (!record(c) || !exact(c, ["thread_id", "message_id"]) || !uuid(c.thread_id) || !uuid(c.message_id) || ids.has(c.thread_id) || threads.get(c.thread_id) !== c.message_id) return null;
      ids.add(c.thread_id);
    }
    topics.set(t.topic_id, t); keys.add(t.topic_key);
  }
  const proposalIds = new Set<string>(), proposalKeys = new Set<string>();
  for (const p of value.proposals) {
    if (!record(p) || !exact(p, ["topic_id", "topic_key", "origin", "base_revision", "current_content_md", "proposed_content_md", "reason"]) ||
      !uuid(p.topic_id) || !standard(p.topic_key) || proposalIds.has(p.topic_id) || proposalKeys.has(p.topic_key) || !ORIGINS.includes(p.origin as string) ||
      !text(p.current_content_md) || !text(p.proposed_content_md) || !text(p.reason) || p.current_content_md === p.proposed_content_md) return null;
    const t = topics.get(p.topic_id);
    if (!t || p.topic_key !== t.topic_key || p.base_revision !== t.base_revision) return null;
    proposalIds.add(p.topic_id); proposalKeys.add(p.topic_key);
  }
  return value as AutoSummaryUpdatePreview;
}

const APPLIED_CHECKPOINT_ERROR = "更新は適用されましたが、消費位置を確認できませんでした";
const SKIPPED_CHECKPOINT_ERROR = "見送りの記録に失敗しました。次回、同じ発言から再提案されることがあります";
export async function requestUpdatePreview(projectId: string, apiKey: string, signal?: AbortSignal, fetcher: Fetcher = fetch): Promise<AutoSummaryUpdatePreview> {
  const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/memory/update/preview`, { method: "POST", headers: { "x-openai-api-key": apiKey }, signal });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const messages: Record<string, string> = { update_input_too_large: "差分要約の入力が大きすぎます", invalid_llm_response: "AIの差分要約応答が不正です", llm_failed: "AIによる差分要約に失敗しました" };
    const error = record(body) && text(body.error) ? body.error : "差分要約を生成できませんでした";
    throw new Error(Object.hasOwn(messages, error) ? messages[error] : error);
  }
  const preview = parseUpdatePreview(body);
  if (!preview) throw new Error("差分要約を生成できませんでした（応答が不正です）");
  return preview;
}

async function checkpoint(projectId: string, topic: UpdateCheckpointTopic, revision: number, fetcher: Fetcher): Promise<"ok" | "failed" | "none"> {
  if (!topic.cursors.length) return "none";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/memory/update/checkpoint`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic_id: topic.topic_id, expected_revision: revision, cursors: topic.cursors }),
      });
      if (response.ok) return "ok";
      if (response.status < 500) return "failed";
    } catch { /* A network failure permits one retry; never retry PATCH. */ }
  }
  return "failed";
}

type Payload = Extract<AutoSummaryUpdatePreview, { result: "preview" | "checkpoint_only" }>;
async function processTopics(projectId: string, preview: Payload, selected: ReadonlySet<string>, fetcher: Fetcher): Promise<UpdateTopicResult[]> {
  return Promise.all(preview.checkpoint_topics.map(async topic => {
    const proposal = preview.proposals.find(p => p.topic_id === topic.topic_id);
    const result: UpdateTopicResult = { topic_id: topic.topic_id, topic_key: topic.topic_key,
      status: proposal ? selected.has(topic.topic_id) ? "failed" : "skipped" : "unchanged", checkpoint: "none" };
    try {
      let revision = topic.base_revision;
      if (proposal && selected.has(topic.topic_id)) {
        const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/memory/topics/${encodeURIComponent(topic.topic_id)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            expected_revision: topic.base_revision, edit_kind: "full", new_content_md: proposal.proposed_content_md,
            source_refs: [{ type: "auto_summary_update", run_id: preview.run_id, model: preview.model, prompt_version: preview.prompt_version,
              base_revision: topic.base_revision, considered_threads: preview.considered_threads }],
          }),
        });
        if (!response.ok) {
          result.status = response.status === 409 ? "conflict" : "failed";
          result.error = "Project Memoryを更新できませんでした";
          return result;
        }
        result.status = "applied";
        result.checkpoint = "failed";
        result.error = APPLIED_CHECKPOINT_ERROR;
        const body: unknown = await response.json();
        if (!record(body) || !record(body.topic) || body.topic.id !== topic.topic_id || !integer(body.topic.revision, 1) || body.topic.revision !== topic.base_revision + 1) return result;
        revision = body.topic.revision;
      }
      result.checkpoint = await checkpoint(projectId, topic, revision, fetcher);
      if (result.checkpoint === "failed") result.error = result.status === "applied" ? APPLIED_CHECKPOINT_ERROR : SKIPPED_CHECKPOINT_ERROR;
      else delete result.error;
    } catch {
      result.error = result.status === "applied" ? APPLIED_CHECKPOINT_ERROR : result.status === "failed" ? "Project Memoryを更新できませんでした" : SKIPPED_CHECKPOINT_ERROR;
      if (result.status === "skipped" || result.status === "unchanged") result.checkpoint = topic.cursors.length ? "failed" : "none";
    }
    return result;
  }));
}

export async function applyUpdate(projectId: string, preview: AutoSummaryUpdatePreview, selectedTopicIds: readonly string[], fetcher: Fetcher = fetch): Promise<UpdateTopicResult[]> {
  const parsed = parseUpdatePreview(preview);
  if (parsed?.result !== "preview" || !Array.isArray(selectedTopicIds) || !selectedTopicIds.length ||
    Array.from(selectedTopicIds).some(id => typeof id !== "string" || !parsed.proposals.some(p => p.topic_id === id)) || new Set(selectedTopicIds).size !== selectedTopicIds.length) throw new Error("Invalid update preview or selection");
  return processTopics(projectId, parsed, new Set(selectedTopicIds), fetcher);
}

export async function skipAllUpdates(projectId: string, preview: AutoSummaryUpdatePreview, fetcher: Fetcher = fetch): Promise<UpdateTopicResult[]> {
  const parsed = parseUpdatePreview(preview);
  if (parsed?.result !== "preview") throw new Error("Invalid update preview");
  return processTopics(projectId, parsed, new Set(), fetcher);
}

export async function checkpointOnly(projectId: string, preview: AutoSummaryUpdatePreview, fetcher: Fetcher = fetch): Promise<UpdateTopicResult[]> {
  const parsed = parseUpdatePreview(preview);
  if (parsed?.result !== "checkpoint_only") throw new Error("Invalid checkpoint preview");
  return processTopics(projectId, parsed, new Set(), fetcher);
}
