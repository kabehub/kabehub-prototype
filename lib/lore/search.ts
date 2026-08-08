import { SupabaseClient } from "@supabase/supabase-js";
import { createEmbedding } from "./openai";
import * as logger from "../logger";

export interface LoreSearchOptionsV2 {
  query: string;
  folderName: string | null;
  userId: string;
  topK: number;
  openaiKey: string;
  timeoutMs: number;
  matchThreshold: number;
}

export type LoreSearchV2Result = {
  id: string;
  chunkText: string;
  similarity: number;
  finalScore: number;
  memoryKind: string | null;
  temporalStatus: string | null;
  confidenceScore: number | null;
  sourceThreadId: string | null;
  sourceMessageId: string | null;
};

// ─── embedding生成（共通化）─────────────────────────────────────────────
// 失敗時は下位層（createEmbedding）で externalApiFailed 済みのため、ここでは再ログせず null を返す。
// AbortError（呼び出し元のタイムアウト・キャンセル）は握りつぶさずそのまま re-throw する。
// これにより呼び出し元は「embedding生成に失敗した」のか「意図したタイムアウトで中断した」のかを区別できる。
export async function embedQuery(
  openaiKey: string,
  query: string,
  signal: AbortSignal,
): Promise<number[] | null> {
  try {
    return await createEmbedding(openaiKey, query, { signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return null;
  }
}

// ─── Lore Book検索（embedding受け取り版）─────────────────────────────────
export async function searchLoreByEmbedding(
  supabase: SupabaseClient,
  embedding: number[],
  opts: { folderName: string; userId: string; topK: number; signal: AbortSignal },
): Promise<string[]> {
  const { folderName, userId, topK, signal } = opts;

  const { data, error } = await supabase
    .rpc("match_lore_embeddings", {
      query_embedding: embedding,
      match_folder_name: folderName,
      match_user_id: userId,
      match_count: topK,
    })
    .abortSignal(signal);

  if (error) {
    logger.dbOperationFailedBestEffort({
      route: "lore-search",
      operation: "lore-search-rpc",
      table: "lore_embeddings",
      errorCode: error.code,
    });
    return [];
  }
  return (data ?? []).map((row: { chunk_text: string }) => row.chunk_text);
}

// ─── Memory検索（embedding受け取り版）───────────────────────────────────
// RPC引数名（f_user_id / f_folder_name / match_count / match_threshold）は
// 現行 searchLoreV2 が呼んでいる match_lore_embeddings_v2 のシグネチャに合わせている。
// 変更しないこと（別オーバーロード match_folder_name / match_user_id 版と混同しない）。
export async function searchLoreV2ByEmbedding(
  supabase: SupabaseClient,
  embedding: number[],
  opts: {
    folderName: string | null;
    userId: string;
    topK: number;
    matchThreshold: number;
    signal: AbortSignal;
  },
): Promise<LoreSearchV2Result[]> {
  const { folderName, userId, topK, matchThreshold, signal } = opts;

  const { data, error } = await supabase
    .rpc("match_lore_embeddings_v2", {
      query_embedding: embedding,
      f_user_id: userId,
      f_folder_name: folderName,
      match_count: topK,
      match_threshold: matchThreshold,
    })
    .abortSignal(signal);

  if (error) {
    logger.dbOperationFailedBestEffort({
      route: "lore-search",
      operation: "lore-v2-search-rpc",
      table: "lore_embeddings",
      errorCode: error.code,
    });
    return [];
  }

  return (data ?? []).map((row: {
    id: string;
    chunk_text: string;
    similarity: number;
    final_score: number;
    memory_kind: string | null;
    temporal_status: string | null;
    confidence_score: number | null;
    source_thread_id: string | null;
    source_message_id: string | null;
  }) => ({
    id: row.id,
    chunkText: row.chunk_text,
    similarity: row.similarity,
    finalScore: row.final_score,
    memoryKind: row.memory_kind,
    temporalStatus: row.temporal_status,
    confidenceScore: row.confidence_score,
    sourceThreadId: row.source_thread_id,
    sourceMessageId: row.source_message_id,
  }));
}

export async function searchLoreV2(
  supabase: SupabaseClient,
  opts: LoreSearchOptionsV2,
): Promise<LoreSearchV2Result[]> {
  const { query, folderName, userId, topK, openaiKey, timeoutMs, matchThreshold } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const embedding = await embedQuery(openaiKey, query, controller.signal);
    if (!embedding) return [];
    return await searchLoreV2ByEmbedding(supabase, embedding, {
      folderName,
      userId,
      topK,
      matchThreshold,
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.warn("[loreV2] search timed out after", timeoutMs, "ms — skipping injection");
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}
