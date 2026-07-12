import { NextRequest, NextResponse } from "next/server";
import { serviceRoleClient } from "@/lib/mcp-auth";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { createEmbedding } from "@/lib/lore/openai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const openaiKey = req.headers.get("x-openai-api-key");
  if (!openaiKey)
    return NextResponse.json({ error: "x-openai-api-key header required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { messageId } = body;
  if (!messageId)
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });

  const { data: message, error: msgError } = await supabase
    .from("messages")
    .select("id, thread_id, role, content, user_id")
    .eq("id", messageId)
    .single();

  if (msgError || !message)
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  if (message.user_id !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (message.role !== "assistant")
    return NextResponse.json({ error: "Only assistant messages can be liked" }, { status: 400 });

  const { data: existing } = await supabase
    .from("lore_embeddings")
    .select("id")
    .eq("source_message_id", messageId)
    .eq("extraction_version", "liked_ai")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) return NextResponse.json({ alreadyLiked: true });

  let embedding: number[];
  try {
    embedding = await createEmbedding(openaiKey, message.content, { apiErrorMode: "provider" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Embedding API error" },
      { status: 500 },
    );
  }

  const { data: thread } = await serviceRoleClient()
    .from("threads")
    .select("folder_name")
    .eq("id", message.thread_id)
    .single();

  const { error: insertError } = await supabase.from("lore_embeddings").insert({
    user_id: user.id,
    chunk_text: message.content,
    embedding,
    source_type: "liked_ai",
    source_message_id: message.id,
    source_thread_id: message.thread_id,
    folder_name: thread?.folder_name ?? null,
    extraction_version: "liked_ai",
    memory_kind: "idea",
    metadata: { ai_proposed_kind: "idea" },
    temporal_status: "current",
    importance_score: 0.8,
    confidence_score: 0.75,
    is_pinned: false,
    is_archived: false,
    tags: [],
  });

  if (insertError)
    return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
