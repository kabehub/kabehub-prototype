import { NextRequest, NextResponse } from "next/server";
import { completeGithubOAuth } from "@/lib/github-oauth-complete";

export const dynamic = "force-dynamic";

const MOBILE_CALLBACK_URL =
  "https://www.kabehub.com/mobile/auth/github/callback";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(`${MOBILE_CALLBACK_URL}?status=error`, 302);
  }

  const result = await completeGithubOAuth({
    code,
    state,
    redirectUri: process.env.GITHUB_MOBILE_REDIRECT_URI!,
  });

  return NextResponse.redirect(
    `${MOBILE_CALLBACK_URL}?status=${result.ok ? "connected" : "error"}`,
    302,
  );
}
