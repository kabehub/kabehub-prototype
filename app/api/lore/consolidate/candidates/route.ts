import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

type SimilarLorePairRow = Record<string, unknown>;

type Candidate = {
  idA: string;
  idB: string;
  chunkTextA: string;
  chunkTextB: string;
  memoryKindA: string | null;
  memoryKindB: string | null;
  temporalStatusA: string | null;
  temporalStatusB: string | null;
  createdAtA: string | null;
  createdAtB: string | null;
  similarity: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function stringValue(row: SimilarLorePairRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") return value;
  }
  return null;
}

function numberValue(row: SimilarLorePairRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function normalizeCandidate(row: SimilarLorePairRow): Candidate | null {
  const idA = stringValue(row, ["idA", "id_a", "loreIdA", "lore_id_a"]);
  const idB = stringValue(row, ["idB", "id_b", "loreIdB", "lore_id_b"]);
  const chunkTextA = stringValue(row, ["chunkTextA", "chunk_text_a"]);
  const chunkTextB = stringValue(row, ["chunkTextB", "chunk_text_b"]);
  const similarity = numberValue(row, ["similarity", "score"]);

  if (!idA || !idB || !chunkTextA || !chunkTextB || similarity === null) {
    return null;
  }

  return {
    idA,
    idB,
    chunkTextA,
    chunkTextB,
    memoryKindA: stringValue(row, ["memoryKindA", "memory_kind_a"]),
    memoryKindB: stringValue(row, ["memoryKindB", "memory_kind_b"]),
    temporalStatusA: stringValue(row, ["temporalStatusA", "temporal_status_a"]),
    temporalStatusB: stringValue(row, ["temporalStatusB", "temporal_status_b"]),
    createdAtA: stringValue(row, ["createdAtA", "created_at_a"]),
    createdAtB: stringValue(row, ["createdAtB", "created_at_b"]),
    similarity,
  };
}

function pairKey(idA: string, idB: string) {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawThreshold = Number(req.nextUrl.searchParams.get("threshold"));
  const rawLimit = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
  const threshold = clamp(Number.isFinite(rawThreshold) ? rawThreshold : 0.9, 0.8, 0.98);
  const limit = clamp(Number.isFinite(rawLimit) ? rawLimit : 10, 1, 30);
  const folderName = req.nextUrl.searchParams.get("folderName")?.trim() || null;

  const { data, error } = await supabase.rpc("find_similar_lore_pairs", {
    p_user_id: user.id,
    p_threshold: threshold,
    p_limit: limit,
    p_folder_name: folderName,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = ((Array.isArray(data) ? data : []) as SimilarLorePairRow[])
    .map(normalizeCandidate)
    .filter((candidate): candidate is Candidate => Boolean(candidate));

  if (candidates.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  const { data: dismissals, error: dismissalsError } = await supabase
    .from("lore_consolidation_dismissals")
    .select("lore_id_a, lore_id_b")
    .eq("user_id", user.id);

  if (dismissalsError) {
    return NextResponse.json({ error: dismissalsError.message }, { status: 500 });
  }

  const dismissedPairs = new Set(
    (dismissals ?? [])
      .filter((row) => typeof row.lore_id_a === "string" && typeof row.lore_id_b === "string")
      .map((row) => pairKey(row.lore_id_a as string, row.lore_id_b as string)),
  );

  return NextResponse.json({
    candidates: candidates.filter((candidate) => !dismissedPairs.has(pairKey(candidate.idA, candidate.idB))),
  });
}
