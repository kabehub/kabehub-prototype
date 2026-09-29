import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { parsePromotionMetadata } from "@/lib/lore/promotion-provenance";
import type { LorePromotionProvenance } from "@/lib/lore/promotion-provenance";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const { data, error } = await supabase.from("lore_embeddings")
    .select("id, metadata")
    .eq("user_id", user.id)
    .eq("source_type", "project_memory_promotion")
    .is("superseded_by", null)
    .order("created_at", { ascending: false });
  if (error) return finalizeJson({ error: error.message }, { status: 500 });

  const valid = (data ?? []).flatMap((row) => {
    const metadata = parsePromotionMetadata(row.metadata);
    return metadata ? [{ lore_id: row.id, ...metadata }] : [];
  });
  if (valid.length === 0) return finalizeJson({ promotions: [] });

  const projectIds = [...new Set(valid.map((row) => row.source_project_id))];
  const { data: projects, error: projectsError } = await supabase.from("projects")
    .select("id, name")
    .eq("user_id", user.id)
    .in("id", projectIds);
  if (projectsError) return finalizeJson({ error: projectsError.message }, { status: 500 });

  const names = new Map((projects ?? []).map((project) => [project.id, project.name]));
  const promotions: LorePromotionProvenance[] = valid.map((row) => ({
    ...row,
    project_name: names.get(row.source_project_id) ?? null,
  }));
  return finalizeJson({ promotions });
}
