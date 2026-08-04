import { NextRequest, NextResponse } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { runBatchTrain } from "@/lib/lore/batchTrain";
import { clamp } from "@/lib/lore/mappers";

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
  const rawLimit = typeof body.limit === "number" ? body.limit : Number(body.limit);
  const limit = clamp(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 20, 1, 100);

  try {
    const result = await runBatchTrain(supabase, openaiKey, user.id, limit);
    if (!result.ok) {
      return finalizeJson({
        error: result.error.message,
        processedCount: result.processedCount,
        insertedCount: result.insertedCount,
      }, { status: 500 });
    }
    return finalizeJson(result);
  } catch (error) {
    return finalizeJson({ error: (error as Error).message }, { status: 500 });
  }
}
