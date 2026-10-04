// Server-side chat search planning. This pure module has no imports.
const CHAT_MEMORY_TRIGGER_KEYWORDS = [
  "前に", "以前", "覚えて", "覚えてる", "方針", "このプロジェクト",
  "前回", "過去ログ", "引き継ぎ", "RAG", "KabeHub", "メモリ",
  "記憶", "これまで", "過去", "続き", "決定", "好み", "設定"
] as const;

// Memo mode returns early in the route before search planning; it is a separate invariant.
export function buildChatLoreSearchPlan(input: {
  userContent: string;
  isTemporary: boolean;
  hasOpenaiKey: boolean;
  loreEnabled: boolean;
  loreTargetProjectId: string | null;
}): { wantsLoreBook: boolean; wantsMemory: boolean } {
  return {
    wantsLoreBook: input.loreEnabled && input.hasOpenaiKey && !!input.loreTargetProjectId,
    wantsMemory: !input.isTemporary && input.hasOpenaiKey &&
      CHAT_MEMORY_TRIGGER_KEYWORDS.some(keyword => input.userContent.includes(keyword)),
  };
}
