// Claude content can start with thinking blocks; only text is JSON output.
export function extractClaudeSettingsText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const texts: string[] = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null || block.type !== "text") continue;
    if (typeof block.text !== "string") return null;
    texts.push(block.text);
  }
  return texts.length > 0 ? texts.join("") : null;
}
