import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const { error } = await supabase
    .from('lore_embeddings')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id);

  if (error) return finalizeJson({ error: error.message }, { status: 500 });

  return finalizeJson({ ok: true });
}
