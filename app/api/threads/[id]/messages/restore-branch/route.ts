import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const { branchRootId, branchIndex } = await req.json();
  if (
    typeof branchRootId !== "string" ||
    !branchRootId ||
    !Number.isInteger(branchIndex) ||
    branchIndex < 0
  ) {
    return finalizeJson(
      { error: "branchRootId and a non-negative integer branchIndex are required" },
      { status: 400 },
    );
  }

  const threadId = params.id;

  const { error } = await supabase.rpc("restore_message_branch", {
    p_user_id: user.id,
    p_thread_id: threadId,
    p_branch_root_id: branchRootId,
    p_branch_index: branchIndex,
  });

  if (error) {
    logger.dbOperationFailed({
      route: "threads-messages-restore-branch",
      operation: "restore_message_branch",
      table: "messages",
      errorCode: error.code,
    });

    if (error.code === "42501") {
      return finalizeJson({ error: "Forbidden" }, { status: 403 });
    }
    if (error.code === "P0001") {
      return finalizeJson({ error: "Invalid branch restore request" }, { status: 400 });
    }
    return finalizeJson({ error: "Failed to restore branch" }, { status: 500 });
  }

  return finalizeJson({ ok: true });
}
