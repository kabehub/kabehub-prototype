import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { getGithubStatus } from "@/lib/github-token-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, finalizeJson } = auth;

  try {
    const status = await getGithubStatus(user.id);
    return finalizeJson(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[github-status] failed:", message);
    return finalizeJson({ error: "GitHub連携状況の取得に失敗しました" }, { status: 500 });
  }
}
