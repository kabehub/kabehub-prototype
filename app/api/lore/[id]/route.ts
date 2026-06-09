import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import type { LorePatchRequest } from "@/types";

export const dynamic = "force-dynamic";

const LORE_MEMORY_SELECT = [
  "id",
  "chunk_text",
  "tags",
  "memory_kind",
  "temporal_status",
  "importance_score",
  "confidence_score",
  "source_thread_id",
  "source_message_id",
  "source_message_number",
  "is_pinned",
  "is_archived",
  "extraction_version",
  "is_manually_corrected",
  "last_confirmed_at",
  "valid_from",
  "valid_until",
  "event_time",
  "created_at",
].join(", ");

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const res = new Response();
  const supabase = createRouteHandlerSupabaseClient(req, res as never);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = params.id;
  const body = await req.json().catch(() => null) as LorePatchRequest | null;
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    if (body.action === "archive") {
      const { data: target, error: targetError } = await supabase
        .from("lore_embeddings")
        .select("is_pinned")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
      if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (target.is_pinned === true) {
        return NextResponse.json(
          { error: "固定済みの記憶はアーカイブできません。先に固定を解除してください。" },
          { status: 409 },
        );
      }
    }

    const updates: Record<string, unknown> = {};
    const now = new Date().toISOString();
    let currentMemoryKind: string | null = null;

    if (body.action === "update_text" || body.action === "update_meta") {
      const { data: target, error: targetError } = await supabase
        .from("lore_embeddings")
        .select("memory_kind")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
      if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
      currentMemoryKind = target.memory_kind;
    }

    const markManualCorrectionIfKindChanged = () => {
      if (body.action !== "update_text" && body.action !== "update_meta") return;
      if (!body.memoryKind) return;
      if (body.memoryKind !== currentMemoryKind) {
        updates.is_manually_corrected = true;
      }
    };

    switch (body.action) {
      case "update_text": {
        const chunkText = body.chunkText?.trim();
        if (!chunkText) {
          return NextResponse.json({ error: "chunkText is required" }, { status: 400 });
        }

        const openaiKey = req.headers.get("x-openai-api-key");
        if (!openaiKey) {
          return NextResponse.json({ error: "x-openai-api-key header required" }, { status: 400 });
        }

        updates.chunk_text = chunkText;
        updates.embedding = await createEmbedding(openaiKey, chunkText);
        updates.extraction_version = "user_edited";
        updates.last_confirmed_at = now;
        if (body.memoryKind) updates.memory_kind = body.memoryKind;
        if (body.temporalStatus) updates.temporal_status = body.temporalStatus;
        markManualCorrectionIfKindChanged();
        break;
      }

      case "update_meta": {
        if (!body.memoryKind && !body.temporalStatus) {
          return NextResponse.json({ error: "memoryKind or temporalStatus is required" }, { status: 400 });
        }

        updates.extraction_version = "user_edited";
        if (body.memoryKind) updates.memory_kind = body.memoryKind;
        if (body.temporalStatus) updates.temporal_status = body.temporalStatus;
        markManualCorrectionIfKindChanged();
        break;
      }

      case "pin":
        updates.is_pinned = body.isPinned;
        break;

      case "confirm_current":
        updates.temporal_status = "current";
        updates.last_confirmed_at = now;
        updates.valid_until = null;
        break;

      case "archive":
        updates.is_archived = true;
        break;

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("lore_embeddings")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select(LORE_MEMORY_SELECT)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
