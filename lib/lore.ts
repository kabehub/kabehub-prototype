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

// ─── embedding生成（共通化）─────────────────────────────────────────────
// 失敗時（HTTPエラー・レスポンス構造不正）は console.warn の上で null を返す。
// AbortError（呼び出し元のタイムアウト・キャンセル）は握りつぶさずそのまま re-throw する。
// これにより呼び出し元は「embedding生成に失敗した」のか「意図したタイムアウトで中断した」のかを区別できる。
export async function embedQuery(
  openaiKey: string,
  query: string,
  signal: AbortSignal,
): Promise<number[] | null> {
  const embRes = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: query }),
    signal,
  });

  if (!embRes.ok) {
    console.warn("[lore] embedding failed:", embRes.status);
    return null;
  }

  const embData = await embRes.json();
  const embedding = embData?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    console.warn("[lore] embedding response invalid");
    return null;
  }
  return embedding as number[];
}

// ─── Lore Book検索（embedding受け取り版）─────────────────────────────────
export async function searchLoreByEmbedding(
  supabase: SupabaseClient,
  embedding: number[],
  opts: { folderName: string; userId: string; topK?: number; signal: AbortSignal },
): Promise<string[]> {
  const { folderName, userId, topK = 3, signal } = opts;

  const { data, error } = await supabase
    .rpc("match_lore_embeddings", {
      query_embedding: embedding,
      match_folder_name: folderName,
      match_user_id: userId,
      match_count: topK,
    })
    .abortSignal(signal);

  if (error) {
    console.warn("[lore] rpc error:", error.message);
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
    topK?: number;
    matchThreshold?: number;
    signal: AbortSignal;
  },
): Promise<LoreSearchV2Result[]> {
  const { folderName, userId, topK = 5, matchThreshold = 0.3, signal } = opts;

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
    console.warn("[loreV2] rpc error:", error.message);
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

// ─── 既存の外部シグネチャ（変更禁止）：内部でembedQuery+ByEmbedding版に委譲 ──────
export async function searchLore(
  supabase: SupabaseClient,
  opts: LoreSearchOptions,
): Promise<string[]> {
  const { query, folderName, userId, topK = 3, openaiKey, timeoutMs = 3000 } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const embedding = await embedQuery(openaiKey, query, controller.signal);
    if (!embedding) return [];
    return await searchLoreByEmbedding(supabase, embedding, {
      folderName,
      userId,
      topK,
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.warn("[lore] search timed out after", timeoutMs, "ms — skipping injection");
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function searchLoreV2(
  supabase: SupabaseClient,
  opts: LoreSearchOptionsV2,
): Promise<LoreSearchV2Result[]> {
  const { query, folderName, userId, topK = 5, openaiKey, timeoutMs = 3000, matchThreshold = 0.3 } = opts;

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
