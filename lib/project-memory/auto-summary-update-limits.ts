import type { AutoSummaryTopicKey } from "./auto-summary-limits";

export const MAX_AUTO_SUMMARY_UPDATE_INPUT_CHARS = 60_000;
export const AUTO_SUMMARY_UPDATE_MAX_COMPLETION_TOKENS = 16_384;
export const AUTO_SUMMARY_UPDATE_PROMPT_VERSION = 2;
export type RevisionOrigin = "auto_summary" | "auto_summary_update" | "consolidation_run" | "instruction_edit" | "manual_or_unknown";
export type AutoSummaryUpdateExcludedReason = "no_baseline" | "no_auto_summary_history" | "provenance_mismatch" | "empty_topic";
export type AutoSummaryUpdateNotApplicableReason = "no_updatable_topics" | "no_new_messages";
export type ExcludedUpdateTopic = { topic_key: AutoSummaryTopicKey; reason: AutoSummaryUpdateExcludedReason };
export type UpdateDecision = { topic_key: AutoSummaryTopicKey; needs_update: false } |
  { topic_key: AutoSummaryTopicKey; needs_update: true; reason: string; content_md: string };
export type UpdateConsideredThread = {
  thread_id: string; last_message_at: string; included_message_count: number; truncated: boolean;
  oldest_included_message_id: string; newest_included_message_id: string; newest_included_created_at: string;
};
export type UpdateStats = {
  user_messages_available: number; user_messages_included: number;
  threads_total: number; threads_eligible: number; threads_included: number;
  input_chars: number; input_chars_limit: number;
};
// Phase 2: accepted changes PATCH(full, expected_revision), then advance with the new revision.
// Dismissed changes and unchanged topics advance with base_revision (avoids shared-input starvation).
// Cancel advances nothing; a topic with a 409 conflict must not advance. Empty cursors need no RPC.
export type UpdateCheckpointTopic = {
  topic_id: string; topic_key: AutoSummaryTopicKey; base_revision: number;
  cursors: Array<{ thread_id: string; message_id: string }>;
};
export type UpdateProposal = {
  topic_id: string; topic_key: AutoSummaryTopicKey; origin: RevisionOrigin; base_revision: number;
  current_content_md: string; proposed_content_md: string; reason: string;
};
type UpdateHeader = { run_id: string; model: string; prompt_version: number };
type UpdatePayload = {
  checkpoint_topics: UpdateCheckpointTopic[]; considered_threads: UpdateConsideredThread[];
  stats: UpdateStats; excluded_topics: ExcludedUpdateTopic[];
};
export type AutoSummaryUpdatePreview = UpdateHeader & (
  { result: "preview"; proposals: UpdateProposal[] } & UpdatePayload |
  { result: "checkpoint_only"; proposals: [] } & UpdatePayload |
  { result: "not_applicable"; reason: AutoSummaryUpdateNotApplicableReason; excluded_topics: ExcludedUpdateTopic[] }
);
