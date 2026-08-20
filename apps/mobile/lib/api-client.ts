import type { AccessTokenProvider, ApiClient } from "@kabehub/shared";

const BASE_URL = "https://www.kabehub.com";

const noAccessToken: AccessTokenProvider = async () => null;

export function createMobileApiClient(
  getAccessToken: AccessTokenProvider = noAccessToken
): ApiClient {
  return {
    async request(path, init) {
      const headers = new Headers(init?.headers);
      const token = await getAccessToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return fetch(`${BASE_URL}${path}`, { ...init, headers });
    },
  };
}
