import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { BULK_ARCHIVE_MAX_ITEMS } from "@/lib/validationLimits";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const res = new Response();
  const supabase = createRouteHandlerSupabaseClient(req, res as never);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids = body.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
  }
  if (ids.length > BULK_ARCHIVE_MAX_ITEMS) {
    return NextResponse.json({ error: `ids must not exceed ${BULK_ARCHIVE_MAX_ITEMS} items` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("lore_embeddings")
    .update({ is_archived: true })
    .in("id", ids)
    .eq("user_id", user.id)
    .eq("is_pinned", false)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const archivedCount = data?.length ?? 0;
  const skippedCount = ids.length - archivedCount;

  return NextResponse.json({ archivedCount, skippedCount });
}
