import { NextRequest } from "next/server";
import { serviceRoleClient } from "@/lib/mcp-auth";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { AiProviderRequestError, createEmbedding } from "@/lib/lore/openai";
import { LIKED_AI_DEFAULTS } from "@/lib/lore/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const openaiKey = req.headers.get("x-openai-api-key");
  if (!openaiKey)
    return finalizeJson({ error: "x-openai-api-key header required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { messageId } = body;
  if (!messageId)
    return finalizeJson({ error: "messageId is required" }, { status: 400 });

  const { data: message, error: msgError } = await supabase
    .from("messages")
    .select("id, thread_id, role, content, user_id")
    .eq("id", messageId)
    .single();

  if (msgError || !message)
    return finalizeJson({ error: "Message not found" }, { status: 404 });
  if (message.user_id !== user.id)
    return finalizeJson({ error: "Forbidden" }, { status: 403 });
  if (message.role !== "assistant")
    return finalizeJson({ error: "Only assistant messages can be liked" }, { status: 400 });

  const { data: existing, error: existingError } = await supabase
    .from("lore_embeddings")
    .select("id")
    .eq("source_message_id", messageId)
    .eq("extraction_version", "liked_ai")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError)
    return finalizeJson({ error: existingError.message }, { status: 500 });
  if (existing) return finalizeJson({ alreadyLiked: true });

  let embedding: number[];
  try {
    embedding = await createEmbedding(openaiKey, message.content);
  } catch (err) {
    const status = err instanceof AiProviderRequestError ? (err.status ?? 502) : 502;
    console.error("[lore/like] provider API request failed", {
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

  const { data: thread, error: threadError } = await serviceRoleClient()
    .from("threads")
    .select("folder_name")
    .eq("id", message.thread_id)
    .single();

  if (threadError)
    return finalizeJson({ error: threadError.message }, { status: 500 });

  const { memoryKind, importanceScore, confidenceScore } = LIKED_AI_DEFAULTS;
  const { error: insertError } = await supabase.from("lore_embeddings").insert({
    user_id: user.id,
    chunk_text: message.content,
    embedding,
    source_type: "liked_ai",
    source_message_id: message.id,
    source_thread_id: message.thread_id,
    folder_name: thread?.folder_name ?? null,
    extraction_version: "liked_ai",
    memory_kind: memoryKind,
    metadata: { ai_proposed_kind: memoryKind },
    temporal_status: "current",
    importance_score: importanceScore,
    confidence_score: confidenceScore,
    is_pinned: false,
    is_archived: false,
    tags: [],
  });

  if (insertError)
    return finalizeJson({ error: insertError.message }, { status: 500 });

  return finalizeJson({ success: true });
}
