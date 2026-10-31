import { MAX_SOURCES, type MessageSource, type MessageSources } from "@kabehub/shared";

const isSource = (item: unknown): item is MessageSource => !!item && typeof item === "object" &&
  "url" in item && typeof item.url === "string" &&
  "title" in item && typeof item.title === "string" &&
  "domain" in item && typeof item.domain === "string";

export function parseMessageSources(value: unknown): MessageSources | undefined {
  if (!value || typeof value !== "object" || !("v" in value) || value.v !== 1 ||
      !("provider" in value) || (value.provider !== "claude" && value.provider !== "openai") ||
      !("items" in value) || !Array.isArray(value.items) || !value.items.every(isSource)) return undefined;
  return { v: 1, provider: value.provider, items: value.items.map(({ url, title, domain }) => ({ url, title, domain })) };
}

export type SourceChipModel = { chips: MessageSource[]; hiddenCount: number; allItems: MessageSource[] };

export function buildSourceChipModel(sources: unknown): SourceChipModel {
  const allItems: MessageSource[] = [];
  if (sources && typeof sources === "object" && "v" in sources && sources.v === 1 &&
      "provider" in sources && (sources.provider === "claude" || sources.provider === "openai") &&
      "items" in sources && Array.isArray(sources.items)) {
    for (const item of sources.items) {
      if (!isSource(item)) continue;
      try {
        const url = new URL(item.url);
        if (url.protocol !== "http:" && url.protocol !== "https:") continue;
        const domain = url.hostname.toLowerCase().replace(/^www\./, "");
        allItems.push({ url: url.href, title: item.title, domain });
        if (allItems.length === MAX_SOURCES) break;
      } catch { /* Invalid source URLs are not links. */ }
    }
  }
  const domains = new Set<string>();
  const chips = allItems.filter(item => {
    if (domains.has(item.domain)) return false;
    domains.add(item.domain);
    return true;
  }).slice(0, 4);
  return { chips, hiddenCount: allItems.length - chips.length, allItems };
}

export function visibleSourceItems(model: SourceChipModel, expanded: boolean): MessageSource[] {
  return expanded ? model.allItems : model.chips;
}
