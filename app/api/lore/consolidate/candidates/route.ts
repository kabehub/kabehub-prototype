import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { clamp, normalizeConsolidationCandidate, type ConsolidationCandidate } from "@/lib/lore/mappers";
import { pairKey } from "@/lib/lore/consolidation";

export const dynamic = "force-dynamic";

type SimilarLorePairRow = Record<string, unknown>;

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
    .map(normalizeConsolidationCandidate)
    .filter((candidate): candidate is ConsolidationCandidate => Boolean(candidate));

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
