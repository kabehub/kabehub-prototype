import { NextRequest } from "next/server";
import { deleteOwnedMessage } from "@/lib/messages/delete";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string; messageId: string }> }
) {
  const params = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const result = await deleteOwnedMessage({
    supabase,
    userId: user.id,
    messageId: params.messageId,
    threadId: params.id,
  });
  if (!result.ok) {
    return finalizeJson({ error: result.error }, { status: 500 });
  }
  return finalizeJson({ success: true });
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string; messageId: string }> }
) {
  const params = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.provider === "string") updates.provider = body.provider;
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (body.branch_id !== undefined) updates.branch_id = body.branch_id;

  if (Object.keys(updates).length === 0) {
    return finalizeJson({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("messages")
    .update(updates)
    .eq("id", params.messageId)
    .eq("thread_id", params.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return finalizeJson({ error }, { status: 500 });
  return finalizeJson({ message: data });
}
