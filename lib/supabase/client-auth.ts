import type { AuthError, SupabaseClient, User } from "@supabase/supabase-js";

export async function getClientUser(
  supabase: SupabaseClient
): Promise<{ user: User | null; error: AuthError | null }> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("[getClientUser] auth.getUser failed:", error.message);
  }
  return { user: data.user, error };
}
