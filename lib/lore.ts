import { SupabaseClient } from "@supabase/supabase-js";

export interface LoreSearchOptions {
  query: string;
  folderName: string;
  userId: string;
  topK?: number;
  openaiKey: string;
  timeoutMs?: number;
}

export interface LoreSearchOptionsV2 {
  query: string;
  folderName: string | null;
  userId: string;
  topK?: number;
  openaiKey: string;
  timeoutMs?: number;
  matchThreshold?: number;
}

export async function searchLore(
  supabase: SupabaseClient,
  opts: LoreSearchOptions,
): Promise<string[]> {
  const { query, folderName, userId, topK = 3, openaiKey, timeoutMs = 3000 } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const embRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: query }),
      signal: controller.signal,
    });

    if (!embRes.ok) return [];

    const embData = await embRes.json();
    const queryEmbedding = embData.data[0].embedding as number[];

    const { data, error } = await supabase.rpc("match_lore_embeddings", {
      query_embedding: queryEmbedding,
      match_folder_name: folderName,
      match_user_id: userId,
      match_count: topK,
    });

    if (error) return [];
    return (data ?? []).map((row: { chunk_text: string }) => row.chunk_text);
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.warn("[lore] search timed out after", timeoutMs, "ms — skipping injection");
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
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

export type LoreSearchResult = LoreSearchV2Result;

export async function searchLoreV2(
  supabase: SupabaseClient,
  opts: LoreSearchOptionsV2,
): Promise<LoreSearchV2Result[]> {
  const { query, folderName, userId, topK = 5, openaiKey, timeoutMs = 3000, matchThreshold = 0.3 } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const embRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: query }),
      signal: controller.signal,
    });

    if (!embRes.ok) return [];

    const embData = await embRes.json();
    const queryEmbedding = embData.data[0].embedding as number[];

    const { data, error } = await supabase.rpc("match_lore_embeddings_v2", {
      query_embedding: queryEmbedding,
      f_user_id: userId,
      f_folder_name: folderName,
      match_count: topK,
      match_threshold: matchThreshold,
    });

    if (error) return [];

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
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.warn("[loreV2] search timed out after", timeoutMs, "ms — skipping injection");
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}
