import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { createThreadResourceHandlers, createThreadResourceFinalizers } from "@/lib/threadResourceCrud";

const handlers = createThreadResourceHandlers({
  table: "thread_notes",
  orderBy: { column: "created_at", ascending: true },
  addExplicitUserFilterOnGet: false,
  buildInsert: ({ threadId, userId, body }) => ({
    ok: true,
    payload: { thread_id: threadId, content: body.content, user_id: userId },
  }),
});
export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;

export async function PATCH(req: NextRequest) {
  const authResponse = new NextResponse();
  const supabase = createRouteHandlerSupabaseClient(req, authResponse);
  const { finalizeJson } = createThreadResourceFinalizers(authResponse);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return finalizeJson({ error: "Unauthorized" }, { status: 401 });

  const { id, content } = await req.json();
  const { data, error } = await supabase
    .from("thread_notes")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) return finalizeJson({ error: error.message }, { status: 500 });
  return finalizeJson(data);
}
