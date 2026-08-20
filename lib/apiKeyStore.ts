import type { ApiKeyProvider, ApiKeyStore } from "@kabehub/shared";

const STORAGE_KEYS: Record<ApiKeyProvider, string> = {
  claude: "kabehub_anthropic_key",
  gemini: "kabehub_gemini_key",
  openai: "kabehub_openai_key",
  ideogram: "kabehub_ideogram_key",
  openrouter: "kabehub_openrouter_key",
};

export const webApiKeyStore: ApiKeyStore = {
  async getKey(provider) {
    return localStorage.getItem(STORAGE_KEYS[provider]);
  },
  async setKey(provider, value) {
    localStorage.setItem(STORAGE_KEYS[provider], value);
  },
  async removeKey(provider) {
    localStorage.removeItem(STORAGE_KEYS[provider]);
  },
};
