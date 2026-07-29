import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { chatCompleteMini, createEmbedding } from "@/lib/lore/openai";
import { clamp } from "@/lib/lore/mappers";

type MessageRow = { id: string; thread_id: string; content: string; created_at: string };
type ExtractedMemory = { text: string; memoryKind?: string; temporalStatus?: string; importanceScore?: number; confidenceScore?: number };
type CorrectionExampleRow = { chunk_text: string; memory_kind: string | null; metadata: Record<string, unknown> | null };

type SupabaseClient = ReturnType<typeof createRouteHandlerSupabaseClient>;

type PersistResult =
  | { ok: true; insertedCount: number }
  | { ok: false; insertedCount: number; error: Error };

const MEMORY_KINDS = new Set([
  "preference",
  "project",
  "plan",
  "decision",
  "fact",
  "todo",
  "idea",
  "constraint",
  "profile",
  "temporary",
  "other",
]);

const TEMPORAL_STATUSES = new Set(["current", "past", "future", "expired", "uncertain"]);

function normalizeMemory(value: unknown): ExtractedMemory | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (!text) return null;

  const memoryKind = typeof record.memoryKind === "string" && MEMORY_KINDS.has(record.memoryKind)
    ? record.memoryKind
    : "fact";
  const temporalStatus = typeof record.temporalStatus === "string" && TEMPORAL_STATUSES.has(record.temporalStatus)
    ? record.temporalStatus
    : "current";
  const importanceScore = typeof record.importanceScore === "number" && Number.isFinite(record.importanceScore)
    ? clamp(record.importanceScore, 0, 1)
    : 0.5;
  const confidenceScore = typeof record.confidenceScore === "number" && Number.isFinite(record.confidenceScore)
    ? clamp(record.confidenceScore, 0, 1)
    : 0.8;

  return { text, memoryKind, temporalStatus, importanceScore, confidenceScore };
}

function buildMemoryExtractionPrompt(examples: CorrectionExampleRow[] = []) {
  const basePrompt = `ユーザー発言から、今後の会話で役立つ長期記憶だけを抽出してください。
雑談、挨拶、単発の質問、AIへの指示だけで永続的な事実ではない内容は除外してください。
出力は {"memories": [...]} のJSONオブジェクトのみ。memoriesの各要素は以下の形式にしてください。
{"text": string, "memoryKind": "preference"|"project"|"plan"|"decision"|"fact"|"todo"|"idea"|"constraint"|"profile"|"temporary"|"other", "temporalStatus": "current"|"past"|"future"|"expired"|"uncertain", "importanceScore": number, "confidenceScore": number}`;

  if (examples.length === 0) return basePrompt;

  const correctionLines = examples.map((example, index) => {
    const aiProposedKind = example.metadata?.ai_proposed_kind;
    const proposed = typeof aiProposedKind === "string" ? aiProposedKind : "unknown";
    const corrected = example.memory_kind ?? "fact";
    return `${index + 1}. text: ${JSON.stringify(example.chunk_text)} / ai_proposed_kind: ${proposed} / corrected_memoryKind: ${corrected}`;
  });

  return `${basePrompt}

以下は過去にAI分類をユーザーが修正した例です。同じ傾向の内容では corrected_memoryKind を優先して分類してください。
${correctionLines.join("\n")}`;
}

async function fetchTargetMessages(supabase: SupabaseClient, userId: string, limit: number) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, thread_id, content, created_at")
    .eq("user_id", userId)
    .eq('is_learned', false)
    .eq('skip_learning', false)
    .eq('role', 'user')
    .neq('provider', 'memo')
    .neq('provider', 'image_gen')
    .or("is_active.is.null,is_active.eq.true")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as MessageRow[];
}

async function fetchCorrectionExamples(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("lore_embeddings")
    .select("chunk_text, memory_kind, metadata")
    .eq("user_id", userId)
    .eq("is_manually_corrected", true)
    .eq("is_archived", false)
    .not("metadata->>ai_proposed_kind", "is", null)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);

  return ((data ?? []) as CorrectionExampleRow[])
    .filter((row) => {
      const aiProposedKind = row.metadata?.ai_proposed_kind;
      return typeof aiProposedKind === "string" && aiProposedKind !== row.memory_kind;
    })
    .slice(0, 5);
}

async function extractMemories(openaiKey: string, message: MessageRow, prompt: string) {
  const content = await chatCompleteMini(openaiKey, prompt, JSON.stringify({
    messageId: message.id,
    createdAt: message.created_at,
    content: message.content,
  }), { jsonMode: true });
  if (typeof content !== "string") return [];

  const parsed = JSON.parse(content);
  const rawMemories: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.memories)
      ? parsed.memories
      : [];
  return rawMemories
    .map(normalizeMemory)
    .filter((memory): memory is ExtractedMemory => Boolean(memory));
}

async function persistExtractedMemories(
  supabase: SupabaseClient,
  userId: string,
  message: MessageRow,
  memories: ExtractedMemory[],
  openaiKey: string,
): Promise<PersistResult> {
  let insertedCount = 0;
  try {
    for (const memory of memories) {
      const embedding = await createEmbedding(openaiKey, memory.text);
      const { error: insertError } = await supabase
        .from("lore_embeddings")
        .insert({
          user_id: userId,
          chunk_text: memory.text,
          embedding,
          memory_kind: memory.memoryKind,
          temporal_status: memory.temporalStatus,
          importance_score: memory.importanceScore,
          confidence_score: memory.confidenceScore,
          extraction_version: "batch_train",
          metadata: { ai_proposed_kind: memory.memoryKind },
          source_type: "message",
          source_thread_id: message.thread_id,
          source_message_id: message.id,
          tags: [],
        });

      if (insertError) throw new Error(insertError.message);
      insertedCount++;
    }
    return { ok: true, insertedCount };
  } catch (error) {
    return { ok: false, insertedCount, error: error as Error };
  }
}

async function markMessageLearnedBestEffort(supabase: SupabaseClient, userId: string, messageId: string): Promise<void> {
  // 現行挙動を維持するため意図的に握りつぶしている。将来の改善候補
  await supabase
    .from("messages")
    .update({ is_learned: true })
    .eq("id", messageId)
    .eq("user_id", userId);
}

type RunBatchTrainResult =
  | { ok: true; processedCount: number; insertedCount: number }
  | { ok: false; processedCount: number; insertedCount: number; error: Error };

export async function runBatchTrain(
  supabase: SupabaseClient,
  openaiKey: string,
  userId: string,
  limit: number,
): Promise<RunBatchTrainResult> {
  const messages = await fetchTargetMessages(supabase, userId, limit);
  const correctionExamples = await fetchCorrectionExamples(supabase, userId);
  const memoryExtractionPrompt = buildMemoryExtractionPrompt(correctionExamples);
  let processedCount = 0;
  let insertedCount = 0;

  for (const message of messages) {
    try {
      const memories = await extractMemories(openaiKey, message, memoryExtractionPrompt);
      processedCount++;
      const persisted = await persistExtractedMemories(supabase, userId, message, memories, openaiKey);
      insertedCount += persisted.insertedCount;
      if (!persisted.ok) return { ok: false, processedCount, insertedCount, error: persisted.error };
      await markMessageLearnedBestEffort(supabase, userId, message.id);
    } catch (error) {
      return { ok: false, processedCount, insertedCount, error: error as Error };
    }
  }

  return { ok: true, processedCount, insertedCount };
}
