import { NextRequest, NextResponse } from "next/server";
import { deleteThread } from "@/lib/supabase-db";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { v4 as uuidv4 } from "uuid";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await deleteThread(params.id);
  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) updates.title = body.title;
  if (body.system_prompt !== undefined) updates.system_prompt = body.system_prompt;
  if (body.is_public !== undefined) updates.is_public = body.is_public;
  if (body.hide_memos !== undefined) updates.hide_memos = body.hide_memos;

  // 公開ONの時だけshare_tokenを生成
  if (body.needsToken && body.is_public) {
    const { data: existing } = await supabase
      .from("threads")
      .select("share_token")
      .eq("id", params.id)
      .single();
    if (!existing?.share_token) {
      updates.share_token = uuidv4();
    }
  }

  const { data, error } = await supabase
    .from("threads")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}