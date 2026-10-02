export const PROJECT_MEMORY_CHAT_MAX_CHARS = 8_000;
export function countProjectMemoryChatChars(text: string): number {
  return [...text].length; // コードポイント数。PostgreSQL char_length と同じ数え方
}
