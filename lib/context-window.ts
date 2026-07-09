// lib/context-window.ts
// Token estimation and context window management for LLM API calls.
// Japanese + English mixed content: ~3.5 chars per token is a safe conservative estimate.

const CHARS_PER_TOKEN = 3.5;
const MESSAGE_OVERHEAD_TOKENS = 10;
const IMAGE_TOKEN_ESTIMATE = 1500;
const STUB_TEXT = "[System note: Earlier conversation history was omitted to fit the context window. The most recent messages are included below. Please continue naturally.]";

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface ContextMessage {
  role: string;
  content: string;
}

export interface TrimResult {
  messages: ContextMessage[];
  wasTrimmed: boolean;
  estimatedInputTokens: number;
  cacheAnchorIndex: number; // -1 は対象なし
}

function computeAnchorIndex(msgs: ContextMessage[]): number {
  if (msgs.length < 2) return -1;
  const candidate = msgs[msgs.length - 2];
  return candidate.role === "assistant" ? msgs.length - 2 : -1;
}

function calcTotalTokens(
  msgs: ContextMessage[],
  systemTokens: number,
  imageTokens: number
): number {
  const msgTokens = msgs.reduce(
    (sum, m) => sum + estimateTokens(m.content) + MESSAGE_OVERHEAD_TOKENS,
    0
  );
  return msgTokens + systemTokens + imageTokens;
}

function mergeStubIntoMessages(
  stubText: string,
  history: ContextMessage[],
  anchor: ContextMessage[]
): ContextMessage[] {
  const firstAfter = history[0] ?? anchor[0];
  if (firstAfter?.role === "user") {
    const merged = { ...firstAfter, content: stubText + "\n\n" + firstAfter.content };
    return history.length > 0
      ? [merged, ...history.slice(1), ...anchor]
      : [merged, ...anchor.slice(1)];
  }
  return [{ role: "user", content: stubText }, ...history, ...anchor];
}

export function trimContextToWindow(
  messages: ContextMessage[],
  systemPrompt: string | undefined,
  options: {
    maxInputTokens?: number;
    anchorTurns?: number;
    responseReserveTokens?: number;
    imageCount?: number;
  } = {}
): TrimResult {
  const {
    maxInputTokens = 80_000,
    anchorTurns = 6,
    responseReserveTokens = 2_000,
    imageCount = 0,
  } = options;

  const systemTokens = estimateTokens(systemPrompt ?? "");
  const imageTokens = imageCount * IMAGE_TOKEN_ESTIMATE;
  const budget = maxInputTokens - systemTokens - responseReserveTokens - imageTokens;

  if (messages.length === 0) {
    return {
      messages,
      wasTrimmed: false,
      estimatedInputTokens: calcTotalTokens(messages, systemTokens, imageTokens),
      cacheAnchorIndex: computeAnchorIndex(messages),
    };
  }

  if (budget <= 0) {
    const finalMessages = messages.slice(-2);
    return {
      messages: finalMessages,
      wasTrimmed: finalMessages.length < messages.length,
      estimatedInputTokens: calcTotalTokens(finalMessages, systemTokens, imageTokens),
      cacheAnchorIndex: computeAnchorIndex(finalMessages),
    };
  }

  const anchorCount = Math.min(anchorTurns * 2, messages.length);
  const anchorMessages = messages.slice(-anchorCount);
  const historyMessages = messages.slice(0, -anchorCount);

  let anchorTokens = calcTotalTokens(anchorMessages, 0, 0);

  if (anchorTokens >= budget) {
    const trimmedAnchor = [...anchorMessages];
    while (anchorTokens >= budget && trimmedAnchor.length > 1) {
      const [removed] = trimmedAnchor.splice(0, 1);
      anchorTokens -= estimateTokens(removed.content) + MESSAGE_OVERHEAD_TOKENS;
    }
    return {
      messages: trimmedAnchor,
      wasTrimmed: historyMessages.length > 0 || trimmedAnchor.length < anchorMessages.length,
      estimatedInputTokens: calcTotalTokens(trimmedAnchor, systemTokens, imageTokens),
      cacheAnchorIndex: computeAnchorIndex(trimmedAnchor),
    };
  }

  let remainingBudget = budget - anchorTokens;
  const keptHistory: ContextMessage[] = [];

  for (let i = historyMessages.length - 1; i >= 0; i--) {
    const msg = historyMessages[i];
    const cost = estimateTokens(msg.content) + MESSAGE_OVERHEAD_TOKENS;
    if (cost > remainingBudget) break;
    remainingBudget -= cost;
    keptHistory.unshift(msg);
  }

  const wasTrimmed = keptHistory.length < historyMessages.length;

  const finalMessages = wasTrimmed
    ? mergeStubIntoMessages(STUB_TEXT, keptHistory, anchorMessages)
    : [...keptHistory, ...anchorMessages];

  return {
    messages: finalMessages,
    wasTrimmed,
    estimatedInputTokens: calcTotalTokens(finalMessages, systemTokens, imageTokens),
    cacheAnchorIndex: computeAnchorIndex(finalMessages),
  };
}
