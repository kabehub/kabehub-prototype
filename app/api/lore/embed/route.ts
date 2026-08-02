import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { AiProviderRequestError, createEmbedding } from "@/lib/lore/openai";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const openaiKey = req.headers.get("x-openai-api-key");
  if (!openaiKey) return finalizeJson({ error: "x-openai-api-key header required" }, { status: 400 });

  const { folderName, chunks } = await req.json();
  if (!folderName || !Array.isArray(chunks)) {
    return finalizeJson({ error: "folderName and chunks are required" }, { status: 400 });
  }

  const embeddedChunks: { chunkText: string; embedding: number[] }[] = [];
  for (const chunk of chunks) {
    const chunkText = chunk.text as string;
    try {
      const embedding = await createEmbedding(openaiKey, chunkText);
      embeddedChunks.push({ chunkText, embedding });
    } catch (err) {
      const status = err instanceof AiProviderRequestError ? (err.status ?? 502) : 502;
      console.error("[lore/embed] provider API request failed", {
        provider: "openai",
        status: err instanceof AiProviderRequestError ? err.status : null,
        errorCode: err instanceof AiProviderRequestError ? err.errorCode : "UPSTREAM_RESPONSE_INVALID",
        errorType: err instanceof Error ? err.name : "unknown",
      });
      return finalizeJson(
        { error: "OpenAI APIへのリクエストに失敗しました", provider: "openai", status },
        { status },
      );
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const { error: delError } = await supabase.from('lore_embeddings').delete()
    .eq('user_id', user.id).eq('folder_name', folderName);
  if (delError) {
    return finalizeJson({ error: "既存のLoreデータの削除に失敗しました" }, { status: 500 });
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
      return finalizeJson({ error: "Loreデータの保存に失敗しました" }, { status: 500 });
    }
  }

  return finalizeJson({ ok: true, count: embeddedChunks.length });
}
