import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions"; // ✅ v62: Vercel環境でレスポンス後もDB保存を保証
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { v4 as uuidv4 } from "uuid";

export const dynamic = 'force-dynamic';

type ChatMessage = { role: string; content: string; provider?: string };
type ImageBlock = { type: "image"; source: { type: "base64"; media_type: string; data: string } };
type ContentBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } } | ImageBlock;

type ClaudeModel = "claude-sonnet-4-5" | "claude-sonnet-4-6";
type GeminiModel = "gemini-2.5-flash" | "gemini-2.5-pro";
type OpenAIModel = "gpt-4o";
type ModelId = ClaudeModel | GeminiModel | OpenAIModel;

const DEFAULT_MODELS: Record<string, ModelId> = {
  claude: "claude-sonnet-4-5",
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o",
};

// ─── ストリーミング版 callClaude ─────────────────────────────────────────────
// ReadableStream<string> を返す。各chunkは生テキスト断片。
// onDone(fullText, cacheStats) は完了時コールバック。
function streamClaude(
  apiKey: string,
  messages: ChatMessage[],
  systemPrompt?: string,
  modelId: ClaudeModel = "claude-sonnet-4-5",
  imageBlocks: ImageBlock[] = [],
  signal?: AbortSignal,
): ReadableStream<string> {
  const systemBlock = systemPrompt?.trim()
    ? [{ type: "text" as const, text: systemPrompt.trim(), cache_control: { type: "ephemeral" as const } }]
    : undefined;

  const messagesForAPI = messages.map((m, index) => {
    const isLast = index === messages.length - 1;
    const isSecondToLast = index === messages.length - 2;
    if (isLast && m.role === "user" && imageBlocks.length > 0) {
      const contentBlocks: ContentBlock[] = [...imageBlocks, { type: "text" as const, text: m.content }];
      return { role: m.role, content: contentBlocks };
    }
    if (isSecondToLast) {
      return { role: m.role, content: [{ type: "text" as const, text: m.content, cache_control: { type: "ephemeral" as const } }] };
    }
    return { role: m.role, content: m.content };
  });

  const body: Record<string, unknown> = {
    model: modelId,
    max_tokens: 8192,
    stream: true, // ← ストリーミング有効化
    messages: messagesForAPI,
  };
  if (systemBlock) body.system = systemBlock;

  return new ReadableStream<string>({
    async start(controller) {
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "prompt-caching-2024-07-31",
          },
          body: JSON.stringify(body),
          signal,
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error?.message ?? "Claude API error");
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        // SSEパース: message_start でキャッシュ統計取得
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") continue;
            try {
              const parsed = JSON.parse(raw);

              // ✅ v62: キャッシュ統計ログ（Gemini指摘③: message_start + message_delta 両方拾う）
              if (process.env.NODE_ENV === "development") {
                if (parsed.type === "message_start") {
                  // 入力トークン + キャッシュヒット/作成トークン
                  const u = parsed.message?.usage ?? {};
                  console.log("[Cache input]", {
                    input_tokens:                u.input_tokens                   ?? 0,
                    cache_creation_input_tokens: u.cache_creation_input_tokens    ?? 0,
                    cache_read_input_tokens:     u.cache_read_input_tokens        ?? 0,
                  });
                }
                if (parsed.type === "message_delta") {
                  // 出力トークン（ストリーム終盤に届く）
                  const u = parsed.usage ?? {};
                  console.log("[Cache output]", {
                    output_tokens: u.output_tokens ?? 0,
                  });
                }
              }

              // テキストチャンクをenqueue
              if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                controller.enqueue(parsed.delta.text);
              }
            } catch {
              // JSON parseエラーは無視
            }
          }
        }

        controller.close();
      } catch (err) {
        // AbortErrorはキャンセル扱い（エラーとして伝播させない）
        if ((err as Error).name !== "AbortError") {
          controller.error(err);
        } else {
          controller.close();
        }
      }
    },
  });
}

// ─── ストリーミング版 callGemini ────────────────────────────────────────────
function streamGemini(
  apiKey: string,
  messages: ChatMessage[],
  systemPrompt?: string,
  modelId: GeminiModel = "gemini-2.5-flash",
  imageBlocks: ImageBlock[] = [],
  signal?: AbortSignal,
): ReadableStream<string> {
  const contents = messages.map((m, index) => {
    const isLast = index === messages.length - 1;
    if (isLast && m.role === "user" && imageBlocks.length > 0) {
      return {
        role: "user",
        parts: [
          ...imageBlocks.map(b => ({ inlineData: { data: b.source.data, mimeType: b.source.media_type } })),
          { text: m.content },
        ],
      };
    }
    return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] };
  });
  const body: Record<string, unknown> = { contents };
  if (systemPrompt?.trim()) body.systemInstruction = { parts: [{ text: systemPrompt.trim() }] };

  return new ReadableStream<string>({
    async start(controller) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal },
        );

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error?.message ?? "Gemini API error");
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const parsed = JSON.parse(raw);
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) controller.enqueue(text);
            } catch {
              // 無視
            }
          }
        }

        controller.close();
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          controller.error(err);
        } else {
          controller.close();
        }
      }
    },
  });
}

// ─── ストリーミング版 callOpenAI ────────────────────────────────────────────
function streamOpenAI(
  apiKey: string,
  messages: ChatMessage[],
  systemPrompt?: string,
  modelId: OpenAIModel = "gpt-4o",
  signal?: AbortSignal,
): ReadableStream<string> {
  const msgs: { role: string; content: string }[] = [];
  if (systemPrompt?.trim()) msgs.push({ role: "system", content: systemPrompt.trim() });
  msgs.push(...messages.map((m) => ({ role: m.role, content: m.content })));

  return new ReadableStream<string>({
    async start(controller) {
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: modelId, messages: msgs, stream: true }),
          signal,
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error?.message ?? "OpenAI API error");
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") continue;
            try {
              const parsed = JSON.parse(raw);
              const text = parsed.choices?.[0]?.delta?.content;
              if (text) controller.enqueue(text);
            } catch {
              // 無視
            }
          }
        }

        controller.close();
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          controller.error(err);
        } else {
          controller.close();
        }
      }
    },
  });
}

// ─── DB保存ヘルパー（中断時でも確実に保存） ──────────────────────────────────
async function saveAssistantMessage(
  supabase: ReturnType<typeof createRouteHandlerSupabaseClient>,
  threadId: string,
  userId: string,
  content: string,
  provider: string,
  messageId: string,
) {
  const { error } = await supabase.from("messages").insert({
    id: messageId,
    thread_id: threadId,
    role: "assistant",
    content,
    provider,
    user_id: userId,
  });
  if (error) console.error("[saveAssistantMessage] DB保存失敗:", error);
}

// ─── POST ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const res = new Response(); // createRouteHandlerSupabaseClient用のダミー
  const supabase = createRouteHandlerSupabaseClient(req, res as never);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const userId = user.id;

  const {
    threadId, messages, userContent, provider, modelId,
    isRegenerate, isMemo, systemPrompt, isTemporary, attachedImages,
  } = await req.json();

  const imageBlocksForApi: ImageBlock[] = (attachedImages ?? []).map(
    (img: { base64: string; mediaType: string }) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
    })
  );

  // フォルダのシステムプロンプトを解決
  let resolvedSystemPrompt: string | undefined = systemPrompt || undefined;
  if (!resolvedSystemPrompt && !isTemporary) {
    const { data: thread } = await supabase
      .from('threads').select('folder_name, user_id').eq('id', threadId).single();
    if (thread?.folder_name) {
      const { data: folderSetting } = await supabase
        .from('folder_settings').select('system_prompt')
        .eq('user_id', userId).eq('folder_name', thread.folder_name).maybeSingle();
      resolvedSystemPrompt = folderSetting?.system_prompt ?? undefined;
    }
  }

  // スレッド作成
  if (!isTemporary) {
    const { data: exists } = await supabase.from("threads").select("id").eq("id", threadId).single();
    if (!exists) {
      const title = userContent.slice(0, 20) + (userContent.length > 20 ? "…" : "");
      await supabase.from("threads").insert({ id: threadId, title, user_id: userId });
    }
  }

  // ユーザーメッセージ保存
  const userMessageId = uuidv4();
  const userMessage = {
    id: userMessageId,
    thread_id: threadId,
    role: "user" as const,
    content: userContent,
    provider: (isMemo ? "memo" : "user") as "memo" | "user",
    created_at: new Date().toISOString(),
  };

  if (!isRegenerate && !isTemporary) {
    await supabase.from("messages").insert({
      id: userMessage.id,
      thread_id: threadId,
      role: "user",
      content: userContent,
      provider: isMemo ? "memo" : "user",
      user_id: userId,
    });
  }

  // メモモードはストリーミング不要
  if (isMemo) {
    return new Response(JSON.stringify({ userMessage }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // API キー
  const anthropicKey = req.headers.get("x-anthropic-api-key");
  const geminiKey    = req.headers.get("x-gemini-api-key");
  const openaiKey    = req.headers.get("x-openai-api-key");

  const resolvedModelId: ModelId = modelId ?? DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.claude;

  const messagesForApi = [
    ...messages.map((m: ChatMessage) => ({
      role: m.role as string,
      content: m.provider === "memo"
        ? `【ユーザーの思考メモ（返答不要の前提知識）】\n${m.content}`
        : m.content,
    })),
    { role: "user" as string, content: userContent },
  ];

  // エラーの場合は非ストリーミングでJSON返却（既存互換）
  let aiStream: ReadableStream<string> | null = null;
  let errorMessage: string | null = null;
  const usedProvider = provider;

  try {
    if (provider === "gemini") {
      if (!geminiKey) throw new Error("GeminiのAPIキーが設定されていません。");
      aiStream = streamGemini(geminiKey, messagesForApi, resolvedSystemPrompt, resolvedModelId as GeminiModel, imageBlocksForApi, req.signal);
    } else if (provider === "claude") {
      if (!anthropicKey) throw new Error("ClaudeのAPIキーが設定されていません。");
      aiStream = streamClaude(anthropicKey, messagesForApi, resolvedSystemPrompt, resolvedModelId as ClaudeModel, imageBlocksForApi, req.signal);
    } else if (provider === "openai") {
      if (!openaiKey) throw new Error("OpenAIのAPIキーが設定されていません。");
      aiStream = streamOpenAI(openaiKey, messagesForApi, resolvedSystemPrompt, resolvedModelId as OpenAIModel, req.signal);
    } else {
      throw new Error(`未対応のプロバイダーです: ${provider}`);
    }
  } catch (err) {
    errorMessage = `（エラー: ${err instanceof Error ? err.message : "不明なエラー"}）\n※右上の「🔑 APIキー」ボタンから設定を確認してください。`;
  }

  // エラー時は非ストリーミングで返す
  if (errorMessage || !aiStream) {
    const content = errorMessage ?? "（応答の取得に失敗しました）";
    const assistantMessageId = uuidv4();
    const assistantMessage = {
      id: assistantMessageId,
      thread_id: threadId,
      role: "assistant" as const,
      content,
      provider: usedProvider,
      created_at: new Date().toISOString(),
    };
    if (!isTemporary) {
      await saveAssistantMessage(supabase, threadId, userId, content, usedProvider, assistantMessageId);
    }
    return new Response(JSON.stringify({ userMessage, assistantMessage }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ─── ストリーミングレスポンス構築 ───────────────────────────────────────
  const assistantMessageId = uuidv4();
  const now = new Date().toISOString();

  // フロントに最初にuserMessageとassistantMessageのIDを通知するため
  // 最初のchunkとしてメタデータを送る
  const metaChunk = JSON.stringify({
    type: "meta",
    userMessage,
    assistantMessageId,
    threadId,
    provider: usedProvider,
    createdAt: now,
  }) + "\n";

  let accumulatedText = "";
  let isAborted = false;

  const outputStream = new TransformStream<string, string>({
    transform(chunk, controller) {
      accumulatedText += chunk;
      // フロントに逐次送信: JSON行形式
      controller.enqueue(JSON.stringify({ type: "chunk", text: chunk }) + "\n");
    },
    flush(controller) {
      // 正常完了: doneチャンクを送信
      controller.enqueue(
        JSON.stringify({ type: "done", aborted: false }) + "\n"
      );
    },
  });

  // DB保存はストリーム完了後または中断時に確実に行う
  const saveToDb = async (aborted: boolean) => {
    if (isTemporary) return;
    const contentToSave = aborted
      ? accumulatedText + "\n\n[生成中断]"
      : accumulatedText;
    await saveAssistantMessage(supabase, threadId, userId, contentToSave, usedProvider, assistantMessageId);
  };

  // ReadableStream with cancel hook（Gemini指摘①への対策）
   // ReadableStream with cancel hook（Gemini指摘①への対策）
  const readable = aiStream.pipeThrough(outputStream);

  // ✅ v62: 二重保存防止フラグ
  let dbSaved = false;

  // ストリームの完了・中断を監視するラッパー
  const wrappedStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      // メタデータを最初に送信
      controller.enqueue(encoder.encode(metaChunk));

      const reader = readable.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(encoder.encode(value));
        }
        // 正常完了: accumulatedTextが溜まった後に保存
        await saveToDb(false);
        dbSaved = true;
      } catch (err) {
        // 中断またはエラー
        isAborted = true;
        await saveToDb(true);
        dbSaved = true;
        // 中断通知をフロントに送る
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "done", aborted: true }) + "\n")
        );
      } finally {
        controller.close();
      }
    },
    cancel() {
    // DB保存済みの場合は中断フラグを立てない
    if (!dbSaved) {
    isAborted = true;
  }
},
  });

  // ✅ waitUntilはwrappedStream定義の後（フォールバック用）
  // 正常終了時はdbSaved=trueでスキップ。cancel後のエッジケースをカバー。
  waitUntil((async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (!dbSaved) {
      await saveToDb(isAborted);
      dbSaved = true;
    }
  })());

  return new Response(wrappedStream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no", // Nginxのバッファリング無効化
    },
  });
}
