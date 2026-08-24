import { consumeOAuthState, saveGithubToken } from "@/lib/github-token-store";
import * as logger from "@/lib/logger";

type CompleteGithubOAuthResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "invalid_state"
        | "token_exchange"
        | "github_user"
        | "save_failed";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function logExternalFailure(
  errorCode: "TOKEN_EXCHANGE_FAILED" | "GITHUB_USER_FAILED",
  details: { status?: number; errorType?: string } = {},
): void {
  logger.externalApiFailed({
    service: "github",
    errorCode,
    ...details,
  });
}

export async function completeGithubOAuth(params: {
  code: string;
  state: string;
  redirectUri: string;
}): Promise<CompleteGithubOAuthResult> {
  let userId: string | null;
  try {
    userId = await consumeOAuthState(params.state);
  } catch (err) {
    logger.dbOperationFailed({
      route: "github-oauth-complete",
      operation: "consume-oauth-state",
      table: "github_oauth_states",
      errorType: err instanceof Error ? err.name : "unknown",
    });
    return { ok: false, reason: "invalid_state" };
  }

  if (!userId) {
    return { ok: false, reason: "invalid_state" };
  }

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: params.code,
        redirect_uri: params.redirectUri,
      }),
    });
  } catch (err) {
    logExternalFailure("TOKEN_EXCHANGE_FAILED", {
      errorType: err instanceof Error ? err.name : "unknown",
    });
    return { ok: false, reason: "token_exchange" };
  }

  if (!tokenResponse.ok) {
    logExternalFailure("TOKEN_EXCHANGE_FAILED", {
      status: tokenResponse.status,
    });
    return { ok: false, reason: "token_exchange" };
  }

  let rawTokenData: unknown;
  try {
    rawTokenData = await tokenResponse.json();
  } catch (err) {
    logExternalFailure("TOKEN_EXCHANGE_FAILED", {
      errorType: err instanceof Error ? err.name : "unknown",
    });
    return { ok: false, reason: "token_exchange" };
  }

  if (!isRecord(rawTokenData)) {
    logExternalFailure("TOKEN_EXCHANGE_FAILED");
    return { ok: false, reason: "token_exchange" };
  }

  const accessToken = rawTokenData.access_token;
  if (
    rawTokenData.error !== undefined ||
    typeof accessToken !== "string" ||
    accessToken.length === 0
  ) {
    logExternalFailure("TOKEN_EXCHANGE_FAILED");
    return { ok: false, reason: "token_exchange" };
  }
  const tokenData = rawTokenData;
  const scope = typeof tokenData.scope === "string" ? tokenData.scope : null;

  let githubUserResponse: Response;
  try {
    githubUserResponse = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    logExternalFailure("GITHUB_USER_FAILED", {
      errorType: err instanceof Error ? err.name : "unknown",
    });
    return { ok: false, reason: "github_user" };
  }

  if (!githubUserResponse.ok) {
    logExternalFailure("GITHUB_USER_FAILED", {
      status: githubUserResponse.status,
    });
    return { ok: false, reason: "github_user" };
  }

  let rawGithubUser: unknown;
  try {
    rawGithubUser = await githubUserResponse.json();
  } catch (err) {
    logExternalFailure("GITHUB_USER_FAILED", {
      errorType: err instanceof Error ? err.name : "unknown",
    });
    return { ok: false, reason: "github_user" };
  }

  if (!isRecord(rawGithubUser)) {
    logExternalFailure("GITHUB_USER_FAILED");
    return { ok: false, reason: "github_user" };
  }
  const githubUser = rawGithubUser;

  try {
    await saveGithubToken(
      userId,
      accessToken,
      scope,
      typeof githubUser.login === "string" ? githubUser.login : null,
    );
  } catch (err) {
    logger.dbOperationFailed({
      route: "github-oauth-complete",
      operation: "save-github-token",
      table: "user_github_tokens",
      errorType: err instanceof Error ? err.name : "unknown",
    });
    return { ok: false, reason: "save_failed" };
  }

  return { ok: true };
}
