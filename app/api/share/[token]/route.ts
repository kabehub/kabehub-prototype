export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { serviceRoleClient } from "@/lib/mcp-auth";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { maskSecretNotation } from "@/lib/stringUtils";

export async function GET(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const adminSupabase = serviceRoleClient();

  const { data: thread, error: threadError } = await adminSupabase
    .from("threads")
    .select("id, title, is_public, created_at, updated_at, user_id, genre, shared_at")
    .eq("share_token", params.token)
    .single();

  if (threadError || !thread || !thread.is_public) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  let messagesQuery = supabase
    .from("messages")
    .select("id, role, content, provider, created_at, is_hidden")
    .eq("thread_id", thread.id)
    .eq("is_hidden", false)
    .neq("provider", "memo");

  if (thread.shared_at) {
    messagesQuery = messagesQuery.lte("created_at", thread.shared_at);
  }

  const { data: messages, error: messagesError } = await messagesQuery
    .order("created_at", { ascending: true });

  if (messagesError) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }

  return NextResponse.json({
    thread: {
      id: thread.id,
      title: thread.title,
      is_public: thread.is_public,
      created_at: thread.created_at,
      updated_at: thread.updated_at,
      user_id: thread.user_id,
      genre: thread.genre,
    },
    messages: (messages ?? []).map((message) => ({
      ...message,
      content: maskSecretNotation(message.content),
    })),
    has_secret_prompt: false,
  });
}
