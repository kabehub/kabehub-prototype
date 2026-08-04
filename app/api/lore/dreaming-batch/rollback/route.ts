import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const body = await req.json().catch(() => ({}));
  const consolidatedId = typeof body.consolidatedId === "string" ? body.consolidatedId : "";

  if (!consolidatedId) {
    return finalizeJson({ error: "consolidatedId is required" }, { status: 400 });
  }

  const { error } = await supabase.rpc("rollback_dreaming_batch_multi", {
    p_user_id: user.id,
    p_consolidated_id: consolidatedId,
  });

  if (error?.code === "P0001") return finalizeJson({ error: error.message }, { status: 409 });
  if (error) return finalizeJson({ error: error.message }, { status: 500 });

  return finalizeJson({ success: true, rolledBackId: consolidatedId });
}
