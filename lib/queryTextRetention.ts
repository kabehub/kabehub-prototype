import { splitMessageContent } from "./attachmentContent";

// Page-owned, memory-only: exact content equality is the trust boundary.
export function createQueryTextRetention() {
  const entries = new Map<string, { queryText: string; content: string }>();
  return {
    remember(messageId: string, queryText: string, content: string) {
      if (queryText === content) {
        entries.delete(messageId);
        return;
      }
      entries.set(messageId, { queryText, content });
    },
    get(message: { id: string; content: string }): string | null {
      const entry = entries.get(message.id);
      if (!entry || entry.content !== message.content || !splitMessageContent(message.content, entry.queryText)) return null;
      return entry.queryText;
    },
    forget(messageId: string) {
      entries.delete(messageId);
    },
  };
}
