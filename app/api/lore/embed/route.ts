import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { createEmbedding } from "@/lib/lore/openai";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const res = new Response();
  const supabase = createRouteHandlerSupabaseClient(req, res as never);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const openaiKey = req.headers.get("x-openai-api-key");
  if (!openaiKey) return NextResponse.json({ error: "x-openai-api-key header required" }, { status: 400 });

  const { folderName, chunks } = await req.json();
  if (!folderName || !Array.isArray(chunks)) {
    return NextResponse.json({ error: "folderName and chunks are required" }, { status: 400 });
  }

  const embeddedChunks: { chunkText: string; embedding: number[] }[] = [];
  for (const chunk of chunks) {
    const chunkText = chunk.text as string;
    try {
      const embedding = await createEmbedding(openaiKey, chunkText, { apiErrorMode: "provider" });
      embeddedChunks.push({ chunkText, embedding });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Embedding API error" },
        { status: 500 },
      );
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const { error: delError } = await supabase.from('lore_embeddings').delete()
    .eq('user_id', user.id).eq('folder_name', folderName);
  if (delError) {
    return NextResponse.json({ error: "既存のLoreデータの削除に失敗しました" }, { status: 500 });
  }

  if (embeddedChunks.length > 0) {
    const { error: insError } = await supabase.from('lore_embeddings').insert(
      embeddedChunks.map(({ chunkText, embedding }) => ({
        user_id: user.id,
        folder_name: folderName,
        chunk_text: chunkText,
        embedding,
      })),
    );
    if (insError) {
      return NextResponse.json({ error: "Loreデータの保存に失敗しました" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, count: embeddedChunks.length });
}
