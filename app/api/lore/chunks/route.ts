import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { getOwnedProject } from "@/lib/project-memory/get-owned-project";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const { searchParams } = req.nextUrl;
  const hasProjectId = searchParams.has("project_id");

  if (searchParams.has("folder_name")) {
    return finalizeJson(
      { error: "folder_name is no longer supported; use project_id" },
      { status: 400 },
    );
  }
  if (!hasProjectId) {
    return finalizeJson({ error: "project_id is required" }, { status: 400 });
  }

  const projectId = searchParams.get("project_id");
  if (!projectId) {
    return finalizeJson({ error: "project_id is required" }, { status: 400 });
  }
  const ownedProject = await getOwnedProject(supabase, user.id, projectId);
  if (!ownedProject.ok) {
    return finalizeJson(
      { error: ownedProject.error },
      { status: ownedProject.status },
    );
  }

  const { data, error } = await supabase
    .from('lore_embeddings')
    .select('id, chunk_text, created_at')
    .eq('user_id', user.id)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) return finalizeJson({ error: error.message }, { status: 500 });

  return finalizeJson({ chunks: data ?? [] });
}
