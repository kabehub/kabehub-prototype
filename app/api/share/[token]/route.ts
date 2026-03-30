export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  // 1. share_token でスレッドを検索
  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("id, title, is_public, hide_memos, share_token, created_at")
    .eq("share_token", params.token)
    .single();

  if (threadError || !thread) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  // 2. is_public が false なら即 404（非公開スレッドは存在を教えない）
  if (!thread.is_public) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  // 3. メッセージを取得
  const { data: allMessages, error: messagesError } = await supabase
    .from("messages")
    .select("id, role, content, provider, created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true });

  if (messagesError) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }

  // 4. hide_memos が true の場合、サーバー側でメモを除外（クライアントに渡さない）
  const messages = thread.hide_memos
    ? (allMessages ?? []).filter((m) => m.provider !== "memo")
    : (allMessages ?? []);

  return NextResponse.json({
    thread: {
      id: thread.id,
      title: thread.title,
      created_at: thread.created_at,
    },
    messages,
  });
}
