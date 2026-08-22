import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import type { SecureStorageAdapter } from "@kabehub/shared";

export const secureStorageAdapter: SecureStorageAdapter = {
  async getItem(key) {
    // Storage failures must propagate so callers can distinguish them from a missing key.
    return SecureStorage.getItem(key);
  },
  async setItem(key, value) {
    await SecureStorage.setItem(key, value);
  },
  async removeItem(key) {
    await SecureStorage.removeItem(key);
  },
};
