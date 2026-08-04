import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const { branchRootId, branchIndex } = await req.json();
  if (!branchRootId || branchIndex == null) {
    return finalizeJson({ error: "branchRootId and branchIndex are required" }, { status: 400 });
  }

  const threadId = params.id;

  const { data: rootMessage, error: rootFetchError } = await supabase
    .from("messages")
    .select("id, message_number")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .eq("id", branchRootId)
    .single();

  if (rootFetchError) return finalizeJson({ error: rootFetchError.message }, { status: 500 });
  if (rootMessage?.message_number == null) {
    return finalizeJson({ error: "branch root message_number is missing" }, { status: 400 });
  }

  const { error: deactivateError } = await supabase
    .from("messages")
    .update({ is_active: false })
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .gte("message_number", rootMessage.message_number);

  if (deactivateError) return finalizeJson({ error: deactivateError.message }, { status: 500 });

  const { error: activateError } = await supabase
    .from("messages")
    .update({ is_active: true })
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .eq("branch_root_id", branchRootId)
    .eq("branch_index", branchIndex);

  if (activateError) return finalizeJson({ error: activateError.message }, { status: 500 });

  return finalizeJson({ ok: true });
}
