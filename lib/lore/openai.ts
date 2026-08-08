import { LORE_EMBEDDING_MODEL, LORE_CHAT_MODEL } from "../internalModels";
import { externalApiFailed } from "../logger";

export class AiProviderRequestError extends Error {
  readonly provider = "openai";

  constructor(
    readonly status: number | null,
    readonly errorCode: "UPSTREAM_API_ERROR" | "UPSTREAM_REQUEST_FAILED" | "UPSTREAM_RESPONSE_INVALID",
  ) {
    super("OpenAI APIへのリクエストに失敗しました");
    this.name = "AiProviderRequestError";
  }
}

function providerRequestError(
  status: number | null,
  errorCode: "UPSTREAM_API_ERROR" | "UPSTREAM_REQUEST_FAILED" | "UPSTREAM_RESPONSE_INVALID",
): AiProviderRequestError {
  externalApiFailed({
    service: "openai",
    status: status ?? undefined,
    errorCode,
  });
  return new AiProviderRequestError(status, errorCode);
}

export async function createEmbedding(
  openaiKey: string,
  input: string,
  opts?: { signal?: AbortSignal },
): Promise<number[]> {
  let embRes: Response;
  try {
    embRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({ model: LORE_EMBEDDING_MODEL, input }),
      signal: opts?.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw providerRequestError(null, "UPSTREAM_REQUEST_FAILED");
  }

  if (!embRes.ok) {
    throw providerRequestError(embRes.status, "UPSTREAM_API_ERROR");
  }

  let embData: any;
  try {
    embData = await embRes.json();
  } catch {
    throw providerRequestError(embRes.status, "UPSTREAM_RESPONSE_INVALID");
  }
  const embedding = embData?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw providerRequestError(embRes.status, "UPSTREAM_RESPONSE_INVALID");
  }
  return embedding as number[];
}

export async function chatCompleteMini(
  openaiKey: string,
  systemPrompt: string,
  userContent: string,
  opts?: { jsonMode?: boolean },
): Promise<string | null> {
  let llmRes: Response;
  try {
    llmRes = await fetch("https://api.openai.com/v1/chat/completions", {
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
  } catch {
    throw providerRequestError(null, "UPSTREAM_REQUEST_FAILED");
  }

  if (!llmRes.ok) throw providerRequestError(llmRes.status, "UPSTREAM_API_ERROR");

  let llmData: any;
  try {
    llmData = await llmRes.json();
  } catch {
    throw providerRequestError(llmRes.status, "UPSTREAM_RESPONSE_INVALID");
  }
  const content = llmData?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : null;
}
