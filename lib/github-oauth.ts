import * as logger from "@/lib/logger";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const REQUEST_TIMEOUT_MS = 5_000;

export type RevokeResult = { ok: true } | { ok: false };
export type CheckTokenResult = "valid" | "invalid" | "error";

class GitHubOAuthConfigurationError extends Error {
  constructor() {
    super("GitHub OAuth application credentials are not configured");
    this.name = "GitHubOAuthConfigurationError";
  }
}

function getApplicationCredentials(): { clientId: string; authorization: string } {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new GitHubOAuthConfigurationError();
  }

  return {
    clientId,
    authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
  };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function requestOptions(
  method: "DELETE" | "POST",
  accessToken: string,
  authorization: string,
): RequestInit {
  return {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: authorization,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
    body: JSON.stringify({ access_token: accessToken }),
    cache: "no-store",
  };
}

export async function revokeGithubAuthorization(
  accessToken: string,
): Promise<RevokeResult> {
  try {
    const { clientId, authorization } = getApplicationCredentials();
    const response = await fetchWithTimeout(
      `${GITHUB_API_BASE_URL}/applications/${encodeURIComponent(clientId)}/grant`,
      requestOptions("DELETE", accessToken, authorization),
    );

    if (response.status === 204) return { ok: true };

    logger.externalApiFailed({
      service: "github",
      status: response.status,
      errorCode: "GRANT_REVOKE_FAILED",
    });
    return { ok: false };
  } catch (err) {
    logger.externalApiFailed({
      service: "github",
      errorCode: "GRANT_REVOKE_FAILED",
      errorType: err instanceof Error ? err.name : "unknown",
    });
    return { ok: false };
  }
}

export async function checkGithubToken(
  accessToken: string,
): Promise<CheckTokenResult> {
  try {
    const { clientId, authorization } = getApplicationCredentials();
    const response = await fetchWithTimeout(
      `${GITHUB_API_BASE_URL}/applications/${encodeURIComponent(clientId)}/token`,
      requestOptions("POST", accessToken, authorization),
    );

    if (response.status === 200) return "valid";
    if (response.status === 404) return "invalid";

    logger.externalApiFailed({
      service: "github",
      status: response.status,
      errorCode: "TOKEN_CHECK_FAILED",
    });
    return "error";
  } catch (err) {
    logger.externalApiFailed({
      service: "github",
      errorCode: "TOKEN_CHECK_FAILED",
      errorType: err instanceof Error ? err.name : "unknown",
    });
    return "error";
  }
}
