import { NextRequest, NextResponse } from "next/server";
import { runDreamingBatch } from "@/lib/lore/dreaming";
import { clamp } from "@/lib/lore/mappers";
import { DREAMING_DEFAULTS } from "@/lib/lore/types";
import { requireRouteUser } from "@/lib/supabase/route-auth";

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
  const rawThreshold = typeof body.threshold === "number" ? body.threshold : Number(body.threshold);
  const limit = clamp(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : DREAMING_DEFAULTS.limit, 1, 5);
  const threshold = clamp(Number.isFinite(rawThreshold) ? rawThreshold : DREAMING_DEFAULTS.threshold, 0.80, 0.98);
  const folderName = typeof body.folderName === "string" && body.folderName.trim()
    ? body.folderName.trim()
    : null;

  try {
    const result = await runDreamingBatch(supabase, openaiKey, user.id, {
      limit,
      threshold,
      folderName,
    });
    return finalizeJson(result);
  } catch (err) {
    return finalizeJson({ error: (err as Error).message }, { status: 500 });
  }
}
