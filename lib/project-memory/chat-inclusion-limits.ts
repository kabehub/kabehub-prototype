export const PROJECT_MEMORY_CHAT_MAX_CHARS = 8_000;
export function countProjectMemoryChatChars(text: string): number {
  return [...text].length; // コードポイント数。PostgreSQL char_length と同じ数え方
}

export type ChatInclusionCandidate = { id: string; topic_key: string; content_md: string };

// 8,000字は topic 本文 (content_md) の合計上限。system ブロック全体の上限ではない。
// preamble・reference_data タグ・meta 行・topic 間の区切りは、この合計に含めない。
export function selectChatIncludedTopics<T extends ChatInclusionCandidate>(
  topics: readonly T[], max: number = PROJECT_MEMORY_CHAT_MAX_CHARS,
): { included: T[]; skipped: T[]; usedChars: number } {
  const sorted = [...topics].sort((a, b) =>
    a.topic_key < b.topic_key ? -1 : a.topic_key > b.topic_key ? 1 :
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
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
