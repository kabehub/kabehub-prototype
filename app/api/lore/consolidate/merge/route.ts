import { NextRequest, NextResponse } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { createEmbedding } from "@/lib/lore/openai";
import {
  CONSOLIDATION_SOURCE_SELECT,
  ConsolidationSourceRow,
  normalizePair,
  validateApprovedPair,
} from "@/lib/lore/consolidation";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

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
    const newEmbedding = await createEmbedding(openaiKey, mergedText);
    const { data: mergedId, error: rpcError } = await supabase.rpc(
      "merge_user_edited_lore_pair",
      {
        p_user_id: user.id,
        p_lore_id_a: loreIdA,
        p_lore_id_b: loreIdB,
        p_merged_text: mergedText,
        p_embedding: newEmbedding,
        p_memory_kind: memoryKind,
        p_temporal_status: temporalStatus,
      },
    );

    if (rpcError) {
      logger.dbOperationFailed({
        route: "lore-consolidate-merge",
        operation: "merge_user_edited_lore_pair",
        table: "lore_embeddings",
        errorCode: rpcError.code,
      });

      if (
        rpcError.message.includes("protection check")
        || rpcError.message.includes("expected 2 source records")
      ) {
        return finalizeJson(
          { error: "Source memories changed, please retry" },
          { status: 409 },
        );
      }

      return finalizeJson({ error: "Failed to merge source memories" }, { status: 500 });
    }

    return finalizeJson({ id: mergedId }, { status: 201 });
  } catch (err) {
    return finalizeJson({ error: (err as Error).message }, { status: 500 });
  }
}
