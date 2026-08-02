import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import {
  collectOwnedStoragePaths,
  removeStoragePaths,
} from "@/lib/supabase/storage-cleanup";
import { v4 as uuidv4 } from "uuid";

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const { data: thread } = await supabase
    .from("threads")
    .select("id, forked_from_id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!thread) return finalizeJson({ error: "Not Found" }, { status: 404 });
  const forkedFromId = thread.forked_from_id;

  const { data: threadMessages, error: msgSelectError } = await supabase
    .from("messages")
    .select("id, metadata")
    .eq("thread_id", params.id)
    .eq("user_id", user.id);

  if (msgSelectError) {
    return finalizeJson({ error: msgSelectError.message }, { status: 500 });
  }

  const { error: archiveError } = await supabase
    .from("lore_embeddings")
    .update({ is_archived: true })
    .eq("source_thread_id", params.id)
    .eq("user_id", user.id)
    .eq("is_pinned", false);

  if (archiveError) {
    console.warn("Failed to archive lore_embeddings for deleted thread:", archiveError.message);
  }

  const { error: deleteError } = await supabase
    .from("threads")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (deleteError) {
    return finalizeJson({ error: deleteError.message }, { status: 500 });
  }

  const ownedPaths = collectOwnedStoragePaths(threadMessages ?? [], user.id);
  if (ownedPaths.length > 0) {
    const cleanup = await removeStoragePaths(supabase, ownedPaths);
    if (cleanup.failedCount > 0) {
      console.warn("[threads-delete] storage cleanup incomplete", {
        scope: "thread",
        attemptedCount: cleanup.attemptedCount,
        failedCount: cleanup.failedCount,
      });
    }
  }

  if (forkedFromId) {
    const { error: recalcForkError } = await supabase.rpc("recalc_fork_count", {
      p_thread_id: forkedFromId,
    });

    if (recalcForkError) {
      console.warn("[threads] recalc_fork_count failed:", recalcForkError);
    }
  }

  return finalizeJson({ success: true });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) updates.title = body.title;
  if (body.system_prompt !== undefined) updates.system_prompt = body.system_prompt;
  if (body.is_public !== undefined) updates.is_public = body.is_public;
  if (body.hide_memos !== undefined) updates.hide_memos = body.hide_memos;
  if (body.allow_prompt_fork !== undefined) updates.allow_prompt_fork = body.allow_prompt_fork;
  if (body.folder_name !== undefined) updates.folder_name = body.folder_name;
  if (body.share_token !== undefined) updates.share_token = body.share_token;
  if (body.metadata !== undefined) updates.metadata = body.metadata;
  if (body.genre !== undefined) updates.genre = body.genre;
  // ✅ v63追加: なりきりモード
  if (body.roleplay_mode !== undefined) updates.roleplay_mode = body.roleplay_mode;
  if (body.rp_char_name !== undefined) updates.rp_char_name = body.rp_char_name;
  if (body.rp_char_icon_url !== undefined) updates.rp_char_icon_url = body.rp_char_icon_url;
  // ✅ v76: スナップショット型共有のPush時刻
  if (body.shared_at !== undefined) updates.shared_at = body.shared_at;

  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("id, share_token")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (threadError) {
    return finalizeJson({ error: threadError.message }, { status: 500 });
  }

  if (body.needsToken && body.is_public) {
    if (!thread?.share_token) {
      updates.share_token = uuidv4();
    }
  }

  const { data, error } = await supabase
    .from("threads")
    .upsert({
      id: params.id,
      user_id: user.id,
      ...updates,
    })
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return finalizeJson({ error: error.message }, { status: 500 });
  return finalizeJson(data);
}
