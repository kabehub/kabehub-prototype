import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import {
  collectOwnedStoragePaths,
  removeStoragePaths,
} from "@/lib/supabase/storage-cleanup";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", params.id)
    .eq("user_id", user.id)
    .order("message_number", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("messages fetch error:", error);
    return finalizeJson([], { status: 500 });
  }

  return finalizeJson(data ?? []);
}

// 指定メッセージ以降を全部削除
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const { fromCreatedAt } = await req.json();
  const isValidFromCreatedAt =
    typeof fromCreatedAt === "string" &&
    !Number.isNaN(Date.parse(fromCreatedAt));

  if (!isValidFromCreatedAt) {
    return finalizeJson(
      { error: "Invalid fromCreatedAt timestamp" },
      { status: 400 }
    );
  }

  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (threadError) return finalizeJson({ error: threadError }, { status: 500 });
  if (!thread) return finalizeJson({ error: "Thread not found" }, { status: 404 });

  const { data: targetMessages, error: targetError } = await supabase
    .from("messages")
    .select("id, metadata")
    .eq("thread_id", params.id)
    .eq("user_id", user.id)
    .gte("created_at", fromCreatedAt);

  if (targetError) {
    return finalizeJson({ error: targetError.message }, { status: 500 });
  }

  const targetIds = (targetMessages ?? []).map((m) => m.id);

  if (targetIds.length > 0) {
    const { error: archiveError } = await supabase
      .from("lore_embeddings")
      .update({ is_archived: true })
      .in("source_message_id", targetIds)
      .eq("user_id", user.id)
      .eq("is_pinned", false);

    if (archiveError) {
      console.warn("Failed to archive lore_embeddings for deleted messages:", archiveError.message);
    }
  }

  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("thread_id", params.id)
    .eq("user_id", user.id)
    .gte("created_at", fromCreatedAt);

  if (error) return finalizeJson({ error }, { status: 500 });

  const ownedPaths = collectOwnedStoragePaths(targetMessages ?? [], user.id);
  if (ownedPaths.length > 0) {
    const cleanup = await removeStoragePaths(supabase, ownedPaths);
    if (cleanup.failedCount > 0) {
      console.warn("[messages-range-delete] storage cleanup incomplete", {
        scope: "range",
        attemptedCount: cleanup.attemptedCount,
        failedCount: cleanup.failedCount,
      });
    }
  }

  return finalizeJson({ success: true });
}
