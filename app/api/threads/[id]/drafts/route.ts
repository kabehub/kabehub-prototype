import { NextRequest, NextResponse } from "next/server";
import { getDrafts, addDraft, deleteDraft } from "@/lib/supabase-db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const drafts = await getDrafts(params.id);
  return NextResponse.json(drafts);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { content } = await req.json();
  const draft = await addDraft(params.id, content);
  return NextResponse.json(draft);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = await req.json();
  await deleteDraft(id);
  return NextResponse.json({ success: true });
}