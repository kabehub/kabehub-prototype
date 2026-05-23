import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const res = new Response();
  const supabase = createRouteHandlerSupabaseClient(req, res as never);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const folderName = req.nextUrl.searchParams.get("folder_name");
  if (!folderName) return NextResponse.json({ error: "folder_name is required" }, { status: 400 });

  const { data, error } = await supabase
    .from('lore_embeddings')
    .select('id, chunk_text, created_at')
    .eq('user_id', user.id)
    .eq('folder_name', folderName)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ chunks: data ?? [] });
}
