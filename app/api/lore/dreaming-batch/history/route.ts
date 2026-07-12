import { NextRequest, NextResponse } from "next/server";
import { LORE_MEMORY_SELECT } from "@/lib/loreMemorySelect";
import { clamp } from "@/lib/lore/mappers";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

type DreamingHistoryRow = {
  id: string;
  superseded_by?: string | null;
  [key: string]: unknown;
};

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawLimit = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = clamp(Number.isFinite(rawLimit) ? rawLimit : 20, 1, 20);
  const folderName = req.nextUrl.searchParams.get("folderName")?.trim() || null;

  let newRecordsQuery = supabase
    .from("lore_embeddings")
    .select(LORE_MEMORY_SELECT)
    .eq("user_id", user.id)
    .eq("extraction_version", "dreaming_batch")
    .eq("source_type", "consolidation")
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (folderName) {
    newRecordsQuery = newRecordsQuery.eq("folder_name", folderName);
  }

  const { data: newRecords, error: newRecordsError } = await newRecordsQuery;
  if (newRecordsError) return NextResponse.json({ error: newRecordsError.message }, { status: 500 });

  const typedNewRecords = (newRecords ?? []) as unknown as DreamingHistoryRow[];
  const newIds = typedNewRecords
    .map((record) => record.id)
    .filter((id): id is string => typeof id === "string");

  if (newIds.length === 0) {
    return NextResponse.json({ history: [] });
  }

  const { data: sourceRecords, error: sourceRecordsError } = await supabase
    .from("lore_embeddings")
    .select(LORE_MEMORY_SELECT + ", superseded_by")
    .eq("user_id", user.id)
    .in("superseded_by", newIds);

  if (sourceRecordsError) {
    return NextResponse.json({ error: sourceRecordsError.message }, { status: 500 });
  }

  const typedSourceRecords = (sourceRecords ?? []) as unknown as DreamingHistoryRow[];
  const sourcesByNewId = new Map<string, DreamingHistoryRow[]>();
  for (const source of typedSourceRecords) {
    const supersededBy = source.superseded_by;
    if (typeof supersededBy !== "string") continue;
    sourcesByNewId.set(supersededBy, [...(sourcesByNewId.get(supersededBy) ?? []), source]);
  }

  return NextResponse.json({
    history: typedNewRecords.map((newRecord) => ({
      newRecord,
      sources: (sourcesByNewId.get(newRecord.id) ?? []).map(({ superseded_by: _supersededBy, ...source }) => source),
    })),
  });
}
