import { NextRequest, NextResponse } from "next/server";
import { getNotes, addNote, updateNote, deleteNote } from "@/lib/supabase-db";

// メモ一覧取得
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const notes = await getNotes(params.id);
  return NextResponse.json(notes);
}

// メモ追加
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { content } = await req.json();
  const note = await addNote(params.id, content);
  return NextResponse.json(note);
}

// メモ更新
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id, content } = await req.json();
  const note = await updateNote(id, content);
  return NextResponse.json(note);
}

// メモ削除
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = await req.json();
  await deleteNote(id);
  return NextResponse.json({ success: true });
}