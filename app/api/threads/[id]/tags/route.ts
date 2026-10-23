import { getOwnedThreadTrashState, isThreadTrashedError, threadTrashResponse } from "@/lib/threads/trash-errors";
import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { TAG_NAME_MAX_LENGTH, normalizeTagName } from "@/lib/validationLimits";
import * as logger from "@/lib/logger";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("id")
    .eq("id", params.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (threadError) return finalizeJson({ error: threadError.message }, { status: 500 });
  if (!thread) {
    // Raw threads RLS is owner-only; preserve reads of other users' public tags.
    const { data: publicThread, error: publicError } = await supabase
      .from("public_threads_view")
      .select("id")
      .eq("id", params.id)
      .maybeSingle();
    if (publicError) return finalizeJson({ error: publicError.message }, { status: 500 });
    if (!publicThread) return finalizeJson([]);
  }

  const { data, error } = await supabase
    .from("thread_tags")
    .select("*")
    .eq("thread_id", params.id)
    .order("created_at", { ascending: true });

  if (error) return finalizeJson({ error: error.message }, { status: 500 });
  return finalizeJson(data);
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const body = await req.json();

  // バリデーション: #・半角/全角スペース除去、空文字弾く、20文字上限
  const rawName = typeof body.name === "string" ? body.name : "";
  const cleanName = normalizeTagName(rawName);
  if (!cleanName) return finalizeJson({ error: "タグ名が空です" }, { status: 400 });
  if (cleanName.length > TAG_NAME_MAX_LENGTH) return finalizeJson({ error: `タグ名は${TAG_NAME_MAX_LENGTH}文字以内にしてください` }, { status: 400 });

  const { data: writeThread, error: writeThreadError } = await getOwnedThreadTrashState(supabase, user.id, params.id);
  if (writeThreadError) return finalizeJson({ error: writeThreadError.message }, { status: 500 });
  if (writeThread?.deleted_at) return finalizeJson(...threadTrashResponse());

  // 重複チェック: 同スレッドに同名タグが既にあれば何もせず200で返す
  const { data: existing, error: existingError } = await supabase
    .from("thread_tags")
    .select("id")
    .eq("thread_id", params.id)
    .eq("name", cleanName)
    .maybeSingle();

  if (existingError) {
    logger.dbOperationFailed({
      route: "threads_id_tags_post",
      operation: "check_duplicate_tag",
      table: "thread_tags",
      errorCode: existingError.code,
    });
    return finalizeJson({ error: existingError.message }, { status: 500 });
  }
  if (existing) return finalizeJson({ duplicate: true }, { status: 200 });

  const { data, error } = await supabase
    .from("thread_tags")
    .insert({ thread_id: params.id, name: cleanName, user_id: user.id })
    .select()
    .single();

  if (writeThread && isThreadTrashedError(error)) return finalizeJson(...threadTrashResponse());
  if (error) return finalizeJson({ error: error.message }, { status: 500 });
  return finalizeJson(data);
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const body = await req.json();
  const { tagId } = body;

  const { data: writeThread, error: writeThreadError } = await getOwnedThreadTrashState(supabase, user.id, params.id);
  if (writeThreadError) return finalizeJson({ error: writeThreadError.message }, { status: 500 });
  if (writeThread?.deleted_at) return finalizeJson(...threadTrashResponse());


  const { error } = await supabase
    .from("thread_tags")
    .delete()
    .eq("id", tagId)
    .eq("thread_id", params.id); // 他スレッドのタグを削除できないよう念押し

  if (error) return finalizeJson({ error: error.message }, { status: 500 });
  return finalizeJson({ success: true });
}
