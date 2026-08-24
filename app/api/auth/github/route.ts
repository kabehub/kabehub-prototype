import { NextRequest, NextResponse } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import {
  createOAuthState,
  deleteGithubToken,
  getGithubTokenStrict,
} from "@/lib/github-token-store";
import {
  checkGithubToken,
  revokeGithubAuthorization,
} from "@/lib/github-oauth";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { authMode, user, finalizeJson, finalizeResponse } = auth;

  const redirectUri =
    authMode === "bearer"
      ? process.env.GITHUB_MOBILE_REDIRECT_URI!
      : process.env.GITHUB_REDIRECT_URI!;

  const state = await createOAuthState(user.id);
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: "repo",
    state,
  });

  const authorizeUrl =
    `https://github.com/login/oauth/authorize?${params.toString()}`;

  if (authMode === "bearer") {
    return finalizeJson({ url: authorizeUrl });
  }

  return finalizeResponse(NextResponse.redirect(authorizeUrl, 302));
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, finalizeJson } = auth;

  let accessToken: string | null;
  try {
    accessToken = await getGithubTokenStrict(user.id);
  } catch {
    return finalizeJson(
      { error: "GitHub連携の解除に失敗しました" },
      { status: 500 },
    );
  }

  if (accessToken === null) {
    return finalizeJson({ ok: true });
  }

  const revokeResult = await revokeGithubAuthorization(accessToken);
  if (!revokeResult.ok) {
    const tokenStatus = await checkGithubToken(accessToken);
    if (tokenStatus !== "invalid") {
      return finalizeJson(
        { error: "GitHub連携の解除に失敗しました" },
        { status: 500 },
      );
    }
  }

  try {
    await deleteGithubToken(user.id);
    return finalizeJson({ ok: true });
  } catch (err) {
    logger.dbOperationFailed({
      route: "auth-github",
      operation: "disconnect",
      table: "user_github_tokens",
      errorType: err instanceof Error ? err.name : "unknown",
    });
    return finalizeJson({ error: "GitHub連携の解除に失敗しました" }, { status: 500 });
  }
}
