import { AUTO_SUMMARY_STANDARD_TOPIC_KEYS } from "./auto-summary-limits";
import { countProjectMemoryChatChars, summarizeChatInclusion } from "./chat-inclusion-limits";

export const AUTO_SUMMARY_STANDARD_WARNING_CHARS = 7_000;
type WarningTopic = { id: string; topic_key: string; content_md: string; include_in_chat: boolean };

export function computeUpdateWarning<T extends WarningTopic>(topics: readonly T[], proposals: ReadonlyArray<{ topic_id: string; proposed_content_md: string }>, selectedTopicIds: ReadonlySet<string> | readonly string[]): {
  standardCharsBefore: number; standardCharsAfter: number; standardOverLimit: boolean; newlyNotInjected: T[]; usedCharsAfter: number; max: number;
} {
  const selected = new Set(selectedTopicIds);
  const replacements = new Map(proposals.map(p => [p.topic_id, p.proposed_content_md]));
  const after = topics.map(t => selected.has(t.id) && replacements.has(t.id) ? { ...t, content_md: replacements.get(t.id)! } : t);
  const standardChars = (items: readonly T[]) => items.reduce((sum, t) => sum + (
    AUTO_SUMMARY_STANDARD_TOPIC_KEYS.some(key => key === t.topic_key) && t.include_in_chat === true && t.content_md.trim() !== ""
      ? countProjectMemoryChatChars(t.content_md) : 0), 0);
  const standardCharsBefore = standardChars(topics), standardCharsAfter = standardChars(after);
  const beforeSummary = summarizeChatInclusion(topics), afterSummary = summarizeChatInclusion(after);
  const previouslyNotInjected = new Set(beforeSummary.notInjected.map(t => t.id));
  return { standardCharsBefore, standardCharsAfter, standardOverLimit: standardCharsAfter > AUTO_SUMMARY_STANDARD_WARNING_CHARS,
    newlyNotInjected: afterSummary.notInjected.filter(t => !previouslyNotInjected.has(t.id)), usedCharsAfter: afterSummary.usedChars, max: afterSummary.max };
}
