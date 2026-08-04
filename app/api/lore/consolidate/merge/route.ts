import { NextRequest, NextResponse } from "next/server";
import { LORE_MEMORY_SELECT } from "@/lib/loreMemorySelect";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { createEmbedding } from "@/lib/lore/openai";
import {
  CONSOLIDATION_SOURCE_SELECT,
  ConsolidationSourceRow,
  normalizePair,
  validateApprovedPair,
} from "@/lib/lore/consolidation";

export const dynamic = "force-dynamic";

function normalizeTags(...tagLists: Array<string[] | null>) {
  return Array.from(new Set(tagLists.flatMap((tags) => tags ?? []).filter((tag) => typeof tag === "string")));
}

export async function POST(req: NextRequest) {
  const openaiKey = req.headers.get("x-openai-api-key");
  if (!openaiKey) {
    return NextResponse.json({ error: "x-openai-api-key header required" }, { status: 400 });
  }

  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const body = await req.json().catch(() => ({}));
  const idA = typeof body.idA === "string" ? body.idA.trim() : "";
  const idB = typeof body.idB === "string" ? body.idB.trim() : "";
  const mergedText = typeof body.mergedText === "string" ? body.mergedText.trim() : "";
  const memoryKind = typeof body.memoryKind === "string" && body.memoryKind.trim() ? body.memoryKind.trim() : null;
  const temporalStatus = typeof body.temporalStatus === "string" && body.temporalStatus.trim()
    ? body.temporalStatus.trim()
    : null;

  if (!idA || !idB || idA === idB || !mergedText) {
    return finalizeJson({ error: "Invalid merge request" }, { status: 400 });
  }

  const [loreIdA, loreIdB] = normalizePair(idA, idB);

  const { data, error } = await supabase
    .from("lore_embeddings")
    .select(CONSOLIDATION_SOURCE_SELECT)
    .in("id", [loreIdA, loreIdB]);

  if (error) return finalizeJson({ error: error.message }, { status: 500 });

  const validated = validateApprovedPair((data ?? []) as unknown as ConsolidationSourceRow[], user.id, loreIdA, loreIdB);
  if (!validated) {
    return finalizeJson({ error: "Invalid lore pair" }, { status: 400 });
  }

  try {
    const { sourceA, sourceB } = validated;
    const newerSource = (sourceA.created_at ?? "") >= (sourceB.created_at ?? "") ? sourceA : sourceB;
    const newEmbedding = await createEmbedding(openaiKey, mergedText);
    const now = new Date().toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from("lore_embeddings")
      .insert({
        user_id: user.id,
        folder_name: newerSource.folder_name,
        chunk_text: mergedText,
        embedding: newEmbedding,
        memory_kind: memoryKind ?? sourceA.memory_kind,
        temporal_status: temporalStatus ?? sourceA.temporal_status,
        extraction_version: "user_edited",
        source_type: "consolidation",
        source_thread_id: null,
        source_message_id: null,
        source_message_number: null,
        tags: normalizeTags(sourceA.tags, sourceB.tags),
        importance_score: Math.max(sourceA.importance_score ?? 0, sourceB.importance_score ?? 0),
        confidence_score: ((sourceA.confidence_score ?? 0) + (sourceB.confidence_score ?? 0)) / 2,
        last_confirmed_at: now,
      })
      .select("id")
      .single();

    if (insertError) return finalizeJson({ error: insertError.message }, { status: 500 });

    const { data: updatedRows, error: updateError } = await supabase
      .from("lore_embeddings")
      .update({ is_archived: true, superseded_by: inserted.id })
      .eq("user_id", user.id)
      .in("id", [loreIdA, loreIdB])
      .eq("is_archived", false)
      .is("superseded_by", null)
      .select("id");

    if (updateError || (updatedRows ?? []).length !== 2) {
      await supabase
        .from("lore_embeddings")
        .delete()
        .eq("id", inserted.id)
        .eq("user_id", user.id);

      return finalizeJson(
        { error: updateError?.message ?? "Failed to archive source memories" },
        { status: 500 },
      );
    }

    const { data: merged, error: fetchError } = await supabase
      .from("lore_embeddings")
      .select(LORE_MEMORY_SELECT)
      .eq("id", inserted.id)
      .eq("user_id", user.id)
      .single();

    if (fetchError) return finalizeJson({ error: fetchError.message }, { status: 500 });

    return finalizeJson(merged, { status: 201 });
  } catch (err) {
    return finalizeJson({ error: (err as Error).message }, { status: 500 });
  }
}
