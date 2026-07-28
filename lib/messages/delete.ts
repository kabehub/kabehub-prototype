import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwnedStoragePath } from "@/lib/storage-path-guard";
import { removeStoragePaths } from "@/lib/supabase/storage-cleanup";

type DeleteOwnedMessageResult =
  | { ok: true }
  | { ok: false; error: unknown };

export async function deleteOwnedMessage({
  supabase,
  userId,
  messageId,
  threadId,
}: {
  supabase: SupabaseClient;
  userId: string;
  messageId: string;
  threadId?: string;
}): Promise<DeleteOwnedMessageResult> {
  const isThreadScoped = threadId !== undefined;

  let selectQuery = supabase
    .from("messages")
    .select("metadata")
    .eq("id", messageId)
    .eq("user_id", userId);
  if (isThreadScoped) selectQuery = selectQuery.eq("thread_id", threadId);
  const { data: existing, error: selectError } =
    await selectQuery.maybeSingle();

  if (selectError) {
    return { ok: false, error: selectError.message };
  }

  if (isThreadScoped && !existing) {
    return { ok: true };
  }

  let archiveQuery = supabase
    .from("lore_embeddings")
    .update({ is_archived: true })
    .eq("source_message_id", messageId)
    .eq("user_id", userId)
    .eq("is_pinned", false);
  if (isThreadScoped) {
    archiveQuery = archiveQuery.eq("source_thread_id", threadId);
  }
  const { error: archiveError } = await archiveQuery;
  if (archiveError) {
    console.warn(
      "Failed to archive lore_embeddings for deleted message:",
      archiveError.message
    );
  }

  let deleteQuery = supabase
    .from("messages")
    .delete()
    .eq("id", messageId)
    .eq("user_id", userId);
  if (isThreadScoped) deleteQuery = deleteQuery.eq("thread_id", threadId);
  const { error: deleteError } = await deleteQuery;

  if (deleteError) {
    return { ok: false, error: deleteError };
  }

  const storagePath = (
    existing as { metadata?: { storagePath?: string } } | null
  )?.metadata?.storagePath;
  if (isOwnedStoragePath(storagePath, userId)) {
    const cleanup = await removeStoragePaths(supabase, [storagePath]);
    if (cleanup.failedCount > 0) {
      const logPrefix = isThreadScoped
        ? "[thread-message-delete]"
        : "[messages-delete]";
      console.warn(`${logPrefix} storage cleanup incomplete`, {
        scope: "message",
        attemptedCount: cleanup.attemptedCount,
        failedCount: cleanup.failedCount,
      });
    }
  }

  return { ok: true };
}
