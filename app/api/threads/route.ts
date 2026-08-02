export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const { data, error } = await supabase
    .from("threads")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    return finalizeJson([], { status: 500 });
  }

  const response = finalizeJson(data ?? [], {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
  // Cookie finalization applies a generic cache policy; preserve this route's existing contract.
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return response;
}
