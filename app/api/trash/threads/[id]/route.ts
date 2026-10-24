import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { purgeThread } from "@/lib/threads/purge";

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;
  const { id } = await props.params;

  const result = await purgeThread({ mode: "user", client: supabase,
    authenticatedUserId: user.id, threadId: id });
  if (result.outcome === "not_found") return finalizeJson({ error: "Not Found" }, { status: 404 });
  if (result.outcome === "error") return finalizeJson({ error: "Failed to purge thread" }, { status: 500 });
  return finalizeJson({ success: true });
}
