import { NextRequest, NextResponse } from "next/server";
import { getMessageNotes, addMessageNote, deleteMessageNote } from "@/lib/supabase-db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const notes = await getMessageNotes(params.id);
  return NextResponse.json(notes);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { messageId, content } = await req.json();
  const note = await addMessageNote(messageId, params.id, content);
  return NextResponse.json(note);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = await req.json();
  await deleteMessageNote(id);
  return NextResponse.json({ success: true });
}