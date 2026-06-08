import { NextRequest, NextResponse } from "next/server";
import { LORE_MEMORY_SELECT } from "@/lib/loreMemorySelect";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

const CONSOLIDATION_SOURCE_SELECT = [
  "id",
  "user_id",
  "folder_name",
  "chunk_text",
  "tags",
  "memory_kind",
  "temporal_status",
  "importance_score",
  "confidence_score",
  "is_archived",
  "superseded_by",
  "is_pinned",
  "extraction_version",
  "created_at",
].join(", ");

type ConsolidationSource = {
  id: string;
  user_id: string;
  folder_name: string | null;
  chunk_text: string;
  tags: string[] | null;
  memory_kind: string | null;
  temporal_status: string | null;
  importance_score: number | null;
  confidence_score: number | null;
  is_archived: boolean | null;
  superseded_by: string | null;
  is_pinned: boolean | null;
  extraction_version: string | null;
  created_at: string | null;
};

function normalizePair(idA: string, idB: string) {
  return idA < idB ? [idA, idB] as const : [idB, idA] as const;
}

function validateSources(
  rows: ConsolidationSource[],
  userId: string,
  loreIdA: string,
  loreIdB: string,
) {
  if (rows.length !== 2) return null;

  const byId = new Map(rows.map((row) => [row.id, row]));
  const sourceA = byId.get(loreIdA);
  const sourceB = byId.get(loreIdB);
  if (!sourceA || !sourceB) return null;

  const isEditableExtraction = (value: string | null) => value === "user_edited" || value === "user_created";
  const invalid = [sourceA, sourceB].some((row) =>
    row.user_id !== userId ||
    row.is_archived !== false ||
    row.superseded_by !== null ||
    row.is_pinned !== false ||
    isEditableExtraction(row.extraction_version)
  );
  if (invalid) return null;

  return { sourceA, sourceB };
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

function normalizeTags(...tagLists: Array<string[] | null>) {
  return Array.from(new Set(tagLists.flatMap((tags) => tags ?? []).filter((tag) => typeof tag === "string")));
}

export async function POST(req: NextRequest) {
  const openaiKey = req.headers.get("x-openai-api-key");
  if (!openaiKey) {
    return NextResponse.json({ error: "x-openai-api-key header required" }, { status: 400 });
  }

  const res = new NextResponse();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const idA = typeof body.idA === "string" ? body.idA.trim() : "";
  const idB = typeof body.idB === "string" ? body.idB.trim() : "";
  const mergedText = typeof body.mergedText === "string" ? body.mergedText.trim() : "";
  const memoryKind = typeof body.memoryKind === "string" && body.memoryKind.trim() ? body.memoryKind.trim() : null;
  const temporalStatus = typeof body.temporalStatus === "string" && body.temporalStatus.trim()
    ? body.temporalStatus.trim()
    : null;

  if (!idA || !idB || idA === idB || !mergedText) {
    return NextResponse.json({ error: "Invalid merge request" }, { status: 400 });
  }

  const [loreIdA, loreIdB] = normalizePair(idA, idB);

  const { data, error } = await supabase
    .from("lore_embeddings")
    .select(CONSOLIDATION_SOURCE_SELECT)
    .in("id", [loreIdA, loreIdB]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const validated = validateSources((data ?? []) as unknown as ConsolidationSource[], user.id, loreIdA, loreIdB);
  if (!validated) {
    return NextResponse.json({ error: "Invalid lore pair" }, { status: 400 });
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

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

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

      return NextResponse.json(
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

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

    return NextResponse.json(merged, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
