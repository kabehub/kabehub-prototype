import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
  // スレッドIDごとにヒットしたメッセージIDを保持
  const matchedMsgMap = new Map<string, string[]>();

  // タイトル検索
  if (target === "title" || target === "both") {
    const { data } = await supabase
      .from("threads")
      .select("id")
      .ilike("title", pattern);
    (data ?? []).forEach((t) => threadIds.add(t.id));
  }

  // メッセージ内容検索
  if (target === "message" || target === "both") {
    const { data } = await supabase
      .from("messages")
      .select("id, thread_id")
      .ilike("content", pattern);
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

  // matchedMessageIds を各スレッドに付与
  const result = (data ?? []).map((t) => ({
    ...t,
    matchedMessageIds: matchedMsgMap.get(t.id) ?? [],
  }));

  return NextResponse.json(result);
}
