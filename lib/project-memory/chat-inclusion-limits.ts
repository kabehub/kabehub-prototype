export const PROJECT_MEMORY_CHAT_MAX_CHARS = 8_000;
export function countProjectMemoryChatChars(text: string): number {
  return [...text].length; // コードポイント数。PostgreSQL char_length と同じ数え方
}

export type ChatInclusionCandidate = { id: string; topic_key: string; content_md: string };

const CHAT_TOPIC_PRIORITY = new Map<string, number>([
  ["principles", 0],
  ["current-work", 1],
  ["overview", 2],
  ["references", 3],
]);

function compareChatInclusionCandidates(a: ChatInclusionCandidate, b: ChatInclusionCandidate): number {
  const priorityDiff = (CHAT_TOPIC_PRIORITY.get(a.topic_key) ?? 4) -
    (CHAT_TOPIC_PRIORITY.get(b.topic_key) ?? 4);
  if (priorityDiff !== 0) return priorityDiff;
  return a.topic_key < b.topic_key ? -1 : a.topic_key > b.topic_key ? 1 :
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// 8,000字は topic 本文 (content_md) の合計上限。system ブロック全体の上限ではない。
// preamble・reference_data タグ・meta 行・topic 間の区切りは、この合計に含めない。
export function selectChatIncludedTopics<T extends ChatInclusionCandidate>(
  topics: readonly T[], max: number = PROJECT_MEMORY_CHAT_MAX_CHARS,
): { included: T[]; skipped: T[]; usedChars: number } {
  const sorted = [...topics].sort(compareChatInclusionCandidates);
  const included: T[] = [];
  const skipped: T[] = [];
  let usedChars = 0;
  for (const topic of sorted) {
    // DB btrim は ON 時点のガード。チャット側は trim で空白本文を最終除外する。
    if (topic.content_md.trim() === "") continue;
    const chars = countProjectMemoryChatChars(topic.content_md);
    if (usedChars + chars > max) {
      skipped.push(topic);
      continue;
    }
    included.push(topic);
    usedChars += chars;
  }
  return { included, skipped, usedChars };
}

export function summarizeChatInclusion<T extends ChatInclusionCandidate & { include_in_chat: boolean }>(
  topics: readonly T[],
): { usedChars: number; max: number; notInjected: T[] } {
  const onTopics = topics.filter(topic => topic.include_in_chat === true);
  const { usedChars, skipped } = selectChatIncludedTopics(onTopics);
  const notInjected = [...skipped, ...onTopics.filter(topic => !topic.content_md.trim())]
    .sort(compareChatInclusionCandidates);
  return { usedChars, max: PROJECT_MEMORY_CHAT_MAX_CHARS, notInjected };
}
