import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { AiProviderRequestError, createEmbedding } from "@/lib/lore/openai";
import { getOwnedProject } from "@/lib/project-memory/get-owned-project";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const openaiKey = req.headers.get("x-openai-api-key");
  if (!openaiKey) return finalizeJson({ error: "x-openai-api-key header required" }, { status: 400 });

  const body = await req.json();
  const { chunks } = body;
  const hasProjectId = body.projectId !== undefined;

  if (Object.prototype.hasOwnProperty.call(body ?? {}, "folderName")) {
    return finalizeJson(
      { error: "folderName is no longer supported; use projectId" },
      { status: 400 },
    );
  }
  if (!hasProjectId) {
    return finalizeJson({ error: "projectId is required" }, { status: 400 });
  }
  if (!Array.isArray(chunks)) {
    return finalizeJson({ error: "chunks are required" }, { status: 400 });
  }

  const projectId = body.projectId;
  if (typeof projectId !== "string") {
    return finalizeJson({ error: "projectId must be a string" }, { status: 400 });
  }
  const ownedProject = await getOwnedProject(supabase, user.id, projectId);
  if (!ownedProject.ok) {
    return finalizeJson(
      { error: ownedProject.error },
      { status: ownedProject.status },
    );
  }

  const embeddedChunks: { chunkText: string; embedding: number[] }[] = [];
  for (const chunk of chunks) {
    const chunkText = chunk.text as string;
    try {
      const embedding = await createEmbedding(openaiKey, chunkText);
      embeddedChunks.push({ chunkText, embedding });
    } catch (err) {
      const status = err instanceof AiProviderRequestError ? (err.status ?? 502) : 502;
      return finalizeJson(
        { error: "OpenAI APIへのリクエストに失敗しました", provider: "openai", status },
        { status },
      );
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const { error: delError } = await supabase.from('lore_embeddings').delete()
    .eq('user_id', user.id).eq('project_id', projectId);
  if (delError) {
    return finalizeJson({ error: "既存のLoreデータの削除に失敗しました" }, { status: 500 });
  }

  if (embeddedChunks.length > 0) {
    const { error: insError } = await supabase.from('lore_embeddings').insert(
      embeddedChunks.map(({ chunkText, embedding }) => ({
        user_id: user.id,
        project_id: projectId,
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
