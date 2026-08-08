import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { v4 as uuidv4 } from "uuid";
import { buildDefaultModels, createModelGuards, getOpenAICapability, OPENAI_RESPONSES_CONFIG, resolveClaudeRequestOverrides } from "@/lib/modelRegistry";
import type { ClaudeModel, GeminiModel, OpenAIModel, ModelId } from "@/types";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

type ChatMessage = { role: string; content: string; provider?: string };
type ArenaProvider = "claude" | "gemini" | "openai";
type EnsureArenaThreadResult =
  | { ok: true; created: boolean }
  | { ok: false; response: NextResponse };

type EnsureArenaThreadParams = {
  supabase: SupabaseClient;
  threadId: string;
  topic: string | undefined;
  userId: string;
};

const PROVIDER_LABELS: Record<ArenaProvider, string> = {
  claude: "Claude",
  gemini: "Gemini",
  openai: "OpenAI",
};

async function fetchProvider(
  provider: ArenaProvider,
  url: string,
  init: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    console.error("[arena] provider API request failed", {
      route: "arena",
      operation: `request_${provider}_api`,
      table: "provider_api",
      errorCode: "UPSTREAM_REQUEST_FAILED",
    });
    throw new Error(`${PROVIDER_LABELS[provider]} APIへのリクエストに失敗しました`);
  }

  if (!response.ok) {
    console.error("[arena] provider API error", {
      route: "arena",
      operation: `request_${provider}_api`,
      table: "provider_api",
      errorCode: `UPSTREAM_API_ERROR_${response.status}`,
    });
    throw new Error(`${PROVIDER_LABELS[provider]} APIへのリクエストに失敗しました`);
  }

  return response;
}

async function readProviderJson(provider: ArenaProvider, response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    console.error("[arena] invalid provider API response", {
      route: "arena",
      operation: `parse_${provider}_api_response`,
      table: "provider_api",
      errorCode: `UPSTREAM_RESPONSE_INVALID_${response.status}`,
    });
    throw new Error(`${PROVIDER_LABELS[provider]} APIへのリクエストに失敗しました`);
  }
}

// デフォルトモデル（modelIdが未指定の場合のフォールバック）
const DEFAULT_MODELS = buildDefaultModels("arena");

const { isClaudeModel, isGeminiModel, isOpenAIModel } = createModelGuards("arena");

async function ensureArenaThread({
  supabase,
  threadId,
  topic,
  userId,
}: EnsureArenaThreadParams): Promise<EnsureArenaThreadResult> {
  const { data: existingThread, error: lookupError } = await supabase
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) {
    logger.dbOperationFailed({
      route: "arena",
      operation: "ensure_thread_lookup",
      table: "threads",
      errorCode: lookupError.code,
    });
    return {
      ok: false,
      response: NextResponse.json({ error: "Failed to verify arena thread" }, { status: 500 }),
    };
  }
  if (existingThread) return { ok: true, created: false };

  const title = `【AI闘技場】${(topic ?? "").slice(0, 30)}`;
  const { error: insertError } = await supabase
    .from("threads")
    .insert({ id: threadId, title, user_id: userId });

  if (!insertError) return { ok: true, created: true };

  if (insertError.code !== "23505") {
    logger.dbOperationFailed({
      route: "arena",
      operation: "ensure_thread_insert",
      table: "threads",
      errorCode: insertError.code,
    });
    return {
      ok: false,
      response: NextResponse.json({ error: "Failed to create arena thread" }, { status: 500 }),
    };
  }

  // 同時リクエストが先に作成した場合だけ成功扱いにする。別ユーザー所有の同一IDは500のまま。
  const { data: racedThread, error: recheckError } = await supabase
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (recheckError) {
    logger.dbOperationFailed({
      route: "arena",
      operation: "ensure_thread_recheck",
      table: "threads",
      errorCode: recheckError.code,
    });
    return {
      ok: false,
      response: NextResponse.json({ error: "Failed to verify arena thread" }, { status: 500 }),
    };
  }
  if (racedThread) return { ok: true, created: false };

  logger.dbOperationFailed({
    route: "arena",
    operation: "ensure_thread_insert_conflict",
    table: "threads",
    errorCode: insertError.code,
  });
  return {
    ok: false,
    response: NextResponse.json({ error: "Failed to create arena thread" }, { status: 500 }),
  };
}

async function compensateCreatedArenaThread({
  supabase,
  threadId,
  userId,
  operation,
}: {
  supabase: SupabaseClient;
  threadId: string;
  userId: string;
  operation: string;
}): Promise<void> {
  const { error: compensationError } = await supabase
    .from("threads")
    .delete()
    .eq("id", threadId)
    .eq("user_id", userId);

  if (compensationError) {
    logger.dbCompensationFailed({
      route: "arena",
      operation,
      table: "threads",
      errorCode: compensationError.code,
    });
  }
}

async function compensateInterventionMessage({
  supabase,
  messageId,
  userId,
}: {
  supabase: SupabaseClient;
  messageId: string;
  userId: string;
}): Promise<void> {
  const { error: compensationError } = await supabase
    .from("messages")
    .delete()
    .eq("id", messageId)
    .eq("user_id", userId);

  if (compensationError) {
    logger.dbCompensationFailed({
      route: "arena",
      operation: "delete_intervention_after_assistant_insert",
      table: "messages",
      errorCode: compensationError.code,
    });
  }
}

async function callClaude(apiKey: string, messages: ChatMessage[], systemPrompt: string | undefined, modelId: ClaudeModel): Promise<string> {
  const body: Record<string, unknown> = {
    model: modelId,
    ...resolveClaudeRequestOverrides(modelId, false),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (systemPrompt?.trim()) body.system = systemPrompt.trim();
  const res = await fetchProvider("claude", "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  const data = await readProviderJson("claude", res);
  if (data.stop_reason === "refusal") {
    return "（AIの安全基準により、この内容には回答できませんでした）";
  }
  const text = Array.isArray(data.content)
    ? data.content
        .filter((b: { type?: string }) => b.type === "text")
        .map((b: { text?: string }) => b.text ?? "")
        .join("")
    : "";
  return text || "（応答の取得に失敗しました）";
}

async function callGemini(apiKey: string, messages: ChatMessage[], systemPrompt: string | undefined, modelId: GeminiModel): Promise<string> {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const body: Record<string, unknown> = { contents };
  if (systemPrompt?.trim()) body.systemInstruction = { parts: [{ text: systemPrompt.trim() }] };
  const res = await fetchProvider(
    "gemini",
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    },
  );
  const data = await readProviderJson("gemini", res);
  const parts = data.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .filter((part: { thought?: boolean }) => part.thought !== true)
        .map((part: { text?: string }) => part.text ?? "")
        .join("")
    : "";
  return text || "（応答の取得に失敗しました）";
}

async function callOpenAI(apiKey: string, messages: ChatMessage[], systemPrompt: string | undefined, modelId: OpenAIModel): Promise<string> {
  const msgs: { role: string; content: string }[] = [];
  if (systemPrompt?.trim()) msgs.push({ role: "system", content: systemPrompt.trim() });
  msgs.push(...messages.map((m) => ({ role: m.role, content: m.content })));

  const capability = getOpenAICapability(modelId);
  if (capability.api === "responses") {
    const res = await fetchProvider("openai", "https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: modelId, input: msgs, max_output_tokens: OPENAI_RESPONSES_CONFIG.maxOutputTokens, store: false }),
    });
    const data = await readProviderJson("openai", res);
    const text = data.output
      ?.flatMap((output: { content?: { type: string; text: string }[] }) => output.content ?? [])
      .filter((content: { type: string }) => content.type === "output_text")
      .map((content: { text: string }) => content.text)
      .join("") ?? "";
    return text || "（応答の取得に失敗しました）";
  }

  const res = await fetchProvider("openai", "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: modelId, messages: msgs }),
  });
  const data = await readProviderJson("openai", res);
  return data.choices?.[0]?.message?.content ?? "（応答の取得に失敗しました）";
}

async function callAI(
  provider: string,
  messages: ChatMessage[],
  systemPrompt: string,
  keys: { anthropic?: string; gemini?: string; openai?: string },
  modelId?: ModelId
): Promise<string> {
  const resolvedModelId = modelId ?? DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.claude;
  if (provider === "claude") {
    if (!isClaudeModel(resolvedModelId)) throw new Error(`Invalid modelId "${resolvedModelId}" for provider "${provider}"`);
    if (!keys.anthropic) throw new Error("ClaudeのAPIキーが設定されていません。");
    return callClaude(keys.anthropic, messages, systemPrompt, resolvedModelId);
  } else if (provider === "gemini") {
    if (!isGeminiModel(resolvedModelId)) throw new Error(`Invalid modelId "${resolvedModelId}" for provider "${provider}"`);
    if (!keys.gemini) throw new Error("GeminiのAPIキーが設定されていません。");
    const geminiMessages = [...messages];
    if (geminiMessages.length > 0 && geminiMessages[geminiMessages.length - 1].role === "assistant") {
      geminiMessages.push({ role: "user", content: "続けてください。あなたの意見を述べてください。" });
    }
    return callGemini(keys.gemini, geminiMessages, systemPrompt, resolvedModelId);
  } else if (provider === "openai") {
    if (!isOpenAIModel(resolvedModelId)) throw new Error(`Invalid modelId "${resolvedModelId}" for provider "${provider}"`);
    if (!keys.openai) throw new Error("OpenAIのAPIキーが設定されていません。");
    return callOpenAI(keys.openai, messages, systemPrompt, resolvedModelId);
  }
  throw new Error(`未対応のプロバイダーです: ${provider}`);
}

export async function POST(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson, finalizeResponse } = auth;
  const userId = user.id;

  let body: {
    mode?: string;
    threadId: string;
    content?: string;
    history?: ChatMessage[];
    currentProvider?: string;
    currentPrompt?: string;
    opponentLabel?: string;
    selfLabel?: string;
    isFirst?: boolean;
    topic?: string;
    interventionContent?: string;
    modelId?: ModelId;
  };
  try {
    const rawText = await req.text();
    body = JSON.parse(rawText);
  } catch {
    return finalizeJson({ error: "Invalid JSON body" }, { status: 400 });
  }

  // DB保存のHTTP契約:
  // - thread / human / intervention INSERT失敗: 500 + { error }
  // - assistant INSERT失敗: 200 + { message, saved: false }
  // - assistant INSERT成功: 200 + { message, saved: true }
  // 補償DELETEが失敗しても、原因となった保存失敗のstatus/bodyは変更しない。

  // ── 人間乱入メッセージの保存モード ──────────────────────────
  if (body.mode === "saveHumanMessage") {
    const { threadId, content: msgContent, topic } = body;
    const ensuredThread = await ensureArenaThread({ supabase, threadId, topic, userId });
    if (!ensuredThread.ok) return finalizeResponse(ensuredThread.response);

    const humanMsg = {
      id: uuidv4(),
      thread_id: threadId,
      role: "user" as const,
      content: msgContent ?? "",
      provider: "user" as const,
      created_at: new Date().toISOString(),
    };
    const { error: humanInsertError } = await supabase.from("messages").insert({
      id: humanMsg.id,
      thread_id: humanMsg.thread_id,
      role: humanMsg.role,
      content: humanMsg.content,
      provider: humanMsg.provider,
      user_id: userId,
    });
    if (humanInsertError) {
      logger.dbOperationFailed({
        route: "arena",
        operation: "insert_human_message",
        table: "messages",
        errorCode: humanInsertError.code,
      });
      if (ensuredThread.created) {
        await compensateCreatedArenaThread({
          supabase,
          threadId,
          userId,
          operation: "delete_thread_after_human_insert",
        });
      }
      return finalizeJson({ error: "Failed to save human message" }, { status: 500 });
    }
    return finalizeJson({ ok: true, message: humanMsg });
  }

  // ── タイムトラベルモード ──────────────────────────────────────
  if (body.mode === "timeTravel") {
    const { threadId, since } = body as { threadId: string; since: string };
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("thread_id", threadId)
      .eq("user_id", userId)
      .gte("created_at", since);
    if (error) return finalizeJson({ error: error.message }, { status: 500 });
    return finalizeJson({ ok: true });
  }

  const {
    threadId,
    history,
    currentProvider,
    currentPrompt,
    opponentLabel,
    selfLabel,
    isFirst,
    topic,
    interventionContent,
    modelId,
  } = body;

  const providerForValidation = currentProvider ?? "";
  const modelForValidation = modelId ?? DEFAULT_MODELS[providerForValidation] ?? DEFAULT_MODELS.claude;
  if (
    (providerForValidation === "claude" && !isClaudeModel(modelForValidation)) ||
    (providerForValidation === "gemini" && !isGeminiModel(modelForValidation)) ||
    (providerForValidation === "openai" && !isOpenAIModel(modelForValidation))
  ) {
    return finalizeJson(
      { error: `Invalid modelId "${modelForValidation}" for provider "${providerForValidation}"` },
      { status: 400 }
    );
  }

  // APIキー取得
  const keys = {
    anthropic: req.headers.get("x-anthropic-api-key") || undefined,
    gemini: req.headers.get("x-gemini-api-key") || undefined,
    openai: req.headers.get("x-openai-api-key") || undefined,
  };

  // スレッド作成（このリクエストで作成した場合だけ、後続失敗時の補償対象にする）
  let arenaThreadCreated = false;
  if (isFirst) {
    const ensuredThread = await ensureArenaThread({ supabase, threadId, topic, userId });
    if (!ensuredThread.ok) return finalizeResponse(ensuredThread.response);
    arenaThreadCreated = ensuredThread.created;
  }

  // 介入メッセージ保存
  let historyWithIntervention = [...(history ?? [])];
  let savedInterventionMessageId: string | null = null;
  if (interventionContent?.trim()) {
    const interventionMsg = {
      id: uuidv4(),
      thread_id: threadId,
      role: "user" as const,
      content: `【神からの介入】${interventionContent}`,
      provider: "user" as const,
      created_at: new Date().toISOString(),
    };
    const { error: interventionInsertError } = await supabase.from("messages").insert({
      id: interventionMsg.id,
      thread_id: interventionMsg.thread_id,
      role: interventionMsg.role,
      content: interventionMsg.content,
      provider: interventionMsg.provider,
      user_id: userId,
    });
    if (interventionInsertError) {
      logger.dbOperationFailed({
        route: "arena",
        operation: "insert_intervention_message",
        table: "messages",
        errorCode: interventionInsertError.code,
      });
      if (arenaThreadCreated) {
        await compensateCreatedArenaThread({
          supabase,
          threadId,
          userId,
          operation: "delete_thread_after_intervention_insert",
        });
      }
      return finalizeJson({ error: "Failed to save intervention message" }, { status: 500 });
    }
    savedInterventionMessageId = interventionMsg.id;
    const interventionForApi = `[状況更新] 以下の新しい事実が判明しました。自然な会話の流れの中で、この事実に対するあなたの見解を簡潔に混ぜ込んで反論してください。事実：${interventionContent}`;
    historyWithIntervention = [...(history ?? []), { role: "user", content: interventionForApi }];
  }

  const rawHistory = historyWithIntervention.slice(-10);
  const contextMessages: ChatMessage[] = [];

  if (isFirst && topic && rawHistory.length === 0) {
    contextMessages.push({ role: "user", content: `【お題】${topic}` });
  } else {
    for (const m of rawHistory) {
      if (m.role === "user") {
        contextMessages.push({ role: "user", content: m.content });
      } else {
        const isSelf = m.provider === currentProvider;
        const label = isSelf ? "自分" : "相手";
        contextMessages.push({ role: "assistant", content: `[${label}の発言] ${m.content}` });
      }
    }
    const last = contextMessages[contextMessages.length - 1];
    if (!last || last.role === "assistant") {
      contextMessages.push({
        role: "user",
        content: `あなたの番です。上記の議論を踏まえて、あなた自身の意見・反論を1つのまとまった文章で述べてください。相手の発言は書かないでください。`,
      });
    }
  }

  const fullSystemPrompt = [
    currentPrompt?.trim(),
    `あなたは ${selfLabel} として、この議論に参加しています。`,
    `相手は ${opponentLabel} です。`,
    `【絶対厳守】あなたに割り当てられた立場・主張を最後まで貫いてください。相手に反論する際も、自分の立場から離れないでください。`,
    `【絶対厳守】応答の冒頭に「[自分の発言]」「[相手の発言]」などのラベルを絶対に付けないでください。本文だけを出力してください。`,
    `【重要】あなたが出力するのは、あなた自身の発言のみです。`,
    `相手（${opponentLabel}）の発言や、"[相手の発言]" などのラベルは絶対に出力しないでください。`,
    `発言の冒頭にラベルや名前を付けないでください。`,
    `ルール：相手の言葉尻を捕らえたり、同じフレーズをオウム返しにしたりするのは避けてください。常に新しい視点や例え話を用いて、論理的に相手を追い詰めてください。`,
  ].filter(Boolean).join("\n");

  let content = "";
  try {
    content = await callAI(currentProvider ?? "", contextMessages, fullSystemPrompt, keys, modelId);
  } catch (err) {
    content = `（エラー: ${err instanceof Error ? err.message : "不明なエラー"}）\n※右上の「🔑 APIキー」ボタンから設定を確認してください。`;
  }

  const assistantMessage = {
    id: uuidv4(),
    thread_id: threadId,
    role: "assistant" as const,
    content,
    provider: (currentProvider ?? "claude") as "claude" | "gemini" | "openai",
    created_at: new Date().toISOString(),
  };

  const { error: assistantInsertError } = await supabase.from("messages").insert({
    id: assistantMessage.id,
    thread_id: threadId,
    role: assistantMessage.role,
    content: assistantMessage.content,
    provider: assistantMessage.provider,
    user_id: userId,
  });

  if (assistantInsertError) {
    logger.dbOperationFailed({
      route: "arena",
      operation: "insert_assistant_message",
      table: "messages",
      errorCode: assistantInsertError.code,
    });
    if (arenaThreadCreated) {
      await compensateCreatedArenaThread({
        supabase,
        threadId,
        userId,
        operation: "delete_thread_after_assistant_insert",
      });
    } else if (savedInterventionMessageId) {
      await compensateInterventionMessage({
        supabase,
        messageId: savedInterventionMessageId,
        userId,
      });
    }
    return finalizeJson({ message: assistantMessage, saved: false });
  }

  return finalizeJson({ message: assistantMessage, saved: true });
}
