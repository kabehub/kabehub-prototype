import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { mapThreadTrashRpcError } from "@/lib/threads/trash-errors";
import * as logger from "@/lib/logger";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;
  const { id } = await props.params;

  // Read before the RPC, including live rows. No fallible read after a successful restore.
  const { data: thread, error: lookupError } = await supabase.from("threads")
    .select("is_public, deleted_at").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (lookupError) {
    logger.dbOperationFailed({ route: "trash_threads_restore", operation: "verify_thread_ownership",
      table: "threads", errorCode: lookupError.code });
    return finalizeJson({ error: "Failed to verify thread" }, { status: 500 });
  }
  if (!thread) return finalizeJson({ error: "Not Found" }, { status: 404 });

  const { error } = await supabase.rpc("restore_thread", { p_user_id: user.id, p_thread_id: id });
  if (error) {
    logger.dbOperationFailed({ route: "trash_threads_restore", operation: "restore_thread",
      table: "threads", errorCode: error.code });
    const mapped = mapThreadTrashRpcError(error);
    return finalizeJson({ error: mapped.error }, { status: mapped.status });
  }
  return finalizeJson({ success: true, is_public: thread.is_public });
}
