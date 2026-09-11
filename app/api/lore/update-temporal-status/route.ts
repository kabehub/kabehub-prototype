import { NextRequest } from "next/server";
import { resolveOwnedProjectIdByName } from "@/lib/project-memory/resolve-owned-project-id";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export const dynamic = "force-dynamic";

type TemporalStatusResult = {
  pastCount?: number;
  expiredCount?: number;
  total?: number;
  past_count?: number;
  expired_count?: number;
};

function toCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeResult(data: TemporalStatusResult | TemporalStatusResult[] | null) {
  const result = Array.isArray(data) ? data[0] : data;
  const pastCount = toCount(result?.pastCount ?? result?.past_count);
  const expiredCount = toCount(result?.expiredCount ?? result?.expired_count);
  const total = toCount(result?.total ?? pastCount + expiredCount);

  return { pastCount, expiredCount, total };
}

export async function POST(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const body = await req.json().catch(() => ({}));
  const folderName = typeof body.folderName === "string" && body.folderName.trim()
    ? body.folderName.trim()
    : null;

  let projectId: string | null = null;
  if (folderName) {
    const resolved = await resolveOwnedProjectIdByName(supabase, user.id, folderName);
    if (!resolved.ok) {
      return finalizeJson({ error: resolved.error }, { status: resolved.status });
    }
    if (resolved.projectId === null) {
      return finalizeJson({ pastCount: 0, expiredCount: 0, total: 0 });
    }
    projectId = resolved.projectId;
  }

  const { data, error } = await supabase.rpc("update_lore_temporal_status_by_project", {
    p_user_id: user.id,
    p_project_id: projectId,
  });

  if (error) {
    return finalizeJson({ error: error.message }, { status: 500 });
  }

  return finalizeJson(normalizeResult(data as TemporalStatusResult | TemporalStatusResult[] | null));
}
