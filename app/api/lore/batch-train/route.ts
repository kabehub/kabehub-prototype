import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { chatCompleteMini, createEmbedding } from "@/lib/lore/openai";

export const dynamic = "force-dynamic";

type MessageRow = {
  id: string;
  thread_id: string;
  content: string;
  created_at: string;
};

type ExtractedMemory = {
  text: string;
  memoryKind?: string;
  temporalStatus?: string;
  importanceScore?: number;
  confidenceScore?: number;
};

type CorrectionExampleRow = {
  chunk_text: string;
  memory_kind: string | null;
  metadata: Record<string, unknown> | null;
};

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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

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

async function fetchCorrectionExamples(
  supabase: ReturnType<typeof createRouteHandlerSupabaseClient>,
  userId: string,
) {
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
  const limit = clamp(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 20, 1, 100);

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("id, thread_id, content, created_at")
    .eq("user_id", user.id)
    .eq('is_learned', false)
    .eq('skip_learning', false)
    .eq('role', 'user')
    .neq('provider', 'memo')
    .neq('provider', 'image_gen')
    .or("is_active.is.null,is_active.eq.true")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (messagesError) return NextResponse.json({ error: messagesError.message }, { status: 500 });

  let processedCount = 0;
  let insertedCount = 0;

  const correctionExamples = await fetchCorrectionExamples(supabase, user.id);
  const memoryExtractionPrompt = buildMemoryExtractionPrompt(correctionExamples);

  for (const message of (messages ?? []) as MessageRow[]) {
    try {
      const memories = await extractMemories(openaiKey, message, memoryExtractionPrompt);
      processedCount++;

      for (const memory of memories) {
        const embedding = await createEmbedding(openaiKey, memory.text);
        const { error: insertError } = await supabase
          .from("lore_embeddings")
          .insert({
            user_id: user.id,
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

      await supabase
        .from("messages")
        .update({ is_learned: true })
        .eq("id", message.id)
        .eq("user_id", user.id);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message, processedCount, insertedCount }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, processedCount, insertedCount });
}
