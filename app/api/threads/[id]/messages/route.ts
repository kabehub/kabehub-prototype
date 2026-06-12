import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", params.id)
    .order("message_number", { ascending: true, nullsFirst: false })
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
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fromCreatedAt } = await req.json();
  const isValidFromCreatedAt =
    typeof fromCreatedAt === "string" &&
    !Number.isNaN(Date.parse(fromCreatedAt));

  if (!isValidFromCreatedAt) {
    return NextResponse.json(
      { error: "Invalid fromCreatedAt timestamp" },
      { status: 400 }
    );
  }

  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (threadError) return NextResponse.json({ error: threadError }, { status: 500 });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const { data: targetMessages } = await supabase
    .from("messages")
    .select("id")
    .eq("thread_id", params.id)
    .eq("user_id", user.id)
    .gte("created_at", fromCreatedAt);

  const targetIds = (targetMessages ?? []).map((m) => m.id);

  if (targetIds.length > 0) {
    const { error: archiveError } = await supabase
      .from("lore_embeddings")
      .update({ is_archived: true })
      .in("source_message_id", targetIds)
      .eq("user_id", user.id)
      .eq("is_pinned", false);

    if (archiveError) {
      console.warn("Failed to archive lore_embeddings for deleted messages:", archiveError.message);
    }
  }

  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("thread_id", params.id)
    .eq("user_id", user.id)
    .gte("created_at", fromCreatedAt);

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ success: true });
}
