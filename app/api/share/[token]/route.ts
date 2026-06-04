export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { serviceRoleClient } from "@/lib/mcp-auth";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const adminSupabase = serviceRoleClient();

  const { data: thread, error: threadError } = await adminSupabase
    .from("threads")
    .select("id, title, is_public, created_at, updated_at, user_id, genre")
    .eq("share_token", params.token)
    .single();

  if (threadError || !thread || !thread.is_public) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("id, role, content, provider, created_at, is_hidden")
    .eq("thread_id", thread.id)
    .eq("is_hidden", false)
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
    messages: messages ?? [],
    has_secret_prompt: false,
  });
}
