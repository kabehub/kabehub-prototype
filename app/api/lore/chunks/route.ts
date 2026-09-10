import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { resolveOwnedProjectIdByName } from "@/lib/project-memory/resolve-owned-project-id";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const folderName = req.nextUrl.searchParams.get("folder_name");
  if (!folderName) return finalizeJson({ error: "folder_name is required" }, { status: 400 });

  const resolved = await resolveOwnedProjectIdByName(supabase, user.id, folderName);
  if (!resolved.ok) {
    return finalizeJson({ error: resolved.error }, { status: resolved.status });
  }
  if (!resolved.projectId) {
    return finalizeJson({ chunks: [] });
  }

  const { data, error } = await supabase
    .from('lore_embeddings')
    .select('id, chunk_text, created_at')
    .eq('user_id', user.id)
    .eq('project_id', resolved.projectId)
    .order('created_at', { ascending: true });

  if (error) return finalizeJson({ error: error.message }, { status: 500 });

  return finalizeJson({ chunks: data ?? [] });
}
