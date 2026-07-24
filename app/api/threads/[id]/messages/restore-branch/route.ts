import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const res = new NextResponse();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { branchRootId, branchIndex } = await req.json();
  if (!branchRootId || branchIndex == null) {
    return NextResponse.json({ error: "branchRootId and branchIndex are required" }, { status: 400 });
  }

  const threadId = params.id;

  const { data: rootMessage, error: rootFetchError } = await supabase
    .from("messages")
    .select("id, message_number")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .eq("id", branchRootId)
    .single();

  if (rootFetchError) return NextResponse.json({ error: rootFetchError.message }, { status: 500 });
  if (rootMessage?.message_number == null) {
    return NextResponse.json({ error: "branch root message_number is missing" }, { status: 400 });
  }

  const { error: deactivateError } = await supabase
    .from("messages")
    .update({ is_active: false })
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .gte("message_number", rootMessage.message_number);

  if (deactivateError) return NextResponse.json({ error: deactivateError.message }, { status: 500 });

  const { error: activateError } = await supabase
    .from("messages")
    .update({ is_active: true })
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .eq("branch_root_id", branchRootId)
    .eq("branch_index", branchIndex);

  if (activateError) return NextResponse.json({ error: activateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
