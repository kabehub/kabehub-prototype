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

type SimilarLorePairRow = Record<string, unknown>;

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

type Candidate = {
  idA: string;
  idB: string;
  similarity: number;
};

type BatchResult =
  | { idA: string; idB: string; newId: string | null; status: "merged"; mergedText: string }
  | { idA: string; idB: string; status: "failed"; reason: string };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function stringValue(row: SimilarLorePairRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") return value;
  }
  return null;
}

function numberValue(row: SimilarLorePairRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function normalizeCandidate(row: SimilarLorePairRow): Candidate | null {
  const idA = stringValue(row, ["idA", "id_a", "loreIdA", "lore_id_a"]);
  const idB = stringValue(row, ["idB", "id_b", "loreIdB", "lore_id_b"]);
  const similarity = numberValue(row, ["similarity", "score"]);

  if (!idA || !idB || idA === idB || similarity === null) return null;
  return { idA, idB, similarity };
}

function normalizePair(idA: string, idB: string) {
  return idA < idB ? [idA, idB] as const : [idB, idA] as const;
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
  if (sourceA.folder_name !== sourceB.folder_name || sourceA.memory_kind !== sourceB.memory_kind) return null;

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

async function createEmbedding(openaiKey: string, content: string): Promise<number[]> {
  const embRes = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: content }),
  });

  if (!embRes.ok) throw new Error("Embedding API error");

  const embData = await embRes.json();
  const embedding = embData.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error("Missing embedding");
  return embedding as number[];
}

function isJsonStringLike(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !["{", "[", "\""].includes(trimmed[0])) return false;

  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function validateMergedText(value: string) {
  if (!value.trim()) return "Merged text is empty";
  if (value.length > 500) return "Merged text exceeds 500 characters";
  if (isJsonStringLike(value)) return "Merged text must not be JSON";
  return null;
}

function normalizeRpcNewId(data: unknown) {
  const row = Array.isArray(data) ? data[0] : data;
  if (typeof row === "string") return row;
  if (row && typeof row === "object") {
    const record = row as Record<string, unknown>;
    for (const key of ["newId", "new_id", "id"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
  }
  return null;
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
  const rawLimit = typeof body.limit === "number" ? body.limit : Number(body.limit);
  const rawThreshold = typeof body.threshold === "number" ? body.threshold : Number(body.threshold);
  const limit = clamp(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 5, 1, 5);
  const threshold = clamp(Number.isFinite(rawThreshold) ? rawThreshold : 0.92, 0.88, 0.98);
  const folderName = typeof body.folderName === "string" && body.folderName.trim()
    ? body.folderName.trim()
    : null;

  const { data, error } = await supabase.rpc("find_similar_lore_pairs_v2", {
    p_user_id: user.id,
    p_threshold: threshold,
    p_limit: limit * 3,
    p_k: 3,
    p_folder_name: folderName,
  });

  console.log("RPC params:", JSON.stringify({
    p_user_id: user.id,
    p_threshold: threshold,
    p_limit: limit * 3,
    p_k: 3,
    p_folder_name: folderName,
  }));
  console.log("RPC raw data:", JSON.stringify(data));
  console.log("RPC error:", JSON.stringify(error));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = ((Array.isArray(data) ? data : []) as SimilarLorePairRow[])
    .map(normalizeCandidate)
    .filter((candidate): candidate is Candidate => Boolean(candidate))
    .sort((a, b) => b.similarity - a.similarity);

  const usedIds = new Set<string>();
  const matched: Candidate[] = [];
  for (const candidate of candidates) {
    if (matched.length >= limit) break;
    if (usedIds.has(candidate.idA) || usedIds.has(candidate.idB)) continue;
    usedIds.add(candidate.idA);
    usedIds.add(candidate.idB);
    matched.push(candidate);
  }

  console.log("matched count:", matched.length);

  const results: BatchResult[] = [];

  for (const candidate of matched) {
    const [loreIdA, loreIdB] = normalizePair(candidate.idA, candidate.idB);

    try {
      const { data: sourceRows, error: sourceError } = await supabase
        .from("lore_embeddings")
        .select(CONSOLIDATION_SOURCE_SELECT)
        .in("id", [loreIdA, loreIdB]);

      if (sourceError) throw new Error(sourceError.message);

      const validated = validateSources((sourceRows ?? []) as unknown as ConsolidationSource[], user.id, loreIdA, loreIdB);
      if (!validated) throw new Error("Invalid lore pair");

      const mergedText = await generateMergedText(openaiKey, validated.sourceA, validated.sourceB);
      const validationError = validateMergedText(mergedText);
      if (validationError) {
        results.push({ idA: loreIdA, idB: loreIdB, status: "failed", reason: validationError });
        continue;
      }

      const embedding = await createEmbedding(openaiKey, mergedText);
      const { data: rpcData, error: rpcError } = await supabase.rpc("consolidate_dreaming_batch", {
        p_user_id: user.id,
        p_lore_id_a: loreIdA,
        p_lore_id_b: loreIdB,
        p_merged_text: mergedText,
        p_embedding: embedding,
      });

      if (rpcError) throw new Error(rpcError.message);

      results.push({
        idA: loreIdA,
        idB: loreIdB,
        newId: normalizeRpcNewId(rpcData),
        status: "merged",
        mergedText,
      });
    } catch (err) {
      results.push({
        idA: loreIdA,
        idB: loreIdB,
        status: "failed",
        reason: (err as Error).message,
      });
    }
  }

  const succeeded = results.filter((result) => result.status === "merged").length;
  const failed = results.filter((result) => result.status === "failed").length;

  return NextResponse.json({
    processed: results.length,
    succeeded,
    failed,
    results,
  });
}
