import type { ApiKeyStore } from "@kabehub/shared";

const NOT_IMPLEMENTED_MESSAGE =
  "mobileApiKeyStore is not implemented until Task12";

export const mobileApiKeyStore: ApiKeyStore = {
  async getKey() {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  },
  async setKey() {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  },
  async removeKey() {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  },
};
