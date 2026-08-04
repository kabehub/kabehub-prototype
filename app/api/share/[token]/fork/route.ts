import { NextRequest } from "next/server";
import { serviceRoleClient } from "@/lib/mcp-auth";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { maskSecretNotation } from "@/lib/stringUtils";

export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const adminSupabase = serviceRoleClient();
  const { data: sourceThread, error: threadError } = await adminSupabase
    .from("threads")
    .select("id, title, is_public, allow_prompt_fork, system_prompt, hide_memos, shared_at")
    .eq("share_token", params.token)
    .single();

  if (threadError || !sourceThread || !sourceThread.is_public) {
    return finalizeJson({ error: "Not Found" }, { status: 404 });
  }

  let sourceMessagesQuery = supabase
    .from("messages")
    .select("role, content, provider, created_at, is_hidden")
    .eq("thread_id", sourceThread.id)
    .eq("is_hidden", false)
    .neq("provider", "memo");

  if (sourceThread.shared_at) {
    sourceMessagesQuery = sourceMessagesQuery.lte("created_at", sourceThread.shared_at);
  }

  const { data: sourceMessages, error: messagesError } = await sourceMessagesQuery
    .order("created_at", { ascending: true });

  if (messagesError) {
    return finalizeJson({ error: "Internal Server Error" }, { status: 500 });
  }

  let hiddenCountQuery = supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", sourceThread.id)
    .eq("is_hidden", true)
    .neq("provider", "memo");

  if (sourceThread.shared_at) {
    hiddenCountQuery = hiddenCountQuery.lte("created_at", sourceThread.shared_at);
  }

  const { count: hiddenCount, error: hiddenCountError } = await hiddenCountQuery;

  if (hiddenCountError) {
    return finalizeJson({ error: "Internal Server Error" }, { status: 500 });
  }

  const systemPrompt = sourceThread.allow_prompt_fork
    ? sourceThread.system_prompt ?? ""
    : "";

  const { data: newThread, error: newThreadError } = await supabase
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
    return finalizeJson({ error: "Failed to create thread" }, { status: 500 });
  }

  if ((sourceMessages ?? []).length > 0) {
    const newMessages = (sourceMessages ?? []).map((message) => {
      return {
        role: message.role,
        content: maskSecretNotation(message.content),
        provider: message.provider,
        thread_id: newThread.id,
        user_id: user.id,
        parent_id: null,
        created_at: message.created_at,
        is_hidden: false,
      };
    });

    const { error: insertError } = await supabase
      .from("messages")
      .insert(newMessages);

    if (insertError) {
      await supabase.from("threads").delete().eq("id", newThread.id);
      return finalizeJson({ error: "Failed to copy messages" }, { status: 500 });
    }
  }

  await supabase.rpc("increment_fork_count", { p_thread_id: sourceThread.id });

  return finalizeJson({
    thread: newThread,
    prompt_forked: sourceThread.allow_prompt_fork,
    hidden_count: hiddenCount ?? 0,
  });
}
