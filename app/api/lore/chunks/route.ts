import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const folderName = req.nextUrl.searchParams.get("folder_name");
  if (!folderName) return finalizeJson({ error: "folder_name is required" }, { status: 400 });

  const { data, error } = await supabase
    .from('lore_embeddings')
    .select('id, chunk_text, created_at')
    .eq('user_id', user.id)
    .eq('folder_name', folderName)
    .order('created_at', { ascending: true });

  if (error) return finalizeJson({ error: error.message }, { status: 500 });

  return finalizeJson({ chunks: data ?? [] });
}
