import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { chatCompleteMini, createEmbedding } from "@/lib/lore/openai";

export const dynamic = "force-dynamic";

const LIKED_AI_CLEANING_PROMPT = `以下はチャットAIの発言テキストです。
会話口調・前置き・Markdown記法・感嘆符などのノイズを取り除き、
「〜である。」調の客観的な知識文として3〜5行で書き直してください。
元の内容にない事実は追加しないでください。
出力は書き直したテキストのみ。説明・前置き不要。`;

const CONSOLIDATION_PROMPT = `複数の記憶を、重複を取り除いて1つに統合してください。
元の記憶にない新事実は追加しないでください。
矛盾がある場合は、created_at が新しい記憶を優先し、古い内容は「以前は〜だったが、現在は〜」のように整理してください。
出力は統合後の記憶本文のみ。説明や前置きは不要です。`;

const CONSOLIDATION_SOURCE_SELECT = [
  "id",
  "user_id",
  "folder_name",
  "chunk_text",
  "memory_kind",
  "temporal_status",
  "importance_score",
  "confidence_score",
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
  importance_score: number | null;
  confidence_score: number | null;
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

type Cluster = {
  ids: string[];
};

type BatchResult =
  | { sourceIds: string[]; newId: string | null; status: "merged"; mergedText: string }
  | { sourceIds: string[]; status: "failed"; reason: string };

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

function buildGreedyChainClusters(candidates: Candidate[], limit: number) {
  const clusters: Cluster[] = [];
  const idToCluster = new Map<string, Cluster>();

  for (const candidate of candidates) {
    const clusterA = idToCluster.get(candidate.idA);
    const clusterB = idToCluster.get(candidate.idB);

    if (clusterA && clusterB) {
      if (clusterA === clusterB) continue;

      const mergedIds = Array.from(new Set([...clusterA.ids, ...clusterB.ids]));
      if (mergedIds.length > 5) continue;

      clusterA.ids = mergedIds;
      for (const id of clusterB.ids) idToCluster.set(id, clusterA);
      const clusterBIndex = clusters.indexOf(clusterB);
      if (clusterBIndex >= 0) clusters.splice(clusterBIndex, 1);
      continue;
    }

    const existingCluster = clusterA ?? clusterB;
    if (existingCluster) {
      const nextId = clusterA ? candidate.idB : candidate.idA;
      if (existingCluster.ids.includes(nextId) || existingCluster.ids.length >= 5) continue;
      existingCluster.ids.push(nextId);
      idToCluster.set(nextId, existingCluster);
      continue;
    }

    if (clusters.length >= limit) continue;

    const newCluster = { ids: [candidate.idA, candidate.idB] };
    clusters.push(newCluster);
    idToCluster.set(candidate.idA, newCluster);
    idToCluster.set(candidate.idB, newCluster);
  }

  return clusters.slice(0, limit);
}

function validateSources(rows: ConsolidationSource[], userId: string, sourceIds: string[]) {
  if (rows.length < 2) return null;

  const byId = new Map(rows.map((row) => [row.id, row]));
  const sources = sourceIds.map((id) => byId.get(id));
  if (sources.some((source) => !source)) return null;

  const isProtectedExtraction = (value: string | null) =>
    value === "user_edited" ||
    value === "user_created" ||
    value === "liked_ai" ||
    value === "liked_ai_cleaned";
  const validSources = sources as ConsolidationSource[];
  const invalid = validSources.some((row) =>
    row.user_id !== userId ||
    row.is_archived !== false ||
    row.superseded_by !== null ||
    row.is_pinned !== false ||
    isProtectedExtraction(row.extraction_version)
  );
  if (invalid) return null;
  const first = validSources[0];
  const mismatched = validSources.some((row) =>
    row.folder_name !== first.folder_name || row.memory_kind !== first.memory_kind
  );
  if (mismatched) return null;

  return validSources;
}

function hasSameFolderNameAndMemoryKind(sources: ConsolidationSource[]) {
  const first = sources[0];
  return sources.every((source) =>
    source.folder_name === first.folder_name && source.memory_kind === first.memory_kind
  );
}

function buildUserPrompt(sources: ConsolidationSource[]) {
  return sources
    .sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""))
    .map((source, index) =>
      `記憶${index + 1}（created_at: ${source.created_at ?? "unknown"}）:\n${source.chunk_text}`
    )
    .join("\n\n---\n\n");
}

async function generateMergedText(openaiKey: string, sources: ConsolidationSource[]) {
  const mergedText = await chatCompleteMini(
    openaiKey,
    CONSOLIDATION_PROMPT,
    buildUserPrompt(sources),
  );
  if (typeof mergedText !== "string" || mergedText.trim().length === 0) {
    throw new Error("Missing merged text");
  }
  return mergedText.trim();
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

type CleanResult = {
  cleaned: number;
  failed: number;
};

async function cleanLikedAiRecords(
  supabase: ReturnType<typeof createRouteHandlerSupabaseClient>,
  openaiKey: string,
  userId: string,
  limit = 10
): Promise<CleanResult> {
  const { data: records } = await supabase
    .from("lore_embeddings")
    .select("id, chunk_text, folder_name, memory_kind, temporal_status, importance_score, confidence_score, tags, source_message_id, source_thread_id, metadata")
    .eq("user_id", userId)
    .eq("extraction_version", "liked_ai")
    .eq("is_archived", false)
    .is("superseded_by", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!records?.length) return { cleaned: 0, failed: 0 };

  let cleaned = 0;
  let failed = 0;

  for (const record of records) {
    try {
      const content = await chatCompleteMini(
        openaiKey,
        LIKED_AI_CLEANING_PROMPT,
        record.chunk_text,
      );
      const cleanedText = content?.trim();
      if (!cleanedText) throw new Error("Empty cleaned text");

      const embedding = await createEmbedding(openaiKey, cleanedText);

      const existingMeta =
        record.metadata && typeof record.metadata === "object" ? record.metadata : {};

      const { data: inserted, error: insertError } = await supabase
        .from("lore_embeddings")
        .insert({
          user_id: userId,
          folder_name: record.folder_name,
          chunk_text: cleanedText,
          embedding,
          source_type: "liked_ai",
          source_message_id: record.source_message_id,
          source_thread_id: record.source_thread_id,
          memory_kind: record.memory_kind,
          temporal_status: record.temporal_status,
          importance_score: record.importance_score,
          confidence_score: record.confidence_score,
          tags: record.tags ?? [],
          is_pinned: false,
          is_archived: false,
          extraction_version: "liked_ai_cleaned",
          metadata: {
            ...existingMeta,
            source_content: record.chunk_text,
          },
        })
        .select("id")
        .single();

      if (insertError || !inserted) throw new Error(insertError?.message ?? "Insert failed");

      const { error: updateError } = await supabase
        .from("lore_embeddings")
        .update({
          is_archived: true,
          superseded_by: inserted.id,
        })
        .eq("id", record.id)
        .eq("user_id", userId);

      if (updateError) throw new Error(updateError.message);

      cleaned++;
    } catch {
      failed++;
    }
  }

  return { cleaned, failed };
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
  const threshold = clamp(Number.isFinite(rawThreshold) ? rawThreshold : 0.92, 0.80, 0.98);
  const folderName = typeof body.folderName === "string" && body.folderName.trim()
    ? body.folderName.trim()
    : null;

  const { data, error } = await supabase.rpc("find_similar_lore_pairs_v2", {
    p_user_id: user.id,
    p_threshold: threshold,
    p_limit: limit * 8,
    p_k: 5,
    p_folder_name: folderName,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = ((Array.isArray(data) ? data : []) as SimilarLorePairRow[])
    .map(normalizeCandidate)
    .filter((candidate): candidate is Candidate => Boolean(candidate))
    .sort((a, b) => b.similarity - a.similarity);

  const matchedClusters = buildGreedyChainClusters(candidates, limit);

  const results: BatchResult[] = [];

  for (const cluster of matchedClusters) {
    const sourceIds = cluster.ids;

    try {
      const { data: sourceRows, error: sourceError } = await supabase
        .from("lore_embeddings")
        .select(CONSOLIDATION_SOURCE_SELECT)
        .in("id", sourceIds);

      if (sourceError) throw new Error(sourceError.message);

      const rows = (sourceRows ?? []) as unknown as ConsolidationSource[];
      const byId = new Map(rows.map((row) => [row.id, row]));
      const clusterSources = sourceIds.map((id) => byId.get(id));
      if (clusterSources.some((source) => !source)) throw new Error("Invalid lore cluster");
      const orderedSources = clusterSources as ConsolidationSource[];
      if (!hasSameFolderNameAndMemoryKind(orderedSources)) continue;

      const validated = validateSources(orderedSources, user.id, sourceIds);
      if (!validated) throw new Error("Invalid lore cluster");

      const mergedText = await generateMergedText(openaiKey, validated);
      const validationError = validateMergedText(mergedText);
      if (validationError) {
        results.push({ sourceIds, status: "failed", reason: validationError });
        continue;
      }

      const embedding = await createEmbedding(openaiKey, mergedText);
      const firstSource = validated[0];
      const importance = Math.max(...validated.map((source) => source.importance_score ?? 0.5));
      const confidence = validated.reduce(
        (sum, source) => sum + (source.confidence_score ?? 0.8),
        0,
      ) / validated.length;

      const { data: rpcData, error: rpcError } = sourceIds.length === 2
        ? await supabase.rpc("consolidate_dreaming_batch", {
            p_user_id: user.id,
            p_lore_id_a: sourceIds[0],
            p_lore_id_b: sourceIds[1],
            p_merged_text: mergedText,
            p_embedding: embedding,
            p_memory_kind: firstSource.memory_kind ?? "fact",
            p_temporal_status: firstSource.temporal_status ?? "current",
            p_folder_name: firstSource.folder_name ?? null,
            p_importance: importance,
            p_confidence: confidence,
          })
        : await supabase.rpc("consolidate_dreaming_batch_multi", {
            p_user_id: user.id,
            p_source_ids: sourceIds,
            p_merged_text: mergedText,
            p_embedding: embedding,
            p_memory_kind: firstSource.memory_kind ?? "fact",
            p_temporal_status: firstSource.temporal_status ?? "current",
            p_folder_name: firstSource.folder_name ?? null,
            p_importance: importance,
            p_confidence: confidence,
          });

      if (rpcError) throw new Error(rpcError.message);

      results.push({
        sourceIds,
        newId: normalizeRpcNewId(rpcData),
        status: "merged",
        mergedText,
      });
    } catch (err) {
      results.push({
        sourceIds,
        status: "failed",
        reason: (err as Error).message,
      });
    }
  }

  const succeeded = results.filter((result) => result.status === "merged").length;
  const failed = results.filter((result) => result.status === "failed").length;

  // liked_ai クリーニングフェーズ
  const cleanResult = await cleanLikedAiRecords(supabase, openaiKey, user.id);

  return NextResponse.json({
    processed: results.length,
    succeeded,
    failed,
    cleaned: cleanResult.cleaned,
    cleanFailed: cleanResult.failed,
    results,
  });
}
