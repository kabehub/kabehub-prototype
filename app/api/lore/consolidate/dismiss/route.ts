import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { normalizePair } from "@/lib/lore/consolidation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const body = await req.json().catch(() => ({}));
  const idA = typeof body.idA === "string" ? body.idA.trim() : "";
  const idB = typeof body.idB === "string" ? body.idB.trim() : "";

  if (!idA || !idB || idA === idB) {
    return finalizeJson({ error: "idA and idB are required" }, { status: 400 });
  }

  const [loreIdA, loreIdB] = normalizePair(idA, idB);

  const { data: ownedRows, error: ownedError } = await supabase
    .from("lore_embeddings")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_archived", false)
    .is("superseded_by", null)
    .in("id", [loreIdA, loreIdB]);

  if (ownedError) return finalizeJson({ error: ownedError.message }, { status: 500 });
  if ((ownedRows ?? []).length !== 2) {
    return finalizeJson({ error: "Invalid lore pair" }, { status: 400 });
  }

  const { error } = await supabase
    .from("lore_consolidation_dismissals")
    .insert({
      user_id: user.id,
      lore_id_a: loreIdA,
      lore_id_b: loreIdB,
    });

  if (error?.code === "23505") return finalizeJson({ ok: true });
  if (error) return finalizeJson({ error: error.message }, { status: 500 });

  return finalizeJson({ ok: true });
}
