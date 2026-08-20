import type { ApiClient } from "@kabehub/shared";

export const webApiClient: ApiClient = {
  async request(path, init) {
    return fetch(path, init);
  },
};
