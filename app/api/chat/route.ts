import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { v4 as uuidv4 } from "uuid";

export const dynamic = 'force-dynamic';

type ChatMessage = { role: string; content: string; provider?: string };

// モデルID型（ChatInput.tsxのMODEL_CONFIGと対応）
type ClaudeModel = "claude-sonnet-4-5" | "claude-sonnet-4-6";
type GeminiModel = "gemini-2.5-flash" | "gemini-2.5-pro";
type OpenAIModel = "gpt-4o";
type ModelId = ClaudeModel | GeminiModel | OpenAIModel;

// デフォルトモデル（modelIdが未指定の場合のフォールバック）
const DEFAULT_MODELS: Record<string, ModelId> = {
  claude: "claude-sonnet-4-5",
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o",
};

async function callClaude(
  apiKey: string,
  messages: ChatMessage[],
  systemPrompt?: string,
  modelId: ClaudeModel = "claude-sonnet-4-5"
): Promise<string> {

  // ① system をブロック形式に変更してキャッシュ付与
  const systemBlock = systemPrompt?.trim()
    ? [{ type: "text" as const, text: systemPrompt.trim(), cache_control: { type: "ephemeral" as const } }]
    : undefined;

  // ② messages に cache_control を付与（最後から2番目のみ）
  const messagesForAPI = messages.map((m, index) => {
    const isSecondToLast = index === messages.length - 2;
    if (isSecondToLast) {
      return {
        role: m.role,
        content: [{ type: "text" as const, text: m.content, cache_control: { type: "ephemeral" as const } }],
      };
    }
    return { role: m.role, content: m.content };
  });

  const body: Record<string, unknown> = {
    model: modelId,
    max_tokens: 8192,
    messages: messagesForAPI,
  };
  if (systemBlock) body.system = systemBlock;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31", // Gemini指摘: 明示的に付けて安全側に倒す
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Claude API error");

  // ③ キャッシュ効果をログ出力（開発時のみ）
  if (process.env.NODE_ENV === "development") {
    const u = data.usage ?? {};
    console.log("[Cache]", {
      created: u.cache_creation_input_tokens ?? 0,
      read:    u.cache_read_input_tokens    ?? 0,
      normal:  u.input_tokens               ?? 0,
    });
  }

  return data.content?.[0]?.text ?? "（応答の取得に失敗しました）";
}
async function callGemini(apiKey: string, messages: ChatMessage[], systemPrompt?: string, modelId: GeminiModel = "gemini-2.5-flash"): Promise<string> {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const body: Record<string, unknown> = { contents };
  if (systemPrompt && systemPrompt.trim()) body.systemInstruction = { parts: [{ text: systemPrompt.trim() }] };
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Gemini API error");
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "（応答の取得に失敗しました）";
}

async function callOpenAI(apiKey: string, messages: ChatMessage[], systemPrompt?: string, modelId: OpenAIModel = "gpt-4o"): Promise<string> {
  const msgs: { role: string; content: string }[] = [];
  if (systemPrompt && systemPrompt.trim()) msgs.push({ role: "system", content: systemPrompt.trim() });
  msgs.push(...messages.map((m) => ({ role: m.role, content: m.content })));
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: modelId, messages: msgs }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "OpenAI API error");
  return data.choices?.[0]?.message?.content ?? "（応答の取得に失敗しました）";
}

export async function POST(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const { threadId, messages, userContent, provider, modelId, isRegenerate, isMemo, systemPrompt, isTemporary } =
    await req.json();
  // 0. フォルダのシステムプロンプトを解決
  // スレッド個別のsystemPromptがない場合のみフォルダ設定を取得
  let resolvedSystemPrompt: string | undefined = systemPrompt || undefined

  if (!resolvedSystemPrompt && !isTemporary) {
    const { data: thread } = await supabase
      .from('threads')
      .select('folder_name, user_id')
      .eq('id', threadId)
      .single()

    if (thread?.folder_name) {
      const { data: folderSetting } = await supabase
        .from('folder_settings')
        .select('system_prompt')
        .eq('user_id', userId)
        .eq('folder_name', thread.folder_name)
        .maybeSingle()

      resolvedSystemPrompt = folderSetting?.system_prompt ?? undefined
    }
  }

  // 1. スレッド作成
  if (!isTemporary) {
    const { data: exists } = await supabase.from("threads").select("id").eq("id", threadId).single();
    if (!exists) {
      const title = userContent.slice(0, 20) + (userContent.length > 20 ? "…" : "");
      const { error } = await supabase.from("threads").insert({ id: threadId, title, user_id: userId });
      if (error) throw error;
    }
  }

  // 2. ユーザーメッセージ保存
  const userMessage = {
    id: uuidv4(),
    thread_id: threadId,
    role: "user" as const,
    content: userContent,
    provider: (isMemo ? "memo" : "user") as "memo" | "user",
    created_at: new Date().toISOString(),
  };

  if (!isRegenerate && !isTemporary) {
    const { error } = await supabase.from("messages").insert({
      id: userMessage.id,
      thread_id: threadId,
      role: "user",
      content: userContent,
      provider: isMemo ? "memo" : "user",
      user_id: userId,
    });
    if (error) throw error;
  }

  if (isMemo) return NextResponse.json({ userMessage });

  // 3. AI API呼び出し
  const anthropicKey = req.headers.get("x-anthropic-api-key");
  const geminiKey = req.headers.get("x-gemini-api-key");
  const openaiKey = req.headers.get("x-openai-api-key");

  // modelIdが未指定の場合はデフォルトを使用
  const resolvedModelId: ModelId = modelId ?? DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.claude;

  const messagesForApi = [
    ...messages.map((m: ChatMessage) => ({
      role: m.role as string,
      content: m.provider === "memo" ? `【ユーザーの思考メモ（返答不要の前提知識）】\n${m.content}` : m.content,
    })),
    { role: "user" as string, content: userContent },
  ];

  let assistantContent = "";
  let usedProvider = provider;

  try {
    if (provider === "gemini") {
      if (!geminiKey) throw new Error("GeminiのAPIキーが設定されていません。");
      assistantContent = await callGemini(geminiKey, messagesForApi, resolvedSystemPrompt, resolvedModelId as GeminiModel);
      usedProvider = "gemini";
    } else if (provider === "claude") {
      if (!anthropicKey) throw new Error("ClaudeのAPIキーが設定されていません。");
      assistantContent = await callClaude(anthropicKey, messagesForApi, resolvedSystemPrompt, resolvedModelId as ClaudeModel);
      usedProvider = "claude";
    } else if (provider === "openai") {
      if (!openaiKey) throw new Error("OpenAIのAPIキーが設定されていません。");
      assistantContent = await callOpenAI(openaiKey, messagesForApi, resolvedSystemPrompt, resolvedModelId as OpenAIModel);
      usedProvider = "openai";
    } else {
      throw new Error(`未対応のプロバイダーです: ${provider}`);
    }
  } catch (err) {
    console.error("AI API error:", err);
    assistantContent = `（エラー: ${err instanceof Error ? err.message : "不明なエラー"}）\n※右上の「🔑 APIキー」ボタンから設定を確認してください。`;
    usedProvider = provider;
  }

  // 4. AIメッセージ保存
  const assistantMessage = {
    id: uuidv4(),
    thread_id: threadId,
    role: "assistant" as const,
    content: assistantContent,
    provider: usedProvider,
    created_at: new Date().toISOString(),
  };

  if (!isTemporary) {
    const { error } = await supabase.from("messages").insert({
      id: assistantMessage.id,
      thread_id: threadId,
      role: "assistant",
      content: assistantContent,
      provider: usedProvider,
      user_id: userId,
    });
    if (error) throw error;
  }

  return NextResponse.json({ userMessage, assistantMessage });
}
