import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const res = new Response();
  const supabase = createRouteHandlerSupabaseClient(req, res as never);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  // 将来的にRPC化推奨: 現在は個人ユーザー向けのためJSで集計
  const { data: messages, error } = await supabase
    .from("messages")
    .select("role, provider, model_id, input_tokens, output_tokens, created_at")
    .eq("user_id", user.id)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = messages ?? [];

  // sends: ユーザーが送信したメッセージ数（memoを除く）
  const sends = rows.filter((r) => r.role === "user" && r.provider !== "memo").length;

  // total_tokens: フロント側で計算させない
  let totalInput = 0;
  let totalOutput = 0;
  for (const r of rows) {
    if (r.input_tokens) totalInput += r.input_tokens;
    if (r.output_tokens) totalOutput += r.output_tokens;
  }
  const total_tokens = totalInput + totalOutput;

  // by_model: provider/model_id ごとの集計（降順）
  const modelMap = new Map<string, { count: number; input_tokens: number; output_tokens: number }>();
  for (const r of rows) {
    if (r.role !== "assistant") continue;
    const key = `${r.provider}/${r.model_id ?? "unknown"}`;
    const cur = modelMap.get(key) ?? { count: 0, input_tokens: 0, output_tokens: 0 };
    cur.count++;
    cur.input_tokens += r.input_tokens ?? 0;
    cur.output_tokens += r.output_tokens ?? 0;
    modelMap.set(key, cur);
  }
  const by_model = Array.from(modelMap.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.count - a.count);

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

  return NextResponse.json({ sends, total_tokens, by_model, hourly, since: sinceIso });
}
