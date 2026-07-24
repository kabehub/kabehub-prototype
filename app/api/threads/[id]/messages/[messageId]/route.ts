import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { isOwnedStoragePath } from "@/lib/storage-path-guard";
import { removeStoragePaths } from "@/lib/supabase/storage-cleanup";

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string; messageId: string }> }
) {
  const params = await props.params;
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing, error: selectError } = await supabase
    .from("messages")
    .select("metadata")
    .eq("id", params.messageId)
    .eq("thread_id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const { error: archiveError } = await supabase
    .from("lore_embeddings")
    .update({ is_archived: true })
    .eq("source_message_id", params.messageId)
    .eq("user_id", user.id)
    .eq("is_pinned", false);

  if (archiveError) {
    console.warn("Failed to archive lore_embeddings for deleted message:", archiveError.message);
  }

  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("id", params.messageId)
    .eq("thread_id", params.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error }, { status: 500 });

  const storagePath = existing?.metadata?.storagePath;
  if (isOwnedStoragePath(storagePath, user.id)) {
    const cleanup = await removeStoragePaths(supabase, [storagePath]);
    if (cleanup.failedCount > 0) {
      console.warn("[thread-message-delete] storage cleanup incomplete", {
        scope: "message",
        attemptedCount: cleanup.attemptedCount,
        failedCount: cleanup.failedCount,
      });
    }
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string; messageId: string }> }
) {
  const params = await props.params;
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.provider === "string") updates.provider = body.provider;
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (body.branch_id !== undefined) updates.branch_id = body.branch_id;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("messages")
    .update(updates)
    .eq("id", params.messageId)
    .eq("thread_id", params.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ message: data });
}
