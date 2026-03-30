import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const target = searchParams.get("target") ?? "both"; // "title" | "message" | "both"

  if (!query) {
    // クエリ空なら全スレッド返す
    const { data, error } = await supabase
      .from("threads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  const pattern = `%${query}%`;
  let threadIds = new Set<string>();

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
      .select("thread_id")
      .ilike("content", pattern);
    (data ?? []).forEach((m) => threadIds.add(m.thread_id));
  }

  if (threadIds.size === 0) {
    return NextResponse.json([]);
  }

  // 該当スレッドを取得
  const { data, error } = await supabase
    .from("threads")
    .select("*")
    .in("id", Array.from(threadIds))
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json(data ?? []);
}
