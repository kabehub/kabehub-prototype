import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { LORE_MEMORY_SELECT } from "@/lib/lore/selects";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const res = new Response();
  const supabase = createRouteHandlerSupabaseClient(req, res as never);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const folder = searchParams.get("folder");
  const kind = searchParams.get("kind");
  const status = searchParams.get("status");
  const pinned = searchParams.get("pinned");
  const includeArchived = searchParams.get("include_archived");
  const sort = searchParams.get("sort");

  let query = supabase
    .from("lore_embeddings")
    .select(LORE_MEMORY_SELECT)
    .eq("user_id", user.id)
    .is("superseded_by", null);

  if (includeArchived !== "true") {
    query = query.eq("is_archived", false);
  }

  if (folder) {
    query = query.eq("folder_name", folder);
  }

  if (kind) {
    query = query.eq("memory_kind", kind);
  }

  if (status) {
    query = query.eq("temporal_status", status);
  }

  if (pinned === "true") {
    query = query.eq("is_pinned", true);
  }

  if (sort === "importance_score") {
    query = query
      .order("importance_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

async function createEmbedding(openaiKey: string, content: string): Promise<number[]> {
  const embRes = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: content }),
  });

  if (!embRes.ok) throw new Error("Embedding API error");

  const embData = await embRes.json();
  const embedding = embData.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error("Missing embedding");
  return embedding as number[];
}

export async function POST(req: NextRequest) {
  const res = new Response();
  const supabase = createRouteHandlerSupabaseClient(req, res as never);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const openaiKey = req.headers.get("x-openai-api-key");
  if (!openaiKey) {
    return NextResponse.json({ error: "x-openai-api-key header required" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const chunkText = typeof body.chunkText === "string" ? body.chunkText.trim() : "";
  if (!chunkText) {
    return NextResponse.json({ error: "chunkText is required" }, { status: 400 });
  }

  try {
    const embedding = await createEmbedding(openaiKey, chunkText);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("lore_embeddings")
      .insert({
        user_id: user.id,
        chunk_text: chunkText,
        embedding,
        memory_kind: typeof body.memoryKind === "string" ? body.memoryKind : "fact",
        temporal_status: typeof body.temporalStatus === "string" ? body.temporalStatus : "current",
        extraction_version: "user_created",
        last_confirmed_at: now,
        source_type: "manual",
        source_message_id: null,
        source_thread_id: null,
        tags: [],
      })
      .select(LORE_MEMORY_SELECT)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
