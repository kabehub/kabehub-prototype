import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { chatCompleteMini } from "@/lib/lore/openai";
import {
  CONSOLIDATION_SOURCE_SELECT,
  ConsolidationSourceRow,
  normalizePair,
  validateApprovedPair,
} from "@/lib/lore/consolidation";

export const dynamic = "force-dynamic";

const CONSOLIDATION_PROMPT = `2つの記憶を、重複を取り除いて1つに統合してください。
元の記憶にない新事実は追加しないでください。
矛盾がある場合は、より新しい記憶を優先し、古い内容は「以前は〜だったが、現在は〜」のように整理してください。
出力は統合後の記憶本文のみ。説明や前置きは不要です。`;

function newerSource(a: ConsolidationSourceRow, b: ConsolidationSourceRow) {
  const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
  const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
  return timeB > timeA ? b : a;
}

function suggestedValue(
  a: string | null,
  b: string | null,
  fallback: string,
  newer: string | null,
) {
  if (a && a === b) return a;
  return newer ?? a ?? b ?? fallback;
}

function buildUserPrompt(sourceA: ConsolidationSourceRow, sourceB: ConsolidationSourceRow) {
  return `記憶A（created_at: ${sourceA.created_at ?? "unknown"}）:
${sourceA.chunk_text}

記憶B（created_at: ${sourceB.created_at ?? "unknown"}）:
${sourceB.chunk_text}`;
}

async function generateMergedText(openaiKey: string, sourceA: ConsolidationSourceRow, sourceB: ConsolidationSourceRow) {
  const mergedText = await chatCompleteMini(
    openaiKey,
    CONSOLIDATION_PROMPT,
    buildUserPrompt(sourceA, sourceB),
  );
  if (typeof mergedText !== "string" || mergedText.trim().length === 0) {
    throw new Error("Missing merged text");
  }
  return mergedText.trim();
}

export async function POST(req: NextRequest) {
  const openaiKey = req.headers.get("x-openai-api-key");
  if (!openaiKey) {
    return NextResponse.json({ error: "x-openai-api-key header required" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "Invalid lore pair" }, { status: 400 });
  }

  const [loreIdA, loreIdB] = normalizePair(idA, idB);

  const { data, error } = await supabase
    .from("lore_embeddings")
    .select(CONSOLIDATION_SOURCE_SELECT)
    .in("id", [loreIdA, loreIdB]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const validated = validateApprovedPair((data ?? []) as unknown as ConsolidationSourceRow[], user.id, loreIdA, loreIdB);
  if (!validated) {
    return NextResponse.json({ error: "Invalid lore pair" }, { status: 400 });
  }

  try {
    const { sourceA, sourceB } = validated;
    const newer = newerSource(sourceA, sourceB);
    const mergedText = await generateMergedText(openaiKey, sourceA, sourceB);

    return NextResponse.json({
      mergedText,
      suggestedMemoryKind: suggestedValue(sourceA.memory_kind, sourceB.memory_kind, "fact", newer.memory_kind),
      suggestedTemporalStatus: suggestedValue(
        sourceA.temporal_status,
        sourceB.temporal_status,
        "current",
        newer.temporal_status,
      ),
      source: {
        idA: sourceA.id,
        idB: sourceB.id,
        chunkTextA: sourceA.chunk_text,
        chunkTextB: sourceB.chunk_text,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
