import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("thread_tags")
    .select("*")
    .eq("thread_id", params.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // バリデーション: #・半角/全角スペース除去、空文字弾く、20文字上限
  const rawName: string = body.name ?? "";
  const cleanName = rawName.replace(/^#+/, "").replace(/[\s\u3000]/g, "").slice(0, 20);
  if (!cleanName) return NextResponse.json({ error: "タグ名が空です" }, { status: 400 });
  if (cleanName.length > 20) return NextResponse.json({ error: "タグ名は20文字以内にしてください" }, { status: 400 });

  // 重複チェック: 同スレッドに同名タグが既にあれば何もせず200で返す
  const { data: existing } = await supabase
    .from("thread_tags")
    .select("id")
    .eq("thread_id", params.id)
    .eq("name", cleanName)
    .maybeSingle();

  if (existing) return NextResponse.json({ duplicate: true }, { status: 200 });

  const { data, error } = await supabase
    .from("thread_tags")
    .insert({ thread_id: params.id, name: cleanName, user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { tagId } = body;

  const { error } = await supabase
    .from("thread_tags")
    .delete()
    .eq("id", tagId)
    .eq("thread_id", params.id); // 他スレッドのタグを削除できないよう念押し

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
