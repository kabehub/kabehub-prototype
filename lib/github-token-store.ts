import { serviceRoleClient } from "@/lib/mcp-auth";
import { decryptToken, encryptToken } from "@/lib/github-token-crypto";

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
  const { data } = await supabase
    .from("user_github_tokens")
    .select("access_token")
    .eq("user_id", userId)
    .maybeSingle();

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
  const { data } = await supabase
    .from("user_github_tokens")
    .select("github_login, scope")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    connected: !!data,
    github_login: data?.github_login ?? null,
    scope: data?.scope ?? null,
  };
}

export async function deleteGithubToken(userId: string): Promise<void> {
  const supabase = serviceRoleClient();
  await supabase.from("user_github_tokens").delete().eq("user_id", userId);
}

export async function createOAuthState(userId: string): Promise<string> {
  const supabase = serviceRoleClient();
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
  const { data } = await supabase
    .from("github_oauth_states")
    .select("user_id, expires_at, used_at")
    .eq("state", state)
    .maybeSingle();

  if (!data) return null;
  if (data.used_at) return null;
  if (new Date(data.expires_at) < new Date()) return null;

  await supabase
    .from("github_oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state", state);

  return data.user_id;
}
