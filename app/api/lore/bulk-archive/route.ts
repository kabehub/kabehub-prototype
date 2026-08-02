import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { BULK_ARCHIVE_MAX_ITEMS } from "@/lib/validationLimits";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const body = await req.json().catch(() => ({}));
  const ids = body.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return finalizeJson({ error: "ids must be a non-empty array" }, { status: 400 });
  }
  if (ids.length > BULK_ARCHIVE_MAX_ITEMS) {
    return finalizeJson({ error: `ids must not exceed ${BULK_ARCHIVE_MAX_ITEMS} items` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("lore_embeddings")
    .update({ is_archived: true })
    .in("id", ids)
    .eq("user_id", user.id)
    .eq("is_pinned", false)
    .select("id");

  if (error) return finalizeJson({ error: error.message }, { status: 500 });

  const archivedCount = data?.length ?? 0;
  const skippedCount = ids.length - archivedCount;

  return finalizeJson({ archivedCount, skippedCount });
}
