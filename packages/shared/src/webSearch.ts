export type MessageSource = { url: string; title: string; domain: string };
export type MessageSources = {
  v: 1;
  provider: "claude" | "openai";
  items: MessageSource[];
};

export const WEB_SEARCH_MAX_USES_CLAUDE = 3;
export const MAX_SOURCES = 20;
export const MAX_SOURCE_TITLE_LENGTH = 120;
export const MAX_SOURCE_URL_LENGTH = 2048;

export function normalizeSources(
  raw: unknown,
  provider: MessageSources["provider"],
): MessageSources | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items: MessageSource[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || typeof entry.url !== "string") continue;
    try {
      const url = new URL(entry.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      url.username = "";
      url.password = "";
      // Measure after removing credentials, before removing tracking parameters.
      if (url.href.length > MAX_SOURCE_URL_LENGTH) continue;
      if (url.searchParams.getAll("utm_source").includes("openai")) {
        const retained = [...url.searchParams].filter(([key, value]) => key !== "utm_source" || value !== "openai");
        url.search = new URLSearchParams(retained).toString();
      }
      const normalizedUrl = url.href;
      if (seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);
      const domain = url.hostname.toLowerCase().replace(/^www\./, "");
      const title = typeof entry.title === "string"
        ? Array.from(entry.title.trim().replace(/\s+/gu, " ")).slice(0, MAX_SOURCE_TITLE_LENGTH).join("")
        : "";
      items.push({ url: normalizedUrl, title: title || domain, domain });
      if (items.length === MAX_SOURCES) break;
    } catch {
      // Invalid URLs are not sources.
    }
  }
  return items.length ? { v: 1, provider, items } : undefined;
}

export function withSources(
  metadata: unknown,
  sources: MessageSources | undefined,
): Record<string, unknown> {
  const copy: Record<string, unknown> = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? { ...metadata }
    : {};
  delete copy.sources;
  if (sources) copy.sources = sources;
  return copy;
}
