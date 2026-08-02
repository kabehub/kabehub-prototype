import { NextRequest } from "next/server";
import { deleteOwnedMessage } from "@/lib/messages/delete";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { isOwnedStoragePath } from "@/lib/storage-path-guard";

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const result = await deleteOwnedMessage({
    supabase,
    userId: user.id,
    messageId: params.id,
  });
  if (!result.ok) {
    return finalizeJson({ error: result.error }, { status: 500 });
  }
  return finalizeJson({ success: true });
}

// ── PATCH /api/messages/[id] ─────────────────────────────────────
// content の部分更新 と is_hidden フラグの切り替えに使用
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const body = await req.json();

  // 画像削除アクション
  if (body.action === "delete_image") {
    const { data: existing, error: fetchError } = await supabase
      .from("messages")
      .select("metadata")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single();
    if (fetchError) return finalizeJson({ error: fetchError }, { status: 500 });

    const storagePath = existing?.metadata?.storagePath;
    if (storagePath) {
      if (isOwnedStoragePath(storagePath, user.id)) {
        const { error: storageError } = await supabase.storage
          .from("generated-images")
          .remove([storagePath]);
        if (storageError) {
          console.error("Storage削除エラー:", JSON.stringify(storageError));
          return finalizeJson({ error: storageError.message }, { status: 500 });
        }
      } else {
        console.warn("[delete_image] storagePath is outside user namespace; skipped storage.remove", {
          messageId: params.id,
          userId: user.id,
        });
      }
    }

    const newMetadata = { ...(existing?.metadata ?? {}), storagePath: null, image_deleted: true };
    const { error: updateError } = await supabase
      .from("messages")
      .update({ metadata: newMetadata })
      .eq("id", params.id)
      .eq("user_id", user.id);
    if (updateError) return finalizeJson({ error: updateError }, { status: 500 });

    return finalizeJson({ success: true });
  }

  // 許可するフィールドのみ更新（content / is_hidden）
  const updates: Record<string, unknown> = {};
  if (typeof body.content === "string") updates.content = body.content;
  if (typeof body.is_hidden === "boolean") updates.is_hidden = body.is_hidden;

  if (Object.keys(updates).length === 0) {
    return finalizeJson({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("messages")
    .update(updates)
    .eq("id", params.id)
    .eq("user_id", user.id) // 自分のメッセージのみ
    .select()
    .single();

  if (error) return finalizeJson({ error }, { status: 500 });
  return finalizeJson({ message: data });
}
