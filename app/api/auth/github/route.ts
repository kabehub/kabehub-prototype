import { NextRequest, NextResponse } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { createOAuthState, deleteGithubToken } from "@/lib/github-token-store";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, finalizeResponse } = auth;

  const state = await createOAuthState(user.id);
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: process.env.GITHUB_REDIRECT_URI!,
    scope: "repo",
    state,
  });

  return finalizeResponse(
    NextResponse.redirect(
      `https://github.com/login/oauth/authorize?${params.toString()}`,
    ),
  );
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, finalizeJson } = auth;

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
