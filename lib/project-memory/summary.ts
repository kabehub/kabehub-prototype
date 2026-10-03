import { AUTO_SUMMARY_STANDARD_TOPIC_KEYS } from "./auto-summary-limits";
import { summarizeChatInclusion } from "./chat-inclusion-limits";

export type ProjectMemorySummaryTopic = {
  id: string;
  topic_key: string;
  content_md: string;
  include_in_chat: boolean;
  promotion: { status: "not_promoted" | "current" | "stale" };
};

export function summarizeProjectMemory(topics: readonly ProjectMemorySummaryTopic[]) {
  const existingKeys = new Set(topics.map(topic => topic.topic_key));
  const chat = summarizeChatInclusion(topics);
  const notInjected = new Set(chat.notInjected);
  const isInjected = (topic: ProjectMemorySummaryTopic) => topic.include_in_chat && !notInjected.has(topic);
  return {
    standardCreated: AUTO_SUMMARY_STANDARD_TOPIC_KEYS.filter(key => existingKeys.has(key)).length,
    standardTotal: AUTO_SUMMARY_STANDARD_TOPIC_KEYS.length,
    chatOnCount: topics.filter(topic => topic.include_in_chat).length,
    chatInjectedCount: topics.filter(isInjected).length,
    chatUsedChars: chat.usedChars,
    chatMaxChars: chat.max,
    loreRegisteredCount: topics.filter(topic => topic.promotion.status === "current" || topic.promotion.status === "stale").length,
    loreStaleCount: topics.filter(topic => topic.promotion.status === "stale").length,
    notInjectedNotPromotedCount: topics.filter(topic => topic.promotion.status === "not_promoted" && !isInjected(topic)).length,
  };
}
