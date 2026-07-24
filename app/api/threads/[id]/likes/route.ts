import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

// POST: いいね追加
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threadId = params.id;

  // 自分のスレッドへのいいねを弾く
  const publicThreadRes = await supabase
    .from("public_threads_view")
    .select("user_id")
    .eq("id", threadId)
    .maybeSingle();

  if (publicThreadRes.error) {
    return NextResponse.json({ error: "Failed to verify thread" }, { status: 500 });
  }

  let thread = publicThreadRes.data;

  if (!thread) {
    const ownThreadRes = await supabase
      .from("threads")
      .select("user_id")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (ownThreadRes.error) {
      return NextResponse.json({ error: "Failed to verify thread" }, { status: 500 });
    }
    thread = ownThreadRes.data;
  }

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
      const { error: recalcError } = await supabase.rpc("recalc_likes_count", {
        p_thread_id: threadId,
      });

      if (recalcError) {
        console.warn("[threads] recalc_likes_count failed:", recalcError);
      }

      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: recalcError } = await supabase.rpc("recalc_likes_count", {
    p_thread_id: threadId,
  });

  if (recalcError) {
    console.error("[threads] recalc_likes_count failed:", recalcError);
    return NextResponse.json({ error: "Failed to sync likes count" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE: いいね解除
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  const { error: recalcError } = await supabase.rpc("recalc_likes_count", {
    p_thread_id: params.id,
  });

  if (recalcError) {
    console.error("[threads] recalc_likes_count failed:", recalcError);
    return NextResponse.json({ error: "Failed to sync likes count" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
