export type ApiKeyProvider =
  | "claude"
  | "gemini"
  | "openai"
  | "ideogram"
  | "openrouter";

export interface ApiKeyStore {
  getKey(provider: ApiKeyProvider): Promise<string | null>;
  setKey(provider: ApiKeyProvider, value: string): Promise<void>;
  removeKey(provider: ApiKeyProvider): Promise<void>;
}

export const API_KEY_HEADER_NAMES: Record<ApiKeyProvider, string> = {
  claude: "x-anthropic-api-key",
  gemini: "x-gemini-api-key",
  openai: "x-openai-api-key",
  ideogram: "x-ideogram-api-key",
  openrouter: "x-openrouter-api-key",
};

export async function buildApiKeyHeaders(
  store: ApiKeyStore,
  providers: readonly ApiKeyProvider[]
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    providers.map(async (provider) => {
      const key = await store.getKey(provider);
      return key ? ([API_KEY_HEADER_NAMES[provider], key] as const) : null;
    })
  );

  return Object.fromEntries(
    entries.filter(
      (entry): entry is readonly [string, string] => entry !== null
    )
  );
}
