import type { SupabaseClient } from "@supabase/supabase-js";

export function isThreadTrashedError(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "P0001" &&
    "message" in error && error.message === "thread is in trash";
}

export function threadTrashResponse() {
  return [{ error: "thread is in trash" }, { status: 409 }] as const;
}

export function mapThreadTrashRpcMessage(message: string): 404 | 409 | null {
  if (message === "thread not found") return 404;
  if (message === "trash retention expired" || message === "thread is in trash") return 409;
  return null;
}

// Never filter out trash in a write preflight: missing and trashed are different.
// Include ownership even for callers using a service-role client.
export async function getOwnedThreadTrashState(db: SupabaseClient, userId: string, threadId: string) {
  return await db.from("threads").select("id, deleted_at")
    .eq("id", threadId).eq("user_id", userId).maybeSingle();
}
