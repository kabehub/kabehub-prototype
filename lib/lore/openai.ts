import { LORE_EMBEDDING_MODEL, LORE_CHAT_MODEL } from "../internalModels";

type ApiErrorMode = "generic" | "provider";

export async function createEmbedding(
  openaiKey: string,
  input: string,
  opts?: { signal?: AbortSignal; apiErrorMode?: ApiErrorMode },
): Promise<number[]> {
  const embRes = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({ model: LORE_EMBEDDING_MODEL, input }),
    signal: opts?.signal,
  });

  if (!embRes.ok) {
    if (opts?.apiErrorMode === "provider") {
      const providerMessage = await readProviderErrorMessage(embRes);
      throw new Error(providerMessage ?? "Embedding API error");
    }
    throw new Error("Embedding API error");
  }

  const embData = await embRes.json();
  const embedding = embData?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error("Missing embedding");
  return embedding as number[];
}

async function readProviderErrorMessage(response: Response): Promise<string | null> {
  try {
    const data = await response.json();
    return typeof data?.error?.message === "string" ? data.error.message : null;
  } catch {
    return null;
  }
}

export async function chatCompleteMini(
  openaiKey: string,
  systemPrompt: string,
  userContent: string,
  opts?: { jsonMode?: boolean },
): Promise<string | null> {
  const llmRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: LORE_CHAT_MODEL,
      ...(opts?.jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!llmRes.ok) throw new Error("Chat Completions API error");

  const llmData = await llmRes.json();
  const content = llmData?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : null;
}
