export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// メッセージ一覧を取得する
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", params.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// スレッドの各種フィールドを更新する
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const updateFields: Record<string, unknown> = {};  // ← string → unknown に変更

    if (typeof body.title === "string") {
      updateFields.title = body.title;
    }
    if (typeof body.system_prompt === "string") {
      updateFields.system_prompt = body.system_prompt;
    }
    if (typeof body.is_public === "boolean") {
      updateFields.is_public = body.is_public;
    }
    if (typeof body.hide_memos === "boolean") {
      updateFields.hide_memos = body.hide_memos;
    }

    // 公開ONの時だけ share_token を生成（まだ無い場合）
    if (body.is_public === true && body.needsToken === true) {
      const { data: existing } = await supabase
        .from("threads")
        .select("share_token")
        .eq("id", params.id)
        .single();

      if (!existing?.share_token) {
        updateFields.share_token = crypto.randomUUID();
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: "更新フィールドがありません" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("threads")
      .update(updateFields)
      .eq("id", params.id)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data[0]);
  } catch (err) {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }
}

// スレッドを削除する
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await supabase
    .from("threads")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}