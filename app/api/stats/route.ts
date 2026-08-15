import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import {
  aggregateUsageStats,
  type StatsMessageRow,
  type StatsUsageEventRow,
} from "@/lib/usageStats";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const period = req.nextUrl.searchParams.get("period") ?? "today";
  const tz = req.nextUrl.searchParams.get("tz") ?? "Asia/Tokyo";

  const now = new Date();
  let since: Date;
  switch (period) {
    case "week":
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      break;
    case "month":
      since = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "all":
      since = new Date(0);
      break;
    default: // today
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  const sinceIso = since.toISOString();

  // ai_usage_eventsが正本。messages側の埋め込みrelationは、期間境界をまたいだ
  // eventが対応するmessageをlegacy fallbackで二重計上しないために取得する。
  const [messageResult, eventResult] = await Promise.all([
    supabase
      .from("messages")
      .select("id, role, provider, model_id, input_tokens, output_tokens, created_at, ai_usage_events(id)")
      .eq("user_id", user.id)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true }),
    supabase
      .from("ai_usage_events")
      .select("id, message_id, provider, model_id, input_tokens, output_tokens, estimated_cost_usd, cost_source, priced_at")
      .eq("user_id", user.id)
      .gte("priced_at", sinceIso)
      .order("priced_at", { ascending: true }),
  ]);

  if (messageResult.error) {
    return finalizeJson({ error: messageResult.error.message }, { status: 500 });
  }
  if (eventResult.error) {
    return finalizeJson({ error: eventResult.error.message }, { status: 500 });
  }

  const rows = (messageResult.data ?? []) as StatsMessageRow[];
  const events = (eventResult.data ?? []) as StatsUsageEventRow[];
  const aggregated = aggregateUsageStats(rows, events);

  // hourly: today のみ。他periodは空オブジェクト
  const hourly: Record<number, number> = {};
  if (period === "today") {
    for (const r of rows) {
      if (r.role !== "user" || r.provider === "memo") continue;
      const hour = parseInt(
        new Date(r.created_at).toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false }),
        10,
      ) % 24;
      hourly[hour] = (hourly[hour] ?? 0) + 1;
    }
  }

  return finalizeJson({ ...aggregated, hourly, since: sinceIso });
}
