import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = new NextResponse();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { branchRootId, branchIndex } = await req.json();
  if (!branchRootId || branchIndex == null) {
    return NextResponse.json({ error: "branchRootId and branchIndex are required" }, { status: 400 });
  }

  const threadId = params.id;

  // branch_root_id が同じメッセージ群を一括切り替え
  // targetIndex の分岐を active に、それ以外を inactive に
  const { data: targets, error: fetchError } = await supabase
    .from("messages")
    .select("id, branch_root_id, branch_index")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .eq("branch_root_id", branchRootId);

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const patches = (targets ?? []).map((msg) => {
    const isTarget = msg.branch_index === branchIndex;
    return supabase
      .from("messages")
      .update({ is_active: isTarget })
      .eq("id", msg.id)
      .eq("user_id", user.id);
  });

  await Promise.all(patches);

  return NextResponse.json({ ok: true });
}
