export type LoreMemoryRow = {
  id: string;
  chunk_text: string;
  tags: string[] | null;
  memory_kind: string | null;
  temporal_status: string | null;
  importance_score: number | null;
  confidence_score: number | null;
  source_thread_id: string | null;
  source_message_id: string | null;
  source_message_number: number | null;
  is_pinned: boolean | null;
  is_archived: boolean | null;
  extraction_version: string | null;
  is_manually_corrected: boolean;
  last_confirmed_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  event_time: string | null;
  created_at: string;
};

export const DREAMING_DEFAULTS = { limit: 5, threshold: 0.92 } as const;
export const LIKED_AI_DEFAULTS = {
  memoryKind: "idea",
  importanceScore: 0.8,
  confidenceScore: 0.75,
} as const;
// サーバー側(app/api/lore/batch-train/route.ts)の省略時デフォルトは20。
// この値はUI側が常に明示送信する固定値であり、サーバーのデフォルトとは別概念
// （たまたまサーバー側のclamp上限=100と一致している）。
export const BATCH_TRAIN_UI_REQUEST_LIMIT = 100;

export const CHAT_LORE_SEARCH_POLICY = {
  combined: {
    timeoutMs: 3_000,
  },
  loreBook: {
    topK: 3,
  },
  memory: {
    topK: 5,
    matchThreshold: 0.3,
  },
  rag: {
    topK: 4,
    timeoutMs: 3_000,
    matchThreshold: 0.3,
  },
} as const;
