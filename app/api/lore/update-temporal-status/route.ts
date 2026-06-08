import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

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
  const res = new NextResponse();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const folderName = typeof body.folderName === "string" && body.folderName.trim()
    ? body.folderName.trim()
    : null;

  const { data, error } = await supabase.rpc("update_lore_temporal_status", {
    p_user_id: user.id,
    p_folder_name: folderName,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(normalizeResult(data as TemporalStatusResult | TemporalStatusResult[] | null));
}
