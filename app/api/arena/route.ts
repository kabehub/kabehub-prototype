import { NextRequest, NextResponse } from "next/server";
import { addMessage, createThread, getThread } from "@/lib/supabase-db";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

type ChatMessage = { role: string; content: string; provider?: string };

// ── AI呼び出し関数（route.tsから流用） ──────────────────────────

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

// ── AIディスパッチャー ───────────────────────────────────────────

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
    // Gemini は履歴の末尾が必ず user ロールでないといけない制約がある
    // アリーナでは直前が assistant（相手AI）の発言になるため、ダミーの user メッセージを末尾に追加する
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

// ── POST /api/arena ─────────────────────────────────────────────
//
// リクエストボディ:
//   threadId       : string       スレッドID（フロントで生成済み）
//   history        : ChatMessage[] これまでの会話履歴（直近10件を想定）
//   currentProvider: string       今回発言するAI（"claude" | "gemini" | "openai"）
//   currentPrompt  : string       今回のAIのシステムプロンプト（人格）
//   opponentLabel  : string       相手AIの表示名（コンテキスト注入用）
//   selfLabel      : string       自分の表示名
//   isFirst        : boolean      最初のターン（スレッド作成判定用）
//   topic          : string       お題（最初のターンのみ使用）
//   interventionContent?: string  神からの介入メッセージ（任意）

export async function POST(req: NextRequest) {
  // 認証チェック
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

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
  } = await req.json();

  // APIキー取得
  const keys = {
    anthropic: req.headers.get("x-anthropic-api-key") || process.env.ANTHROPIC_API_KEY || undefined,
    gemini: req.headers.get("x-gemini-api-key") || process.env.GEMINI_API_KEY || undefined,
    openai: req.headers.get("x-openai-api-key") || process.env.OPENAI_API_KEY || undefined,
  };

  // スレッドが存在しない場合は作成（最初のターン）
  if (isFirst) {
    const exists = await getThread(threadId);
    if (!exists) {
      await createThread(threadId, `【AI闘技場】${topic.slice(0, 30)}`, userId);
    }
  }

  // 神の介入メッセージをDBに保存してhistoryに追加
  // DB保存は【神からの介入】タグ付きのまま（UI表示用）
  // APIに渡す際は強すぎるシグナルを避けるため「地の文」に変換する（Geminiの提案）
  let historyWithIntervention = [...history];
  if (interventionContent?.trim()) {
    const interventionMsg = {
      id: uuidv4(),
      thread_id: threadId,
      role: "user" as const,
      content: `【神からの介入】${interventionContent}`,
      provider: "user" as const,
      created_at: new Date().toISOString(),
    };
    await addMessage(interventionMsg, userId);
    // APIには「地の文」として渡す（タグ強調を避けて自然な会話の流れに溶け込ませる）
    const interventionForApi = `[状況更新] 以下の新しい事実が判明しました。自然な会話の流れの中で、この事実に対するあなたの見解を簡潔に混ぜ込んで反論してください。事実：${interventionContent}`;
    historyWithIntervention = [
      ...history,
      { role: "user", content: interventionForApi },
    ];
  }

  // コンテキスト構築
  // 方針: AIへ渡すメッセージは「神/お題 = user」「AI発言 = assistant」に統一する。
  // 話者名は content 先頭に注入して誰が発言したか明示する。
  // これにより user/assistant が正しく交互になり、Claude・Gemini・OpenAI どれも受け付けられる。

  const rawHistory = historyWithIntervention.slice(-10);
  const contextMessages: ChatMessage[] = [];

  if (isFirst && topic && rawHistory.length === 0) {
    // 初回かつ履歴なし：お題だけを user として渡す
    contextMessages.push({ role: "user", content: `【お題】${topic}` });
  } else {
    // 2ターン目以降：履歴を user/assistant に変換して渡す
    // ラベルは [自分] / [相手] に統一（AIの名前を直接使うと相手の発言まで書き続けるリスクがある）
    for (const m of rawHistory) {
      if (m.role === "user") {
        contextMessages.push({ role: "user", content: m.content });
      } else {
        const isSelf = m.provider === currentProvider;
        const label = isSelf ? "自分" : "相手";
        contextMessages.push({
          role: "assistant",
          content: `[${label}の発言] ${m.content}`,
        });
      }
    }
    // 末尾が assistant の場合、次の発言を促す user メッセージを追加
    const last = contextMessages[contextMessages.length - 1];
    if (!last || last.role === "assistant") {
      contextMessages.push({
        role: "user",
        content: `あなたの番です。上記の議論を踏まえて、あなた自身の意見・反論を1つのまとまった文章で述べてください。相手の発言は書かないでください。`,
      });
    }
  }

  // システムプロンプト構築
  const fullSystemPrompt = [
    currentPrompt?.trim(),
    `あなたは ${selfLabel} として、この議論に参加しています。`,
    `相手は ${opponentLabel} です。`,
    `【重要】あなたが出力するのは、あなた自身の発言のみです。`,
    `相手（${opponentLabel}）の発言や、"[相手の発言]" などのラベルは絶対に出力しないでください。`,
    `発言の冒頭にラベルや名前を付けないでください。`,
    `ルール：相手の言葉尻を捕らえたり、同じフレーズをオウム返しにしたりするのは避けてください。常に新しい視点や例え話を用いて、論理的に相手を追い詰めてください。`,
  ]
    .filter(Boolean)
    .join("\n");

  // AI呼び出し
  let content = "";
  try {
    content = await callAI(currentProvider, contextMessages, fullSystemPrompt, keys);
  } catch (err) {
    content = `（エラー: ${err instanceof Error ? err.message : "不明なエラー"}）\n※右上の「🔑 APIキー」ボタンから設定を確認してください。`;
  }

  // DB保存
  const assistantMessage = {
    id: uuidv4(),
    thread_id: threadId,
    role: "assistant" as const,
    content,
    provider: currentProvider as "claude" | "gemini" | "openai",
    created_at: new Date().toISOString(),
  };
  await addMessage(assistantMessage, userId);

  return NextResponse.json({ message: assistantMessage });
}
