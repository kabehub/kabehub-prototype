import { SupabaseClient } from "@supabase/supabase-js";

export interface LoreSearchOptions {
  query: string;
  folderName: string;
  userId: string;
  topK?: number;
  openaiKey: string;
  timeoutMs?: number;
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
