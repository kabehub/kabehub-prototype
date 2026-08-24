import { NextRequest, NextResponse } from "next/server";
import { completeGithubOAuth } from "@/lib/github-oauth-complete";

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

  const result = await completeGithubOAuth({
    code,
    state,
    redirectUri: process.env.GITHUB_REDIRECT_URI!,
  });

  return NextResponse.redirect(
    new URL(`/settings?github=${result.ok ? "connected" : "error"}`, req.url),
  );
}
