import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

function normalizePair(idA: string, idB: string) {
  return idA < idB ? [idA, idB] : [idB, idA];
}

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const idA = typeof body.idA === "string" ? body.idA.trim() : "";
  const idB = typeof body.idB === "string" ? body.idB.trim() : "";

  if (!idA || !idB || idA === idB) {
    return NextResponse.json({ error: "idA and idB are required" }, { status: 400 });
  }

  const [loreIdA, loreIdB] = normalizePair(idA, idB);

  const { data: ownedRows, error: ownedError } = await supabase
    .from("lore_embeddings")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_archived", false)
    .is("superseded_by", null)
    .in("id", [loreIdA, loreIdB]);

  if (ownedError) return NextResponse.json({ error: ownedError.message }, { status: 500 });
  if ((ownedRows ?? []).length !== 2) {
    return NextResponse.json({ error: "Invalid lore pair" }, { status: 400 });
  }

  const { error } = await supabase
    .from("lore_consolidation_dismissals")
    .insert({
      user_id: user.id,
      lore_id_a: loreIdA,
      lore_id_b: loreIdB,
    });

  if (error?.code === "23505") return NextResponse.json({ ok: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
