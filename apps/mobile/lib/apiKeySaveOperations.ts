import type { ApiKeyProvider } from "@kabehub/shared";

export const MOBILE_API_KEY_PROVIDERS = [
  "claude",
  "gemini",
  "openai",
  "ideogram",
  "openrouter",
] as const satisfies readonly ApiKeyProvider[];

export type ApiKeyFieldState = {
  status: "loaded" | "missing" | "error";
  initialValue: string;
  value: string;
  dirty: boolean;
};

export type ApiKeySaveOperation =
  | { provider: ApiKeyProvider; kind: "set"; value: string }
  | { provider: ApiKeyProvider; kind: "remove" };

export function buildApiKeySaveOperations(
  fields: Record<ApiKeyProvider, ApiKeyFieldState>
): ApiKeySaveOperation[] {
  const operations: ApiKeySaveOperation[] = [];

  for (const provider of MOBILE_API_KEY_PROVIDERS) {
    const field = fields[provider];

    if (!field.dirty) continue;

    operations.push(
      field.value === ""
        ? { provider, kind: "remove" }
        : { provider, kind: "set", value: field.value }
    );
  }

  return operations;
}
