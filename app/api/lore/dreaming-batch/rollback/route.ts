import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const consolidatedId = typeof body.consolidatedId === "string" ? body.consolidatedId : "";

  if (!consolidatedId) {
    return NextResponse.json({ error: "consolidatedId is required" }, { status: 400 });
  }

  const { error } = await supabase.rpc("rollback_dreaming_batch_multi", {
    p_user_id: user.id,
    p_consolidated_id: consolidatedId,
  });

  if (error?.code === "P0001") return NextResponse.json({ error: error.message }, { status: 409 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, rolledBackId: consolidatedId });
}
