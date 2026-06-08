import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

const CONSOLIDATION_PROMPT = `2つの記憶を、重複を取り除いて1つに統合してください。
元の記憶にない新事実は追加しないでください。
矛盾がある場合は、より新しい記憶を優先し、古い内容は「以前は〜だったが、現在は〜」のように整理してください。
出力は統合後の記憶本文のみ。説明や前置きは不要です。`;

const CONSOLIDATION_SOURCE_SELECT = [
  "id",
  "user_id",
  "folder_name",
  "chunk_text",
  "memory_kind",
  "temporal_status",
  "is_archived",
  "superseded_by",
  "is_pinned",
  "extraction_version",
  "created_at",
].join(", ");

type ConsolidationSource = {
  id: string;
  user_id: string;
  folder_name: string | null;
  chunk_text: string;
  memory_kind: string | null;
  temporal_status: string | null;
  is_archived: boolean | null;
  superseded_by: string | null;
  is_pinned: boolean | null;
  extraction_version: string | null;
  created_at: string | null;
};

function normalizePair(idA: string, idB: string) {
  return idA < idB ? [idA, idB] as const : [idB, idA] as const;
}

function newerSource(a: ConsolidationSource, b: ConsolidationSource) {
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

function validateSources(
  rows: ConsolidationSource[],
  userId: string,
  loreIdA: string,
  loreIdB: string,
) {
  if (rows.length !== 2) return null;

  const byId = new Map(rows.map((row) => [row.id, row]));
  const sourceA = byId.get(loreIdA);
  const sourceB = byId.get(loreIdB);
  if (!sourceA || !sourceB) return null;

  const isEditableExtraction = (value: string | null) => value === "user_edited" || value === "user_created";
  const invalid = [sourceA, sourceB].some((row) =>
    row.user_id !== userId ||
    row.is_archived !== false ||
    row.superseded_by !== null ||
    row.is_pinned !== false ||
    isEditableExtraction(row.extraction_version)
  );
  if (invalid) return null;

  return { sourceA, sourceB };
}

function buildUserPrompt(sourceA: ConsolidationSource, sourceB: ConsolidationSource) {
  return `記憶A（created_at: ${sourceA.created_at ?? "unknown"}）:
${sourceA.chunk_text}

記憶B（created_at: ${sourceB.created_at ?? "unknown"}）:
${sourceB.chunk_text}`;
}

async function generateMergedText(openaiKey: string, sourceA: ConsolidationSource, sourceB: ConsolidationSource) {
  const llmRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CONSOLIDATION_PROMPT },
        { role: "user", content: buildUserPrompt(sourceA, sourceB) },
      ],
    }),
  });

  if (!llmRes.ok) throw new Error("Chat Completions API error");

  const llmData = await llmRes.json();
  const mergedText = llmData.choices?.[0]?.message?.content;
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

  const validated = validateSources((data ?? []) as unknown as ConsolidationSource[], user.id, loreIdA, loreIdB);
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
