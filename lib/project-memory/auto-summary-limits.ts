// Import-free: shared by server and browser.
export const AUTO_SUMMARY_STANDARD_TOPIC_KEYS = ["overview", "current-work", "principles", "references"] as const;
export const MAX_AUTO_SUMMARY_INPUT_CHARS = 60_000;
export const MAX_AUTO_SUMMARY_MESSAGE_CHARS = 1_000;
export const MIN_AUTO_SUMMARY_USER_MESSAGES = 2;
export const MAX_AUTO_SUMMARY_THREADS = 100;
export const AUTO_SUMMARY_MAX_COMPLETION_TOKENS = 16_384;
export const AUTO_SUMMARY_TRUNCATION_MARKER = "…[truncated]";
export type AutoSummaryTopicKey = typeof AUTO_SUMMARY_STANDARD_TOPIC_KEYS[number];
export type AutoSummaryTopic = { topic_key: AutoSummaryTopicKey; content_md: string };
export type AutoSummaryStats = {
  threads_total: number; threads_eligible: number; threads_included: number;
  threads_truncated: number; messages_truncated: number; input_chars: number; input_chars_limit: number;
  user_messages_included: number; user_messages_available: number;
};
export type AutoSummaryConsideredThread = {
  thread_id: string; last_message_at: string; included_message_count: number; truncated: boolean;
  oldest_included_message_id: string; newest_included_message_id: string;
};
export type AutoSummaryNotApplicableReason = "all_standard_topics_exist" | "no_eligible_threads" | "insufficient_evidence";
export type BootstrapPreview = {
  result: "preview"; run_id: string; model: string; prompt_version: number;
  stats: AutoSummaryStats; considered_threads: AutoSummaryConsideredThread[]; topics: AutoSummaryTopic[];
  empty_topic_keys: AutoSummaryTopicKey[];
} | { result: "not_applicable"; reason: AutoSummaryNotApplicableReason };
export type AutoSummaryPreview = Extract<BootstrapPreview, { result: "preview" }>;
