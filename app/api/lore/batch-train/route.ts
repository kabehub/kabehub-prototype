import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { runBatchTrain } from "@/lib/lore/batchTrain";
import { clamp } from "@/lib/lore/mappers";

export const dynamic = "force-dynamic";

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
  const rawLimit = typeof body.limit === "number" ? body.limit : Number(body.limit);
  const limit = clamp(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 20, 1, 100);

  try {
    const result = await runBatchTrain(supabase, openaiKey, user.id, limit);
    if (!result.ok) {
      return NextResponse.json({
        error: result.error.message,
        processedCount: result.processedCount,
        insertedCount: result.insertedCount,
      }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
