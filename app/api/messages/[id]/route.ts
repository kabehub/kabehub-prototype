import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { isOwnedStoragePath } from "@/lib/storage-path-guard";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error: archiveError } = await supabase
    .from("lore_embeddings")
    .update({ is_archived: true })
    .eq("source_message_id", params.id)
    .eq("user_id", user.id)
    .eq("is_pinned", false);

  if (archiveError) {
    console.warn("Failed to archive lore_embeddings for deleted message:", archiveError.message);
  }

  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ success: true });
}

// ── PATCH /api/messages/[id] ─────────────────────────────────────
// content の部分更新 と is_hidden フラグの切り替えに使用
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // 画像削除アクション
  if (body.action === "delete_image") {
    const { data: existing, error: fetchError } = await supabase
      .from("messages")
      .select("metadata")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single();
    if (fetchError) return NextResponse.json({ error: fetchError }, { status: 500 });

    const storagePath = existing?.metadata?.storagePath;
    if (storagePath) {
      if (isOwnedStoragePath(storagePath, user.id)) {
        const { error: storageError } = await supabase.storage
          .from("generated-images")
          .remove([storagePath]);
        if (storageError) {
          console.error("Storage削除エラー:", JSON.stringify(storageError));
          return NextResponse.json({ error: storageError.message }, { status: 500 });
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
    if (updateError) return NextResponse.json({ error: updateError }, { status: 500 });

    return NextResponse.json({ success: true });
  }

  // 許可するフィールドのみ更新（content / is_hidden）
  const updates: Record<string, unknown> = {};
  if (typeof body.content === "string") updates.content = body.content;
  if (typeof body.is_hidden === "boolean") updates.is_hidden = body.is_hidden;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("messages")
    .update(updates)
    .eq("id", params.id)
    .eq("user_id", user.id) // 自分のメッセージのみ
    .select()
    .single();

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ message: data });
}
