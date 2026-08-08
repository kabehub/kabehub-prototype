import { serviceRoleClient } from "@/lib/mcp-auth";
import { decryptToken, encryptToken } from "@/lib/github-token-crypto";
import * as logger from "@/lib/logger";

export async function saveGithubToken(
  userId: string,
  accessToken: string,
  scope: string | null,
  githubLogin: string | null,
): Promise<void> {
  const supabase = serviceRoleClient();
  const encrypted = await encryptToken(accessToken);
  const { error } = await supabase.from("user_github_tokens").upsert(
    {
      user_id: userId,
      access_token: encrypted,
      scope,
      github_login: githubLogin,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) throw new Error(error.message);
}

export async function getGithubToken(userId: string): Promise<string | null> {
  const supabase = serviceRoleClient();
  const { data, error } = await supabase
    .from("user_github_tokens")
    .select("access_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // GitHub文脈注入はチャット本体の補助機能。
    // token storeの一時障害でチャット全体を失敗させないため、明示的に未接続扱いへフォールバックする。
    logger.dbOperationFailedBestEffort({
      route: "github-token-store",
      operation: "get-github-token",
      table: "user_github_tokens",
      errorCode: error.code,
    });
    return null;
  }

  if (!data?.access_token) return null;

  try {
    return await decryptToken(data.access_token);
  } catch {
    return null;
  }
}

export async function getGithubStatus(
  userId: string,
): Promise<{ connected: boolean; github_login: string | null; scope: string | null }> {
  const supabase = serviceRoleClient();
  const { data, error } = await supabase
    .from("user_github_tokens")
    .select("github_login, scope")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    connected: !!data,
    github_login: data?.github_login ?? null,
    scope: data?.scope ?? null,
  };
}

export async function deleteGithubToken(userId: string): Promise<void> {
  const supabase = serviceRoleClient();
  const { error } = await supabase.from("user_github_tokens").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function createOAuthState(userId: string): Promise<string> {
  const supabase = serviceRoleClient();
  const cleanupBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // Future cleanup can move to a daily Supabase pg_cron job if this grows.
  const { error: cleanupError } = await supabase
    .from("github_oauth_states")
    .delete()
    .lt("expires_at", cleanupBefore);

  if (cleanupError) {
    logger.dbOperationFailedBestEffort({
      route: "github-token-store",
      operation: "cleanup-expired-oauth-states",
      table: "github_oauth_states",
      errorCode: cleanupError.code,
    });
  }

  const state = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { error } = await supabase.from("github_oauth_states").insert({
    state,
    user_id: userId,
    expires_at: expiresAt,
  });

  if (error) throw new Error(error.message);

  return state;
}

export async function consumeOAuthState(state: string): Promise<string | null> {
  const supabase = serviceRoleClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("github_oauth_states")
    .update({ used_at: nowIso })
    .eq("state", state)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .select("user_id")
    .maybeSingle();

  if (error) {
    logger.dbOperationFailed({
      route: "github-token-store",
      operation: "consume-oauth-state",
      table: "github_oauth_states",
      errorCode: error.code,
    });
    return null;
  }

  return data?.user_id ?? null;
}
