// Server-only Responses adapter. Share Responses input; keep Chat Completions/Arena adapters independent.
import { TextDecoder } from "node:util";
import { WEB_SEARCH_MAX_TOOL_CALLS_OPENAI } from "@kabehub/shared";
import { CHAT_OPENAI_CONFIG, getOpenAICapability, type OpenAICapability, type RegistryOpenAIModel } from "@/lib/modelRegistry";
import { buildResponsesInput } from "@/lib/openai-responses-input";

type Message = { role: string; content: string };
type ImageBlock = { type: "image"; source: { type: "base64"; media_type: string; data: string } };
type ReasoningEffort = Extract<OpenAICapability, { api: "chat_completions" }>["reasoningEffort"];
type RequestInput = {
  modelId: RegistryOpenAIModel;
  systemPrompt?: string;
  messages: Message[];
  imageBlocks?: ImageBlock[];
  reasoningEffort?: ReasoningEffort;
};
export type OpenAIWebSearchUsage = {
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  cache_write_input_tokens: number | null;
  normal_input_tokens: number | null;
  aborted?: boolean;
};
export type OpenAIWebSearchErrorHandlers = {
  onHttpError: (status: number) => Error;
  onTerminalError: (kind: "incomplete" | "failed" | "protocol", reason?: string) => Error;
  onTransportError: (error: unknown) => Error;
};

export function buildOpenAIWebSearchRequest({ modelId, systemPrompt, messages, imageBlocks = [], reasoningEffort }: RequestInput) {
  const input = buildResponsesInput({ systemPrompt, messages, imageBlocks });
  return {
    model: modelId,
    input,
    tools: [{ type: "web_search" as const }],
    max_tool_calls: WEB_SEARCH_MAX_TOOL_CALLS_OPENAI,
    max_output_tokens: CHAT_OPENAI_CONFIG.maxOutputTokens,
    stream: true,
    store: false,
    ...(reasoningEffort !== undefined ? { reasoning: { effort: reasoningEffort } } : {}),
  };
}

type StreamInput = Omit<RequestInput, "reasoningEffort"> & {
  apiKey: string;
  signal?: AbortSignal;
  onUsage?: (usage: OpenAIWebSearchUsage) => void;
  search: {
    controlToken: string;
    onSearching: () => void;
    onCitation: (citation: { url: string; title?: string }) => void;
  };
  errors: OpenAIWebSearchErrorHandlers;
  fetchImpl?: typeof fetch;
  // Optional observation only: no text or identifiers go to a logger.
  onTextDone?: (observation: { itemId: string; contentIndex: number; matchesDelta: boolean }) => void;
};
type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
const tokens = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export function streamOpenAIWebSearch(options: StreamInput): ReadableStream<string> {
  let resumeDrain: (() => void) | undefined;
  let cancelled = false;
  return new ReadableStream<string>({
    start(controller) {
      const run = async () => {
        let terminal: "pending" | "completed" | "incomplete" | "failed" = "pending";
        let reason: string | undefined;
        let protocolError = false;
        let searchingSent = false;
        let aborted = false;
        let failure: Error | undefined;
        const usage: OpenAIWebSearchUsage = { input_tokens: null, output_tokens: null, cached_input_tokens: null, cache_write_input_tokens: null, normal_input_tokens: null };
        const textByPart = new Map<string, string>();
        const captureUsage = (response: JsonObject | undefined) => {
          const data = object(response?.usage);
          if (!data) return;
          const details = object(data.input_tokens_details);
          usage.input_tokens = tokens(data.input_tokens);
          usage.output_tokens = tokens(data.output_tokens);
          usage.cached_input_tokens = tokens(details?.cached_tokens);
          usage.cache_write_input_tokens = tokens(details?.cache_write_tokens);
          usage.normal_input_tokens = usage.input_tokens === null ? null : Math.max(0, usage.input_tokens - (usage.cached_input_tokens ?? 0) - (usage.cache_write_input_tokens ?? 0));
        };
        const citation = (value: unknown) => {
          const annotation = object(value);
          if (annotation?.type === "url_citation" && typeof annotation.url === "string") {
            options.search.onCitation({ url: annotation.url, ...(typeof annotation.title === "string" ? { title: annotation.title } : {}) });
          }
        };
        const finalCitations = (response: JsonObject | undefined) => {
          if (!Array.isArray(response?.output)) return;
          for (const value of response.output) {
            const item = object(value);
            if (item?.type !== "message" || !Array.isArray(item.content)) continue;
            for (const value of item.content) {
              const part = object(value);
              if (Array.isArray(part?.annotations)) part.annotations.forEach(citation);
            }
          }
        };
        const event = (value: unknown) => {
          const data = object(value);
          if (!data || typeof data.type !== "string") return;
          const type = data.type;
          const isTerminal = ["response.completed", "response.incomplete", "response.failed", "error"].includes(type);
          const isSearch = ["response.web_search_call.in_progress", "response.web_search_call.searching", "response.web_search_call.completed"].includes(type) ||
            (type.startsWith("response.output_item.") && object(data.item)?.type === "web_search_call");
          const isCitation = type === "response.output_text.annotation.added" && object(data.annotation)?.type === "url_citation";
          if (terminal !== "pending" && (isTerminal || isSearch || isCitation || type === "response.output_text.delta")) {
            protocolError = true;
            return; // Never mutate text, sources, searching or usage after a terminal.
          }
          if (isTerminal) {
            terminal = type === "response.completed" ? "completed" : type === "response.incomplete" ? "incomplete" : "failed";
            const response = object(data.response);
            captureUsage(response);
            if (terminal === "completed" || terminal === "incomplete") finalCitations(response);
            const incompleteReason = object(response?.incomplete_details)?.reason;
            // Retain only the two documented classification labels, never raw error text.
            if (incompleteReason === "max_output_tokens" || incompleteReason === "content_filter") reason = incompleteReason;
          } else if (type === "response.output_text.delta") {
            if (typeof data.delta !== "string") { protocolError = true; return; }
            controller.enqueue(data.delta);
            if (options.onTextDone && typeof data.item_id === "string" && typeof data.content_index === "number") {
              const key = JSON.stringify([data.item_id, data.content_index]);
              textByPart.set(key, (textByPart.get(key) ?? "") + data.delta);
            }
          } else if (isSearch) {
            if (!searchingSent) {
              searchingSent = true;
              controller.enqueue(options.search.controlToken);
              options.search.onSearching();
            }
          } else if (isCitation) citation(data.annotation);
          else if (type === "response.output_text.done" && options.onTextDone && typeof data.item_id === "string" && typeof data.content_index === "number" && typeof data.text === "string") {
            const key = JSON.stringify([data.item_id, data.content_index]);
            options.onTextDone({ itemId: data.item_id, contentIndex: data.content_index, matchesDelta: (textByPart.get(key) ?? "") === data.text });
            textByPart.delete(key);
          }
        };
        const line = (raw: string) => {
          const value = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
          if (!value.startsWith("data:")) return;
          const json = value.slice(5).trim();
          if (json === "[DONE]") return;
          let parsed: unknown;
          try { parsed = JSON.parse(json); }
          catch { protocolError = true; return; }
          event(parsed);
        };
        try {
          const capability = getOpenAICapability(options.modelId);
          const body = buildOpenAIWebSearchRequest({ ...options, reasoningEffort: capability.api === "chat_completions" ? capability.reasoningEffort : undefined });
          const response = await (options.fetchImpl ?? fetch)("https://api.openai.com/v1/responses", {
            method: "POST", headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(body), signal: options.signal,
          });
          if (!response.ok) failure = options.errors.onHttpError(response.status);
          else if (!response.body) protocolError = true;
          else {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                lines.forEach(line);
                if (done) { if (buffer) line(buffer); break; }
              }
            } finally { reader.releaseLock(); }
          }
        } catch (error) {
          aborted = error instanceof Error && error.name === "AbortError";
          if (!aborted && !options.signal?.aborted) failure = options.errors.onTransportError(error);
        }
        aborted ||= Boolean(options.signal?.aborted);
        // Once only, including failures: never erase recovered usage with nulls in catch.
        options.onUsage?.({ ...usage, ...(aborted ? { aborted: true } : {}) });
        if (aborted) { controller.close(); return; }
        if (!failure) {
          // TS cannot see terminal assignments made by the synchronous event callback.
          const state = terminal as "pending" | "completed" | "incomplete" | "failed";
          if (protocolError || state === "pending") failure = options.errors.onTerminalError("protocol");
          else if (state === "incomplete") failure = options.errors.onTerminalError("incomplete", reason);
          else if (state === "failed") failure = options.errors.onTerminalError("failed");
        }
        // error() discards queued chunks. Drain first so even a single HTTP chunk
        // containing many deltas and a failed terminal preserves every partial delta.
        if (failure) {
          while (!cancelled && controller.desiredSize !== null && controller.desiredSize <= 0) {
            await new Promise<void>(resolve => { resumeDrain = resolve; });
          }
          if (!cancelled) controller.error(failure);
        }
        else controller.close();
      };
      void run().catch(error => controller.error(error));
    },
    pull() { resumeDrain?.(); resumeDrain = undefined; },
    cancel() { cancelled = true; resumeDrain?.(); resumeDrain = undefined; },
  });
}
