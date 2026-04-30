import { NextRequest, NextResponse } from "next/server";
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

  await supabase.from("threads").delete().eq("id", params.id);
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
  if (body.allow_prompt_fork !== undefined) updates.allow_prompt_fork = body.allow_prompt_fork;
  if (body.folder_name !== undefined) updates.folder_name = body.folder_name;
  if (body.share_token !== undefined) updates.share_token = body.share_token;
  if (body.metadata !== undefined) updates.metadata = body.metadata;
  if (body.genre !== undefined) updates.genre = body.genre;
  // ✅ v63追加: なりきりモード
  if (body.roleplay_mode !== undefined) updates.roleplay_mode = body.roleplay_mode;
  if (body.rp_char_name !== undefined) updates.rp_char_name = body.rp_char_name;
  if (body.rp_char_icon_url !== undefined) updates.rp_char_icon_url = body.rp_char_icon_url;
  // ✅ v76: スナップショット型共有のPush時刻
  if (body.shared_at !== undefined) updates.shared_at = body.shared_at;

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
    .upsert({
      id: params.id,
      user_id: user.id,
      ...updates,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
