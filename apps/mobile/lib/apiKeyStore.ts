import type { ApiKeyProvider, ApiKeyStore } from "@kabehub/shared";

import { secureStorageAdapter } from "./secureStorage";

const STORAGE_KEY_PREFIX = "kabehub_apikey_";

function storageKey(provider: ApiKeyProvider): string {
  return `${STORAGE_KEY_PREFIX}${provider}`;
}

export const mobileApiKeyStore: ApiKeyStore = {
  async getKey(provider) {
    return secureStorageAdapter.getItem(storageKey(provider));
  },
  async setKey(provider, value) {
    await secureStorageAdapter.setItem(storageKey(provider), value);
  },
  async removeKey(provider) {
    await secureStorageAdapter.removeItem(storageKey(provider));
  },
};
