import { NextRequest, NextResponse } from "next/server";
import { serviceRoleClient } from "@/lib/mcp-auth";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const authSupabase = createRouteHandlerSupabaseClient(req, new NextResponse());
  const {
    data: { user },
    error: authError,
  } = await authSupabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminSupabase = serviceRoleClient();
  const { data: sourceThread, error: threadError } = await adminSupabase
    .from("threads")
    .select("id, title, is_public, allow_prompt_fork, system_prompt")
    .eq("share_token", params.token)
    .single();

  if (threadError || !sourceThread || !sourceThread.is_public) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const { data: sourceMessages, error: messagesError } = await authSupabase
    .from("messages")
    .select("role, content, provider, created_at, is_hidden")
    .eq("thread_id", sourceThread.id)
    .order("created_at", { ascending: true });

  if (messagesError) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }

  const systemPrompt = sourceThread.allow_prompt_fork
    ? sourceThread.system_prompt ?? ""
    : "";

  const { data: newThread, error: newThreadError } = await authSupabase
    .from("threads")
    .insert({
      title: `Fork of ${sourceThread.title}`,
      user_id: user.id,
      system_prompt: systemPrompt,
      forked_from_id: sourceThread.id,
    })
    .select()
    .single();

  if (newThreadError || !newThread) {
    return NextResponse.json({ error: "Failed to create thread" }, { status: 500 });
  }

  let hiddenCount = 0;

  if ((sourceMessages ?? []).length > 0) {
    const newMessages = (sourceMessages ?? []).map((message) => {
      let content = message.content.replace(/\[\[(.*?)\]\]/gs, "[redacted]");

      if (message.is_hidden) {
        content = "[This message was hidden in the shared thread]";
        hiddenCount++;
      }

      return {
        role: message.role,
        content,
        provider: message.provider,
        thread_id: newThread.id,
        user_id: user.id,
        parent_id: null,
        created_at: message.created_at,
        is_hidden: false,
      };
    });

    const { error: insertError } = await authSupabase
      .from("messages")
      .insert(newMessages);

    if (insertError) {
      await authSupabase.from("threads").delete().eq("id", newThread.id);
      return NextResponse.json({ error: "Failed to copy messages" }, { status: 500 });
    }
  }

  await authSupabase.rpc("increment_fork_count", { p_thread_id: sourceThread.id });

  return NextResponse.json({
    thread: newThread,
    prompt_forked: sourceThread.allow_prompt_fork,
    hidden_count: hiddenCount,
  });
}
