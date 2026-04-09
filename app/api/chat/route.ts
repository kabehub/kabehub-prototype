import { NextRequest, NextResponse } from "next/server";
import { addMessage, createThread, getThread } from "@/lib/supabase-db";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { v4 as uuidv4 } from "uuid";

export const dynamic = 'force-dynamic';

type ChatMessage = { role: string; content: string; provider?: string };

async function callClaude(
  apiKey: string,
  messages: ChatMessage[],
  systemPrompt?: string
): Promise<string> {
  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-5",
    max_tokens: 8192,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (systemPrompt && systemPrompt.trim()) {
    body.system = systemPrompt.trim();
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Claude API error");
  return data.content?.[0]?.text ?? "（応答の取得に失敗しました）";
}

async function callGemini(
  apiKey: string,
  messages: ChatMessage[],
  systemPrompt?: string
): Promise<string> {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const body: Record<string, unknown> = { contents };
  if (systemPrompt && systemPrompt.trim()) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt.trim() }],
    };
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Gemini API error");
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "（応答の取得に失敗しました）";
}

async function callOpenAI(
  apiKey: string,
  messages: ChatMessage[],
  systemPrompt?: string
): Promise<string> {
  const msgs: { role: string; content: string }[] = [];
  if (systemPrompt && systemPrompt.trim()) {
    msgs.push({ role: "system", content: systemPrompt.trim() });
  }
  msgs.push(...messages.map((m) => ({ role: m.role, content: m.content })));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: msgs,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "OpenAI API error");
  return data.choices?.[0]?.message?.content ?? "（応答の取得に失敗しました）";
}

export async function POST(req: NextRequest) {
  // ── 認証チェック ──────────────────────────────────────────
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id;

  // ── リクエストボディ ──────────────────────────────────────
// ✅ 変更後
const { threadId, messages, userContent, provider, isRegenerate, isMemo, systemPrompt, isTemporary } =
  await req.json();

// 1. 一時モードの場合はDB操作をスキップ
if (!isTemporary) {
  const exists = await getThread(threadId);
  if (!exists) {
    await createThread(threadId, userContent, userId);
  }
}

  // 2. ユーザーメッセージを保存（再生成時はスキップ）
  const userMessage = {
    id: uuidv4(),
    thread_id: threadId,
    role: "user" as const,
    content: userContent,
    provider: (isMemo ? "memo" : "user") as "memo" | "user",
    created_at: new Date().toISOString(),
  };
  // ✅ 変更後
  if (!isRegenerate && !isTemporary) {
  await addMessage(userMessage, userId);
  }

  // メモモードの場合はAIを呼ばずここで終了
  if (isMemo) {
    return NextResponse.json({ userMessage });
  }

  // 3. AI API 呼び出し
  const anthropicKey = req.headers.get("x-anthropic-api-key") ;
  const geminiKey = req.headers.get("x-gemini-api-key") ;
  const openaiKey = req.headers.get("x-openai-api-key") ;

  const messagesForApi = [
  ...messages.map((m: ChatMessage) => ({
    role: m.role as string,
    content:
      m.provider === "memo"
        ? `【ユーザーの思考メモ（返答不要の前提知識）】\n${m.content}`
        : m.content,
  })),
  { role: "user" as string, content: userContent },
  ];

  let assistantContent = "";
  let usedProvider = provider;

  try {
    if (provider === "gemini") {
      if (!geminiKey) throw new Error("GeminiのAPIキーが設定されていません。");
      assistantContent = await callGemini(geminiKey, messagesForApi, systemPrompt);
      usedProvider = "gemini";
    } else if (provider === "claude") {
      if (!anthropicKey) throw new Error("ClaudeのAPIキーが設定されていません。");
      assistantContent = await callClaude(anthropicKey, messagesForApi, systemPrompt);
      usedProvider = "claude";
    } else if (provider === "openai") {
      if (!openaiKey) throw new Error("OpenAIのAPIキーが設定されていません。");
      assistantContent = await callOpenAI(openaiKey, messagesForApi, systemPrompt);
      usedProvider = "openai";
    } else {
      throw new Error(`未対応のプロバイダーです: ${provider}`);
    }
  } catch (err) {
    console.error("AI API error:", err);
    assistantContent = `（エラー: ${err instanceof Error ? err.message : "不明なエラー"}）\n※右上の「🔑 APIキー」ボタンから設定を確認してください。`;
    usedProvider = provider;
  }

  // 4. AIの応答を保存
  const assistantMessage = {
    id: uuidv4(),
    thread_id: threadId,
    role: "assistant" as const,
    content: assistantContent,
    provider: usedProvider,
    created_at: new Date().toISOString(),
  };
  // ✅ 変更後
  if (!isTemporary) {
  await addMessage(assistantMessage, userId);
  }

return NextResponse.json({ userMessage, assistantMessage });
}
