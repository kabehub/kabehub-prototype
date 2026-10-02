import { buildReferenceBlock, buildReferencePreamble, sanitizeAttributeValue } from "@/lib/ai-context-blocks";
import { selectChatIncludedTopics } from "@/lib/project-memory/chat-inclusion-limits";

export function buildProjectMemoryChatBlock(
  topics: readonly { id: string; topic_key: string; content_md: string; revision: number }[],
  max?: number,
): { text: string; includedIds: string[]; skippedIds: string[] } | null {
  const { included, skipped } = selectChatIncludedTopics(topics, max);
  if (included.length === 0) return null;
  const blocks = included.map(topic => buildReferenceBlock("project_memory_topic", topic.content_md, {
    topic_key: sanitizeAttributeValue(topic.topic_key),
    revision: String(topic.revision),
  }));
  // 独立した preamble により、dynamic の参照状態に依存せずキャッシュ内容を固定する。
  return {
    text: buildReferencePreamble() + "\n\n" + blocks.join("\n\n"),
    includedIds: included.map(topic => topic.id),
    skippedIds: skipped.map(topic => topic.id),
  };
}
