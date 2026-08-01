import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

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
