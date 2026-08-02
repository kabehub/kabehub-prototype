import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { LORE_MEMORY_SELECT } from "@/lib/lore/selects";
import { createEmbedding } from "@/lib/lore/openai";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

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
  if (error) return finalizeJson({ error: error.message }, { status: 500 });

  return finalizeJson(data ?? []);
}

export async function POST(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const openaiKey = req.headers.get("x-openai-api-key");
  if (!openaiKey) {
    return finalizeJson({ error: "x-openai-api-key header required" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const chunkText = typeof body.chunkText === "string" ? body.chunkText.trim() : "";
  if (!chunkText) {
    return finalizeJson({ error: "chunkText is required" }, { status: 400 });
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

    if (error) return finalizeJson({ error: error.message }, { status: 500 });

    return finalizeJson(data, { status: 201 });
  } catch (err) {
    return finalizeJson({ error: (err as Error).message }, { status: 500 });
  }
}
