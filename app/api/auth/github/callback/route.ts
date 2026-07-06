import { NextRequest, NextResponse } from "next/server";
import { consumeOAuthState, saveGithubToken } from "@/lib/github-token-store";

  // ⚠️ このファイルはGitHub連携専用のコールバックです。
  // Googleログインのコールバックは app/auth/callback/route.ts です。
  // 混同するとGitHubトークン交換とGoogleログインの処理が入れ替わるバグになるため注意。

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings?github=error", req.url));
  }

  const userId = await consumeOAuthState(state);
  if (!userId) {
    return NextResponse.redirect(new URL("/settings?github=error", req.url));
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: process.env.GITHUB_REDIRECT_URI,
    }),
  });
  const tokenData = await tokenRes.json();

  if (tokenData.error || !tokenData.access_token) {
    return NextResponse.redirect(new URL("/settings?github=error", req.url));
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const githubUser = await userRes.json();

  await saveGithubToken(
    userId,
    tokenData.access_token,
    tokenData.scope ?? null,
    githubUser.login ?? null,
  );

  return NextResponse.redirect(new URL("/settings?github=connected", req.url));
}
