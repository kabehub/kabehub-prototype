import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { mapThreadTrashRpcError } from "@/lib/threads/trash-errors";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const { data, error } = await supabase.rpc("list_trashed_threads", { p_user_id: user.id });
  if (error) {
    logger.dbOperationFailed({ route: "trash_threads", operation: "list_trashed_threads",
      table: "threads", errorCode: error.code });
    const mapped = mapThreadTrashRpcError(error);
    return finalizeJson({ error: mapped.error }, { status: mapped.status });
  }
  return finalizeJson((data ?? []).map(({ id, title, deleted_at, expires_at, is_public, project_id }: {
    id: string; title: string; deleted_at: string; expires_at: string; is_public: boolean; project_id: string | null;
  }) => ({ id, title, deleted_at, expires_at, is_public, project_id })));
}
