import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { getGithubStatus } from "@/lib/github-token-store";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, finalizeJson } = auth;

  try {
    const status = await getGithubStatus(user.id);
    return finalizeJson(status);
  } catch (err) {
    logger.dbOperationFailed({
      route: "auth-github",
      operation: "get-status",
      table: "user_github_tokens",
      errorType: err instanceof Error ? err.name : "unknown",
    });
    return finalizeJson({ error: "GitHub連携状況の取得に失敗しました" }, { status: 500 });
  }
}
