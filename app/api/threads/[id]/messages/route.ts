import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", params.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("messages fetch error:", error);
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// 指定メッセージ以降を全部削除
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { fromCreatedAt } = await req.json();

  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("thread_id", params.id)
    .gte("created_at", fromCreatedAt);

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ success: true });
}