import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { chatCompleteMini, createEmbedding } from "@/lib/lore/openai";
import {
  CONSOLIDATION_SOURCE_SELECT,
  ConsolidationSourceRow,
  validateDreamingSources,
  validateMergedText,
} from "@/lib/lore/consolidation";
import { generateMergedText } from "@/lib/lore/consolidationLlm";
import {
  DreamingCandidate,
  normalizeDreamingCandidate,
  normalizeRpcNewId,
} from "@/lib/lore/mappers";

const LIKED_AI_CLEANING_PROMPT = `以下はチャットAIの発言テキストです。
会話口調・前置き・Markdown記法・感嘆符などのノイズを取り除き、
「〜である。」調の客観的な知識文として3〜5行で書き直してください。
元の内容にない事実は追加しないでください。
出力は書き直したテキストのみ。説明・前置き不要。`;

type SimilarLorePairRow = Record<string, unknown>;

type Cluster = {
  ids: string[];
};

type BatchResult =
  | { sourceIds: string[]; newId: string | null; status: "merged"; mergedText: string }
  | { sourceIds: string[]; status: "failed"; reason: string };

export function buildGreedyChainClusters(candidates: DreamingCandidate[], limit: number) {
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

export function hasSameFolderNameAndMemoryKind(sources: ConsolidationSourceRow[]) {
  const first = sources[0];
  return sources.every((source) =>
    source.folder_name === first.folder_name && source.memory_kind === first.memory_kind
  );
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

export async function callConsolidateDreaming(
  supabase: ReturnType<typeof createRouteHandlerSupabaseClient>,
  userId: string,
  sourceIds: string[],
  mergedText: string,
  embedding: number[],
  firstSource: ConsolidationSourceRow,
  importance: number,
  confidence: number,
) {
  const { data, error } = sourceIds.length === 2
    ? await supabase.rpc("consolidate_dreaming_batch", {
        p_user_id: userId,
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
        p_user_id: userId,
        p_source_ids: sourceIds,
        p_merged_text: mergedText,
        p_embedding: embedding,
        p_memory_kind: firstSource.memory_kind ?? "fact",
        p_temporal_status: firstSource.temporal_status ?? "current",
        p_folder_name: firstSource.folder_name ?? null,
        p_importance: importance,
        p_confidence: confidence,
      });

  if (error) throw new Error(error.message);
  return data;
}

export async function runDreamingBatch(
  supabase: ReturnType<typeof createRouteHandlerSupabaseClient>,
  openaiKey: string,
  userId: string,
  { limit, threshold, folderName }: { limit: number; threshold: number; folderName: string | null },
) {
  const { data, error } = await supabase.rpc("find_similar_lore_pairs_v2", {
    p_user_id: userId,
    p_threshold: threshold,
    p_limit: limit * 8,
    p_k: 5,
    p_folder_name: folderName,
  });

  if (error) throw new Error(error.message);

  const candidates = ((Array.isArray(data) ? data : []) as SimilarLorePairRow[])
    .map(normalizeDreamingCandidate)
    .filter((candidate): candidate is DreamingCandidate => Boolean(candidate))
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

      const rows = (sourceRows ?? []) as unknown as ConsolidationSourceRow[];
      const byId = new Map(rows.map((row) => [row.id, row]));
      const clusterSources = sourceIds.map((id) => byId.get(id));
      if (clusterSources.some((source) => !source)) throw new Error("Invalid lore cluster");
      const orderedSources = clusterSources as ConsolidationSourceRow[];
      if (!hasSameFolderNameAndMemoryKind(orderedSources)) continue;

      const validated = validateDreamingSources(orderedSources, userId, sourceIds);
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

      const rpcData = await callConsolidateDreaming(
        supabase,
        userId,
        sourceIds,
        mergedText,
        embedding,
        firstSource,
        importance,
        confidence,
      );

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
  const cleanResult = await cleanLikedAiRecords(supabase, openaiKey, userId);

  return {
    processed: results.length,
    succeeded,
    failed,
    cleaned: cleanResult.cleaned,
    cleanFailed: cleanResult.failed,
    results,
  };
}
