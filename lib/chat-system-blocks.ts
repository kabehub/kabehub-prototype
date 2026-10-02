export type CachedSystemBlock = { label: string; text: string };

type ClaudeSystemBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

// Request limit 4 − message anchor 1 = 3, even when no anchor is present.
export const MAX_SYSTEM_CACHE_MARKERS = 3;

export function buildClaudeSystemBlocks({ stable, cached, dynamic }: {
  stable?: string;
  cached: CachedSystemBlock[];
  dynamic?: string;
}): ClaudeSystemBlock[] {
  const stableText = stable?.trim();
  const cachedTexts = cached.map(block => block.text.trim()).filter(Boolean);
  const texts = [...(stableText ? [stableText] : []), ...cachedTexts];
  const selected = new Set<number>();
  if (stableText) selected.add(0);
  if (cachedTexts.length) selected.add(texts.length - 1);
  for (let index = stableText ? 1 : 0; index < texts.length; index++) {
    if (selected.size >= MAX_SYSTEM_CACHE_MARKERS) break;
    selected.add(index);
  }
  const blocks: ClaudeSystemBlock[] = texts.map((text, index) => ({
    type: "text",
    text,
    ...(selected.has(index) ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));
  if (dynamic?.trim()) blocks.push({ type: "text", text: dynamic.trim() });
  return blocks;
}

// Preserve legacy bytes: pre/post are raw slices, and post already has its separator.
export function buildCombinedSystemPrompt({ stable, cached, pre, post }: {
  stable: string;
  cached: CachedSystemBlock[];
  pre: string;
  post: string;
}): string {
  let dynamic = pre;
  for (const block of cached) {
    if (block.text) dynamic = dynamic ? dynamic + "\n\n" + block.text : block.text;
  }
  dynamic += post;
  return dynamic ? stable + "\n\n" + dynamic : stable;
}
