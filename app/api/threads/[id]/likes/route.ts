import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

// POST: いいね追加
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threadId = params.id;

  // 自分のスレッドへのいいねを弾く
  const { data: thread } = await supabase
    .from("threads")
    .select("user_id")
    .eq("id", threadId)
    .single();

  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (thread.user_id === user.id) {
    return NextResponse.json({ error: "Cannot like your own thread" }, { status: 403 });
  }

  const { error } = await supabase
    .from("likes")
    .insert({ thread_id: threadId, user_id: user.id });

  // POST: いいね追加 --- likes insert の後に追加
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ↓ 追加
    await supabase.rpc("increment_likes_count", { p_thread_id: threadId });

    return NextResponse.json({ ok: true });
}

// DELETE: いいね解除
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("likes")
    .delete()
    .eq("thread_id", params.id)
    .eq("user_id", user.id);

  // DELETE: いいね解除 --- likes delete の後に追加
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ↓ 追加
  await supabase.rpc("decrement_likes_count", { p_thread_id: params.id });

  return NextResponse.json({ ok: true });
}
