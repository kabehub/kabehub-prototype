import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

type ChatMessage = { role: string; content: string; provider?: string };

async function callClaude(apiKey: string, messages: ChatMessage[], systemPrompt?: string): Promise<string> {
  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-5",
    max_tokens: 8192,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (systemPrompt?.trim()) body.system = systemPrompt.trim();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "Claude API error");
  return data.content?.[0]?.text ?? "（応答の取得に失敗しました）";
}

async function callGemini(apiKey: string, messages: ChatMessage[], systemPrompt?: string): Promise<string> {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const body: Record<string, unknown> = { contents };
  if (systemPrompt?.trim()) body.systemInstruction = { parts: [{ text: systemPrompt.trim() }] };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "Gemini API error");
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "（応答の取得に失敗しました）";
}

async function callOpenAI(apiKey: string, messages: ChatMessage[], systemPrompt?: string): Promise<string> {
  const msgs: { role: string; content: string }[] = [];
  if (systemPrompt?.trim()) msgs.push({ role: "system", content: systemPrompt.trim() });
  msgs.push(...messages.map((m) => ({ role: m.role, content: m.content })));
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "gpt-4o", messages: msgs }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "OpenAI API error");
  return data.choices?.[0]?.message?.content ?? "（応答の取得に失敗しました）";
}

async function callAI(
  provider: string,
  messages: ChatMessage[],
  systemPrompt: string,
  keys: { anthropic?: string; gemini?: string; openai?: string }
): Promise<string> {
  if (provider === "claude") {
    if (!keys.anthropic) throw new Error("ClaudeのAPIキーが設定されていません。");
    return callClaude(keys.anthropic, messages, systemPrompt);
  } else if (provider === "gemini") {
    if (!keys.gemini) throw new Error("GeminiのAPIキーが設定されていません。");
    const geminiMessages = [...messages];
    if (geminiMessages.length > 0 && geminiMessages[geminiMessages.length - 1].role === "assistant") {
      geminiMessages.push({ role: "user", content: "続けてください。あなたの意見を述べてください。" });
    }
    return callGemini(keys.gemini, geminiMessages, systemPrompt);
  } else if (provider === "openai") {
    if (!keys.openai) throw new Error("OpenAIのAPIキーが設定されていません。");
    return callOpenAI(keys.openai, messages, systemPrompt);
  }
  throw new Error(`未対応のプロバイダーです: ${provider}`);
}

export async function POST(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  };
  try {
    const rawText = await req.text();
    body = JSON.parse(rawText);
  } catch (err) {
    console.error("arena route: JSON parse error", err);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── 人間乱入メッセージの保存モード ──────────────────────────
  if (body.mode === "saveHumanMessage") {
    const { threadId, content: msgContent } = body;
    const humanMsg = {
      id: uuidv4(),
      thread_id: threadId,
      role: "user" as const,
      content: msgContent ?? "",
      provider: "user" as const,
      created_at: new Date().toISOString(),
    };
    await supabase.from("messages").insert({
      id: humanMsg.id,
      thread_id: humanMsg.thread_id,
      role: humanMsg.role,
      content: humanMsg.content,
      provider: humanMsg.provider,
      user_id: userId,
    });
    return NextResponse.json({ message: humanMsg });
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
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
  } = body;

  // APIキー取得
  const keys = {
    anthropic: req.headers.get("x-anthropic-api-key") || undefined,
    gemini: req.headers.get("x-gemini-api-key") || undefined,
    openai: req.headers.get("x-openai-api-key") || undefined,
  };

  // スレッド作成
  if (isFirst) {
    const { data: exists } = await supabase.from("threads").select("id").eq("id", threadId).single();
    if (!exists) {
      const title = `【AI闘技場】${(topic ?? "").slice(0, 30)}`;
      await supabase.from("threads").insert({ id: threadId, title, user_id: userId });
    }
  }

  // 介入メッセージ保存
  let historyWithIntervention = [...(history ?? [])];
  if (interventionContent?.trim()) {
    const interventionMsg = {
      id: uuidv4(),
      thread_id: threadId,
      role: "user" as const,
      content: `【神からの介入】${interventionContent}`,
      provider: "user" as const,
      created_at: new Date().toISOString(),
    };
    await supabase.from("messages").insert({
      id: interventionMsg.id,
      thread_id: interventionMsg.thread_id,
      role: interventionMsg.role,
      content: interventionMsg.content,
      provider: interventionMsg.provider,
      user_id: userId,
    });
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
    content = await callAI(currentProvider ?? "", contextMessages, fullSystemPrompt, keys);
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

  await supabase.from("messages").insert({
    id: assistantMessage.id,
    thread_id: threadId,
    role: assistantMessage.role,
    content: assistantMessage.content,
    provider: assistantMessage.provider,
    user_id: userId,
  });

  return NextResponse.json({ message: assistantMessage });
}