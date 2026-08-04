import { NextRequest, NextResponse } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import {
  CONSOLIDATION_SOURCE_SELECT,
  ConsolidationSourceRow,
  normalizePair,
  validateApprovedPair,
  validateMergedText,
} from "@/lib/lore/consolidation";
import { generateMergedText } from "@/lib/lore/consolidationLlm";

export const dynamic = "force-dynamic";

function newerSource(a: ConsolidationSourceRow, b: ConsolidationSourceRow) {
  const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
  const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
  return timeB > timeA ? b : a;
}

function suggestedValue(
  a: string | null,
  b: string | null,
  fallback: string,
  newer: string | null,
) {
  if (a && a === b) return a;
  return newer ?? a ?? b ?? fallback;
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
  if (!idA || !idB || idA === idB) {
    return finalizeJson({ error: "Invalid lore pair" }, { status: 400 });
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
    const newer = newerSource(sourceA, sourceB);
    const mergedText = await generateMergedText(openaiKey, [sourceA, sourceB]);
    const validationError = validateMergedText(mergedText);
    if (validationError) throw new Error(validationError);

    return finalizeJson({
      mergedText,
      suggestedMemoryKind: suggestedValue(sourceA.memory_kind, sourceB.memory_kind, "fact", newer.memory_kind),
      suggestedTemporalStatus: suggestedValue(
        sourceA.temporal_status,
        sourceB.temporal_status,
        "current",
        newer.temporal_status,
      ),
      source: {
        idA: sourceA.id,
        idB: sourceB.id,
        chunkTextA: sourceA.chunk_text,
        chunkTextB: sourceB.chunk_text,
      },
    });
  } catch (err) {
    return finalizeJson({ error: (err as Error).message }, { status: 500 });
  }
}
