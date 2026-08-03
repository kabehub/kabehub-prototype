import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { createThreadResourceHandlers } from "@/lib/threadResourceCrud";

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
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

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
