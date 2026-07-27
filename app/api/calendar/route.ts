import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authResponse = new NextResponse();
  const supabase = createRouteHandlerSupabaseClient(req, authResponse);

  const finalizeResponse = <T extends NextResponse>(response: T): T => {
    const authCookies = authResponse.cookies.getAll();
    for (const cookie of authCookies) {
      response.cookies.set(cookie);
    }
    if (authCookies.length > 0) {
      response.headers.set("Cache-Control", "private, no-store");
    }
    return response;
  };

  const finalizeJson = (body: unknown, init?: ResponseInit): NextResponse =>
    finalizeResponse(NextResponse.json(body, init));

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return finalizeJson({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1), 10);

  // JST基準（UTC+9）で月初・月末をUTC値に変換
  // JST 月初 0:00 = UTC (月初 - 9h)
  const startUTC = new Date(Date.UTC(year, month - 1, 1) - 9 * 3600 * 1000);
  const endUTC = new Date(Date.UTC(year, month, 1) - 9 * 3600 * 1000);

  const { data: threads, error } = await supabase
    .from("threads")
    .select("id, title, updated_at")
    .eq("user_id", user.id)
    .gte("updated_at", startUTC.toISOString())
    .lt("updated_at", endUTC.toISOString())
    .order("updated_at", { ascending: false });

  if (error) {
    return finalizeJson({ error: error.message }, { status: 500 });
  }

  return finalizeJson(threads ?? []);
}
