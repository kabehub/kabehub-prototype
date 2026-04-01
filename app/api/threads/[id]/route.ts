import { NextRequest, NextResponse } from "next/server";
import { getDrafts, addDraft, deleteDraft } from "@/lib/supabase-db";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const drafts = await getDrafts(params.id);
  return NextResponse.json(drafts);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { content } = await req.json();
  const draft = await addDraft(params.id, content, user.id);
  return NextResponse.json(draft);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await deleteDraft(id);
  return NextResponse.json({ success: true });
}