/*
 * 以下のSQL関数をSupabase Dashboard > SQL Editorで手動実行してください:
 *
 * CREATE OR REPLACE FUNCTION match_lore_embeddings(
 *   query_embedding vector(1536),
 *   match_folder_name text,
 *   match_user_id uuid,
 *   match_count int
 * )
 * RETURNS TABLE (chunk_text text, similarity float)
 * LANGUAGE sql STABLE
 * AS $$
 *   SELECT chunk_text, 1 - (embedding <-> query_embedding) AS similarity
 *   FROM lore_embeddings
 *   WHERE user_id = match_user_id AND folder_name = match_folder_name
 *   ORDER BY embedding <-> query_embedding
 *   LIMIT match_count;
 * $$;
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const res = new Response();
  const supabase = createRouteHandlerSupabaseClient(req, res as never);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const openaiKey = req.headers.get("x-openai-api-key");
  if (!openaiKey) return NextResponse.json({ error: "x-openai-api-key header required" }, { status: 400 });

  const { query, folderName, topK = 3 } = await req.json();
  if (!query || !folderName) {
    return NextResponse.json({ error: "query and folderName are required" }, { status: 400 });
  }

  const embRes = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: query }),
  });

  if (!embRes.ok) {
    const err = await embRes.json();
    return NextResponse.json({ error: err.error?.message ?? "Embedding API error" }, { status: 500 });
  }

  const embData = await embRes.json();
  const queryEmbedding = embData.data[0].embedding as number[];

  const { data, error } = await supabase.rpc('match_lore_embeddings', {
    query_embedding: queryEmbedding,
    match_folder_name: folderName,
    match_user_id: user.id,
    match_count: topK,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const chunks = (data ?? []).map((row: { chunk_text: string }) => row.chunk_text);
  return NextResponse.json({ chunks });
}
