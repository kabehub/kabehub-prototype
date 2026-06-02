import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const target = searchParams.get("target") ?? "both"; // "title" | "message" | "both"

  if (!query) {
    const { data, error } = await supabase
      .from("threads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  const pattern = `%${query}%`;
  const threadIds = new Set<string>();
  const matchedMsgMap = new Map<string, string[]>();

  if (target === "both") {
    const [titleRes, msgRes] = await Promise.all([
      supabase.from("threads").select("id").ilike("title", pattern),
      supabase.from("messages").select("id, thread_id").ilike("content", pattern),
    ]);
    (titleRes.data ?? []).forEach((t) => threadIds.add(t.id));
    (msgRes.data ?? []).forEach((m) => {
      threadIds.add(m.thread_id);
      const existing = matchedMsgMap.get(m.thread_id) ?? [];
      matchedMsgMap.set(m.thread_id, [...existing, m.id]);
    });
  } else if (target === "title") {
    const { data } = await supabase.from("threads").select("id").ilike("title", pattern);
    (data ?? []).forEach((t) => threadIds.add(t.id));
  } else if (target === "message") {
    const { data } = await supabase.from("messages").select("id, thread_id").ilike("content", pattern);
    (data ?? []).forEach((m) => {
      threadIds.add(m.thread_id);
      const existing = matchedMsgMap.get(m.thread_id) ?? [];
      matchedMsgMap.set(m.thread_id, [...existing, m.id]);
    });
  }

  if (threadIds.size === 0) {
    return NextResponse.json([]);
  }

  const { data, error } = await supabase
    .from("threads")
    .select("*")
    .in("id", Array.from(threadIds))
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error }, { status: 500 });

  const result = (data ?? []).map((t) => ({
    ...t,
    matchedMessageIds: matchedMsgMap.get(t.id) ?? [],
  }));

  return NextResponse.json(result);
}
