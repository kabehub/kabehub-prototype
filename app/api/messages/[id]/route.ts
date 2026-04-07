import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("id", params.id);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ success: true });
}

// ── PATCH /api/messages/[id] ─────────────────────────────────────
// content の部分更新 と is_hidden フラグの切り替えに使用
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  // 許可するフィールドのみ更新（content / is_hidden）
  const updates: Record<string, unknown> = {};
  if (typeof body.content === "string") updates.content = body.content;
  if (typeof body.is_hidden === "boolean") updates.is_hidden = body.is_hidden;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("messages")
    .update(updates)
    .eq("id", params.id)
    .eq("user_id", user.id) // 自分のメッセージのみ
    .select()
    .single();

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ message: data });
}
