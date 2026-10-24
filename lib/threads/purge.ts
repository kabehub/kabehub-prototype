import type { SupabaseClient } from "@supabase/supabase-js";
import { collectOwnedStoragePaths, removeStoragePaths, type StorageCleanupResult } from "@/lib/supabase/storage-cleanup";
import * as logger from "@/lib/logger";

// Callers supply credentials from authentication, never from request JSON.
// User mode has no service client; cron mode has no caller-supplied owner ID.
export type PurgeThreadInput =
  | { mode: "user"; client: SupabaseClient; authenticatedUserId: string; threadId: string }
  | { mode: "cron"; serviceClient: SupabaseClient; threadId: string };
export type PurgeThreadResult = {
  outcome: "deleted" | "not_found" | "error";
  storage: StorageCleanupResult;
  errorCode?: string;
};

export async function purgeThread(input: PurgeThreadInput): Promise<PurgeThreadResult> {
  const storage: StorageCleanupResult = { attemptedCount: 0, succeededCount: 0, failedCount: 0, errorCodes: [] };
  const db = input.mode === "user" ? input.client : input.serviceClient;
  const fail = (operation: string, table: string, code?: string): PurgeThreadResult => {
    logger.dbOperationFailed({ route: "thread-purge", operation, table, errorCode: code });
    return { outcome: "error", storage, errorCode: code ?? "unknown" };
  };
  let operation = "lookup_owner";
  let table = "threads";
  try {
    let userId: string;
    if (input.mode === "cron") {
      const { data: thread, error } = await input.serviceClient.from("threads")
        .select("user_id").eq("id", input.threadId).maybeSingle();
      if (error) return fail(operation, table, error.code);
      if (!thread) return { outcome: "not_found", storage };
      userId = thread.user_id;
    } else {
      userId = input.authenticatedUserId;
    }

    // Collect before CASCADE, and abort on ANY failed page. Deduplicate paths
    // across pages using the existing ownership-aware Storage helper.
    operation = "collect_paths";
    table = "messages";
    const paths = new Set<string>();
    const pageSize = 500;
    for (let offset = 0; ;) {
      const { data, error } = await db.from("messages").select("id, metadata")
        .eq("thread_id", input.threadId).eq("user_id", userId)
        .order("id").range(offset, offset + pageSize - 1);
      if (error) return fail(operation, table, error.code);
      if (!data?.length) break;
      for (const path of collectOwnedStoragePaths(data, userId)) paths.add(path);
      // PostgREST may cap results below pageSize. Only an empty page is final.
      offset += data.length;
    }

    operation = "delete_thread";
    table = "threads";
    let deleted: boolean;
    if (input.mode === "user") {
      const { data, error } = await input.client.from("threads").delete()
        .eq("id", input.threadId).eq("user_id", input.authenticatedUserId)
        .not("deleted_at", "is", null).select("id");
      if (error) return fail(operation, table, error.code);
      deleted = (data?.length ?? 0) > 0;
    } else {
      const { data, error } = await input.serviceClient.rpc("purge_expired_thread", { p_thread_id: input.threadId });
      if (error) return fail(operation, table, error.code);
      if (typeof data !== "boolean") return fail(operation, table, "INVALID_RPC_RESULT");
      deleted = data;
    }
    if (!deleted) return { outcome: "not_found", storage };

    // Storage failure never changes a successful DB deletion into an error.
    let cleanup = storage;
    try {
      cleanup = paths.size ? await removeStoragePaths(db, [...paths]) : storage;
    } catch (error) {
      cleanup = { attemptedCount: paths.size, succeededCount: 0, failedCount: paths.size,
        errorCodes: [error instanceof Error ? error.name : "unknown"] };
    }
    if (cleanup.failedCount > 0) {
      for (const errorCode of new Set(cleanup.errorCodes.length ? cleanup.errorCodes : ["unknown"])) {
        logger.dbOperationFailedBestEffort({ route: "thread-purge", operation: "remove_owned_storage_paths",
          table: "generated-images", errorCode });
      }
    }
    console.info("[thread-purge]", { mode: input.mode, outcome: "deleted",
      attemptedCount: cleanup.attemptedCount, failedCount: cleanup.failedCount });
    return { outcome: "deleted", storage: cleanup };
  } catch (error) {
    return fail(operation, table, error instanceof Error ? error.name : "unknown");
  }
}
