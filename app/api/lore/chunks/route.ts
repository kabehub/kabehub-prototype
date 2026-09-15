import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { resolveOwnedProjectIdByName } from "@/lib/project-memory/resolve-owned-project-id";
import { getOwnedProject } from "@/lib/project-memory/get-owned-project";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const { searchParams } = req.nextUrl;
  const hasProjectId = searchParams.has("project_id");
  const hasFolderName = searchParams.has("folder_name");

  if (hasProjectId && hasFolderName) {
    return finalizeJson(
      { error: "project_id and folder_name cannot both be specified" },
      { status: 400 },
    );
  }
  if (!hasProjectId && !hasFolderName) {
    return finalizeJson({ error: "project_id or folder_name is required" }, { status: 400 });
  }

  let projectId: string;
  if (hasProjectId) {
    const requestedProjectId = searchParams.get("project_id");
    if (!requestedProjectId) {
      return finalizeJson({ error: "project_id is required" }, { status: 400 });
    }
    const ownedProject = await getOwnedProject(supabase, user.id, requestedProjectId);
    if (!ownedProject.ok) {
      return finalizeJson(
        { error: ownedProject.error },
        { status: ownedProject.status },
      );
    }
    projectId = requestedProjectId;
  } else {
    const folderName = searchParams.get("folder_name");
    if (!folderName) {
      return finalizeJson({ error: "folder_name is required" }, { status: 400 });
    }
    const resolved = await resolveOwnedProjectIdByName(supabase, user.id, folderName);
    if (!resolved.ok) {
      return finalizeJson({ error: resolved.error }, { status: resolved.status });
    }
    if (!resolved.projectId) {
      return finalizeJson({ chunks: [] });
    }
    projectId = resolved.projectId;
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
