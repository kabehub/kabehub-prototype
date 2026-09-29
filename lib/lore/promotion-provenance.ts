export type LorePromotionProvenance = {
  lore_id: string;
  source_topic_id: string;
  source_topic_key: string;
  source_project_id: string;
  source_revision: number;
  project_name: string | null;
};

type PromotionMetadata = Pick<LorePromotionProvenance, "source_topic_id" | "source_topic_key" | "source_project_id" | "source_revision">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePromotionMetadata(metadata: unknown): PromotionMetadata | null {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  if (typeof value.source_topic_id !== "string" || !UUID.test(value.source_topic_id)) return null;
  if (typeof value.source_project_id !== "string" || !UUID.test(value.source_project_id)) return null;
  if (typeof value.source_topic_key !== "string" || !value.source_topic_key.trim()) return null;
  if (typeof value.source_revision !== "number" || !Number.isSafeInteger(value.source_revision) || value.source_revision < 1) return null;
  return {
    source_topic_id: value.source_topic_id,
    source_topic_key: value.source_topic_key,
    source_project_id: value.source_project_id,
    source_revision: value.source_revision,
  };
}

export function formatProvenanceLabel(p: LorePromotionProvenance): string {
  return `${p.project_name ?? "削除済みProject"} / ${p.source_topic_key} rev.${p.source_revision}`;
}

export function loreCardElementId(loreId: string): string {
  return `lore-${loreId}`;
}

export function parseLoreHash(hash: string): string | null {
  if (!hash.startsWith("#lore-")) return null;
  try {
    const id = decodeURIComponent(hash.slice(6));
    return id && !id.includes("/") && !id.includes("#") ? id : null;
  } catch {
    return null;
  }
}

export function getLorePromotionPresentation({ sourceMessageId, extractionVersion, provenance }: {
  sourceMessageId: string | null;
  extractionVersion: string | null;
  provenance?: LorePromotionProvenance | null;
}): { showManualAdded: boolean; showEdited: boolean; provenanceLabel: string | null } {
  if (provenance) return {
    showManualAdded: false,
    showEdited: extractionVersion === "user_edited",
    provenanceLabel: formatProvenanceLabel(provenance),
  };
  return { showManualAdded: !sourceMessageId, showEdited: false, provenanceLabel: null };
}
