import {
  AUTO_SUMMARY_STANDARD_TOPIC_KEYS, MAX_AUTO_SUMMARY_INPUT_CHARS, MAX_AUTO_SUMMARY_THREADS,
  type BootstrapPreview, type AutoSummaryPreview, type AutoSummaryTopicKey,
} from "./auto-summary-limits";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type AutoSummaryApplyResult = { topic_key: AutoSummaryTopicKey; status: "applied" | "conflict" | "failed"; error?: string };
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const timestamp = (v: unknown) => text(v) && Number.isFinite(Date.parse(v));

export function parseBootstrapPreview(value: unknown): BootstrapPreview | null {
  if (!record(value)) return null;
  if (value.result === "not_applicable") {
    if (!exact(value, ["result", "reason"]) || !["all_standard_topics_exist", "no_eligible_threads", "insufficient_evidence"].includes(value.reason as string)) return null;
    return value as BootstrapPreview;
  }
  if (value.result !== "preview" || !exact(value, ["result", "run_id", "model", "prompt_version", "stats", "considered_threads", "topics", "empty_topic_keys"]) ||
    !text(value.run_id) || !text(value.model) || !integer(value.prompt_version, 1) || !record(value.stats) ||
    !Array.isArray(value.considered_threads) || !Array.isArray(value.topics) || !Array.isArray(value.empty_topic_keys)) return null;
  const stats = value.stats;
  if (!exact(stats, ["threads_total", "threads_eligible", "threads_included", "threads_truncated", "messages_truncated", "input_chars", "input_chars_limit", "user_messages_included", "user_messages_available"]) ||
    !Object.values(stats).every(v => integer(v)) || stats.input_chars_limit !== MAX_AUTO_SUMMARY_INPUT_CHARS ||
    !integer(stats.input_chars, 1, MAX_AUTO_SUMMARY_INPUT_CHARS) || !integer(stats.threads_included, 1, MAX_AUTO_SUMMARY_THREADS) ||
    !integer(stats.threads_eligible, stats.threads_included as number, stats.threads_total as number) ||
    !integer(stats.threads_truncated, 0, stats.threads_included as number) || value.considered_threads.length !== stats.threads_included) return null;
  const ids = new Set<string>();
  let messageCount = 0, truncated = 0;
  for (const t of value.considered_threads) {
    if (!record(t) || !exact(t, ["thread_id", "last_message_at", "included_message_count", "truncated", "oldest_included_message_id", "newest_included_message_id"]) ||
      !text(t.thread_id) || ids.has(t.thread_id) || !timestamp(t.last_message_at) ||
      !integer(t.included_message_count, 1, MAX_AUTO_SUMMARY_INPUT_CHARS) || typeof t.truncated !== "boolean" ||
      !text(t.oldest_included_message_id) || !text(t.newest_included_message_id)) return null;
    if (t.included_message_count === 1 && t.oldest_included_message_id !== t.newest_included_message_id) return null;
    if (t.included_message_count > 1 && t.oldest_included_message_id === t.newest_included_message_id) return null;
    ids.add(t.thread_id); messageCount += t.included_message_count; if (t.truncated) truncated++;
  }
  if (truncated !== stats.threads_truncated || !integer(stats.messages_truncated, 0, messageCount) ||
    ((stats.messages_truncated as number) > 0 && truncated === 0) ||
    stats.user_messages_included !== messageCount ||
    !integer(stats.user_messages_included, stats.threads_included as number, stats.user_messages_available as number)) return null;
  if (!value.topics.length || value.topics.length + value.empty_topic_keys.length > AUTO_SUMMARY_STANDARD_TOPIC_KEYS.length) return null;
  const keys = new Set<string>();
  for (const t of value.topics) {
    if (!record(t) || !exact(t, ["topic_key", "content_md"]) ||
      !AUTO_SUMMARY_STANDARD_TOPIC_KEYS.includes(t.topic_key as AutoSummaryTopicKey) || keys.has(t.topic_key as string) || !text(t.content_md)) return null;
    keys.add(t.topic_key as string);
  }
  for (const key of value.empty_topic_keys) {
    if (!AUTO_SUMMARY_STANDARD_TOPIC_KEYS.includes(key as AutoSummaryTopicKey) || keys.has(key)) return null;
    keys.add(key);
  }
  return value as AutoSummaryPreview;
}

export async function requestAutoSummaryPreview(projectId: string, apiKey: string, signal?: AbortSignal, fetcher: Fetcher = fetch): Promise<BootstrapPreview> {
  const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/memory/bootstrap/preview`, {
    method: "POST", headers: { "x-openai-api-key": apiKey }, signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(record(body) && text(body.error) ? body.error : "会話からProject Memoryを生成できませんでした");
  const preview = parseBootstrapPreview(body);
  if (!preview) throw new Error("会話からProject Memoryを生成できませんでした（応答が不正です）");
  return preview;
}

export async function applyAutoSummary(projectId: string, preview: AutoSummaryPreview, selectedKeys: readonly string[], fetcher: Fetcher = fetch): Promise<AutoSummaryApplyResult[]> {
  if (parseBootstrapPreview(preview)?.result !== "preview") throw new Error("Invalid auto summary preview");
  const selected = new Set(selectedKeys);
  return Promise.all(preview.topics.filter(t => selected.has(t.topic_key)).map(async topic => {
    try {
      const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/memory/topics`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...topic,
          source_refs: [{ type: "auto_summary", run_id: preview.run_id, model: preview.model,
            prompt_version: preview.prompt_version, considered_threads: preview.considered_threads }],
        }),
      });
      if (response.status === 201) return { topic_key: topic.topic_key, status: "applied" as const };
      const body: unknown = await response.json().catch(() => null);
      return { topic_key: topic.topic_key, status: response.status === 409 ? "conflict" as const : "failed" as const,
        error: record(body) && text(body.error) ? body.error : "Project Memoryを作成できませんでした" };
    } catch {
      return { topic_key: topic.topic_key, status: "failed" as const, error: "Project Memoryを作成できませんでした" };
    }
  }));
}
