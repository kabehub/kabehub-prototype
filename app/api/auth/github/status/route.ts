import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { getGithubStatus } from "@/lib/github-token-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res as never);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const status = await getGithubStatus(user.id);
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[github-status] failed:", message);
    return NextResponse.json({ error: "GitHub連携状況の取得に失敗しました" }, { status: 500 });
  }
}
