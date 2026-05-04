export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  // 1. share_token でスレッドを検索
  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("id, title, is_public, hide_memos, share_token, created_at, allow_prompt_fork, system_prompt, shared_at")
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
  // ✅ v76: shared_at がある場合のみフィルター（null時は全件・後方互換）
  let messagesQuery = supabase
    .from("messages")
    .select("id, role, content, provider, created_at, is_hidden")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true });

  if (thread.shared_at) {
    messagesQuery = messagesQuery.lte("created_at", thread.shared_at);
  }

  const { data: allMessages, error: messagesError } = await messagesQuery;

  if (messagesError) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }

  // 4. hide_memos が true の場合、サーバー側でメモを除外（クライアントに渡さない）
  const messages = thread.hide_memos
    ? (allMessages ?? []).filter((m) => m.provider !== "memo")
    : (allMessages ?? []);

  const hasSecretPrompt =
    !thread.allow_prompt_fork &&
    !!(thread.system_prompt?.trim());

  return NextResponse.json({
    thread: {
      id: thread.id,
      title: thread.title,
      created_at: thread.created_at,
    },
    messages,
    has_secret_prompt: hasSecretPrompt,
  });

  
}
