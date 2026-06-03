// lib/context-window.ts
// Token estimation and context window management for LLM API calls.
// Japanese + English mixed content: ~3.5 chars per token is a safe conservative estimate.

const CHARS_PER_TOKEN = 3.5;
const MESSAGE_OVERHEAD_TOKENS = 10;

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
}

export function trimContextToWindow(
  messages: ContextMessage[],
  systemPrompt: string | undefined,
  options: {
    maxInputTokens?: number;
    anchorTurns?: number;
    responseReserveTokens?: number;
  } = {}
): TrimResult {
  const {
    maxInputTokens = 80_000,
    anchorTurns = 6,
    responseReserveTokens = 2_000,
  } = options;

  const systemTokens = estimateTokens(systemPrompt ?? "");
  const budget = maxInputTokens - systemTokens - responseReserveTokens;

  if (budget <= 0 || messages.length === 0) {
    return { messages, wasTrimmed: false, estimatedInputTokens: systemTokens };
  }

  const anchorCount = Math.min(anchorTurns * 2, messages.length);
  const anchorMessages = messages.slice(-anchorCount);
  const historyMessages = messages.slice(0, -anchorCount);

  const anchorTokens = anchorMessages.reduce(
    (sum, m) => sum + estimateTokens(m.content) + MESSAGE_OVERHEAD_TOKENS,
    0
  );

  if (anchorTokens >= budget) {
    return {
      messages: anchorMessages,
      wasTrimmed: historyMessages.length > 0,
      estimatedInputTokens: anchorTokens + systemTokens,
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

  const truncationStub: ContextMessage[] = wasTrimmed
    ? [{ role: "user", content: "[System note: Earlier conversation history was omitted to fit the context window. The most recent messages are included below. Please continue naturally.]" }]
    : [];

  return {
    messages: [...truncationStub, ...keptHistory, ...anchorMessages],
    wasTrimmed,
    estimatedInputTokens: budget - remainingBudget + systemTokens,
  };
}
