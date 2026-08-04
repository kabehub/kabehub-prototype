import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { clamp, normalizeConsolidationCandidate, type ConsolidationCandidate } from "@/lib/lore/mappers";
import { pairKey } from "@/lib/lore/consolidation";

export const dynamic = "force-dynamic";

type SimilarLorePairRow = Record<string, unknown>;

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

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

  if (error) return finalizeJson({ error: error.message }, { status: 500 });

  const candidates = ((Array.isArray(data) ? data : []) as SimilarLorePairRow[])
    .map(normalizeConsolidationCandidate)
    .filter((candidate): candidate is ConsolidationCandidate => Boolean(candidate));

  if (candidates.length === 0) {
    return finalizeJson({ candidates: [] });
  }

  const { data: dismissals, error: dismissalsError } = await supabase
    .from("lore_consolidation_dismissals")
    .select("lore_id_a, lore_id_b")
    .eq("user_id", user.id);

  if (dismissalsError) {
    return finalizeJson({ error: dismissalsError.message }, { status: 500 });
  }

  const dismissedPairs = new Set(
    (dismissals ?? [])
      .filter((row) => typeof row.lore_id_a === "string" && typeof row.lore_id_b === "string")
      .map((row) => pairKey(row.lore_id_a as string, row.lore_id_b as string)),
  );

  return finalizeJson({
    candidates: candidates.filter((candidate) => !dismissedPairs.has(pairKey(candidate.idA, candidate.idB))),
  });
}
